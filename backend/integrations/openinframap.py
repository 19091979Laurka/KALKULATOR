"""
OpenInfraMap vector tiles — linie energetyczne (ta sama warstwa co na mapie).
Źródło: https://openinframap.org/tiles/{z}/{x}/{y}.pbf (power_line layer).
Używane gdy OSM Overpass nie zwraca linii (np. słabe pokrycie w PL).
"""
import logging
import math
import asyncio
from typing import Dict, Any, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

OIM_TILES_BASE = "https://openinframap.org/tiles"
OIM_LAYER = "power_line"
EXTENT = 4096


def _lonlat_to_tile(z: int, lon: float, lat: float) -> Tuple[int, int]:
    """Dla z, lon (deg), lat (deg) → numer kafelka (x, y)."""
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (x, y)


def _bbox_to_tiles(z: int, min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> List[Tuple[int, int]]:
    """Zwraca listę (x,y) kafelków pokrywających bbox w z."""
    x_min, y_max = _lonlat_to_tile(z, min_lon, max_lat)
    x_max, y_min = _lonlat_to_tile(z, max_lon, min_lat)
    out = []
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            out.append((x, y))
    return out


def _tile_pixel_to_wgs84(z: int, tx: int, ty: int, px: float, py: float, extent: int = EXTENT) -> Tuple[float, float]:
    """Współrzędne (px, py) w kafelku (z,tx,ty) → (lon, lat) WGS84."""
    n = 2.0 ** z
    xtile = tx + (px / extent)
    ytile = ty + ((extent - py) / extent)
    lon = (xtile / n) * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1.0 - 2.0 * ytile / n)))
    lat = math.degrees(lat_rad)
    return (lon, lat)


def _decode_tile_to_features(pbf_bytes: bytes, z: int, tx: int, ty: int) -> List[Dict]:
    """
    Dekoduje PBF do listy GeoJSON Feature (LineString) w WGS84.
    Współrzędne w MVT są w [0, extent]; przeliczamy na lon/lat.
    """
    try:
        import mapbox_vector_tile
    except ImportError:
        logger.warning("mapbox-vector-tile not installed — skipping OpenInfraMap")
        return []

    features_out = []
    try:
        decoded = mapbox_vector_tile.decode(pbf_bytes, extent=EXTENT)
        layer = decoded.get(OIM_LAYER)
        if not layer:
            return []

        for feat in layer.get("features", []):
            geom = feat.get("geometry")
            props = feat.get("properties", {})
            if not geom:
                continue
            gtype = geom.get("type")
            coords_tile = geom.get("coordinates", [])
            if gtype == "LineString":
                if len(coords_tile) < 2:
                    continue
                coords_wgs84 = [_tile_pixel_to_wgs84(z, tx, ty, c[0], c[1]) for c in coords_tile]
                geojson_geom = {"type": "LineString", "coordinates": coords_wgs84}
                voltage = _parse_voltage_props(props)
                features_out.append({"type": "Feature", "geometry": geojson_geom, "properties": {"voltage": voltage, **props}})
            elif gtype == "MultiLineString":
                for part in coords_tile:
                    if len(part) < 2:
                        continue
                    coords_wgs84 = [_tile_pixel_to_wgs84(z, tx, ty, c[0], c[1]) for c in part]
                    geojson_geom = {"type": "LineString", "coordinates": coords_wgs84}
                    voltage = _parse_voltage_props(props)
                    features_out.append({"type": "Feature", "geometry": geojson_geom, "properties": {"voltage": voltage, **props}})
    except Exception as e:
        logger.debug("OpenInfraMap decode error: %s", e)
    return features_out


def _parse_voltage_props(props: Dict) -> str:
    """Z atrybutów OIM/OSM → WN / SN / nN."""
    v = (props or {}).get("voltage") or (props or {}).get("voltage:primary") or ""
    if not v:
        return "SN"
    s = str(v).strip().lower().replace(" ", "")
    try:
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
        return "SN"


async def fetch_power_lines_oim(parcel_geom: Optional[Dict]) -> Dict[str, Any]:
    """
    Pobiera linie energetyczne z wektorowych kafelków OpenInfraMap (ta sama warstwa co na mapie).
    Zwraca format zbieżny z Overpass: ok, lines, line_geojson, line_length_m, source.
    """
    result = {
        "ok": False,
        "lines": [],
        "line_length_m": 0.0,
        "line_geojson": {"type": "FeatureCollection", "features": []},
        "source": "OpenInfraMap (vector tiles)",
    }
    if not parcel_geom or parcel_geom.get("type") != "Polygon":
        return result

    coords = parcel_geom.get("coordinates", [])
    if not coords:
        return result
    ring = coords[0][0] if isinstance(coords[0][0][0], (list, tuple)) else coords[0]
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    # Zoom 14–15 dla działki (kilka kafelków)
    z = 15
    tiles = _bbox_to_tiles(z, min_lon, min_lat, max_lon, max_lat)
    if not tiles:
        return result

    loop = asyncio.get_event_loop()
    all_features = []

    def get_tile(tx: int, ty: int) -> Optional[bytes]:
        url = f"{OIM_TILES_BASE}/{z}/{tx}/{ty}.pbf"
        try:
            r = requests.get(url, timeout=10, headers={"User-Agent": "Kalkulator-OIM/1.0"})
            if r.status_code == 200 and r.content:
                return r.content
        except Exception as e:
            logger.debug("OIM tile %s/%s/%s error: %s", z, tx, ty, e)
        return None

    for (tx, ty) in tiles:
        try:
            pbf = await loop.run_in_executor(None, get_tile, tx, ty)
            if pbf:
                all_features.extend(_decode_tile_to_features(pbf, z, tx, ty))
        except Exception as e:
            logger.debug("OIM tile fetch/decode %s/%s: %s", tx, ty, e)

    if not all_features:
        return result

    # Przecięcie z działką i długość — w infrastructure używamy _check_intersection_with_features
    result["line_geojson"] = {"type": "FeatureCollection", "features": all_features}
    result["ok"] = True
    result["_raw_features"] = all_features  # do przecięcia w infrastructure
    logger.info("OpenInfraMap: %d linii w BBOX (do przecięcia z działką)", len(all_features))
    return result
