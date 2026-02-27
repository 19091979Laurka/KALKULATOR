"""
Moduł: Cechy terenu
- Parametry geometryczne (ULDK)
- Dane Ewidencji Gruntów i Budynków (ULDK extended)
"""
import logging
from typing import Dict, Any, Optional
from backend.integrations.uldk import ULDKClient

logger = logging.getLogger(__name__)
_uldk = ULDKClient()


async def fetch_terrain(parcel_id: str, lon: Optional[float] = None, lat: Optional[float] = None) -> Dict[str, Any]:
    """
    Pobiera cechy terenu dla działki.
    parcel_id: format TERYT.OBREB.NR np. "061802_2.0004.109"
    """
    result = {
        "parcel_id": parcel_id,
        "area_m2": None,
        "area_ha": None,
        "geometry": None,
        "voivodeship": None,
        "county": None,
        "commune": None,
        "region": None,
        "egib": {
            "uzytek": None,
            "klasa": None,
        },
        "centroid": {"lon": lon, "lat": lat},
        "source": "ULDK/GUGiK",
        "ok": False,
    }

    try:
        raw = _uldk.get_parcel_by_id(parcel_id)
        if raw:
            result["geometry"] = raw.get("geometry")
            result["voivodeship"] = raw.get("voivodeship")
            result["county"] = raw.get("county")
            result["commune"] = raw.get("commune")
            result["region"] = raw.get("region")

            # Oblicz powierzchnię z geometrii GeoJSON
            geom = raw.get("geometry")
            if geom:
                area_m2 = _calc_area_m2(geom)
                result["area_m2"] = round(area_m2, 1)
                result["area_ha"] = round(area_m2 / 10000, 4)
                centroid = _calc_centroid(geom)
                if centroid:
                    result["centroid"] = centroid

            result["ok"] = True
    except Exception as e:
        logger.error(f"terrain.fetch_terrain error: {e}")

    # Fallback: szukaj po współrzędnych
    if not result["ok"] and lon and lat:
        try:
            raw = _uldk.search_by_coords(lon, lat)
            if raw:
                result["geometry"] = raw.get("geometry")
                result["voivodeship"] = raw.get("voivodeship")
                result["county"] = raw.get("county")
                result["ok"] = True
        except Exception as e:
            logger.error(f"terrain.search_by_coords error: {e}")

    return result


def _calc_area_m2(geojson: Dict) -> float:
    """Przybliżone pole w m² dla Polski (EPSG:4326)."""
    try:
        coords = geojson.get("coordinates", [[]])[0]
        if not coords or len(coords) < 3:
            return 0.0
        # Shoelace formula na stopniach → przeliczenie na m²
        n = len(coords)
        area_deg = 0.0
        for i in range(n):
            j = (i + 1) % n
            area_deg += coords[i][0] * coords[j][1]
            area_deg -= coords[j][0] * coords[i][1]
        area_deg = abs(area_deg) / 2.0
        # Dla Polski ~52°N: 1°lat = 111120m, 1°lon = 68500m
        return area_deg * 111120.0 * 68500.0
    except Exception:
        return 0.0


def _calc_centroid(geojson: Dict) -> Optional[Dict[str, float]]:
    try:
        coords = geojson.get("coordinates", [[]])[0]
        if not coords:
            return None
        lon = sum(c[0] for c in coords) / len(coords)
        lat = sum(c[1] for c in coords) / len(coords)
        return {"lon": round(lon, 6), "lat": round(lat, 6)}
    except Exception:
        return None
