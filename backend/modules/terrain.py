"""
Moduł: Cechy terenu (Spec v3.0 - Strict Data Policy)
Pobiera dane geometryczne z ULDK i dane infrastruktury z GESUT/BDOT10k.
"""
import asyncio
import logging
import math
from typing import Dict, Any, Optional, List
from backend.integrations.uldk import ULDKClient
from backend.integrations.gesut_client import GESUTClient

logger = logging.getLogger(__name__)
_uldk = ULDKClient()
_gesut = GESUTClient()

def _normalize_obreb(name: str) -> str:
    """Obręb bez polskich znaków (np. BOŻEWO → BOZEWO) — fallback dla ULDK GetParcelByIdOrNr."""
    if not name:
        return name
    t = str(name).strip()
    for a, b in [("Ą", "A"), ("Ć", "C"), ("Ę", "E"), ("Ł", "L"), ("Ń", "N"), ("Ó", "O"), ("Ś", "S"), ("Ź", "Z"), ("Ż", "Z")]:
        t = t.replace(a, b).replace(a.lower(), b.lower())
    return t

async def fetch_terrain(
    parcel_id: str,
    lon: Optional[float] = None,
    lat: Optional[float] = None,
    obreb: Optional[str] = None,
    county: Optional[str] = None,
    municipality: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Pobiera cechy terenu dla działki.
    ZASADA: Jeśli nie ma danych w ULDK, zwraca BŁĄD. Brak domysłów.
    """

    result = {
        "parcel_id": parcel_id,
        "area_m2": None,
        "area_ha": None,
        "geometry": None,
        "voivodeship": None,
        "county": None,
        "commune": None,
        "status": "ERROR", # Default to error until proven real
        "source": "ULDK/GUGiK",
        "ok": False,
        "infrastructure": [],  # Infrastructure data from GESUT/BDOT10k
    }

    try:
        # UWAGA: Wszystkie wywołania ULDK są synchroniczne (requests.get).
        # asyncio.to_thread() zapobiega blokowaniu event loop przy batch (59 działek).

        # 1. Próba bezpośrednia: pełny TERYT ID (np. "140601_2.0004.74/4")
        raw = await asyncio.to_thread(_uldk.get_parcel_by_id, parcel_id)

        # 2. Jeśli ULDK nie znalazł pełnego TERYT, spróbuj wyszukać po numerze/obrebie.
        #    Dotyczy sytuacji, gdy ID ma postać "141906_5.0029.60" lub "142003_2.0002.81/8".
        if (not raw or not raw.get("ok")):
            # 2a. Spróbuj GetParcelByIdOrNr bez żadnych zmian (może zadziała dla ID zawierającego /).
            raw = await asyncio.to_thread(_uldk.get_parcel_by_id_or_nr, parcel_id)

        # 2b. parcel_id zawiera spację → zakładamy format "NazwaObrebu NrDzialki"
        #     (np. "Cieszkowo Kolonia 74/4") — GetParcelByIdOrNr wymaga nazwy OBREBU, nie gminy
        if (not raw or not raw.get("ok")) and ' ' in parcel_id:
            raw = await asyncio.to_thread(_uldk.get_parcel_by_id_or_nr, parcel_id)

        # 3. Obręb podany explicite → "NazwaObrebu NrDzialki" (najbardziej wiarygodne)
        if (not raw or not raw.get("ok")) and obreb:
            raw = await asyncio.to_thread(_uldk.get_parcel_by_id_or_nr, f"{obreb} {parcel_id}")

        # 3b. Fallback: obręb znormalizowany (bez polskich znaków) — ULDK czasem zwraca brak przy Ż/Ó/Ą itd.
        if (not raw or not raw.get("ok")) and obreb:
            _norm_obreb = _normalize_obreb(obreb)
            if _norm_obreb != obreb:
                raw = await asyncio.to_thread(_uldk.get_parcel_by_id_or_nr, f"{_norm_obreb} {parcel_id}")

        # 4. Fallback: gmina lub powiat jako przybliżenie nazwy obrebu
        #    UWAGA: Gmina ≠ Obręb. Działa tylko gdy nazwa obrebu = nazwa gminy/wsi.
        #    Dla pewności podaj obreb explicite w żądaniu.
        if (not raw or not raw.get("ok")) and municipality:
            raw = await asyncio.to_thread(_uldk.get_parcel_by_id_or_nr, f"{municipality} {parcel_id}")
        if (not raw or not raw.get("ok")) and county:
            raw = await asyncio.to_thread(_uldk.get_parcel_by_id_or_nr, f"{county} {parcel_id}")
        # 5. Ostatnia szansa: sam numer (np. 81/5, 302/6) — GetParcelByIdOrNr może zwrócić wynik w jednej jednostce
        if (not raw or not raw.get("ok")) and " " not in (parcel_id or "") and (parcel_id or "").strip():
            raw = await asyncio.to_thread(_uldk.get_parcel_by_id_or_nr, parcel_id.strip())

        if raw and raw.get("ok"):
            result["parcel_id"] = raw.get("teryt") or parcel_id

            result["geometry"] = raw.get("geometry")
            result["voivodeship"] = raw.get("voivodeship")
            result["county"] = raw.get("county")
            result["commune"] = raw.get("commune")

            # Oblicz parametry z geometry (To są dane RZECZYWISTE - wektorowe)
            geom = raw.get("geometry")
            if geom:
                shape_metrics = _calc_shape_metrics(geom)
                # Prefer area from ULDK (EPSG:2180) when available; fallback to local calculation
                area_from_uldk = raw.get("area_m2")
                if area_from_uldk is not None and area_from_uldk > 0:
                    result["area_m2"] = area_from_uldk
                    result["area_ha"] = round(area_from_uldk / 10000, 4)
                else:
                    result["area_m2"] = shape_metrics["area"]
                    result["area_ha"] = round(shape_metrics["area"] / 10000, 4)
                result["perimeter_m"] = shape_metrics.get("perimeter")
                result["shape_class"] = shape_metrics.get("shape_class")
                result["status"] = "REAL"
                result["ok"] = True
                cent = _centroid_from_geojson(geom)
                if cent is None and geom.get("coordinates"):
                    # Fallback: środek z pierwszego pierścienia
                    try:
                        ring = geom["coordinates"][0] if not isinstance(geom["coordinates"][0][0], (list, tuple)) else geom["coordinates"][0][0]
                        if len(ring) >= 3:
                            lons = [p[0] for p in ring]
                            lats = [p[1] for p in ring]
                            cent = {"lon": round(sum(lons) / len(lons), 6), "lat": round(sum(lats) / len(lats), 6)}
                    except Exception:
                        pass
                result["centroid"] = cent

                # Fetch infrastructure data if we have centroid
                if cent:
                    try:
                        bbox = {
                            'minx': cent['lon'] - 0.01,  # ~1km buffer
                            'miny': cent['lat'] - 0.01,
                            'maxx': cent['lon'] + 0.01,
                            'maxy': cent['lat'] + 0.01,
                        }
                        infrastructure = _gesut.get_infrastructure(bbox)
                        if infrastructure:
                            result["infrastructure"] = infrastructure
                            logger.info(f"✓ Pobrano {len(infrastructure)} obiektów infrastruktury")
                    except Exception as e:
                        logger.warning(f"Infrastructure fetch failed: {e}")
                        result["infrastructure"] = []
            else:
                result["error"] = "Brak geometrii w bazie ULDK"
        else:
            # Rozróżnij: niedostępność serwisu vs. brak działki
            raw_err = (raw or {}).get("error", "") if raw else ""
            if raw_err and ("niedostępny" in raw_err or "timeout" in raw_err.lower() or "ConnectionError" in raw_err):
                result["error"] = f"ULDK GUGiK chwilowo niedostępny — spróbuj ponownie za kilka sekund"
            else:
                result["error"] = (
                    f"Działka '{parcel_id}' nie znaleziona w bazie ULDK. "
                    f"Sprawdź format: pełny TERYT (np. 141906_5.0029.60) "
                    f"lub podaj Obręb w polu 'Obręb' (np. Niedarzyn) i numer działki (np. 114/2)"
                )

    except Exception as e:
        logger.error(f"terrain.fetch_terrain error: {e}")
        result["error"] = str(e)

    return result


def _centroid_from_geojson(geojson: Dict) -> Optional[Dict[str, float]]:
    """Oblicz centroid (lon, lat) z geometrii GeoJSON (Polygon lub MultiPolygon)."""
    try:
        coords = geojson.get("coordinates", [])
        if not coords:
            return None
        # Polygon: coordinates = [exterior_ring]; MultiPolygon: [poly1, poly2] gdzie poly = [ring]
        first = coords[0]
        ring = first[0] if isinstance(first[0], (list, tuple)) and isinstance(first[0][0], (list, tuple)) else first
        if not ring or len(ring) < 3:
            return None
        lons = [p[0] for p in ring]
        lats = [p[1] for p in ring]
        return {"lon": round(sum(lons) / len(lons), 6), "lat": round(sum(lats) / len(lats), 6)}
    except Exception:
        return None


def _calc_shape_metrics(geojson: Dict) -> Dict:
    """Dokładne obliczenia geometryczne na podstawie wektorów ULDK (Polygon lub MultiPolygon)."""
    empty = {"area": 0.0, "perimeter": 0.0, "shape_coef": 0.0, "shape_class": "brak"}
    try:
        coords_raw = geojson.get("coordinates", [])
        if not coords_raw:
            return empty
        # Polygon: [exterior_ring] (ring = list of [lon,lat]); MultiPolygon: [poly1, ...] (poly = [ring, ...])
        first = coords_raw[0]
        ring = first[0] if isinstance(first[0], (list, tuple)) and len(first[0]) > 0 and isinstance(first[0][0], (list, tuple)) else first
        coords = ring
        if not coords or len(coords) < 3:
            return empty
            
        # Obliczania dla Polski (PUWG 1992 - EPSG:2180) - Uproszczone ale precyzyjne lokalnie
        # WGS84 -> Meters (Local Linear)
        avg_lat = sum(p[1] for p in coords) / len(coords)
        cos_lat = math.cos(math.radians(avg_lat))
        sy = 111132.954 - 559.822 * math.cos(2 * math.radians(avg_lat))
        sx = 111412.84 * cos_lat
        
        area_m2 = 0.0
        perimeter_m = 0.0
        
        pts = []
        for lon, lat in coords:
            pts.append((lon * sx, lat * sy))
            
        for i in range(len(pts) - 1):
            x1, y1 = pts[i]
            x2, y2 = pts[i+1]
            area_m2 += x1 * y2 - x2 * y1
            perimeter_m += math.hypot(x2 - x1, y2 - y1)
            
        area_m2 = abs(area_m2) / 2.0
        
        # Klasyfikacja kształtu
        shape_coef = (4 * math.pi * area_m2) / (perimeter_m**2) if perimeter_m > 0 else 0
        shape_class = "korzystny" if shape_coef > 0.8 else "średni" if shape_coef > 0.5 else "niekorzystny"
        
        return {
            "area": round(area_m2, 2),
            "perimeter": round(perimeter_m, 1),
            "shape_coef": round(shape_coef, 2),
            "shape_class": shape_class
        }
    except Exception as e:
        logger.error(f"Shape metrics error: {e}")
        return empty
