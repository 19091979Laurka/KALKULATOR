"""
Moduł: Agregator Property_Master_Record (Spec v3.0)
Główny koordynator zbierania danych z zachowaniem jawności statusu (REAL/TEST/ERROR).
KROK 2: Shapely integration for real infrastructure intersection calculation.
"""
import logging
import asyncio
import json
import math
from typing import Dict, Any, Optional, List, Tuple
from shapely.geometry import shape, LineString, Polygon, GeometryCollection
from shapely.ops import unary_union
from backend.integrations.uldk import ULDKClient
from backend.integrations.kieg import KIEGClient
from backend.integrations.gunb import GUNBClient
from backend.integrations.rcn_gugik import GUGikRCNClient
from backend.integrations.gus_fixed import GUSClientFixed, is_agricultural
from backend.modules.terrain import fetch_terrain
from backend.modules.planning import fetch_planning
from backend.modules.infrastructure import fetch_infrastructure

logger = logging.getLogger(__name__)


def _bbox_2180_from_geojson(geojson: Optional[Dict]) -> Optional[Tuple[float, float, float, float]]:
    """
    Oblicz BBOX (E_min, N_min, E_max, N_max) w EPSG:2180 z geometrii GeoJSON (WGS84).
    Używane gdy ULDK get_parcel_bbox nie zwróci wyniku — pozwala nie tracić KIEG/RCN.
    Przybliżenie liniowe dla Polski (bez pyproj).
    """
    if not geojson or geojson.get("type") not in ("Polygon", "MultiPolygon"):
        return None
    coords_raw = geojson.get("coordinates", [])
    if not coords_raw:
        return None
    # Zbierz wszystkie pary (lon, lat)
    points = []
    if geojson["type"] == "Polygon":
        for ring in coords_raw:
            for pt in ring:
                if len(pt) >= 2:
                    points.append((float(pt[0]), float(pt[1])))
    else:
        for poly in coords_raw:
            for ring in poly:
                for pt in ring:
                    if len(pt) >= 2:
                        points.append((float(pt[0]), float(pt[1])))
    if not points:
        return None
    # Przybliżenie WGS84 → EPSG:2180 (Poland 1992), wzór jak w rcn_gugik
    meters_per_deg_lat = 111_320.0
    e_list, n_list = [], []
    for lon, lat in points:
        m_lon = 111_320.0 * math.cos(math.radians(lat))
        e_list.append(5_500_000 + (lon - 19.0) * m_lon)
        n_list.append(5_200_000 + (lat - 52.0) * meters_per_deg_lat)
    return (min(e_list), min(n_list), max(e_list), max(n_list))


# KSWS coefficients (wbudowane w backend — nie mock, to standardy KSWS-V.5)
KSWS_STANDARDS = {
    "elektro_WN": {"S": 0.250, "k": 0.650, "R": 0.060, "u": 0.065, "impact_judicial": 0.073, "band_width_m": 30, "track_b_mult": 1.80, "label": "Linie 110-400 kV"},
    "elektro_SN": {"S": 0.200, "k": 0.500, "R": 0.060, "u": 0.065, "impact_judicial": 0.050, "band_width_m": 10, "track_b_mult": 1.56, "label": "Linie 15-30 kV"},
    "elektro_nN": {"S": 0.100, "k": 0.400, "R": 0.060, "u": 0.065, "impact_judicial": 0.025, "band_width_m": 5,  "track_b_mult": 1.30, "label": "Linie <1 kV"},
    "gaz_wysokie": {"S": 0.350, "k": 0.600, "R": 0.050, "u": 0.055, "impact_judicial": 0.120, "band_width_m": 15, "track_b_mult": 2.00, "label": "Gazociągi >1.6 MPa"},
    "gaz_srednie": {"S": 0.250, "k": 0.550, "R": 0.050, "u": 0.055, "impact_judicial": 0.080, "band_width_m": 10, "track_b_mult": 1.75, "label": "Gazociągi 0.4-1.6 MPa"},
    "gaz_niskie":  {"S": 0.150, "k": 0.450, "R": 0.050, "u": 0.055, "impact_judicial": 0.040, "band_width_m": 5,  "track_b_mult": 1.40, "label": "Gazociągi <0.4 MPa"},
    "teleko":      {"S": 0.080, "k": 0.350, "R": 0.060, "u": 0.065, "impact_judicial": 0.020, "band_width_m": 3,  "track_b_mult": 1.20, "label": "Sieci telekom."},
    "wod_kan":     {"S": 0.180, "k": 0.500, "R": 0.060, "u": 0.065, "impact_judicial": 0.045, "band_width_m": 8,  "track_b_mult": 1.50, "label": "Wodociągi/kanalizacja"},
    "default":     {"S": 0.250, "k": 0.500, "R": 0.060, "u": 0.065, "impact_judicial": 0.073, "band_width_m": 10, "track_b_mult": 1.56, "label": "Typ nieznany"},
}


