"""
Moduł: Infrastruktura (Spec v3.0 - Strict Data Policy)
Pobiera dane infrastrukturalne z OpenStreetMap Overpass API.
KROK 2: Passes OSM features for Shapely intersection calculation.
NIGDY nie estymuje brakujących danych.

UWAGA: GUGiK KIUT (integracja.gugik.gov.pl) to usługa WMS (raster),
NIE WFS (wektor). Nie da się pobrać geometrii wektorowej z KIUT.
Dlatego jedynym źródłem wektorowym jest OpenStreetMap Overpass.

ŹRÓDŁA DANYCH:
1. OpenStreetMap Overpass API — dane wektorowe (geometria + atrybuty)
2. OpenInfraMap vector tiles — ta sama warstwa co na mapie (power_line), gdy Overpass nie zwraca
3. GUGiK KIUT WMS GetFeatureInfo — detekcja obecności (bez geometrii)

BATCH MODE: prefetch_regional_osm() pobiera linie dla całego regionu
jednym zapytaniem — unika rate-limitingu Overpass (429).
"""
import logging
import math
import asyncio
import requests
from typing import Dict, Any, Optional, List, Tuple
from shapely.geometry import shape, LineString, MultiLineString
from backend.integrations.overpass import fetch_power_lines, OVERPASS_URL, OVERPASS_TIMEOUT
try:
    from backend.integrations.openinframap import fetch_power_lines_oim
except ImportError:
    fetch_power_lines_oim = None  # mapbox-vector-tile optional

logger = logging.getLogger(__name__)

# Szerokości stref ochronnych [m] wg rodzaju sieci
STREFY_OCHRONNE = {
    "elektro_WN": 30,
    "elektro_SN": 15,
    "elektro_nN": 5,
    "gaz_wysokie": 50,
    "gaz_srednie": 15,
    "gaz_niskie": 3,
    "wod_kan": 3,
    "teleko": 2,
    "cieplo": 5,
}

# ========== REGIONAL OSM CACHE (batch mode) ==========
_osm_regional_cache: Dict[str, Any] = {
    "features": None,
    "bbox": None,
}


def clear_regional_cache():
    """Czyści cache regionalny (wywoływane po batch processing)."""
    _osm_regional_cache["features"] = None
    _osm_regional_cache["bbox"] = None


async def prefetch_regional_osm(
    parcel_geometries: List[Dict],
    buffer_deg: float = 0.015,
) -> int:
    """
    Pobierz WSZYSTKIE linie energetyczne dla regionu jednym zapytaniem Overpass.
    Wywoływane PRZED batch processing — wypełnia cache.

    Args:
        parcel_geometries: lista GeoJSON Polygon geometrii działek (WGS84)
        buffer_deg: bufor wokół regionalnego BBOX [stopnie], ~1.5km

    Returns:
        int: liczba znalezionych linii energetycznych
    """
    if not parcel_geometries:
        return 0

    # Oblicz regionalny BBOX ze wszystkich działek
    all_lons = []
    all_lats = []
    for geom in parcel_geometries:
        if not geom or geom.get("type") != "Polygon":
            continue
        coords = geom.get("coordinates", [])
        if not coords:
            continue
        ring = coords[0]
        for pt in ring:
            if len(pt) >= 2:
                all_lons.append(pt[0])
                all_lats.append(pt[1])

    if not all_lons:
        logger.warning("prefetch_regional_osm: brak prawidłowych geometrii")
        return 0

    s = min(all_lats) - buffer_deg
    w = min(all_lons) - buffer_deg
    n = max(all_lats) + buffer_deg
    e = max(all_lons) + buffer_deg

    logger.info(
        "REGIONAL OSM: Pobieranie linii energetycznych dla bbox (%.4f,%.4f)-(%.4f,%.4f)",
        s, w, n, e
    )

    # Jedno zapytanie Overpass dla całego regionu
    bbox_str = f"{max(-90, s)},{max(-180, w)},{min(90, n)},{min(180, e)}"
    query = f"""
[out:json][timeout:{OVERPASS_TIMEOUT + 10}];
(
  way["power"="line"]({bbox_str});
  way["power"="minor_line"]({bbox_str});
  way["power"="cable"]({bbox_str});
  way["power"="minor_cable"]({bbox_str});
);
out geom;
"""
    features = []
    for attempt in range(1, 4):
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None,
                lambda: requests.post(
                    OVERPASS_URL,
                    data={"data": query},
                    timeout=OVERPASS_TIMEOUT + 15,
                    headers={"User-Agent": "Kalkulator-Roszczen/3.0-batch"},
                ),
            )
            if resp.status_code == 200:
                data = resp.json()
                elements = data.get("elements", [])
                for el in elements:
                    if el.get("type") != "way":
                        continue
                    nodes = el.get("geometry", [])
                    if len(nodes) < 2:
                        continue
                    coords = [[nd["lon"], nd["lat"]] for nd in nodes]
                    geojson = {"type": "LineString", "coordinates": coords}
                    tags = el.get("tags", {})
                    voltage = _parse_voltage_osm(tags)
                    features.append({
                        "type": "Feature",
                        "geometry": geojson,
                        "properties": {"voltage": voltage, "osm_id": el.get("id")},
                    })
                break
            elif resp.status_code == 429:
                wait = 15 * attempt
                logger.warning("REGIONAL OSM: 429 rate limit, czekam %ds...", wait)
                await asyncio.sleep(wait)
            else:
                logger.warning("REGIONAL OSM: HTTP %s", resp.status_code)
                break
        except Exception as exc:
            logger.error("REGIONAL OSM: error attempt %d: %s", attempt, exc)
            if attempt < 3:
                await asyncio.sleep(5)

    _osm_regional_cache["features"] = features
    _osm_regional_cache["bbox"] = (s, w, n, e)
    logger.info("REGIONAL OSM: Pobrano %d linii energetycznych dla regionu", len(features))
    return len(features)


