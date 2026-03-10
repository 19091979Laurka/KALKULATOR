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
from backend.integrations.overpass import fetch_power_lines

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

    # --- ELEKTRONIKA: OpenStreetMap Overpass API (zamiast GESUT WFS) ---
    # GESUT WFS nie działa, ale OpenStreetMap ma doskonałe dane power lines
    try:
        osm_data = await fetch_power_lines(parcel_geom if parcel_geom else None)

        if osm_data and osm_data.get("ok") and osm_data.get("lines"):
            # Linie znalezione w OSM
            result["energie"]["detected"] = True
            result["energie"]["features"] = osm_data.get("lines", [])
            result["energie"]["geojson"] = osm_data.get("line_geojson", {})
            result["energie"]["feature_count"] = len(osm_data.get("lines", []))
            result["energie"]["length_m"] = osm_data.get("line_length_m", 0.0)

            # Określ napięcie z pierwszej znalezionej linii
            first_line = osm_data.get("lines", [{}])[0]
            voltage = first_line.get("voltage", "SN")
            result["energie"]["voltage"] = voltage
            result["energie"]["strefa_m"] = STREFY_OCHRONNE.get(f"elektro_{voltage}", 15)
            result["energie"]["status"] = "REAL (OSM Overpass)"
            result["energie"]["info"] = f"OpenStreetMap: {len(osm_data.get('lines', []))} linii, dł. {osm_data.get('line_length_m', 0):.1f}m"
            result["energie"]["source"] = "OpenStreetMap (Overpass API)"
            result["energie"]["ok"] = True
            result["ok"] = True
        else:
            # Linie nie znalezione w OSM
            result["energie"]["detected"] = False
            result["energie"]["status"] = "NOT_DETECTED"
            result["energie"]["info"] = "Brak linii w OpenStreetMap dla tego obszaru"
            result["energie"]["source"] = "OpenStreetMap (Overpass API)"

    except Exception as e:
        logger.error(f"infra_base error (Overpass): {e}", exc_info=True)
        result["energie"]["status"] = "ERROR"
        result["energie"]["info"] = f"Błąd Overpass API: {str(e)}"

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
