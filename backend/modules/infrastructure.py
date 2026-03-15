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
2. GUGiK KIUT WMS GetFeatureInfo — detekcja obecności (bez geometrii)

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
from backend.integrations.openinframap import fetch_power_lines_oim
from backend.integrations.gesut_client import GESUTClient
from backend.integrations.bdot10k import BDOT10kClient
from backend.integrations.pse_scraper import PSEWebScraper
from backend.config.voivodeships import VOIVODESHIPS_CONFIG

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
    "poles": None,
    "bbox": None,
    "valid": False,
}


def clear_regional_cache():
    """Czyści cache regionalny (wywoływane po batch processing)."""
    _osm_regional_cache["features"] = None
    _osm_regional_cache["poles"] = None
    _osm_regional_cache["bbox"] = None
    _osm_regional_cache["valid"] = False


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
  node["power"="tower"]({bbox_str});
  node["power"="pole"]({bbox_str});
);
out geom;
"""
    features = []
    poles = []
    success = False
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
                    if el.get("type") == "way":
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
                    elif el.get("type") == "node":
                        tags = el.get("tags", {}) or {}
                        if tags.get("power") in ("tower", "pole"):
                            geojson = {"type": "Point", "coordinates": [el.get("lon"), el.get("lat")]}
                            poles.append({
                                "type": "Feature",
                                "geometry": geojson,
                                "properties": {"power": tags.get("power"), "osm_id": el.get("id")},
                            })
                success = True
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

    if success:
        _osm_regional_cache["features"] = features
        _osm_regional_cache["poles"] = poles
        _osm_regional_cache["bbox"] = (s, w, n, e)
        _osm_regional_cache["valid"] = True
        logger.info("REGIONAL OSM: Pobrano %d linii energetycznych dla regionu", len(features))
        return len(features)

    _osm_regional_cache["features"] = None
    _osm_regional_cache["bbox"] = None
    _osm_regional_cache["valid"] = False
    logger.warning("REGIONAL OSM: cache invalid (Overpass nie odpowiedział poprawnie)")
    return 0


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

    # Buffer ~50m at 52°N: compensates for OSM vs GUGiK cadastral positional offset.
    # Typical discrepancy in Poland is 10-50m. 50m / 111132 ≈ 0.00045°
    parcel_buffered = parcel.buffer(0.00045)

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
            # OSM (GPS survey) and GUGiK cadastral data (typically 10-50m discrepancy)
            if not parcel_buffered.intersects(line):
                continue

            # Length: try original parcel first, fallback to buffered intersection
            intersection = parcel.intersection(line)
            if intersection.is_empty:
                # Line is within tolerance buffer but doesn't strictly cross parcel boundary.
                # Use buffered intersection — gives approximate crossing length.
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


async def _kiut_raster_line_length(
    parcel_geom: Dict,
    band_width_m: float = 30.0,
) -> Optional[float]:
    """
    Pobierz GetMap PNG z KIUT dla obszaru działki i oblicz długość linii
    przecinającej (lub biegnącej w pasie) działki.

    Zasada ZERO DOMYSŁÓW: tylko dane z rastra KIUT, bez interpolacji.
    Zwraca długość w metrach lub None gdy brak danych.

    Podejście:
    1. GetMap PNG z KIUT dla bbox działki + bufor ~200m
    2. Znajdź piksele z treścią (linie energetyczne)
    3. Konwertuj piksele na WGS84
    4. Oblicz ile metrów linii przebiega w pasie działki (parcel + band_width_m buffer)
    """
    try:
        from PIL import Image
        import numpy as np
        import io

        # BBOX z geometrii działki + bufor 400m (linie KIUT mogą być ~300m od EGIB działki)
        coords_raw = parcel_geom.get("coordinates", [])
        if not coords_raw:
            return None
        ring = coords_raw[0][0] if isinstance(coords_raw[0][0][0], (list, tuple)) else coords_raw[0]
        lons_p = [p[0] for p in ring]
        lats_p = [p[1] for p in ring]
        c_lon = sum(lons_p) / len(lons_p)
        c_lat = sum(lats_p) / len(lats_p)

        # Bufor 400m w stopniach (przesunięcie KIUT vs EGIB może sięgać ~300m)
        buf_lon = 400.0 / (111319.0 * math.cos(math.radians(c_lat)))
        buf_lat = 400.0 / 111132.0
        min_lon = min(lons_p) - buf_lon
        max_lon = max(lons_p) + buf_lon
        min_lat = min(lats_p) - buf_lat
        max_lat = max(lats_p) + buf_lat

        # WMS 1.3.0 EPSG:4326: BBOX = lat_min,lon_min,lat_max,lon_max
        bbox_str = f"{min_lat},{min_lon},{max_lat},{max_lon}"
        IMG_SIZE = 512

        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(
            None,
            lambda: requests.get(
                KIUT_WMS_URL,
                params={
                    "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap",
                    "LAYERS": "przewod_elektroenergetyczny",
                    "FORMAT": "image/png", "TRANSPARENT": "TRUE",
                    "CRS": "EPSG:4326",
                    "BBOX": bbox_str,
                    "WIDTH": str(IMG_SIZE), "HEIGHT": str(IMG_SIZE),
                },
                timeout=10,
                headers={"User-Agent": "Kalkulator-KIUT/3.0"},
            ),
        )

        if resp.status_code != 200 or "image" not in resp.headers.get("Content-Type", ""):
            return None

        img = Image.open(io.BytesIO(resp.content)).convert("RGBA")
        arr = np.array(img)

        # Piksele z treścią (linie energetyczne = kolor niezerowy)
        nonzero = np.any(arr[:, :, :3] > 15, axis=2)
        py_idx, px_idx = np.where(nonzero)
        if len(px_idx) == 0:
            return None

        # Konwertuj piksele → WGS84
        # W WMS 1.3.0 EPSG:4326: oś Y = lat (od max do min), X = lon (od min do max)
        lon_range = max_lon - min_lon
        lat_range = max_lat - min_lat
        pts_lon = min_lon + (px_idx / IMG_SIZE) * lon_range
        pts_lat = max_lat - (py_idx / IMG_SIZE) * lat_range  # Y odwrócony

        # Bufor działki = szerokość pasa ochronnego (band_width_m)
        # Znajdź piksele linii w pasie działki
        buf_deg_lon = band_width_m / (111319.0 * math.cos(math.radians(c_lat)))
        buf_deg_lat = band_width_m / 111132.0
        parcel_min_lon = min(lons_p) - buf_deg_lon
        parcel_max_lon = max(lons_p) + buf_deg_lon
        parcel_min_lat = min(lats_p) - buf_deg_lat
        parcel_max_lat = max(lats_p) + buf_deg_lat

        mask = (
            (pts_lon >= parcel_min_lon) & (pts_lon <= parcel_max_lon) &
            (pts_lat >= parcel_min_lat) & (pts_lat <= parcel_max_lat)
        )
        near_lons = pts_lon[mask]
        near_lats = pts_lat[mask]

        if len(near_lons) < 2:
            return None

        # Oblicz długość linii przez obszar: posortuj po lon i zsumuj odcinki
        order = np.argsort(near_lons)
        sorted_lons = near_lons[order]
        sorted_lats = near_lats[order]

        dx_m = 111319.0 * math.cos(math.radians(c_lat))
        dy_m = 111132.0
        total_len = 0.0
        for i in range(len(sorted_lons) - 1):
            dx = (sorted_lons[i + 1] - sorted_lons[i]) * dx_m
            dy = (sorted_lats[i + 1] - sorted_lats[i]) * dy_m
            seg = math.hypot(dx, dy)
            # Ignoruj skoki > 50m (nieciągłości rastra)
            if seg < 50.0:
                total_len += seg

        logger.info(
            "KIUT raster: %d pikseli w pasie %dm, długość=%.1fm",
            int(mask.sum()), int(band_width_m), total_len,
        )
        return round(total_len, 1) if total_len > 0 else None

    except Exception as e:
        logger.warning("_kiut_raster_line_length error: %s", e)
        return None


async def _check_kiut_wms(lon: float, lat: float) -> Optional[bool]:
    """
    Sprawdź obecność linii elektroenergetycznej via KIUT WMS GetFeatureInfo.
    Zwraca True/False/None (None = brak odpowiedzi).
    NIE daje geometrii — tylko detekcja.
    """
    try:
        # WMS 1.3.0 EPSG:4326: BBOX = lat_min, lon_min, lat_max, lon_max (nie lon,lat!)
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
        if resp.status_code == 200:
            try:
                data = resp.json()
                features = data.get("features", [])
                if features:
                    return True
            except Exception:
                # Nie JSON — prawdopodobnie GML/XML.
                # Jeśli serwer zwrócił FeatureCollection, najpewniej znalazł obiekt.
                content = resp.content.lower()
                if b"featurecollection" in content or b"gml:featuremember" in content:
                    return True
                return False
        return None
    except Exception as e:
        logger.debug("KIUT WMS GetFeatureInfo error: %s", e)
        return None


def _get_voivodeship_from_coords(lon: float, lat: float) -> str:
    """
    Określ województwo na podstawie współrzędnych.
    Używa prostego mapowania na podstawie granic przybliżonych.
    """
    try:
        # Proste mapowanie na podstawie współrzędnych (przybliżone granice)
        if 14.0 <= lon <= 19.0 and 50.0 <= lat <= 54.5:
            if lat > 52.0 and lon < 16.0:
                return "zachodniopomorskie"
            elif lat > 51.5 and lon > 17.0:
                return "wielkopolskie"
            elif lon < 15.5:
                return "lubuskie"
            else:
                return "wielkopolskie"
        elif 19.0 <= lon <= 23.5 and 49.0 <= lat <= 54.5:
            if lat > 52.0:
                return "warmińsko-mazurskie"
            elif lat > 50.5:
                return "mazowieckie"
            else:
                return "świętokrzyskie"
        elif 16.0 <= lon <= 19.0 and 49.0 <= lat <= 51.0:
            return "śląskie"
        elif 18.0 <= lon <= 21.0 and 51.0 <= lat <= 53.0:
            return "łódzkie"
        elif 20.5 <= lon <= 24.0 and 50.0 <= lat <= 52.0:
            return "lubelskie"
        elif 17.0 <= lon <= 20.5 and 50.0 <= lat <= 52.0:
            return "opolskie"
        elif 15.0 <= lon <= 18.0 and 50.5 <= lat <= 52.5:
            return "dolnośląskie"
        elif 17.5 <= lon <= 20.0 and 52.5 <= lat <= 54.5:
            return "kujawsko-pomorskie"
        elif 21.0 <= lon <= 24.5 and 52.0 <= lat <= 54.5:
            return "podlaskie"
        elif 14.0 <= lon <= 17.0 and 52.5 <= lat <= 54.5:
            return "zachodniopomorskie"
        elif 19.0 <= lon <= 22.0 and 53.5 <= lat <= 54.5:
            return "warmińsko-mazurskie"
        else:
            return "mazowieckie"  # Default
    except Exception:
        return "all"


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
            "poles_count": 0,
            "poles_geojson": {"type": "FeatureCollection", "features": []},
        },
        "media": {
            "gaz": {"detected": False, "status": "UNKNOWN"},
            "woda": {"detected": False, "status": "UNKNOWN"},
            "kanal": {"detected": False, "status": "UNKNOWN"},
            "cieplo": {"detected": False, "status": "UNKNOWN"},
        },
        "telecom": {"detected": False, "source": "", "info": ""},
        "droga": {"access": False, "type": "nieznany", "status": "TEST/OSM"},
        "ok": False,
    }

    osm_result = None

    # --- KROK 1: REGIONAL CACHE (batch mode) ---
    if _osm_regional_cache["valid"] and parcel_geom:
        cache_features = _osm_regional_cache["features"]
        cache_poles = _osm_regional_cache.get("poles") or []
        if cache_features:
            logger.info("INFRA [%s]: Sprawdzam regional cache (%d features)",
                         parcel_id, len(cache_features))
            osm_result = _check_intersection_with_features(parcel_geom, cache_features)
            osm_result["source"] = "OpenStreetMap (Overpass API)"
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
        else:
            logger.info("INFRA [%s]: Regional cache pusty — przechodzę do indywidualnych zapytań",
                        parcel_id)
        # Poles count from regional cache (if available)
        if cache_poles:
            try:
                parcel = shape(parcel_geom)
                if not parcel.is_valid:
                    parcel = parcel.buffer(0)
                parcel_buffered = parcel.buffer(0.0002)
                poles_count = 0
                poles_in = []
                for feat in cache_poles:
                    coords = feat.get("geometry", {}).get("coordinates")
                    if not coords:
                        continue
                    pt = shape({"type": "Point", "coordinates": coords})
                    if parcel_buffered.contains(pt):
                        poles_count += 1
                        poles_in.append(feat)
                if osm_result is None:
                    osm_result = {"detected": False, "features": [], "length_m": 0.0, "voltage": None}
                osm_result["poles_count"] = poles_count
                osm_result["poles_geojson"] = {"type": "FeatureCollection", "features": poles_in}
            except Exception as e:
                logger.warning("INFRA [%s]: poles count error (cache): %s", parcel_id, e)

    # --- KROK 2: INDIVIDUAL OVERPASS (single parcel mode) ---
    if osm_result is None:
        try:
            logger.info("INFRA [%s]: Individual Overpass query", parcel_id)
            osm_data = await fetch_power_lines(parcel_geom if parcel_geom else None, include_poles=True)
            if osm_data and osm_data.get("ok") and osm_data.get("lines"):
                features_for_check = osm_data.get("line_geojson", {}).get("features", [])
                if features_for_check and parcel_geom:
                    osm_result = _check_intersection_with_features(parcel_geom, features_for_check)
                    osm_result["source"] = "OpenStreetMap (Overpass API)"
                    osm_result["poles_count"] = osm_data.get("poles_count", 0)
                    osm_result["poles_geojson"] = osm_data.get("poles_geojson", {"type": "FeatureCollection", "features": []})
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
                        "source": "OpenStreetMap (Overpass API)",
                        "poles_count": osm_data.get("poles_count", 0),
                        "poles_geojson": osm_data.get("poles_geojson", {"type": "FeatureCollection", "features": []}),
                    }
            elif osm_data and osm_data.get("ok"):
                # No lines, but possibly poles detected
                osm_result = {
                    "detected": False,
                    "features": [],
                    "length_m": 0.0,
                    "voltage": None,
                    "source": "OpenStreetMap (Overpass API)",
                    "poles_count": osm_data.get("poles_count", 0),
                    "poles_geojson": osm_data.get("poles_geojson", {"type": "FeatureCollection", "features": []}),
                }
            else:
                osm_result = None
        except Exception as e:
            logger.error("INFRA [%s]: Overpass error: %s", parcel_id, e)
            osm_result = None

    # --- KROK 3: FALLBACK OpenInfraMap (vector tiles) ---
    if osm_result is None:
        try:
            logger.info("INFRA [%s]: OpenInfraMap fallback", parcel_id)
            oim_data = await fetch_power_lines_oim(parcel_geom)
            raw_feats = oim_data.get("_raw_features") or oim_data.get("line_geojson", {}).get("features", [])
            if raw_feats and parcel_geom:
                osm_result = _check_intersection_with_features(parcel_geom, raw_feats)
                osm_result["source"] = "OpenInfraMap (vector tiles)"
                if not osm_result.get("detected") and raw_feats:
                    nearby_feats, min_dist, nv = _find_nearby_features(
                        parcel_geom, raw_feats, max_distance_m=1000
                    )
                    if nearby_feats:
                        osm_result["nearby"] = True
                        osm_result["features"] = nearby_feats
                        osm_result["voltage"] = nv or "SN"
                        osm_result["min_distance_m"] = min_dist
            elif raw_feats:
                osm_result = {
                    "detected": True,
                    "features": raw_feats,
                    "length_m": 0.0,
                    "voltage": (raw_feats[0].get("properties", {}).get("voltage", "SN") if raw_feats else "SN"),
                    "source": "OpenInfraMap (vector tiles)",
                }
            else:
                osm_result = {"detected": False, "features": [], "length_m": 0.0, "voltage": None}
        except Exception as e:
            logger.error("INFRA [%s]: OpenInfraMap error: %s", parcel_id, e)
            osm_result = {"detected": False, "features": [], "length_m": 0.0, "voltage": None}

    # --- KROK 4: FALLBACK GESUT (jeśli OSM i OIM nie znalazły) ---
    if osm_result is None or not osm_result.get("detected"):
        try:
            logger.info("INFRA [%s]: GESUT fallback", parcel_id)
            if parcel_geom:
                # Oblicz bbox z geometrii działki + bufor
                parcel_shape = shape(parcel_geom)
                bounds = parcel_shape.bounds  # minx, miny, maxx, maxy
                bbox = {
                    'minx': bounds[0] - 0.01,
                    'miny': bounds[1] - 0.01,
                    'maxx': bounds[2] + 0.01,
                    'maxy': bounds[3] + 0.01,
                }
                gesut_client = GESUTClient()
                gesut_features = gesut_client.get_infrastructure_wfs(bbox)
                if gesut_features and parcel_geom:
                    # Typowana lista: E=energia, T=telekom (GESUT zwraca wszystkie typy)
                    extracted = gesut_client.extract_infrastructure_info(gesut_features)
                    converted_features = []
                    telecom_features = []
                    for item in extracted:
                        geom = item.get("geometry")
                        if not geom or geom.get("type") not in ("LineString", "MultiLineString"):
                            continue
                        f = {"type": "Feature", "geometry": geom, "properties": {}}
                        if item.get("type") == "E":
                            props = item.get("properties") or {}
                            voltage = _parse_voltage_gesut(props) if isinstance(props, dict) else "SN"
                            f["properties"]["voltage"] = voltage
                            converted_features.append(f)
                        elif item.get("type") == "T":
                            telecom_features.append(f)

                    if converted_features:
                        gesut_result = _check_intersection_with_features(parcel_geom, converted_features)
                        gesut_result["source"] = "GESUT WFS"
                        if gesut_result.get("detected"):
                            osm_result = gesut_result
                            logger.info("INFRA [%s]: ✓ GESUT znalazł infrastrukturę", parcel_id)
                    # Telekom: podziemna linia kablowa (telekomunikacyjna/światłowodowa)
                    if telecom_features:
                        telecom_result = _check_intersection_with_features(parcel_geom, telecom_features)
                        if telecom_result.get("detected"):
                            result["telecom"]["detected"] = True
                            result["telecom"]["source"] = "GESUT WFS"
                            result["telecom"]["info"] = "Podziemna linia kablowa (telekomunikacyjna/światłowodowa)"
                            logger.info("INFRA [%s]: ✓ GESUT znalazł linię telekom./światłowodową", parcel_id)
        except Exception as e:
            logger.error("INFRA [%s]: GESUT error: %s", parcel_id, e)

    # --- KROK 5: FALLBACK PSE Web Scraping (Polskie Sieci Elektroenergetyczne) ---
    if osm_result is None or not osm_result.get("detected"):
        try:
            logger.info("INFRA [%s]: PSE Web Scraping fallback", parcel_id)
            if parcel_geom:
                # Oblicz bbox z geometrii działki + większy bufor dla linii WN
                parcel_shape = shape(parcel_geom)
                bounds = parcel_shape.bounds  # minx, miny, maxx, maxy
                # Większy bufor dla PSE (linie WN mogą być daleko)
                buffer_deg = 0.05  # ~5km
                extended_bounds = parcel_shape.buffer(buffer_deg).bounds

                pse_scraper = PSEWebScraper()
                pse_lines = await pse_scraper.get_transmission_lines_data()
                if pse_lines:
                    # Konwertuj na GeoJSON features
                    pse_features = pse_scraper.convert_pse_to_geojson(pse_lines)
                    if pse_features:
                        # Filtruj tylko linie w rozszerzonym bbox działki
                        filtered_features = []
                        for feat in pse_features:
                            feat_geom = feat.get("geometry")
                            if feat_geom:
                                line = shape(feat_geom)
                                extended_bbox = parcel_shape.buffer(buffer_deg)
                                if extended_bbox.intersects(line):
                                    filtered_features.append(feat)

                        if filtered_features:
                            pse_result = _check_intersection_with_features(parcel_geom, filtered_features)
                            pse_result["source"] = "PSE Web Scraping (Polskie Sieci Elektroenergetyczne)"
                            if pse_result.get("detected"):
                                osm_result = pse_result
                                logger.info("INFRA [%s]: ✓ PSE znalazł infrastrukturę WN", parcel_id)
        except Exception as e:
            logger.error("INFRA [%s]: PSE scraping error: %s", parcel_id, e)

    # --- KROK 6: FALLBACK BDOT10k (Baza Danych Obiektów Topograficznych) ---
    if osm_result is None or not osm_result.get("detected"):
        try:
            logger.info("INFRA [%s]: BDOT10k fallback", parcel_id)
            if parcel_geom:
                # Oblicz bbox z geometrii działki + bufor
                parcel_shape = shape(parcel_geom)
                bounds = parcel_shape.bounds  # minx, miny, maxx, maxy
                bbox = (bounds[0] - 0.01, bounds[1] - 0.01, bounds[2] + 0.01, bounds[3] + 0.01)

                bdot_client = BDOT10kClient()
                bbox_dict = {
                    'minx': bbox[0], 'miny': bbox[1],
                    'maxx': bbox[2], 'maxy': bbox[3]
                }
                bdot_features = await bdot_client.get_infrastructure_in_bbox(bbox)
                if bdot_features:
                    # Filtruj tylko linie energetyczne
                    power_features = [f for f in bdot_features if f.get("properties", {}).get("type") == "power_line"]
                    if power_features and parcel_geom:
                        bdot_result = _check_intersection_with_features(parcel_geom, power_features)
                        bdot_result["source"] = "BDOT10k (Baza Danych Obiektów Topograficznych)"
                        if bdot_result.get("detected"):
                            osm_result = bdot_result
                            logger.info("INFRA [%s]: ✓ BDOT10k znalazł infrastrukturę", parcel_id)

                # Słupy z BDOT10k (PTWP_A/PTTR_A) — zawsze próbuj w fallbacku BDOT, także gdy brak linii
                poles_features = await bdot_client.get_infrastructure_by_type("power_towers", bbox_dict)
                if poles_features and parcel_geom:
                    poles_in_parcel = bdot_client.count_poles_in_parcel(poles_features, parcel_geom)
                    if poles_in_parcel > 0:
                        if not osm_result:
                            osm_result = {
                                "detected": False,
                                "voltage": "SN",
                                "source": "BDOT10k (słupy/wieże)",
                                "poles_count": 0,
                                "poles_geojson": {"type": "FeatureCollection", "features": []},
                            }
                        osm_result["poles_count"] = poles_in_parcel
                        if not osm_result.get("poles_geojson") or not osm_result["poles_geojson"].get("features"):
                            parcel_shape = shape(parcel_geom)
                            poles_in = [
                                f for f in poles_features
                                if f.get("geometry", {}).get("type") == "Point" and f.get("geometry", {}).get("coordinates")
                                and parcel_shape.buffer(0.0001).contains(shape(f["geometry"]))
                            ]
                            osm_result["poles_geojson"] = {"type": "FeatureCollection", "features": poles_in}
                        logger.info("INFRA [%s]: BDOT10k znalazł %d słupów", parcel_id, poles_in_parcel)
        except Exception as e:
            logger.error("INFRA [%s]: BDOT10k error: %s", parcel_id, e)

    # --- Wypełnij wynik ---
    detected = osm_result.get("detected", False) if osm_result else False
    nearby = osm_result.get("nearby", False) if osm_result else False
    poles_count = (osm_result or {}).get("poles_count", 0) if osm_result else 0
    poles_only = True if (not detected and poles_count and poles_count > 0) else False

    if detected:
        # CONFIRMED: Linie przecinają działkę
        voltage = osm_result.get("voltage", "SN")
        length_m = osm_result.get("length_m", 0.0)
        features = osm_result.get("features", [])
        poles_count = osm_result.get("poles_count")
        poles_geojson = osm_result.get("poles_geojson")

        result["energie"]["detected"] = True
        result["energie"]["features"] = features
        result["energie"]["geojson"] = {"type": "FeatureCollection", "features": features}
        result["energie"]["feature_count"] = len(features)
        result["energie"]["length_m"] = length_m
        result["energie"]["voltage"] = voltage
        if poles_count is not None:
            result["energie"]["poles_count"] = poles_count
        if poles_geojson:
            result["energie"]["poles_geojson"] = poles_geojson
        result["energie"]["strefa_m"] = STREFY_OCHRONNE.get(f"elektro_{voltage}", 15)
        result["energie"]["status"] = "REAL (OSM Overpass)"
        result["energie"]["info"] = f"OSM: {len(features)} linii, dł. przecięcia {length_m:.1f}m"
        result["energie"]["source"] = osm_result.get("source") or "OpenStreetMap (Overpass API)"
        result["energie"]["ok"] = True
        result["ok"] = True
        logger.info("INFRA [%s]: CONFIRMED — %d linii, length=%.1fm, voltage=%s",
                     parcel_id, len(features), length_m, voltage)

    elif nearby:
        # NEARBY: Linie w okolicy (BBOX) ale nie przecinają geometrycznie (błąd pozycyjny OSM vs EGIB).
        # Próbuj zmierzyć długość z rastra KIUT — jedyne wiarygodne źródło.
        voltage = osm_result.get("voltage", "SN")
        features = osm_result.get("features", [])
        poles_count = osm_result.get("poles_count")
        poles_geojson = osm_result.get("poles_geojson")
        strefa_m = STREFY_OCHRONNE.get(f"elektro_{voltage}", 15)

        # Próba pomiaru z rastra KIUT — multi-band retry (strefa może być za wąska przy błędzie pozycyjnym OSM)
        raster_length = None
        if parcel_geom:
            for try_band in sorted(set([strefa_m, 30, 50, 100, 200, 300])):
                logger.info("INFRA [%s]: NEARBY — próba KIUT raster (band=%dm)", parcel_id, int(try_band))
                raster_length = await _kiut_raster_line_length(parcel_geom, band_width_m=try_band)
                logger.info("INFRA [%s]: NEARBY — KIUT raster wynik band=%dm: %s", parcel_id, int(try_band), raster_length)
                if raster_length is not None and raster_length > 0:
                    logger.info("INFRA [%s]: NEARBY — KIUT raster udany z band=%dm", parcel_id, int(try_band))
                    break

        result["energie"]["detected"] = True
        result["energie"]["features"] = features
        result["energie"]["geojson"] = {"type": "FeatureCollection", "features": features}
        result["energie"]["feature_count"] = len(features)
        result["energie"]["voltage"] = voltage
        if poles_count is not None:
            result["energie"]["poles_count"] = poles_count
        if poles_geojson:
            result["energie"]["poles_geojson"] = poles_geojson
        result["energie"]["strefa_m"] = strefa_m
        result["energie"]["ok"] = True
        result["ok"] = True

        if raster_length is not None and raster_length > 0:
            result["energie"]["length_m"] = raster_length
            result["energie"]["status"] = "OSM NEARBY + KIUT raster (długość z GetMap)"
            result["energie"]["source"] = "KIUT GUGiK (WMS GetMap — raster) + OSM (detekcja)"
            result["energie"]["info"] = (
                f"OSM: {len(features)} linii {voltage} w pobliżu działki. "
                f"Długość przez działkę z rastra KIUT: {raster_length:.1f}m. "
                f"Zweryfikuj w Geoportalu."
            )
            logger.info(
                "INFRA [%s]: NEARBY+KIUT raster — voltage=%s raster_length=%.1fm",
                parcel_id, voltage, raster_length,
            )
        else:
            result["energie"]["length_m"] = 0.0
            result["energie"]["status"] = "NEARBY (OSM) — brak długości z rastra"
            result["energie"]["source"] = osm_result.get("source") or "OpenStreetMap (Overpass API)"
            result["energie"]["info"] = (
                f"OSM: {len(features)} linii {voltage} w pobliżu (~1km). "
                f"Raster KIUT nie zwrócił długości — podaj w Korekcie ręcznej."
            )
            logger.info(
                "INFRA [%s]: NEARBY — %d linii w BBOX, voltage=%s — raster pomiar nieudany",
                parcel_id, len(features), voltage,
            )

    else:
        # POLES ONLY: słupy są na działce, linia nie została wykryta (brak wektora)
        if poles_only:
            voltage = osm_result.get("voltage", "SN")
            result["energie"]["detected"] = True
            result["energie"]["features"] = []
            result["energie"]["geojson"] = {"type": "FeatureCollection", "features": []}
            result["energie"]["feature_count"] = 0
            result["energie"]["length_m"] = 0.0
            result["energie"]["voltage"] = voltage
            result["energie"]["poles_count"] = poles_count
            result["energie"]["poles_geojson"] = osm_result.get("poles_geojson", {"type": "FeatureCollection", "features": []})
            result["energie"]["strefa_m"] = STREFY_OCHRONNE.get(f"elektro_{voltage}", 15)
            result["energie"]["status"] = "POLES ONLY (OSM) — DO WERYFIKACJI"
            result["energie"]["info"] = f"OSM: wykryto słupy ({poles_count}), brak wektora linii — DO WERYFIKACJI"
            result["energie"]["source"] = osm_result.get("source") or "OpenStreetMap (Overpass API)"
            result["energie"]["ok"] = True
            result["ok"] = True
            logger.info("INFRA [%s]: POLES ONLY — poles=%d", parcel_id, poles_count)
            return result

        # NOT DETECTED w OSM — sprawdź KIUT WMS (niebieska linia nN często tylko w KIUT GUGiK)
        result["energie"]["detected"] = False
        result["energie"]["status"] = "NOT_DETECTED"
        result["energie"]["info"] = "Brak linii energetycznych w OSM — DO WERYFIKACJI"
        result["energie"]["source"] = osm_result.get("source") or "OpenStreetMap (Overpass API)"
        logger.info("INFRA [%s]: NOT DETECTED (OSM)", parcel_id)

        # Sprawdź KIUT w centroidzie oraz w kilku punktach działki (linia może biec wzdłuż granicy)
        kiut_ok = False
        if parcel_geom and parcel_geom.get("type") == "Polygon" and parcel_geom.get("coordinates"):
            try:
                ring = parcel_geom["coordinates"][0]
                if isinstance(ring[0], (list, tuple)):
                    ring = ring[0]
                n = len(ring)
                # centroid + 4 punkty (początek, 1/4, 1/2, 3/4 obwodu)
                pts = [(lon, lat)]
                for i in [0, n // 4, n // 2, 3 * n // 4]:
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
        if kiut_ok:
                # Użyj napięcia z infra_type (przekazanego z formularza), nie hardkoduj nN
                kiut_voltage_map = {"elektro_WN": "WN", "elektro_SN": "SN", "elektro_nN": "nN"}
                kiut_voltage = kiut_voltage_map.get(infra_type, "SN")
                strefa_m = STREFY_OCHRONNE.get(infra_type, STREFY_OCHRONNE.get("elektro_SN", 15))

                # Próba automatycznego pomiaru długości linii z rastra KIUT
                # Próbuj kolejno: strefa z infra_type → 30m → 50m (rosnący bufor dla przesunięcia OSM)
                raster_length = None
                if parcel_geom:
                    for try_band in sorted(set([strefa_m, 30, 50, 100, 200, 300])):
                        raster_length = await _kiut_raster_line_length(parcel_geom, band_width_m=try_band)
                        if raster_length is not None and raster_length > 0:
                            logger.info("INFRA [%s]: KIUT raster udany z band=%dm", parcel_id, int(try_band))
                            break

                result["energie"]["detected"] = True
                result["energie"]["voltage"] = kiut_voltage
                result["energie"]["strefa_m"] = strefa_m
                result["energie"]["source"] = "KIUT GUGiK (WMS GetMap — raster)"
                result["energie"]["geojson"] = {"type": "FeatureCollection", "features": []}
                result["energie"]["ok"] = True
                result["ok"] = True

                if raster_length is not None and raster_length > 0:
                    result["energie"]["length_m"] = raster_length
                    result["energie"]["status"] = "KIUT GUGiK (raster — długość z GetMap)"
                    result["energie"]["info"] = (
                        f"Linia {kiut_voltage} z KIUT GUGiK. "
                        f"Długość obliczona z rastra WMS: {raster_length:.1f}m. "
                        f"Zweryfikuj w Geoportalu i w razie potrzeby popraw w Korekcie ręcznej."
                    )
                    logger.info(
                        "INFRA [%s]: KIUT raster długość=%.1fm (%s)",
                        parcel_id, raster_length, kiut_voltage,
                    )
                else:
                    result["energie"]["length_m"] = 0.0
                    result["energie"]["status"] = "KIUT GUGiK (wykryto, brak długości z rastra)"
                    result["energie"]["info"] = (
                        f"Linia {kiut_voltage} wykryta w KIUT GUGiK. "
                        f"Nie udało się automatycznie zmierzyć długości z rastra — "
                        f"zmierz w Geoportalu i wpisz w Korektę ręczną."
                    )
                    logger.info(
                        "INFRA [%s]: KIUT wykryto linię (%s) ale raster pomiaru się nie powiódł",
                        parcel_id, kiut_voltage,
                    )

    return result


def _parse_voltage_gesut(props: Dict) -> str:
    """Parsuje napięcie z właściwości GESUT"""
    # GESUT może mieć różne pola dla napięcia
    voltage_fields = ["napięcie", "voltage", "napiecie", "poziom_napiecia"]
    for field in voltage_fields:
        v = props.get(field)
        if v:
            # Spróbuj sparsować podobnie jak OSM
            try:
                s = str(v).strip().lower().replace(" ", "")
                if "kv" in s:
                    kv = float(s.replace("kv", "").replace(",", "."))
                elif "v" in s:
                    volt = float(s.replace("v", "").replace(",", "."))
                    kv = volt / 1000.0 if volt >= 1 else volt
                else:
                    raw = float(s.replace(",", "."))
                    kv = raw if raw >= 10 else raw / 1000.0
                if kv >= 110:
                    return "WN"
                if kv >= 1:
                    return "SN"
                return "nN"
            except (ValueError, TypeError):
                continue
    return "SN"  # Default