def calculate_track_a(property_value: float, band_area: float, total_area: float, coeffs: dict, years: int = 10) -> dict:
    """Track A — ścieżka sądowa (TK P 10/16): WSP + WBK + OBN"""
    S = coeffs["S"]
    k = coeffs["k"]
    R = coeffs["R"]
    impact = coeffs["impact_judicial"]
    ratio = band_area / total_area if total_area > 0 else 0.1
    wsp = property_value * S * k * ratio
    wbk = property_value * R * k * ratio * years
    obn = property_value * impact * (years / 10)
    total = wsp + wbk + obn
    return {"wsp": round(wsp, 2), "wbk": round(wbk, 2), "obn": round(obn, 2), "total": round(total, 2), "years": years}


def calculate_track_b(track_a_total: float, infra_type: str = "elektro_SN") -> dict:
    """Track B — ścieżka negocjacyjna: Track A × mnożnik"""
    mult = KSWS_STANDARDS.get(infra_type, KSWS_STANDARDS["default"])["track_b_mult"]
    return {"total": round(track_a_total * mult, 2), "multiplier": mult}


def _shapely_length_meters(geom) -> float:
    """Oblicz długość geometrii Shapely w metrach (WGS84 → geodezyjne przybliżenie)."""
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


def _collect_intersection_length(intersection) -> float:
    """Zbierz długość z wyniku Shapely intersection (LineString / Multi / Collection)."""
    total = 0.0
    if intersection.is_empty:
        return 0.0
    if intersection.geom_type == "LineString":
        total += _shapely_length_meters(intersection)
    elif intersection.geom_type == "MultiLineString":
        for ls in intersection.geoms:
            total += _shapely_length_meters(ls)
    elif intersection.geom_type == "GeometryCollection":
        for g in intersection.geoms:
            if g.geom_type == "LineString":
                total += _shapely_length_meters(g)
            elif g.geom_type == "MultiLineString":
                for ls in g.geoms:
                    total += _shapely_length_meters(ls)
    return total


def calculate_intersection_length(parcel_geojson: Dict[str, Any], wfs_features: List[Dict[str, Any]]) -> float:
    """
    Calculate actual infrastructure line intersection with parcel boundary.

    Uses Shapely intersection + geodesic length approximation for WGS84.
    Wynik w METRACH (nie stopniach!).

    Args:
        parcel_geojson: GeoJSON geometry of parcel (Polygon, WGS84)
        wfs_features: List of GeoJSON features (LineString geometries)

    Returns:
        float: Total intersection length in meters
    """
    try:
        if not parcel_geojson or parcel_geojson.get("type") != "Polygon":
            logger.warning("Invalid or missing parcel geometry")
            return 0.0

        parcel_poly = shape(parcel_geojson)
        if not parcel_poly.is_valid:
            parcel_poly = parcel_poly.buffer(0)
        # Buffer ~50m compensates for OSM vs GUGiK cadastral positional offset (typically 10-50m in Poland)
        parcel_buffered = parcel_poly.buffer(0.00045)

        total_length = 0.0
        feature_count = 0

        for feature in wfs_features:
            try:
                geom = feature.get("geometry")
                if not geom:
                    continue

                geom_type = geom.get("type")

                if geom_type in ("LineString", "MultiLineString"):
                    line = shape(geom)
                    if not line.is_valid:
                        line = line.buffer(0)

                    intersection = parcel_poly.intersection(line)
                    if intersection.is_empty:
                        intersection = parcel_buffered.intersection(line)
                    total_length += _collect_intersection_length(intersection)
                    feature_count += 1

            except Exception as e:
                logger.warning(f"Error processing feature: {e}")
                continue

        logger.info(
            "Intersection calculation: features=%d total_length=%.2f m",
            feature_count, total_length
        )

        return round(total_length, 2)

    except Exception as e:
        logger.error(f"Error in calculate_intersection_length: {e}")
        return 0.0