def _parse_voltage_osm(tags: Dict) -> str:
    """Parse voltage from OSM tags: WN (≥110kV), SN (1-110kV), nN (<1kV).
    Wartości < 1000 traktowane jako V (np. 400 → 0.4 kV → nN)."""
    v = tags.get("voltage") or tags.get("voltage:primary") or ""
    try:
        s = str(v).strip().lower().replace(" ", "")
        if "kv" in s:
            kv = float(s.replace("kv", "").replace(",", "."))
        elif "v" in s:
            volt = float(s.replace("v", "").replace(",", "."))
            kv = volt / 1000.0 if volt >= 1 else volt  # 400 V → 0.4 kV
        else:
            raw = float(s.replace(",", "."))
            kv = raw if raw >= 10 else raw / 1000.0  # 22 → SN, 400 → nN
        if kv >= 110:
            return "WN"
        if kv >= 1:
            return "SN"
        return "nN"
    except (ValueError, TypeError):
        return "SN"


def _check_intersection_with_features(
    parcel_geojson: Dict,
    features: List[Dict],
) -> Dict[str, Any]:
    """
    Sprawdź które linie z cache'u przecinają działkę.
    Zwraca intersecting features + oblicza długość przecięcia.
    """
    if not parcel_geojson or not features:
        return {"detected": False, "features": [], "length_m": 0.0, "voltage": None}

    try:
        parcel = shape(parcel_geojson)
        if not parcel.is_valid:
            parcel = parcel.buffer(0)
    except Exception as e:
        logger.warning("_check_intersection: invalid parcel geom: %s", e)
        return {"detected": False, "features": [], "length_m": 0.0, "voltage": None}

    # Buffer ~20m at 52°N: compensates for OSM vs GUGiK cadastral positional offset.
    # 20m / 111132 ≈ 0.00018°; we use 0.0002° (~22m) to be safe.
    parcel_buffered = parcel.buffer(0.0002)

    intersecting = []
    total_length = 0.0
    voltages = set()

    for feat in features:
        try:
            geom = feat.get("geometry")
            if not geom:
                continue
            line = shape(geom)
            if not line.is_valid:
                line = line.buffer(0)

            # Use buffered parcel for detection — handles positional offset between
            # OSM (GPS survey) and GUGiK cadastral data (typically 10-30m discrepancy)
            if not parcel_buffered.intersects(line):
                continue

            # Length: use original (unbuffered) parcel for accurate crossing length
            intersection = parcel.intersection(line)
            if intersection.is_empty:
                # Line is within tolerance buffer but not strictly inside parcel boundary.
                # Use buffered intersection to get approximate segment length.
                intersection = parcel_buffered.intersection(line)
            seg_length = 0.0
            if intersection.geom_type == "LineString":
                seg_length = _length_meters(intersection)
            elif intersection.geom_type == "MultiLineString":
                for ls in intersection.geoms:
                    seg_length += _length_meters(ls)
            elif intersection.geom_type == "GeometryCollection":
                for g in intersection.geoms:
                    if g.geom_type in ("LineString", "MultiLineString"):
                        if hasattr(g, "geoms"):
                            for ls in g.geoms:
                                seg_length += _length_meters(ls)
                        else:
                            seg_length += _length_meters(g)

            total_length += seg_length
            voltage = feat.get("properties", {}).get("voltage", "SN")
            voltages.add(voltage)
            intersecting.append(feat)

        except Exception as e:
            logger.warning("_check_intersection feature error: %s", e)
            continue

    detected = len(intersecting) > 0
    primary_voltage = list(voltages)[0] if voltages else None

    return {
        "detected": detected,
        "features": intersecting,
        "length_m": round(total_length, 1),
        "voltage": primary_voltage,
        "feature_count": len(intersecting),
    }


