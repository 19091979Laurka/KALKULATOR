"""
Moduł: Infrastruktura
- Linie energetyczne (GESUT)
- Uzbrojenie w media: gaz, woda, kanalizacja, ciepło (GESUT)
- Dostęp do światłowodu (GESUT teleko)
- Dostęp do drogi publicznej (OSM Overpass API)
"""
import logging
import requests
import asyncio
from typing import Dict, Any, Optional, List
import json
import math
from shapely.geometry import shape, LineString, Point, MultiPoint
from shapely.ops import transform

def project_to_meters(geom_ll, center_lat):
    """Simple linear projection for small areas."""
    # Scale factors
    sy = 111120.0
    sx = sy * math.cos(math.radians(center_lat))
    
    def transform_fn(x, y, z=None):
        return (x * sx, y * sy)
        
    return transform(transform_fn, geom_ll)

def project_back_to_ll(geom_m, center_lat):
    """Reverse simple linear projection."""
    sy = 111120.0
    sx = sy * math.cos(math.radians(center_lat))
    
    def transform_fn(x, y, z=None):
        return (x / sx, y / sy)
        
    return transform(transform_fn, geom_m)

logger = logging.getLogger(__name__)

OSM_OVERPASS = "https://overpass-api.de/api/interpreter"

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


def _osm_road_query(lon: float, lat: float, radius_m: int = 300) -> Optional[Dict]:
    """Zapytanie OSM Overpass o drogi w promieniu."""
    query = f"""
[out:json][timeout:10];
way(around:{radius_m},{lat},{lon})["highway"];
out tags 1;
"""
    try:
        r = requests.post(OSM_OVERPASS, data={"data": query}, timeout=15)
        if r.status_code == 200:
            elements = r.json().get("elements", [])
            if elements:
                el = elements[0]
                tags = el.get("tags", {})
                hw = tags.get("highway", "unknown")
                name = tags.get("name", "")
                # Uproszczona klasyfikacja
                if hw in ("motorway", "trunk", "primary"):
                    road_type = "droga_krajowa"
                elif hw in ("secondary", "tertiary"):
                    road_type = "droga_powiatowa"
                elif hw in ("residential", "unclassified", "service", "living_street"):
                    road_type = "droga_gminna"
                else:
                    road_type = hw
                return {"access": True, "type": road_type, "name": name, "osm_highway": hw}
    except Exception as e:
        logger.warning(f"OSM road query error: {e}")
    return {"access": False, "type": None, "name": None, "osm_highway": None}


