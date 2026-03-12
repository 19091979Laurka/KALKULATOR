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
        bbox_2180 = self.uldk.get_parcel_bbox(resolved_pid, srid="2180")
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

        # WAŻNE: jeśli EGiB pokazuje budynki na działce → grunt BUDOWLANY, nie rolny!
        has_buildings = len(data.get("buildings", [])) > 0
        if has_buildings and agri:
            logger.info("Działka ma budynki w EGiB → zmiana klasyfikacji z rolna na budowlaną")
            agri = False
            primary_class = "B"  # força do "Building" classification

        # Cena — priorytet: RCN transakcje → GUS BDL z klasą gruntu → fallback
        rcn_price = self._calculate_avg_price(data["transactions"])

        # GUS z klasą gruntu (poprawiona obsługa zabudowanej)
        gus_result = await self.gus.fetch_market_price(
            terrain.get("voivodeship") or "",
            land_class=primary_class if primary_class == "B" or not agri else primary_class,
        )
        gus_price = gus_result.get("price_m2") if gus_result.get("ok") else None
        land_type = gus_result.get("land_type", "agricultural" if agri else "building")
        price_source = gus_result.get("source", "GUS")

        # Wybór ceny: RCN tylko jeśli mamy transakcje, inaczej GUS z właściwą klasą
        avg_price = rcn_price if rcn_price else gus_price

        # === KOREKTA RĘCZNA — nadpisuje dane API gdy rzeczywistość się nie zgadza ===
        if manual_price_m2 is not None:
            avg_price = manual_price_m2
            price_source = "Korekta ręczna"
            logger.info("Manual override: price_m2=%.2f", manual_price_m2)
        if manual_land_type is not None:
            land_type = manual_land_type
            agri = (manual_land_type == "agricultural")
            logger.info("Manual override: land_type=%s", manual_land_type)

        # === KOREKTA RĘCZNA — infrastruktura ===
        if manual_infra_detected is not None:
            pl["detected"] = manual_infra_detected
            logger.info("Manual override: infra_detected=%s", manual_infra_detected)
        if manual_voltage is not None:
            pl["voltage"] = manual_voltage
            logger.info("Manual override: voltage=%s", manual_voltage)

        # KSWS + Track A/B (jeśli jest linia)
        area_m2 = terrain.get("area_m2") or 0
        infra_type = infra_type_pref
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

        # Priorytet 3: placeholder tylko jeśli infrastruktura wykryta (np. NEARBY)
        if not line_length or line_length <= 0:
            line_length = band_width * 50 if pl.get("detected") else 0.0
            if line_length > 0:
                logger.info("Using placeholder line_length: %.1f m (band_width=%d × 50)", line_length, band_width)

        band_area = line_length * band_width if line_length and line_length > 0 else 0.0

        property_value = (avg_price or 6.50) * area_m2
        # Compensation: zawsze oblicz (0 gdy brak infrastruktury)
        if pl.get("detected") and area_m2 > 0 and band_area > 0:
            track_a = calculate_track_a(property_value, band_area, area_m2, coeffs)
            track_b = calculate_track_b(track_a["total"], infra_type)
        else:
            track_a = {"wsp": 0.0, "wbk": 0.0, "obn": 0.0, "total": 0.0, "years": 10}
            track_b = {"total": 0.0, "multiplier": coeffs["track_b_mult"]}

        master_record = {
            "metadata": {"teryt_id": resolved_pid, "status": "REAL", "source": "ULDK GUGiK"},
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
                    "poles_count": None,
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
                "telecom": {"fiber_ready": False},
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
                "band_width_m": band_width,
                "band_area_m2": round(band_area, 2),
                "property_value_total": round(property_value, 2),
                "price_per_m2": avg_price,
                "label": coeffs.get("label", ""),
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
            }
        }
        return master_record

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