def _find_nearby_features(
    parcel_geojson: Dict,
    features: List[Dict],
    max_distance_m: float = 1000,
) -> tuple:
    """
    Znajdź features w promieniu max_distance_m od działki.
    Zwraca (nearby_features, min_distance_m, nearest_voltage).
    """
    try:
        parcel = shape(parcel_geojson)
        if not parcel.is_valid:
            parcel = parcel.buffer(0)
        centroid = parcel.centroid
        lat0 = centroid.y
        # Approx conversion: degrees → meters at this latitude
        dy_m = 111132.0
        dx_m = 111319.0 * math.cos(math.radians(lat0))

        nearby = []
        min_dist = float("inf")
        nearest_voltage = None

        for feat in features:
            try:
                geom = feat.get("geometry")
                if not geom:
                    continue
                line = shape(geom)
                if not line.is_valid:
                    continue
                # Distance in degrees → meters (approximate)
                dist_deg = parcel.distance(line)
                # Approximate conversion to meters
                dist_m = dist_deg * ((dx_m + dy_m) / 2)  # average of x and y scale
                if dist_m <= max_distance_m:
                    nearby.append(feat)
                    if dist_m < min_dist:
                        min_dist = dist_m
                        nearest_voltage = feat.get("properties", {}).get("voltage", "SN")
            except Exception:
                continue

        return nearby, min_dist if nearby else 0, nearest_voltage
    except Exception as e:
        logger.warning("_find_nearby_features error: %s", e)
        return [], 0, None


def _length_meters(geom) -> float:
    """Oblicz długość geometrii w metrach (approx geodezyjne dla WGS84)."""
    try:
        coords = list(geom.coords)
        if len(coords) < 2:
            return 0.0
        lat0 = sum(c[1] for c in coords) / len(coords)
        dy_m = 111132.0
        dx_m = 111319.0 * math.cos(math.radians(lat0))
        total = 0.0
        for i in range(len(coords) - 1):
            x1, y1 = coords[i][0], coords[i][1]
            x2, y2 = coords[i + 1][0], coords[i + 1][1]
            dx = (x2 - x1) * dx_m
            dy = (y2 - y1) * dy_m
            total += math.hypot(dx, dy)
        return total
    except Exception:
        return 0.0


# ========== KIUT WMS GetFeatureInfo (detekcja obecności) ==========
KIUT_WMS_URL = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu"

# Minimalna liczba czerwonych pikseli (linia na WMS) do uznania "wykryto"
KIUT_PIXEL_MIN_RED = 30


