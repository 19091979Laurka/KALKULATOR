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
from typing import Dict, Any, Optional

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
    lon: float,
    lat: float,
    parcel_geom: Optional[Dict] = None,
    infra_type: str = "elektro_SN",
) -> Dict[str, Any]:
    """
    Pobiera dane infrastrukturalne dla działki.
    """
    from backend.integrations.gesut import GESUTClient

    gesut = GESUTClient()

    # BBOX wokół centroidu
    delta = 0.003  # ~300m
    bbox = (lon - delta, lat - delta, lon + delta, lat + delta)

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
    }

    # --- GESUT: energia elektryczna ---
    try:
        layer_key = "elektro"
        if infra_type.startswith("gaz"):
            layer_key = "gaz"
        elif infra_type == "wod_kan":
            layer_key = "woda"
        elif infra_type == "teleko":
            layer_key = "telekom"

        infra_data = await gesut.get_infrastructure_in_bbox(layer_key, bbox)
        if infra_data and infra_data.get("length_m", 0) > 0:
            result["energie"] = {
                "type": infra_type,
                "length_m": round(infra_data.get("length_m", 0), 1),
                "strefa_m": STREFY_OCHRONNE.get(infra_type, 10),
                "detected": True,
                "ok": True,
            }
    except Exception as e:
        logger.warning(f"GESUT energie error: {e}")

    # --- GESUT: media (gaz, woda, kanalizacja, ciepło) ---
    for media_key, gesut_layer in [("gaz", "gaz"), ("woda", "woda"), ("kanal", "kanal"), ("cieplo", "cieplo")]:
        try:
            data = await gesut.get_infrastructure_in_bbox(gesut_layer, bbox)
            if data and data.get("length_m", 0) > 0:
                result["media"][media_key] = True
        except Exception as e:
            logger.debug(f"GESUT {gesut_layer} error: {e}")

    # --- GESUT: światłowód ---
    try:
        data = await gesut.get_infrastructure_in_bbox("telekom", bbox)
        if data and data.get("length_m", 0) > 0:
            result["swiatlowod"] = True
    except Exception as e:
        logger.debug(f"GESUT teleko error: {e}")

    # --- OSM: droga ---
    loop = asyncio.get_event_loop()
    road = await loop.run_in_executor(None, lambda: _osm_road_query(lon, lat))
    result["droga"] = road

    return result
