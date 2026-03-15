"""
ULDKClientFixed — klasa bazowa klienta ULDK GUGiK.
Zawiera metody: get_parcel_by_id, get_parcel_bbox, search_by_coords, _parse_response.
ULDKClient (uldk.py) dziedziczy z tej klasy i dodaje GetParcelByIdOrNr.
"""
import logging
import time
import requests
from typing import Optional, Dict, Tuple

try:
    import wellknown
except ImportError:
    wellknown = None

logger = logging.getLogger(__name__)

_ULDK_TIMEOUT = 12          # s — szybka odpowiedź (~0.5-2s normalnie)
_ULDK_RETRIES = 4           # więcej prób, bo ULDK bywa niestabilny
_ULDK_RETRY_DELAY = 1.5     # s między próbami — łagodniejsze tempo


class ULDKClientFixed:
    BASE_URL = "https://uldk.gugik.gov.pl"

    # ── Wewnętrzna metoda HTTP z retry ────────────────────────────────────────
    def _get_with_retry(self, params: dict) -> Optional[requests.Response]:
        """GET z automatycznym retry (timeout/5xx). Zwraca Response lub None."""
        last_err = None
        for attempt in range(1, _ULDK_RETRIES + 1):
            try:
                resp = requests.get(self.BASE_URL, params=params, timeout=_ULDK_TIMEOUT)
                resp.raise_for_status()
                return resp
            except requests.exceptions.Timeout as e:
                last_err = e
                logger.warning("ULDK timeout (próba %d/%d): %s", attempt, _ULDK_RETRIES, params.get("id", ""))
                if attempt < _ULDK_RETRIES:
                    time.sleep(_ULDK_RETRY_DELAY)
            except requests.exceptions.ConnectionError as e:
                last_err = e
                logger.warning("ULDK connection error (próba %d/%d): %s", attempt, _ULDK_RETRIES, e)
                if attempt < _ULDK_RETRIES:
                    time.sleep(_ULDK_RETRY_DELAY)
            except Exception as e:
                last_err = e
                logger.error("ULDK error: %s", e)
                break  # Inne błędy (np. 4xx) — nie próbuj ponownie
        if last_err:
            logger.error("ULDK wszystkie próby wyczerpane: %s", last_err)
        return None

    # ── GetParcelById ─────────────────────────────────────────────────────────
    def get_parcel_by_id(self, parcel_id: str, srid: str = "4326") -> Optional[Dict]:
        """Pobierz działkę po ID (teryt+obręb+numer)."""
        params = {
            "request": "GetParcelById",
            "id": parcel_id,
            "result": "geom_wkt,teryt,voivodeship,county,commune,region,parcel",
            "srid": srid,
        }
        resp = self._get_with_retry(params)
        if resp is None:
            return {"ok": False, "error": "ULDK niedostępny — spróbuj ponownie za chwilę", "source": "ULDK/GUGiK"}
        try:
            parsed = self._parse_response(resp.text, parcel_id)
            if parsed:
                parsed["ok"] = bool(parsed.get("geometry"))
            return parsed
        except Exception as e:
            logger.error("ULDK parse error: %s", e)
            return {"ok": False, "error": str(e), "source": "ULDK/GUGiK"}

    # ── GetParcelBBox ─────────────────────────────────────────────────────────
    def get_parcel_bbox(self, parcel_id: str, srid: str = "2180") -> Optional[Tuple[float, float, float, float]]:
        """Oblicz BBOX działki z geometrii (ULDK nie ma bezpośredniego GetBBox)."""
        params = {
            "request": "GetParcelById",
            "id": parcel_id,
            "result": "geom_wkt",
            "srid": srid,
        }
        try:
            resp = requests.get(self.BASE_URL, params=params, timeout=_ULDK_TIMEOUT)
            if resp.status_code == 200:
                parsed = self._parse_response(resp.text, parcel_id)
                if parsed and parsed.get("geometry"):
                    geom = parsed["geometry"]
                    gtype = geom.get("type", "")
                    coords_raw = geom.get("coordinates", [])
                    # Spłaszcz do jednej listy punktów
                    if gtype == "Polygon":
                        ring = coords_raw[0] if coords_raw else []
                    elif gtype == "MultiPolygon":
                        ring = [pt for poly in coords_raw for r in poly for pt in r]
                    else:
                        ring = []
                    if ring:
                        xs = [p[0] for p in ring]
                        ys = [p[1] for p in ring]
                        return (min(xs), min(ys), max(xs), max(ys))
        except Exception as e:
            logger.warning("ULDK get_parcel_bbox error: %s", e)
        return None

    # ── GetParcelByXY ─────────────────────────────────────────────────────────
    def search_by_coords(self, lon: float, lat: float) -> Optional[Dict]:
        """Znajdź działkę po współrzędnych WGS84."""
        params = {
            "request": "GetParcelByXY",
            "xy": f"{lon},{lat},4326",
            "result": "geom_wkt,teryt,voivodeship,county,commune,region,parcel",
            "srid": "4326",
        }
        resp = self._get_with_retry(params)
        if resp is None:
            return None
        try:
            return self._parse_response(resp.text, None)
        except Exception as e:
            logger.error("ULDK GetParcelByXY parse error: %s", e)
            return None

    # ── Parser odpowiedzi ─────────────────────────────────────────────────────
    def _parse_response(self, wkt_response: str, parcel_id: Optional[str] = None) -> Optional[Dict]:
        """Parser odpowiedzi pipe-delimited WKT → GeoJSON dict.

        ULDK zwraca:
          0\\nSRID=4326;POLYGON(...)|teryt|voi|county|commune|region|parcel   ← sukces
          -1 brak wyników\\n...                                                ← nie znaleziono
        """
        lines = [l.strip() for l in wkt_response.strip().split("\n") if l.strip()]
        if not lines:
            return None

        status = lines[0]
        # ULDK zwraca "0" = znaleziono, "-1 ..." = nie znaleziono, "1" (historycznie)
        if status not in ("0", "1"):
            logger.warning("ULDK brak wyników (status=%r) dla %s", status, parcel_id)
            return None

        data_line = None
        for line in lines[1:]:
            if "POLYGON" in line or "MULTIPOLYGON" in line or "|" in line:
                data_line = line
                break

        if not data_line:
            return None

        result: Dict = {}
        if "|" in data_line:
            headers = ["geom_wkt", "teryt", "voivodeship", "county", "commune", "region", "parcel"]
            result = dict(zip(headers, data_line.split("|")))
        else:
            if "POLYGON" in data_line or "MULTIPOLYGON" in data_line:
                result["geom_wkt"] = data_line
            else:
                result["teryt"] = data_line

        if "geom_wkt" in result:
            wkt = result["geom_wkt"]
            if ";" in wkt:
                wkt = wkt.split(";")[-1]
            try:
                if wellknown:
                    result["geometry"] = wellknown.loads(wkt)
                elif wkt.startswith("MULTIPOLYGON"):
                    result["geometry"] = self._parse_multipolygon_wkt(wkt)
                else:
                    result["geometry"] = self._parse_polygon_wkt(wkt)
            except Exception as e:
                logger.warning("Failed to parse WKT: %s", e)
                result["geometry"] = None

        return result

    # ── Parsery WKT ───────────────────────────────────────────────────────────
    @staticmethod
    def _parse_polygon_wkt(wkt: str) -> Optional[Dict]:
        """Prosty parser WKT POLYGON → GeoJSON dict (bez zewnętrznych bibliotek)."""
        if not wkt.startswith("POLYGON"):
            return None
        clean = wkt[len("POLYGON"):].strip()
        # Usuń zewnętrzne nawiasy: "((pts))" → "(pts)"
        if clean.startswith("((") and clean.endswith("))"):
            clean = clean[1:-1]  # → "(pts)"
        if clean.startswith("(") and clean.endswith(")"):
            clean = clean[1:-1]  # → "pts"
        coords = []
        for p in clean.split(","):
            parts = p.strip().split()
            if len(parts) >= 2:
                try:
                    coords.append([float(parts[0]), float(parts[1])])
                except ValueError:
                    continue
        return {"type": "Polygon", "coordinates": [coords]} if coords else None

    @staticmethod
    def _parse_multipolygon_wkt(wkt: str) -> Optional[Dict]:
        """Prosty parser WKT MULTIPOLYGON → GeoJSON dict."""
        if not wkt.startswith("MULTIPOLYGON"):
            return None
        # MULTIPOLYGON(((x y, x y,...)),((x y,...)))
        inner = wkt[len("MULTIPOLYGON"):].strip()
        if inner.startswith("("):
            inner = inner[1:]  # usuń zewnętrzny nawias
        if inner.endswith(")"):
            inner = inner[:-1]

        polygons = []
        depth = 0
        start = 0
        for i, ch in enumerate(inner):
            if ch == "(":
                depth += 1
                if depth == 1:
                    start = i
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    poly_str = inner[start:i+1]  # np. "((x y,x y,...))"
                    # Parse single polygon ring
                    ring_str = poly_str.strip("()")
                    coords = []
                    for p in ring_str.split(","):
                        parts = p.strip().split()
                        if len(parts) >= 2:
                            try:
                                coords.append([float(parts[0]), float(parts[1])])
                            except ValueError:
                                continue
                    if coords:
                        polygons.append([coords])

        return {"type": "MultiPolygon", "coordinates": polygons} if polygons else None