async def _check_kiut_wms_pixel_analysis(parcel_geom: Optional[Dict]) -> Optional[tuple]:
    """
    KIUT WMS GetMap + analiza pikseli — detekcja linii (czerwone piksele na obrazie).
    Zasada 7.B: NIE liczymy długości z pikseli — tylko obecność (detected).
    Zwraca (detected: bool, red_count: int) lub None przy błędzie.
    """
    if not parcel_geom or parcel_geom.get("type") != "Polygon":
        return None
    coords = parcel_geom.get("coordinates", [])
    if not coords:
        return None
    ring = coords[0][0] if isinstance(coords[0][0][0], (list, tuple)) else coords[0]
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    lat_min, lat_max = min(lats), max(lats)
    lon_min, lon_max = min(lons), max(lons)
    # WMS 1.3.0 EPSG:4326: BBOX = lat_min, lon_min, lat_max, lon_max
    bbox = f"{lat_min},{lon_min},{lat_max},{lon_max}"
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetMap",
        "LAYERS": "przewod_elektroenergetyczny",
        "CRS": "EPSG:4326",
        "BBOX": bbox,
        "WIDTH": "512",
        "HEIGHT": "512",
        "FORMAT": "image/png",
        "TRANSPARENT": "TRUE",
    }
    try:
        from PIL import Image
        import io
    except ImportError:
        logger.debug("PIL not available — skip KIUT pixel analysis")
        return None
    try:
        loop = asyncio.get_event_loop()
        def _get():
            r = requests.get(
                KIUT_WMS_URL,
                params=params,
                timeout=10,
                headers={"User-Agent": "Kalkulator-KIUT/3.0"},
            )
            return r
        resp = await loop.run_in_executor(None, _get)
        if resp.status_code != 200 or not resp.content:
            return None
        ct = (resp.headers.get("Content-Type") or "").lower()
        if "image" not in ct and "png" not in ct:
            # Może być XML przy błędzie
            if b"ServiceException" in resp.content or b"<?xml" in resp.content[:100]:
                return None
        img = Image.open(io.BytesIO(resp.content))
        img = img.convert("RGBA")
        red_count = 0
        for (r, g, b, a) in img.getdata():
            if a < 128:
                continue
            if r > 120 and r > g and r > b:
                red_count += 1
        detected = red_count >= KIUT_PIXEL_MIN_RED
        logger.info("KIUT WMS pixel analysis: red_count=%d detected=%s", red_count, detected)
        return (detected, red_count)
    except Exception as e:
        logger.debug("KIUT WMS pixel analysis error: %s", e)
        return None


def _parse_kiut_wms_response(resp) -> Optional[bool]:
    """
    Parsuj odpowiedź KIUT WMS GetFeatureInfo.
    GUGiK zwraca XML (text/xml), nie JSON. Komunikat "nie udostępnia danych opisowych"
    = brak obiektu w tym punkcie. Inna zawartość featureMember = wykryto linię.
    """
    if resp.status_code != 200:
        return None
    ct = (resp.headers.get("Content-Type") or "").lower()
    body = resp.text if isinstance(resp.text, str) else resp.content.decode("utf-8", errors="ignore")
    # JSON (gdy serwer kiedyś zwróci)
    if "json" in ct:
        try:
            data = resp.json()
            return len(data.get("features", [])) > 0
        except Exception:
            pass
    # XML od GUGiK: "Usługa nie udostępnia danych opisowych dla wybranego obiektu" = brak linii w tym pikselu
    if "xml" in ct or body.strip().startswith("<?xml"):
        if "nie udostępnia danych opisowych" in body or "nie udostepnia danych opisowych" in body:
            return False
        # FeatureCollection z inną treścią = prawdopodobnie obiekt (linia)
        if "FeatureCollection" in body and "featureMember" in body:
            return True
    return None


