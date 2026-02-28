"""
Moduł: Cechy terenu
- Parametry geometryczne (ULDK)
- Dane Ewidencji Gruntów i Budynków (ULDK extended)
"""
import logging
from typing import Dict, Any, Optional
import math
import requests
from backend.integrations.uldk import ULDKClient

logger = logging.getLogger(__name__)
_uldk = ULDKClient()

def _resolve_with_nominatim(address: str) -> Optional[Dict]:
    """Próba znalezienia działki przez geokodowanie adresu w Nominatim i odwrotne szukanie w ULDK."""
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {'q': address, 'format': 'json', 'limit': 1}
        headers = {'User-Agent': 'kalkulator/1.0'}
        r = requests.get(url, params=params, headers=headers, timeout=10)
        data = r.json()
        if data:
            lat, lon = float(data[0]['lat']), float(data[0]['lon'])
            return _uldk.search_by_coords(lon, lat)
    except Exception as e:
        logger.warning(f"Nominatim lookup failed: {e}")
    return None


async def fetch_terrain(
    parcel_id: str, 
    lon: Optional[float] = None, 
    lat: Optional[float] = None,
    county: Optional[str] = None,
    municipality: Optional[str] = None
) -> Dict[str, Any]:
    """
    Pobiera cechy terenu dla działki.
    parcel_id: TERYT ID lub numer działki.
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
        # 1. Próba bezpośrednia (TERYT ID)
        raw = _uldk.get_parcel_by_id(parcel_id)
        
        # 2. Jeśli nie znaleziono, a mamy dane adresowe -> szukamy po numerze
        if not raw and (municipality or county):
            candidates = []
            
            # Najpierw spróbujmy mądrzej z geokodowaniem Nominatim dla dokładnych fraz (np "Cieszkowo Kolonia")
            address_query = f"{municipality}, {county}" if county else f"{municipality}"
            raw = _resolve_with_nominatim(address_query)
            
            if raw:
                # Jeśli trafiliśmy gdzieś w obręb, wydobądźmy ID obrębu i połączmy z numerem działki
                teryt = raw.get("teryt")
                if teryt:
                    obreb = teryt.rsplit('.', 1)[0]
                    target_id = f"{obreb}.{parcel_id}"
                    logger.info(f"Nominatim mapped to obreb: {obreb}, testing target: {target_id}")
                    raw_target = _uldk.get_parcel_by_id(target_id)
                    if raw_target:
                        raw = raw_target
                    else:
                        # Może ułamek z '/' był zapisany URL-encode albo myślnikiem, ale powiedzmy że target_id to first guess
                        raw = None # fallback into full text search 

            # Jesli nadal nic, robimy fallback na stare candidates
            if not raw:
                if municipality: candidates.append(f"{municipality} {parcel_id}")
                if county and municipality: candidates.append(f"{county} {municipality} {parcel_id}")
                if county: candidates.append(f"{county} {parcel_id}")
    
                for query in candidates:
                    try:
                        logger.info(f"Trying ULDK search: {query}")
                        raw = _uldk.get_parcel_by_id_or_nr(query)
                        if raw:
                            logger.info(f"Found parcel via: {query}")
                            break
                    except Exception as ex:
                        logger.debug(f"Search candidate failed ({query}): {ex}")


        if raw:
            result["parcel_id"] = raw.get("teryt") or parcel_id
            result["geometry"] = raw.get("geometry")
            result["voivodeship"] = raw.get("voivodeship")
            result["county"] = raw.get("county")
            result["commune"] = raw.get("commune")
            result["region"] = raw.get("region")

            # Oblicz dokładne parametry kształtu i powierzchni
            geom = raw.get("geometry")
            if geom:
                shape_metrics = _calc_shape_metrics(geom)
                result["area_m2"] = shape_metrics["area"]
                result["area_ha"] = round(shape_metrics["area"] / 10000, 4)
                result["perimeter_m"] = shape_metrics["perimeter"]
                result["shape_coef"] = shape_metrics["shape_coef"]
                result["shape_class"] = shape_metrics["shape_class"]
                result["segments"] = shape_metrics["segments"]
                
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


def _calc_shape_metrics(geojson: Dict) -> Dict:
    """Dokładne obliczenia geometryczne (metry, wzór Surveyor, geodezyjne odległości)."""
    empty = {"area": 0.0, "perimeter": 0.0, "shape_coef": 0.0, "shape_class": "brak", "segments": []}
    try:
        coords = geojson.get("coordinates", [[]])[0]
        if not coords or len(coords) < 3:
            return empty
            
        avg_lat = sum(p[1] for p in coords) / len(coords)
        cos_lat = math.cos(math.radians(avg_lat))
        
        area_m2 = 0.0
        perimeter_m = 0.0
        distances = []
        
        local_coords = []
        for lon, lat in coords:
            x = math.radians(lon) * 6371000 * cos_lat
            y = math.radians(lat) * 6371000
            local_coords.append((x, y))
            
        for i in range(len(local_coords) - 1):
            x1, y1 = local_coords[i]
            x2, y2 = local_coords[i+1]
            area_m2 += x1 * y2 - x2 * y1
            dist = math.hypot(x2 - x1, y2 - y1)
            perimeter_m += dist
            distances.append({
                "from": f"A{i}",
                "to": f"A{i+1}",
                "lat": round(coords[i][1], 8),
                "lon": round(coords[i][0], 8),
                "distance_m": round(dist, 2)
            })
            
        area_m2 = abs(area_m2) / 2.0
        
        dzialki360_shape = 0
        if area_m2 > 0 and perimeter_m > 0:
            dzialki360_shape = round((4 * math.pi * area_m2) / (perimeter_m * perimeter_m), 2)
            
        shape_class = "średni"
        if dzialki360_shape > 0.8: shape_class = "korzystny"
        elif dzialki360_shape < 0.5: shape_class = "niekorzystny"
        
        return {
            "area": round(area_m2, 2),
            "perimeter": round(perimeter_m, 2),
            "shape_coef": dzialki360_shape,
            "shape_class": shape_class,
            "segments": distances
        }
    except Exception as e:
        logger.error(f"Shape metrics calc error: {e}")
        return empty


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
