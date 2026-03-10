"""
Overpass API Client — linie elektroenergetyczne z OpenStreetMap.
Uzupełnia GESUT: daje geometrię wektorową i długość w metrach.
Źródło: OpenInfraMap / OSM power=line, minor_line, cable.
"""
import logging
import asyncio
from typing import Dict, Any, List, Optional, Tuple

import requests
from shapely.geometry import shape

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT = 25


def _bbox_from_geojson(geom: Dict) -> Tuple[float, float, float, float]:
    """(min_lat, min_lon, max_lat, max_lon) z GeoJSON Polygon."""
    coords = geom.get("coordinates", [])
    if not coords:
        return (0, 0, 0, 0)
    ring = coords[0][0] if isinstance(coords[0][0][0], (list, tuple)) else coords[0]
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return (min(lats), min(lons), max(lats), max(lons))


def _buffer_bbox(s: float, w: float, n: float, e: float, delta: float = 0.002) -> str:
    """Overpass bbox(south,west,north,east) z buforem ~200m."""
    return f"{max(-90, s - delta)},{max(-180, w - delta)},{min(90, n + delta)},{min(180, e + delta)}"


def _parse_voltage(tags: Dict) -> str:
    """WN (>110kV), SN (1–110kV), nN (<1kV)."""
    v = tags.get("voltage") or tags.get("voltage:primary") or ""
    try:
        kv = float(str(v).replace("kV", "").replace("000", ""))
        if kv >= 110:
            return "WN"
        if kv >= 1:
            return "SN"
        return "nN"
    except (ValueError, TypeError):
        return "SN"


def _line_length_meters(geom: Dict, parcel_geom: Optional[Dict]) -> float:
    """Długość linii przecinającej działkę [m]. Shapely + aproksymacja geodezyjna."""
    if not parcel_geom:
        return 0.0
    try:
        parcel = shape(parcel_geom)
        line = shape(geom)
        if not line.is_valid:
            line = line.buffer(0)
        if not parcel.is_valid:
            parcel = parcel.buffer(0)
        clipped = line.intersection(parcel)
        if clipped.is_empty or clipped.geom_type == "Point":
            return 0.0
        if clipped.geom_type == "LineString":
            coords = list(clipped.coords)
        else:
            coords = []
            for g in (clipped.geoms if hasattr(clipped, "geoms") else [clipped]):
                if hasattr(g, "coords"):
                    coords.extend(g.coords)
        if len(coords) < 2:
            return 0.0
        # Aproksymacja geodezyjna: 1° lat≈111km, 1° lon≈68km (52°N)
        import math
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
        return round(total, 1)
    except Exception as e:
        logger.warning("overpass _line_length_meters: %s", e)
        return 0.0


async def fetch_power_lines(
    parcel_geom: Optional[Dict],
    bbox_4326: Optional[Tuple[float, float, float, float]] = None,
) -> Dict[str, Any]:
    """
    Pobierz linie energetyczne z OSM w zasięgu działki.

    Args:
        parcel_geom: GeoJSON Polygon działki (WGS84)
        bbox_4326: (min_lat, min_lon, max_lat, max_lon) gdy brak parcel_geom

    Returns:
        {
            "ok": bool,
            "lines": [{"geometry": GeoJSON, "voltage": str, "length_m": float}],
            "line_length_m": float,
            "line_geojson": GeoJSON FeatureCollection,
            "source": "OSM Overpass"
        }
    """
    result = {
        "ok": False,
        "lines": [],
        "line_length_m": 0.0,
        "line_geojson": {"type": "FeatureCollection", "features": []},
        "source": "OSM Overpass",
    }

    if parcel_geom:
        s, w, n, e = _bbox_from_geojson(parcel_geom)
    elif bbox_4326:
        s, w, n, e = bbox_4326
    else:
        return result

    bbox_str = _buffer_bbox(s, w, n, e)

    query = f"""
[out:json][timeout:{OVERPASS_TIMEOUT}];
(
  way["power"="line"]({bbox_str});
  way["power"="minor_line"]({bbox_str});
  way["power"="cable"]({bbox_str});
  way["power"="minor_cable"]({bbox_str});
);
out geom;
"""
    try:
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(
            None,
            lambda: requests.post(
                OVERPASS_URL,
                data={"data": query},
                timeout=OVERPASS_TIMEOUT,
                headers={"User-Agent": "Kalkulator-Roszczen/1.0"},
            ),
        )
        if resp.status_code != 200:
            logger.warning("Overpass HTTP %s", resp.status_code)
            return result

        data = resp.json()
        elements = data.get("elements", [])

        lines = []
        features = []
        total_length = 0.0

        for el in elements:
            if el.get("type") != "way":
                continue
            nodes = el.get("geometry", [])
            if len(nodes) < 2:
                continue
            coords = [[n["lon"], n["lat"]] for n in nodes]
            geojson = {"type": "LineString", "coordinates": coords}
            tags = el.get("tags", {})
            voltage = _parse_voltage(tags)
            length_m = _line_length_meters(geojson, parcel_geom) if parcel_geom else 0.0
            total_length += length_m

            lines.append({"geometry": geojson, "voltage": voltage, "length_m": length_m})
            features.append({
                "type": "Feature",
                "geometry": geojson,
                "properties": {"voltage": voltage, "length_m": length_m},
            })

        result["lines"] = lines
        result["line_length_m"] = round(total_length, 1)
        result["line_geojson"] = {"type": "FeatureCollection", "features": features}
        result["ok"] = True
        logger.info("Overpass OK: %d linii, length_m=%.1f", len(lines), total_length)

    except requests.exceptions.Timeout:
        logger.warning("Overpass timeout")
    except Exception as e:
        logger.error("Overpass error: %s", e)

    return result