async def _check_kiut_wms(lon: float, lat: float) -> Optional[bool]:
    """
    Sprawdź obecność linii elektroenergetycznej via KIUT WMS GetFeatureInfo.
    Zwraca True/False/None (None = brak odpowiedzi).
    NIE daje geometrii — tylko detekcja.
    """
    try:
        # WMS 1.3.0 EPSG:4326: BBOX = lat_min, lon_min, lat_max, lon_max
        bbox = f"{lat - 0.001},{lon - 0.001},{lat + 0.001},{lon + 0.001}"
        params = {
            "SERVICE": "WMS",
            "VERSION": "1.3.0",
            "REQUEST": "GetFeatureInfo",
            "LAYERS": "przewod_elektroenergetyczny",
            "QUERY_LAYERS": "przewod_elektroenergetyczny",
            "INFO_FORMAT": "application/json",
            "CRS": "EPSG:4326",
            "BBOX": bbox,
            "WIDTH": "256",
            "HEIGHT": "256",
            "I": "128",
            "J": "128",
        }
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(
            None,
            lambda: requests.get(
                KIUT_WMS_URL,
                params=params,
                timeout=8,
                headers={"User-Agent": "Kalkulator-KIUT/3.0"},
            ),
        )
        out = _parse_kiut_wms_response(resp)
        if out is None and resp.status_code == 200:
            # Fallback: stara heurystyka (np. inny serwer)
            try:
                data = resp.json()
                out = len(data.get("features", [])) > 0
            except Exception:
                if b"Feature" in (resp.content if hasattr(resp, "content") else b""):
                    out = b"przewod" in (resp.content or b"").lower()
        return out
    except Exception as e:
        logger.debug("KIUT WMS GetFeatureInfo error: %s", e)
        return None


