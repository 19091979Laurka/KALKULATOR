"""
Moduł: Ograniczenia formalnoprawne
- MPZP zasięg i przeznaczenie (planowanie.gov.pl WFS)
- Plan ogólny gminy
- Studium uwarunkowań i kierunków zagospodarowania przestrzennego
"""
import asyncio
import logging
import requests
from typing import Dict, Any

logger = logging.getLogger(__name__)

# GUGiK / planowanie.gov.pl WFS endpoints
PLANNING_WFS = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego"
PLAN_OGOLNY_WFS = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaPlanowOgolnych"


def _wfs_get_features(wfs_url: str, layer: str, bbox: str, max_features: int = 5) -> list:
    """Generyczne zapytanie WFS GetFeature w BBOX."""
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": layer,
        "outputFormat": "application/json",
        "srsName": "EPSG:4326",
        "bbox": f"{bbox},EPSG:4326",
        "count": max_features,
    }
    try:
        r = requests.get(wfs_url, params=params, timeout=15)
        if r.status_code == 200:
            data = r.json()
            return data.get("features", [])
    except Exception as e:
        logger.warning(f"WFS {wfs_url} layer={layer} error: {e}")
    return []


def _make_bbox(lon: float, lat: float, delta: float = 0.005) -> str:
    """Tworzy BBOX string wokół punktu (delta ~500m)."""
    return f"{lon - delta},{lat - delta},{lon + delta},{lat + delta}"


async def fetch_planning(lon: float, lat: float) -> Dict[str, Any]:
    """
    Pobiera dane planistyczne dla punktu (centroid działki).
    """
    if lon is None or lat is None:
        return {
            "mpzp": {"has_mpzp": False, "przeznaczenie": None, "symbol": None, "uchwala": None, "source": None, "ok": False},
            "plan_ogolny": {"status": None, "zone": None, "ok": False},
            "studium": {"przeznaczenie": None, "ok": False},
        }
    result = {
        "mpzp": {
            "has_mpzp": False,
            "przeznaczenie": None,
            "symbol": None,
            "uchwala": None,
            "source": None,
            "ok": False,
        },
        "plan_ogolny": {
            "status": None,
            "zone": None,
            "ok": False,
        },
        "studium": {
            "przeznaczenie": None,
            "ok": False,
        },
    }

    bbox = _make_bbox(lon, lat)
    loop = asyncio.get_event_loop()

    # --- MPZP ---
    try:
        features = await loop.run_in_executor(None, lambda: _wfs_get_features(PLANNING_WFS, "mpzp:pzp_obszar", bbox))
        if features:
            props = features[0].get("properties", {})
            result["mpzp"] = {
                "has_mpzp": True,
                "przeznaczenie": props.get("przeznaczenie_terenu") or props.get("symbol_terenu"),
                "symbol": props.get("symbol_planu") or props.get("nr_uchwaly"),
                "uchwala": props.get("data_uchwaly"),
                "source": PLANNING_WFS,
                "ok": True,
            }
    except Exception as e:
        logger.warning(f"MPZP fetch error: {e}")

    # --- Plan ogólny gminy ---
    try:
        features = await loop.run_in_executor(None, lambda: _wfs_get_features(PLAN_OGOLNY_WFS, "po:plan_ogolny", bbox))
        if features:
            props = features[0].get("properties", {})
            result["plan_ogolny"] = {
                "status": props.get("status") or "uchwalony",
                "zone": props.get("strefa_planistyczna") or props.get("przeznaczenie"),
                "ok": True,
            }
    except Exception as e:
        logger.warning(f"Plan ogólny fetch error: {e}")

    # --- Studium ---
    try:
        features = await loop.run_in_executor(None, lambda: _wfs_get_features(PLANNING_WFS, "mpzp:studium_obszar", bbox))
        if features:
            props = features[0].get("properties", {})
            result["studium"] = {
                "przeznaczenie": props.get("przeznaczenie") or props.get("kierunek"),
                "ok": True,
            }
    except Exception as e:
        logger.warning(f"Studium fetch error: {e}")

    return result