async def fetch_infrastructure(
    parcel_id: Optional[str],
    lon: float,
    lat: float,
    parcel_geom: Optional[Dict] = None,
    infra_type: str = "elektro_SN",
) -> Dict[str, Any]:
    """
    Pobiera dane infrastrukturalne dla działki.
    """
    from backend.integrations.gesut import GESUTClient
    from backend.integrations.uldk import ULDKClient

    # Extract county code (first 4 digits of TERYT) if parcel_id looks like a full TERYT
    county_code = None
    if parcel_id and "_" in parcel_id and len(parcel_id.split("_")[0]) >= 4:
        county_code = parcel_id[:4]

    gesut = GESUTClient(county_code=county_code)

    uldk = ULDKClient()

    # 1. Uzyskaj BBOX w układzie EPSG:2180 (wymagany przez GESUT WMS)
    bbox_2180 = None
    if parcel_id:
        bbox_2180 = uldk.get_parcel_bbox(parcel_id, srid="2180")

    if not bbox_2180:
        # Fallback: przybliżona konwersja lon/lat -> 2180
        # E ≈ (LON - 15) * 85000 + bonus
        # N ≈ (LAT - 49.0) * 111000 + bonus
        # Dla centroidu:
        e = (lon - 15.0) * 85000 * 0.77 + 250000 # bardzo zgrubne
        n = (lat - 49.0) * 111120 + 150000
        delta = 200 # 200m
        bbox_2180 = (e - delta, n - delta, e + delta, n + delta)
        logger.warning(f"Using estimated BBOX 2180: {bbox_2180}")

    result = {
        "energie": {
            "type": infra_type,
            "length_m": None,
            "strefa_m": STREFY_OCHRONNE.get(infra_type, 10),
            "detected": False,
            "ok": False,
        },
        "media": {
            "gaz": False,
            "woda": False,
            "kanal": False,
            "cieplo": False,
        },
        "swiatlowod": False,
        "droga": {"access": False, "type": None, "name": None},
        "view_3d_url": None,
        "details_extended": {
            "poles_count": 0,
            "intersection_area_m2": 0,
            "line_geojson": None,
            "buffer_geojson": None
        }
    }

    # 3D View URL
    if bbox_2180:
        # Simple centroid-based 3D view
        e_mid = (bbox_2180[0] + bbox_2180[2]) / 2
        n_mid = (bbox_2180[1] + bbox_2180[3]) / 2
        result["view_3d_url"] = f"https://mapy.geoportal.gov.pl/imap3d/?lon={lon}&lat={lat}&zoom=18"

    # --- GESUT: kluczowa warstwa (elektro/gaz/woda zależnie od infra_type) ---
    try:
        layer_key = "elektro"
        if infra_type.startswith("gaz"):
            layer_key = "gaz"
        elif infra_type == "wod_kan":
            layer_key = "woda"
        elif infra_type == "teleko":
            layer_key = "telekom"

        # Try to use enhanced detection
        infra_data = await gesut.fetch_infrastructure(bbox_2180)
        
        if infra_data and infra_data.get("ok") and infra_data.get("line_length_m", 0) > 0:
            result["energie"] = {
                "type": infra_data.get("voltage", "SN"),
                "length_m": round(infra_data.get("line_length_m", 0), 1),
                "strefa_m": STREFY_OCHRONNE.get(f"elektro_{infra_data.get('voltage', 'SN')}", 15),
                "detected": True,
                "ok": True,
                "voltage": infra_data.get("voltage"),
                "poles_count": infra_data.get("poles_count", 0)
            }
            
            # --- SPATIAL ANALYSIS: INTERSECTION ---
            if parcel_geom and infra_data.get("coordinates") and bbox_2180:
                try:
                    # 1. Create LineString in EPSG:2180
                    line_coords = infra_data["coordinates"]
                    if len(line_coords) >= 2:
                        line_geom_2180 = LineString(line_coords)
                        buffer_dist = result["energie"]["strefa_m"]
                        buffer_geom_2180 = line_geom_2180.buffer(buffer_dist)
                        
                        # 2. Local Linear Transformation: LL -> 2180
                        # We use the bbox in both systems to find local scaling
                        bbox_ll = uldk.get_parcel_bbox(parcel_id, srid="4326")
                        if bbox_ll:
                            l_min, a_min, l_max, a_max = bbox_ll
                            e_min, n_min, e_max, n_max = bbox_2180
                            
                            kx = (e_max - e_min) / (l_max - l_min) if (l_max - l_min) != 0 else 1.0
                            ky = (n_max - n_min) / (a_max - a_min) if (a_max - a_min) != 0 else 1.0
                            
                            def to_2180(lon, lat, z=None):
                                return (e_min + (lon - l_min) * kx, n_min + (lat - a_min) * ky)
                            
                            def to_ll(e, n, z=None):
                                return (l_min + (e - e_min) / kx, a_min + (n - n_min) / ky)
                                
                            p_geom_ll = shape(parcel_geom)
                            p_geom_2180 = transform(to_2180, p_geom_ll)
                            
                            # 3. Intersect
                            intersection = buffer_geom_2180.intersection(p_geom_2180)
                            area_m2 = intersection.area
                            
                            result["details_extended"]["intersection_area_m2"] = round(area_m2, 1)
                            
                            # 4. Prepare GeoJSON for frontend (back to LL)
                            result["details_extended"]["line_geojson"] = json.loads(json.dumps(transform(to_ll, line_geom_2180).__geo_interface__))
                            result["details_extended"]["buffer_geojson"] = json.loads(json.dumps(transform(to_ll, buffer_geom_2180).__geo_interface__))
                except Exception as ex:
                    logger.error(f"Spatial analysis error: {ex}")
    except Exception as e:
        logger.warning(f"GESUT primary layer error: {e}")

    # --- GESUT: media (gaz, woda, kanalizacja, ciepło) ---
    for media_key, gesut_layer in [("gaz", "gaz"), ("woda", "woda"), ("kanal", "kanal"), ("cieplo", "cieplo")]:
        try:
            # Nie sprawdzaj ponownie jeśli to był główny typ
            if result["media"].get(media_key) is True: continue
            
            data = await gesut.get_infrastructure_in_bbox(gesut_layer, bbox_2180)
            if data and data.get("line_length_m", 0) > 0:
                result["media"][media_key] = True
        except Exception as e:
            logger.debug(f"GESUT {gesut_layer} error: {e}")

    # --- GESUT: światłowód ---
    try:
        data = await gesut.get_infrastructure_in_bbox("telekom", bbox_2180)
        if data and data.get("line_length_m", 0) > 0:
            result["swiatlowod"] = True
    except Exception as e:
        logger.debug(f"GESUT teleko error: {e}")

    # --- OSM: droga ---
    loop = asyncio.get_event_loop()
    road = await loop.run_in_executor(None, lambda: _osm_road_query(lon, lat))
    result["droga"] = road

    return result