async def fetch_infrastructure(
    parcel_id: Optional[str],
    lon: float,
    lat: float,
    parcel_geom: Optional[Dict] = None,
    infra_type: str = "elektro_SN",
) -> Dict[str, Any]:
    """
    Pobiera dane infrastrukturalne dla działki.
    ZASADA: Wyłącznie dane z API. Brak estymacji.

    LOGIKA:
    1. Sprawdź REGIONAL CACHE (jeśli batch mode — prefetch_regional_osm)
    2. Jeśli brak cache → indywidualny Overpass query
    3. FALLBACK: Jeśli Overpass fail → zwróć "brak danych" ale NIE blokuj raportu
    """
    result = {
        "energie": {
            "type": infra_type,
            "length_m": 0.0,
            "strefa_m": STREFY_OCHRONNE.get(infra_type, 10),
            "detected": False,
            "status": "UNKNOWN",
            "info": "",
            "ok": False,
        },
        "media": {
            "gaz": {"detected": False, "status": "UNKNOWN"},
            "woda": {"detected": False, "status": "UNKNOWN"},
            "kanal": {"detected": False, "status": "UNKNOWN"},
            "cieplo": {"detected": False, "status": "UNKNOWN"},
        },
        "droga": {"access": False, "type": "nieznany", "status": "TEST/OSM"},
        "ok": False,
    }

    osm_result = None

    # --- KROK 1: REGIONAL CACHE (batch mode) ---
    if _osm_regional_cache["features"] is not None and parcel_geom:
        cache_features = _osm_regional_cache["features"]
        logger.info("INFRA [%s]: Sprawdzam regional cache (%d features)",
                     parcel_id, len(cache_features))
        osm_result = _check_intersection_with_features(parcel_geom, cache_features)
        # Jeśli nie przecinają → sprawdź proximity (≤1km = nearby)
        if not osm_result.get("detected") and cache_features:
            nearby_features, min_dist, nearest_voltage = _find_nearby_features(
                parcel_geom, cache_features, max_distance_m=1000
            )
            if nearby_features:
                osm_result["nearby"] = True
                osm_result["features"] = nearby_features
                osm_result["voltage"] = nearest_voltage or "SN"
                osm_result["min_distance_m"] = min_dist
                logger.info("INFRA [%s]: Nearby features: %d (min_dist=%.0fm)",
                           parcel_id, len(nearby_features), min_dist)

    # --- KROK 2: INDIVIDUAL OVERPASS (single parcel mode) ---
    if osm_result is None:
        try:
            logger.info("INFRA [%s]: Individual Overpass query", parcel_id)
            osm_data = await fetch_power_lines(parcel_geom if parcel_geom else None)
            if osm_data and osm_data.get("ok") and osm_data.get("lines"):
                features_for_check = osm_data.get("line_geojson", {}).get("features", [])
                if features_for_check and parcel_geom:
                    osm_result = _check_intersection_with_features(parcel_geom, features_for_check)
                    if not osm_result.get("detected") and osm_data.get("lines"):
                        # Sprawdź proximity — tylko jeśli linie w promieniu 1km
                        nearby_feats, min_dist, nv = _find_nearby_features(
                            parcel_geom, features_for_check, max_distance_m=1000
                        )
                        if nearby_feats:
                            osm_result["nearby"] = True
                            osm_result["features"] = nearby_feats
                            osm_result["voltage"] = nv or osm_data["lines"][0].get("voltage", "SN")
                            osm_result["min_distance_m"] = min_dist
                else:
                    osm_result = {
                        "detected": True,
                        "features": osm_data.get("lines", []),
                        "length_m": osm_data.get("line_length_m", 0.0),
                        "voltage": osm_data["lines"][0].get("voltage", "SN") if osm_data.get("lines") else "SN",
                    }
            else:
                osm_result = {"detected": False, "features": [], "length_m": 0.0, "voltage": None}
        except Exception as e:
            logger.error("INFRA [%s]: Overpass error: %s", parcel_id, e)
            osm_result = {"detected": False, "features": [], "length_m": 0.0, "voltage": None}

    # --- KROK 2b: OPENINFRAMAP (gdy Overpass nie znalazł — ta sama warstwa co na mapie) ---
    if fetch_power_lines_oim and parcel_geom and (not osm_result or (not osm_result.get("detected") and not osm_result.get("nearby"))):
        try:
            oim_data = await fetch_power_lines_oim(parcel_geom)
            raw = oim_data.get("_raw_features", [])
            if raw:
                oim_intersect = _check_intersection_with_features(parcel_geom, raw)
                if oim_intersect.get("detected"):
                    oim_intersect["_source"] = "OpenInfraMap"
                    osm_result = oim_intersect
                    logger.info("INFRA [%s]: Wykryto linie z OpenInfraMap (vector tiles)", parcel_id)
                elif not osm_result:
                    osm_result = {"detected": False, "features": [], "length_m": 0.0, "voltage": None}
        except Exception as e:
            logger.debug("INFRA [%s]: OpenInfraMap fallback error: %s", parcel_id, e)

    # --- Wypełnij wynik ---
    detected = osm_result.get("detected", False) if osm_result else False
    nearby = osm_result.get("nearby", False) if osm_result else False

    if detected:
        # CONFIRMED: Linie przecinają działkę (Overpass lub OpenInfraMap)
        voltage = osm_result.get("voltage", "SN")
        length_m = osm_result.get("length_m", 0.0)
        features = osm_result.get("features", [])
        from_oim = osm_result.get("_source") == "OpenInfraMap"

        result["energie"]["detected"] = True
        result["energie"]["features"] = features
        result["energie"]["geojson"] = {"type": "FeatureCollection", "features": features}
        result["energie"]["feature_count"] = len(features)
        result["energie"]["length_m"] = length_m
        result["energie"]["voltage"] = voltage
        result["energie"]["strefa_m"] = STREFY_OCHRONNE.get(f"elektro_{voltage}", 15)
        if from_oim:
            result["energie"]["status"] = "REAL (OpenInfraMap)"
            result["energie"]["info"] = f"OpenInfraMap: {len(features)} linii, dł. przecięcia {length_m:.1f}m"
            result["energie"]["source"] = "OpenInfraMap (vector tiles)"
        else:
            result["energie"]["status"] = "REAL (OSM Overpass)"
            result["energie"]["info"] = f"OSM: {len(features)} linii, dł. przecięcia {length_m:.1f}m"
            result["energie"]["source"] = "OpenStreetMap (Overpass API)"
        result["energie"]["ok"] = True
        result["ok"] = True
        logger.info("INFRA [%s]: CONFIRMED — %d linii, length=%.1fm, voltage=%s (%s)",
                     parcel_id, len(features), length_m, voltage, "OpenInfraMap" if from_oim else "Overpass")

    elif nearby:
        # NEARBY: Linie w okolicy (BBOX) ale nie przecinają — DO WERYFIKACJI
        # Raportuj jako detected z flagą "DO WERYFIKACJI" → Track A/B się policzy
        voltage = osm_result.get("voltage", "SN")
        features = osm_result.get("features", [])

        result["energie"]["detected"] = True  # Traktuj jako detected dla kalkulacji
        result["energie"]["features"] = features
        result["energie"]["geojson"] = {"type": "FeatureCollection", "features": features}
        result["energie"]["feature_count"] = len(features)
        result["energie"]["length_m"] = 0.0  # Brak przecięcia
        result["energie"]["voltage"] = voltage
        result["energie"]["strefa_m"] = STREFY_OCHRONNE.get(f"elektro_{voltage}", 15)
        result["energie"]["status"] = "NEARBY (OSM) — DO WERYFIKACJI"
        result["energie"]["info"] = f"OSM: {len(features)} linii w okolicy (~1km) — DO WERYFIKACJI NA GEOPORTALU"
        result["energie"]["source"] = "OpenStreetMap (Overpass API)"
        result["energie"]["ok"] = True
        result["ok"] = True
        logger.info("INFRA [%s]: NEARBY — %d linii w BBOX, voltage=%s — DO WERYFIKACJI",
                     parcel_id, len(features), voltage)

    else:
        # NOT DETECTED w OSM — sprawdź KIUT WMS (niebieska linia nN często tylko w KIUT GUGiK)
        result["energie"]["detected"] = False
        result["energie"]["status"] = "NOT_DETECTED"
        result["energie"]["info"] = "Brak linii energetycznych w OSM — DO WERYFIKACJI"
        result["energie"]["source"] = "OpenStreetMap (Overpass API)"
        logger.info("INFRA [%s]: NOT DETECTED (OSM)", parcel_id)

        # Sprawdź KIUT w centroidzie oraz w wielu punktach obwodu (linia może przecinać działkę między punktami)
        kiut_ok = False
        if parcel_geom and parcel_geom.get("type") == "Polygon" and parcel_geom.get("coordinates"):
            try:
                ring = parcel_geom["coordinates"][0]
                if isinstance(ring[0], (list, tuple)):
                    ring = ring[0]
                n = len(ring)
                # Centroid + do 12 punktów równomiernie na obwodzie (większa szansa trafienia w linię)
                pts = [(lon, lat)]
                for k in range(12):
                    i = (k * n) // 12
                    if i < n and len(ring[i]) >= 2:
                        pts.append((float(ring[i][0]), float(ring[i][1])))
                for plon, plat in pts:
                    if await _check_kiut_wms(plon, plat):
                        kiut_ok = True
                        break
            except Exception as e:
                logger.debug("KIUT multi-point sample error: %s", e)
        if not kiut_ok and lon is not None and lat is not None:
            kiut_ok = await _check_kiut_wms(lon, lat)
        # Fallback: KIUT WMS pixel analysis (GetMap 512×512, liczba czerwonych pikseli)
        kiut_pixel_source = None
        if not kiut_ok and parcel_geom:
            pixel_result = await _check_kiut_wms_pixel_analysis(parcel_geom)
            if pixel_result:
                detected_pixel, red_count = pixel_result
                if detected_pixel:
                    kiut_ok = True
                    kiut_pixel_source = red_count
        if kiut_ok:
                result["energie"]["detected"] = True
                result["energie"]["length_m"] = 0.0
                result["energie"]["voltage"] = "nN"
                result["energie"]["strefa_m"] = STREFY_OCHRONNE.get("elektro_nN", 5)
                if kiut_pixel_source is not None:
                    result["energie"]["status"] = "KIUT GUGiK (analiza pikseli WMS)"
                    result["energie"]["info"] = f"Linia wykryta w KIUT WMS (analiza pikseli, {kiut_pixel_source} px). Brak wektora — wpisz długość w Korektę ręczną."
                    result["energie"]["source"] = "KIUT GUGiK (WMS GetMap + pixel analysis)"
                else:
                    result["energie"]["status"] = "KIUT GUGiK (brak wektora — wpisz długość ręcznie)"
                    result["energie"]["info"] = "Linia wykryta w warstwie KIUT GUGiK (np. nN). Brak geometrii wektorowej — zmierz długość w Geoportalu i wpisz w Korektę ręczną."
                    result["energie"]["source"] = "KIUT GUGiK (WMS GetFeatureInfo)"
                result["energie"]["geojson"] = {"type": "FeatureCollection", "features": []}
                result["energie"]["ok"] = True
                result["ok"] = True
                logger.info("INFRA [%s]: Wykryto linię w KIUT GUGiK (%s) — użytkownik wpisze długość",
                            parcel_id, "pixel analysis" if kiut_pixel_source is not None else "GetFeatureInfo")

    return result