class PropertyAggregator:
    def __init__(self):
        self.uldk = ULDKClient()
        self.kieg = KIEGClient()
        self.gunb = GUNBClient()
        self.rcn = GUGikRCNClient()
        self.gus = GUSClientFixed()

    async def generate_master_record(
        self,
        parcel_id: str,
        infra_type_pref: str = "elektro_SN",
        obreb: Optional[str] = None,
        county: Optional[str] = None,
        municipality: Optional[str] = None,
        manual_price_m2: Optional[float] = None,
        manual_land_type: Optional[str] = None,
        manual_infra_detected: Optional[bool] = None,
        manual_voltage: Optional[str] = None,
        manual_line_length_m: Optional[float] = None,  # Ręczny pomiar długości linii [m]
        manual_poles_count: Optional[int] = None,      # Ręczna liczba słupów
        years: int = 6,  # Okres WBK: 6 lat (art. 118 KC po noweli 2018)
        is_farmer: bool = False,  # Rolnik → wymusza agri=True, aktywuje R5
    ) -> Dict[str, Any]:
        # 1. Podstawowa geometria (ULDK)
        terrain = await fetch_terrain(parcel_id, obreb=obreb, county=county, municipality=municipality)
        if not terrain.get("ok") or terrain.get("status") != "REAL":
            return {
                "status": "ERROR",
                "message": terrain.get("error", "Nie znaleziono rzeczywistych danych w ULDK"),
                "data": None
            }

        resolved_pid = terrain.get("parcel_id") or parcel_id
        centroid = terrain.get("centroid") or {}
        lon, lat = centroid.get("lon"), centroid.get("lat")
        # get_parcel_bbox jest synchroniczne (requests.get) — thread aby nie blokować event loop
        bbox_2180 = await asyncio.to_thread(self.uldk.get_parcel_bbox, resolved_pid, "2180")
        bbox_source = "ULDK"
        # Fallback: gdy ULDK nie zwróci bbox (np. timeout), oblicz z geometrii — żeby nie tracić KIEG/RCN
        if not bbox_2180 and terrain.get("geometry"):
            bbox_2180 = _bbox_2180_from_geojson(terrain.get("geometry"))
            if bbox_2180:
                bbox_source = "geometry_fallback"
                logger.info("Bbox 2180 z geometrii (fallback), ULDK get_parcel_bbox nie zwrócił")
        if not bbox_2180:
            bbox_source = "brak"
        parts = resolved_pid.split('.')
        teryt_unit = parts[0] if len(parts) > 1 else ""
        parcel_nr = parts[-1] if len(parts) > 0 else resolved_pid

        # 2. Pobieranie równoległe
        tasks = {
            "planning": fetch_planning(lon, lat),
            "infra_base": fetch_infrastructure(resolved_pid, lon, lat, terrain.get("geometry"), infra_type_pref),
            "land_use": self.kieg.get_land_use(bbox_2180) if bbox_2180 else self._empty_list(),
            "buildings": self.kieg.get_buildings(bbox_2180) if bbox_2180 else self._empty_list(),
            "permits": self.gunb.get_permits(teryt_unit, parcel_nr),
            "transactions": self.rcn.get_transactions_near_bbox(
                bbox_2180[0]-1000, bbox_2180[1]-1000, bbox_2180[2]+1000, bbox_2180[3]+1000
            ) if bbox_2180 else self._empty_list(),
        }
        results = await asyncio.gather(*tasks.values())
        data = dict(zip(tasks.keys(), results))

        pl = data["infra_base"].get("energie", {})
        media = data["infra_base"].get("media", {})
        geom_geojson = terrain.get("geometry")
        centroid = terrain.get("centroid") or {}

        # Ustal klasę gruntu
        land_use_list = self._map_land_use(data["land_use"], terrain.get("area_m2"))
        primary_class = land_use_list[0]["class"] if land_use_list else "R"
        agri = is_agricultural(primary_class)

        # Flaga rolnik — nadpisuje klasyfikację: wymusza agri=True niezależnie od EGiB
        if is_farmer:
            agri = True
            if not is_agricultural(primary_class):
                primary_class = "R"
            logger.info("is_farmer=True → agri=True (R5 aktywne)")

        # WAŻNE: jeśli EGiB pokazuje budynki na działce → grunt BUDOWLANY, nie rolny!
        # Ale is_farmer ma wyższy priorytet (rolnik może mieć siedlisko na działce)
        has_buildings = len(data.get("buildings", [])) > 0
        if has_buildings and agri and not is_farmer:
            logger.info("Działka ma budynki w EGiB → zmiana klasyfikacji z rolna na budowlaną")
            agri = False
            primary_class = "B"

        # Cena — priorytet: RCN transakcje → GUS BDL z klasą gruntu → fallback
        rcn_price = self._calculate_avg_price(data["transactions"])
        rcn_stats = self._calculate_price_stats(data["transactions"])

        voi = terrain.get("voivodeship") or ""

        # GUS z klasą gruntu (poprawiona obsługa zabudowanej)
        gus_result = await self.gus.fetch_market_price(
            voi,
            land_class=primary_class if primary_class == "B" or not agri else primary_class,
        )
        gus_price = gus_result.get("price_m2") if gus_result.get("ok") else None
        land_type = gus_result.get("land_type", "agricultural" if agri else "building")
        price_source = gus_result.get("source", "GUS")

        # Zawsze pobierz też cenę budowlaną (do R4 i korekty ręcznej „budowlany”)
        county = terrain.get("county") or ""
        gus_building_result = await self.gus.fetch_market_price(
            voi, use_type="building", county=county or None
        )
        gus_building_price = gus_building_result.get("price_m2") if gus_building_result.get("ok") else None

        # === KOREKTA PLANISTYCZNA: działka rolna ale WZ wydane → cena jak budowlana ===
        mpzp_data = data["planning"].get("mpzp", {})
        studium_data = data["planning"].get("studium", {})
        mpzp_usage = (mpzp_data.get("przeznaczenie") or "").lower()
        studium_usage = (studium_data.get("przeznaczenie") or "").lower()
        build_keywords = {"zabudow", "mieszkaniow", "mz", "mu", "mn", "ml", "usług", "komercj", "budowl"}
        planning_indicates_building = any(k in mpzp_usage for k in build_keywords) or \
                                      any(k in studium_usage for k in build_keywords)
        has_wz = len(data.get("permits", [])) > 0  # pozwolenie/WZ w GUNB

        if agri and (planning_indicates_building or has_wz):
            logger.info("KOREKTA: działka rolna w KW, ale WZ/MPZP wskazuje zabudowę → cena budowlana")
            effective_agri = False  # do kalkulacji używamy ceny budowlanej
            effective_price = gus_building_price or gus_price
            effective_price_source = f"GUS budowlana (korekta WZ/MPZP)"
        else:
            effective_agri = agri
            effective_price = gus_price
            effective_price_source = price_source

        # Wybór ceny: RCN → GUS (z korektą planistyczną) → fallback
        avg_price = rcn_price if rcn_price else effective_price

        price_source = effective_price_source

        # === KOREKTA RĘCZNA — nadpisuje dane API gdy rzeczywistość się nie zgadza ===
        if manual_price_m2 is not None:
            avg_price = manual_price_m2
            price_source = "Korekta ręczna"
            logger.info("Manual override: price_m2=%.2f", manual_price_m2)
        if manual_land_type is not None:
            land_type = manual_land_type
            agri = (manual_land_type == "agricultural")
            logger.info("Manual override: land_type=%s", manual_land_type)
            # Gdy użytkownik wybiera „budowlany”, używamy ceny budowlanej GUS (nie rolnej)
            if manual_land_type == "building":
                if gus_building_price is not None and gus_building_price > 0:
                    avg_price = gus_building_price
                    price_source = "GUS BDL (budowlana)"
                    logger.info("Korekta ręczna budowlany → cena GUS budowlana: %.2f zł/m²", gus_building_price)
                # jeśli brak ceny budowlanej z GUS, avg_price zostaje (albo użytkownik może wpisać manual_price_m2)

        # === KOREKTA RĘCZNA — infrastruktura ===
        if manual_infra_detected is not None:
            pl["detected"] = manual_infra_detected
            logger.info("Manual override: infra_detected=%s", manual_infra_detected)
        if manual_voltage is not None:
            pl["voltage"] = manual_voltage
            logger.info("Manual override: voltage=%s", manual_voltage)
        if manual_poles_count is not None and manual_poles_count >= 0:
            pl["poles_count"] = manual_poles_count
            logger.info("Manual override: poles_count=%s", manual_poles_count)

        # KSWS + Track A/B (jeśli jest linia)
        area_m2 = terrain.get("area_m2") or 0
        infra_type = infra_type_pref
        # Dopasuj typ infrastruktury do napięcia, jeśli jest znane (REAL DATA ONLY)
        v = (pl.get("voltage") or "").upper()
        if pl.get("detected") and v in ("WN", "SN", "NN", "N", "NN", "nN"):
            if v == "WN":
                infra_type = "elektro_WN"
            elif v in ("NN", "N", "NN", "nN"):
                infra_type = "elektro_nN"
            else:
                infra_type = "elektro_SN"

        coeffs = KSWS_STANDARDS.get(infra_type, KSWS_STANDARDS["default"])
        band_width = coeffs["band_width_m"]

        # KROK 2: Długość linii przecinającej działkę [metry]
        # Priorytet 1: z infrastructure.py — geodezyjne obliczenie w metrach
        line_length = pl.get("length_m", 0.0) or 0.0
        logger.info("Infra length_m from infrastructure.py: %.2f m", line_length)

        # Priorytet 2: recalculate z features via Shapely (jeśli infra nie policzyła)
        if line_length <= 0 and pl.get("features") and geom_geojson:
            try:
                wfs_features = pl.get("features", [])
                if wfs_features and isinstance(wfs_features, list):
                    line_length = calculate_intersection_length(geom_geojson, wfs_features)
                    logger.info("Recalculated intersection length (Shapely): %.2f m", line_length)
            except Exception as e:
                logger.error(f"Error calculating intersection length: {e}")

        # Priorytet 3: Ręczne nadpisanie długości linii (użytkownik zmierzył z mapy / geodeta)
        measurement_source = "geodezyjne (OSM)"
        if manual_line_length_m is not None and manual_line_length_m >= 0:
            line_length = manual_line_length_m
            measurement_source = "ręczny pomiar"
            logger.info("Manual override: line_length_m=%.1f", line_length)
        elif not line_length or line_length <= 0:
            if pl.get("detected"):
                # Infrastruktura wykryta ale brak automatycznego pomiaru — NIE szacujemy
                # Użytkownik musi wpisać długość ręcznie na podstawie mapy
                line_length = 0.0
                measurement_source = "BRAK — wpisz ręcznie"
                logger.info("INFRA [%s]: Detected but length=0 — user must enter manually", parcel_id)
            else:
                line_length = 0.0
                measurement_source = "brak — nie wykryto"

        # ZASADA: brak szacowania długości — jeśli nie ma wektora, długość = 0
        band_area = (line_length * band_width) if line_length and line_length > 0 else 0.0

        property_value = (avg_price or 6.50) * area_m2
        # Compensation: zawsze oblicz (0 gdy brak infrastruktury)
        if pl.get("detected") and area_m2 > 0 and band_area > 0:
            track_a = calculate_track_a(property_value, band_area, area_m2, coeffs, years=years)
            track_b = calculate_track_b(track_a["total"], infra_type)
        else:
            track_a = {"wsp": 0.0, "wbk": 0.0, "obn": 0.0, "total": 0.0, "years": years}
            track_b = {"total": 0.0, "multiplier": coeffs["track_b_mult"]}

        master_record = {
            "metadata": {
                "teryt_id": resolved_pid,
                "status": "REAL",
                "source": "ULDK GUGiK",
                "bbox_source": bbox_source,
            },
            "parcel_metadata": {
                "commune": terrain.get("commune"),
                "county": terrain.get("county"),
                "region": terrain.get("voivodeship"),
            },
            "geometry": {
                "area_m2": terrain.get("area_m2"),
                "perimeter_m": terrain.get("perimeter_m"),
                "shape_class": terrain.get("shape_class"),
                "status": terrain.get("status"),
                "geojson": geom_geojson,
                "geojson_ll": geom_geojson,
                "centroid_ll": [centroid.get("lon"), centroid.get("lat")] if centroid else None,
            },
            "planning": {
                "mpzp_active": data["planning"].get("mpzp", {}).get("has_mpzp", False),
                "usage": data["planning"].get("mpzp", {}).get("przeznaczenie"),
                "studium_usage": data["planning"].get("studium", {}).get("przeznaczenie"),
                "status": "REAL (planowanie.gov.pl)" if data["planning"].get("mpzp", {}).get("ok") else "ERROR/BRAK"
            },
            "infrastructure": {
                "power_lines": {
                    "detected": pl.get("detected", False),
                    "voltage": pl.get("voltage"),
                    "length_m": pl.get("length_m", 0.0),
                    "status": pl.get("status", "UNKNOWN"),
                    "info": pl.get("info", ""),
                    "geojson": pl.get("geojson", {"type": "FeatureCollection", "features": []}),
                },
                "power": {
                    "exists": pl.get("detected", False),
                    "voltage": pl.get("voltage") or "—",
                    "poles_count": pl.get("poles_count"),
                    "poles_geojson": pl.get("poles_geojson", {"type": "FeatureCollection", "features": []}),
                    "buffer_zone_m": data["infra_base"].get("energie", {}).get("strefa_m"),
                    "occupied_area_m2": band_area if pl.get("detected") else None,
                    "line_length_m": line_length,
                    "band_width_m": band_width,
                },
                "utilities": {
                    "gaz": media.get("gaz", {}).get("detected", False),
                    "woda": media.get("woda", {}).get("detected", False),
                    "kanal": media.get("kanal", {}).get("detected", False),
                },
                "telecom": {
                    "fiber_ready": data["infra_base"].get("telecom", {}).get("detected", False),
                    "detected": data["infra_base"].get("telecom", {}).get("detected", False),
                    "source": data["infra_base"].get("telecom", {}).get("source", ""),
                    "info": data["infra_base"].get("telecom", {}).get("info", ""),
                },
                "other_media": media,
            },
            "egib": {
                "land_use": land_use_list,
                "primary_class": primary_class,
                "land_type": land_type,
            },
            "buildings": {"count": len(data["buildings"]) if data["buildings"] else 0},
            "access": {"public_road_access": None, "road_type": None},
            "market_data": {
                "transactions_count": len(data["transactions"]),
                "rcn_price_m2": rcn_price,
                "gus_price_m2": gus_price,
                "average_price_m2": avg_price,
                "price_median": rcn_stats.get("price_median"),
                "price_min": rcn_stats.get("price_min"),
                "price_max": rcn_stats.get("price_max"),
                "sample_size": rcn_stats.get("sample_size", len(data["transactions"])),
                "land_type": land_type,
                "price_source": price_source,
                "recent_transactions_count": len(data["transactions"]),
                "last_transaction_date": None,
                "status": "Korekta ręczna" if manual_price_m2 is not None else (
                    "REAL (RCN GUGiK)" if data["transactions"] else (
                        f"GUS BDL ({land_type})" if gus_result.get("ok") else "BRAK DANYCH"
                    )
                )
            },
            "investments": {
                "permits_count": len(data["permits"]),
                "active_permits": len(data["permits"]),
                "status": "REAL (GUNB)" if data["permits"] else "BRAK"
            },
            "ksws": {
                "infra_type": infra_type,
                "coeffs": coeffs,
                "line_length_m": round(line_length, 1),
                "band_width_m": band_width,
                "band_area_m2": round(band_area, 2),
                "property_value_total": round(property_value, 2),
                "price_per_m2": avg_price,
                "label": coeffs.get("label", ""),
                "measurement_source": measurement_source,
                "voltage": pl.get("voltage"),
            },
            "compensation": {
                "track_a": track_a,
                "track_b": track_b,
                "infra_type": infra_type,
                "basis": {
                    "S": coeffs["S"],
                    "k": coeffs["k"],
                    "R": coeffs["R"],
                    "impact_judicial": coeffs["impact_judicial"],
                    "track_b_multiplier": coeffs["track_b_mult"],
                }
            },
            "claims_qualification": self._qualify_claims(
                infra_detected=pl.get("detected", False),
                infra_type=infra_type,
                voltage=pl.get("voltage"),
                agri=agri,
                planning=data["planning"],
                years=years,
                band_area=band_area,
                track_a=track_a,
                area_m2=area_m2,
                current_price_m2=avg_price or 0.0,
                building_price_m2=gus_building_price or 0.0,
                line_length_m=line_length,
                voivodeship=voi,
            ),
        }
        return master_record

    def _calculate_r5_agri_damage(
        self,
        infra_type: str,
        line_length_m: float,
        band_area_m2: float,
        area_m2: float,
        price_per_m2: float,
        voivodeship: str,
        years: int,
    ) -> dict:
        """
        Szkoda rolna (R5) — 3 komponenty z metodologią sądową:

        R5.1 DAMNUM EMERGENS — Fundamenty słupów (art. 361 §1 KC)
             = liczba_słupów × pow_fundamentu[m²] × cena_gruntu[zł/m²]
             UZASADNIENIE: grunt pod fundamentem trwale wyłączony spod uprawy.

        R5.2 LUCRUM CESSANS — Kliny/wyspy niedostępne sprzętowi (art. 361 §2 KC)
             Wariant KONSERWATYWNY (sądowy): czynsz dzierżawny = 3% ceny gruntu × pow_wyspy
             Wariant PEŁNY: produkcja globalna GUS na 1ha × pow_wyspy
             UZASADNIENIE: czynsz = wartość rynkowa użytkowania (ARiMR, BDL GUS).

        R5.3 LUCRUM CESSANS — Dezorganizacja mechaniczna i GPS/RTK (ewentualne)
             = 10% rocznego czynszu dzierżawnego z całego pasa × lata
             UZASADNIENIE: opryskiwacze 24-36m belka, precyzyjne siewniki GPS/RTK
             wymagają prostoliniowych pasów — niemożliwe przy słupach.
             UWAGA: wymaga biegłego do sądowego zastosowania.
        """
        import math as _math

        # Parametry wg typu infrastruktury
        is_wn = infra_type == "elektro_WN"
        foundation_m2 = 4.0 if is_wn else (2.0 if infra_type == "elektro_SN" else 1.0)
        pole_spacing = 250.0 if is_wn else (70.0 if infra_type == "elektro_SN" else 50.0)
        # Wyspa niedostępna: belka 24m → omija słup z ~12m buforem po każdej stronie
        # Konserwatywny (sąd): prostokąt 24m × 6m = 144m² → zaokrąglamy do 100m²
        # Pełny: uwzględnia efekt "trójkąta" omijania ~ 200m²
        inaccessible_cons = 100.0   # m² per słup — wariant sądowy konserwatywny
        inaccessible_full = 200.0   # m² per słup — wariant pełny (biegły)

        pole_count = max(1, _math.ceil(line_length_m / pole_spacing)) if line_length_m > 0 else 0
        foundations_m2 = round(pole_count * foundation_m2, 1)

        # --- R5.1 Damnum emergens: fundamenty ---
        r51_szkoda = round(foundations_m2 * price_per_m2, 2)

        # --- Dane GUS: produkcja globalna na 1ha UR [zł/ha/rok, 2023] ---
        prod_per_ha = self.gus.get_agri_production_per_ha(voivodeship)
        prod_per_m2_year = prod_per_ha / 10000.0  # zł/m²/rok

        # Czynsz dzierżawny = 3% ceny gruntu (dolna granica, do porównania)
        dzierzawa_per_m2_year = price_per_m2 * 0.03

        wyspy_cons_m2 = pole_count * inaccessible_cons
        wyspy_full_m2 = pole_count * inaccessible_full

        # --- R5.2 Lucrum cessans: wartość produkcji z wysp niedostępnych sprzętowi ---
        # Sąd konserwatywny: GUS prod. globalna × wyspy_cons
        # Sąd pełny: GUS prod. globalna × wyspy_full
        # Uzasadnienie: bezpośrednia strata plonu — pole nie jest uprawiane = plon nie powstaje
        r52_annual_cons = round(wyspy_cons_m2 * prod_per_m2_year, 2)
        r52_annual_full = round(wyspy_full_m2 * prod_per_m2_year, 2)
        r52_cons = round(r52_annual_cons * years, 2)
        r52_full = round(r52_annual_full * years, 2)
        total_szkoda = round(r51_szkoda + r52_cons, 2)
        total_full   = round(r51_szkoda + r52_full, 2)

        return {
            "active": pole_count > 0 and line_length_m > 0,
            "pole_count": pole_count,
            "foundations_total_m2": foundations_m2,
            "prod_per_ha_year_gus": prod_per_ha,
            "r51": {
                "label": "R5.1 — Fundamenty słupów (damnum emergens)",
                "basis": "art. 361 §1 KC",
                "formula": f"{pole_count} sł. × {foundation_m2} m²/sł. × {price_per_m2:.2f} zł/m²",
                "value": r51_szkoda,
            },
            "r52": {
                "label": "R5.2 — Wyspy/kliny niedostępne sprzętowi (lucrum cessans)",
                "basis": "art. 361 §2 KC",
                "formula": f"{wyspy_cons_m2:.0f} m² × {prod_per_m2_year:.4f} zł/m²/rok × {years} lat",
                "value": r52_cons,
                "note": f"Prod. globalna GUS 2023: {prod_per_ha:,.0f} zł/ha/rok ({voivodeship}). Belka 24-36m → {inaccessible_cons:.0f} m²/słup niedostępnych.",
            },
            "total": total_szkoda,
            "years": years,
            "summary_basis": [
                f"R5.1 Fundamenty: {pole_count} sł. × {foundation_m2}m²/sł. × {price_per_m2:.2f}zł/m² = {r51_szkoda:.0f} zł (art. 361§1 KC)",
                f"R5.2 Wyspy: {wyspy_cons_m2:.0f}m² × {prod_per_m2_year:.4f}zł/m²/rok × {years}lat = {r52_cons:.0f} zł (GUS {prod_per_ha:,.0f}zł/ha/rok, art. 361§2 KC)",
                f"ŁĄCZNIE szkoda rolna: {total_szkoda:.0f} zł",
            ],
        }

    def _qualify_claims(
        self,
        infra_detected: bool,
        infra_type: str,
        voltage: Optional[str],
        agri: bool,
        planning: dict,
        years: int,
        band_area: float,
        track_a: dict,
        area_m2: float = 0.0,
        current_price_m2: float = 0.0,
        building_price_m2: float = 0.0,
        line_length_m: float = 0.0,
        voivodeship: str = "",
    ) -> dict:
        """
        Spec v2.1 Dual-Track — kwalifikacja 4 roszczeń głównych + 2 ewentualnych.
        """
        mpzp = planning.get("mpzp", {})
        studium = planning.get("studium", {})
        mpzp_active = mpzp.get("has_mpzp", False)
        mpzp_usage = (mpzp.get("przeznaczenie") or "").lower()
        studium_usage = (studium.get("przeznaczenie") or "").lower()

        # R1 — Służebność przesyłu (ZAWSZE aktywna gdy wykryto infra)
        r1 = {
            "active": infra_detected,
            "label": "R1 — Służebność przesyłu",
            "basis": "art. 305¹–305⁴ KC",
            "value": track_a.get("wsp", 0.0),
            "note": "Aktywne" if infra_detected else "Brak infrastruktury",
        }

        # R2 — Bezumowne korzystanie (ZAWSZE aktywna gdy wykryto infra)
        r2 = {
            "active": infra_detected,
            "label": "R2 — Bezumowne korzystanie",
            "basis": "art. 224–225 KC",
            "value": track_a.get("wbk", 0.0),
            "years": years,
            "note": f"{years} lat wstecz (art. 118 KC — przedawnienie od 2018)" if infra_detected else "Brak infrastruktury",
        }

        # R3 — Obniżenie wartości nieruchomości (ZAWSZE aktywna gdy wykryto infra)
        r3 = {
            "active": infra_detected,
            "label": "R3 — Obniżenie wartości nieruchomości",
            "basis": "art. 305² KC",
            "value": track_a.get("obn", 0.0),
            "note": "Linia przez centrum działki" if band_area > 0 else "Brak infrastruktury",
        }

        # R4 — Blokada zabudowy
        keywords_block = ("infrastruktura", "linia", "przesył", "strefa ochronna", "elektroenergetyczn", "gazociąg", "telekom")
        keywords_build = ("zabudow", "mieszkaniow", " mz", " mu", " mn", " ml", "usług", "komercj")
        keywords_no_build = ("bez zabudow", "zakaz zabudow", "nie dopuszcza zabudow", "wykluczono zabudow")

        mpzp_blocks = any(k in mpzp_usage for k in keywords_block)
        mpzp_explicitly_blocks = any(k in mpzp_usage for k in keywords_no_build)
        mpzp_enables_build = (
            any(k in mpzp_usage for k in keywords_build)
            and not mpzp_explicitly_blocks
        )
        studium_enables_build = any(k in studium_usage for k in keywords_build)

        if infra_detected and mpzp_active and (mpzp_blocks or mpzp_explicitly_blocks) and not mpzp_enables_build:
            r4_status = "OCZYWISTE"
            r4_note = f"MPZP wyklucza zabudowę ze względu na infrastrukturę ({mpzp.get('przeznaczenie', '—')})"
        elif infra_detected and mpzp_active and mpzp_enables_build:
            r4_status = "OCZEKUJE_NA_WZ"
            r4_note = f"MPZP dopuszcza zabudowę ({mpzp.get('przeznaczenie', '—')}), ale infrastruktura może blokować WZ"
        elif infra_detected and not mpzp_active and studium_enables_build:
            r4_status = "OCZEKUJE_NA_WZ"
            r4_note = f"Brak MPZP, studium wskazuje zabudowę ({studium.get('przeznaczenie', '—')}) — wymaga decyzji WZ"
        elif infra_detected and agri:
            r4_status = "NONE"
            r4_note = "Grunt rolny bez planów zabudowy"
        else:
            r4_status = "NONE"
            r4_note = "Brak przesłanek dla blokady zabudowy"

        # Wartość szkody R4: różnica ceny budowlanej i rolnej × pow. działki
        # (szacunek = potencjalna strata właściciela który nie dostał WZ przez linię)
        r4_damage = 0.0
        if r4_status in ("OCZYWISTE", "WZ_ODMOWNE") and building_price_m2 > current_price_m2 and area_m2 > 0:
            r4_damage = round((building_price_m2 - current_price_m2) * area_m2, 2)

        r4 = {
            "active": r4_status in ("OCZYWISTE", "WZ_ODMOWNE"),
            "status": r4_status,
            "label": "R4 — Blokada zabudowy",
            "basis": "art. 140 KC + decyzja WZ/MPZP",
            "note": r4_note,
            "value": r4_damage,
            "damage_calc": f"({building_price_m2:.2f} - {current_price_m2:.2f}) zł/m² × {area_m2:.0f} m²" if r4_damage > 0 else None,
        }

        # R5 — Szkoda rolna: dezorganizacja produkcji + fundamenty słupów
        elektro_infra = infra_type.startswith("elektro") or infra_type.startswith("gaz")
        r5_applicable = agri and elektro_infra and infra_detected and line_length_m > 0
        if r5_applicable:
            r5_calc = self._calculate_r5_agri_damage(
                infra_type=infra_type,
                line_length_m=line_length_m,
                band_area_m2=band_area,
                area_m2=area_m2,
                price_per_m2=current_price_m2,
                voivodeship=voivodeship,
                years=years,
            )
        else:
            r5_calc = None

        r5 = {
            "active": r5_applicable,
            "label": "R5 — Szkoda rolna (fundamenty + wyspy niedostępne sprzętowi)",
            "basis": "art. 361 §1–2 KC",
            "note": " | ".join(r5_calc["summary_basis"]) if r5_calc else "Nie dotyczy (brak infrastruktury słupowej na gruncie rolnym)",
            "value": r5_calc["total"] if r5_calc else 0.0,
            "detail": r5_calc,
        }

        # Suma roszczeń z wartością (Track A + R5 jeśli aktywne)
        total_active = round(
            (r1["value"] if r1["active"] else 0) +
            (r2["value"] if r2["active"] else 0) +
            (r3["value"] if r3["active"] else 0) +
            (r4.get("value", 0) if r4["active"] else 0) +
            (r5["value"] if r5["active"] else 0),
            2
        )

        return {
            "R1": r1,
            "R2": r2,
            "R3": r3,
            "R4": r4,
            "R5": r5,
            "total_active_claims": total_active,
            "active_count": sum(1 for r in [r1, r2, r3, r4, r5] if r["active"]),
            "r4_status": r4_status,
        }

    async def _empty_list(self):
        return []

    def _map_land_use(self, features: list, fallback_area: Optional[float] = None) -> list:
        if not features:
            return [{"class": "R", "area_m2": fallback_area or 0}]
        out = []
        for f in features:
            props = f.get("properties", {}) if isinstance(f, dict) else {}
            cls = props.get("klasa") or props.get("oznacz") or props.get("id") or "R"
            area = None
            for key in ("powierzchnia", "area_m2", "pow"):
                if props.get(key) is not None:
                    try:
                        area = float(props[key])
                        break
                    except (TypeError, ValueError):
                        pass
            out.append({"class": str(cls), "area_m2": area if area is not None else 0})
        return out if out else [{"class": "R", "area_m2": fallback_area or 0}]

    def _calculate_price_stats(self, transactions: list) -> dict:
        """Oblicza statystyki cen (mediana, min, max) z listy transakcji RCN."""
        import statistics as _stats
        prices = []
        for t in transactions:
            for key in ("cena_jednostkowa", "cena", "wartosc", "price"):
                raw = t.get(key)
                if raw:
                    try:
                        prices.append(float(str(raw).replace(",", ".")))
                        break
                    except (ValueError, TypeError):
                        pass
        if prices:
            return {
                "price_median": round(_stats.median(prices), 2),
                "price_min": round(min(prices), 2),
                "price_max": round(max(prices), 2),
                "sample_size": len(prices),
            }
        return {"price_median": None, "price_min": None, "price_max": None, "sample_size": 0}

    def _calculate_avg_price(self, transactions: list) -> Optional[float]:
        prices = []
        for t in transactions:
            try:
                p = t.get("dzi_cena_brutto") or t.get("nier_cena_brutto")
                if p:
                    prices.append(float(p))
            except Exception:
                pass
        return round(sum(prices) / len(prices), 2) if prices else None
