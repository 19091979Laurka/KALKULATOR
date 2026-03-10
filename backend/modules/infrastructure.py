"""
Moduł: Infrastruktura (Spec v3.0 - Strict Data Policy)
Pobiera dane infrastrukturalne z GESUT/KIUT WFS (Vector).
KROK 2: Passes WFS features for Shapely intersection calculation.
NIGDY nie estymuje brakujących danych.
"""
import logging
from typing import Dict, Any, Optional, List
from backend.integrations.gesut import GESUTClient
from backend.integrations.uldk import ULDKClient

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
    """
    # 1. Podstawowy BBOX
    uldk = ULDKClient()
    bbox_2180 = None
    if parcel_id:
        bbox_2180 = uldk.get_parcel_bbox(parcel_id, srid="2180")
    
    if not bbox_2180:
        return {"ok": False, "error": "Brak BBOX parceli w EPSG:2180", "status": "ERROR"}

    # 2. GESUT Client
    county_code = parcel_id[:4] if parcel_id and len(parcel_id) >= 4 else None
    gesut = GESUTClient(county_code=county_code)

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

    # --- GESUT: kluczowa warstwa energetyczna (WFS Vector) ---
    try:
        infra_data = await gesut.fetch_infrastructure(bbox_2180, layer_key="elektro")

        if infra_data and infra_data.get("ok"):
            result["energie"]["detected"] = infra_data.get("detected", False)
            result["energie"]["voltage"] = infra_data.get("voltage", "nieznane")
            # KROK 2: Pass WFS features for Shapely intersection calculation
            result["energie"]["features"] = infra_data.get("features", [])  # GeoJSON features
            result["energie"]["geojson"] = infra_data.get("geojson")  # Full GeoJSON response
            result["energie"]["feature_count"] = infra_data.get("feature_count", 0)
            # Line length will be calculated by PropertyAggregator using Shapely
            result["energie"]["length_m"] = 0.0  # Placeholder, real value from Shapely
            result["energie"]["strefa_m"] = STREFY_OCHRONNE.get(f"elektro_{infra_data.get('voltage', 'SN')}", 15)
            result["energie"]["status"] = "REAL (KIUT WFS Vector)"
            result["energie"]["info"] = infra_data.get("info", "")
            result["energie"]["source"] = infra_data.get("source", "GUGiK KIUT WFS")
            result["energie"]["ok"] = True
            result["ok"] = True
        else:
            result["energie"]["status"] = "ERROR"
            result["energie"]["info"] = infra_data.get("error", "Błąd serwisu GESUT WFS")

    except Exception as e:
        logger.error(f"infra_base error (WFS): {e}", exc_info=True)
        result["energie"]["status"] = "ERROR"
        result["energie"]["info"] = str(e)

    # --- GESUT: Inne media (uproszczona obecność) ---
    for media in ["gaz", "woda", "kanal", "cieplo"]:
        try:
            data = await gesut.get_infrastructure_in_bbox(media, bbox_2180)
            if data and data.get("ok"):
                result["media"][media]["detected"] = data.get("detected", False)
                result["media"][media]["status"] = "REAL"
            else:
                result["media"][media]["status"] = "ERROR"
        except: pass

    return result
