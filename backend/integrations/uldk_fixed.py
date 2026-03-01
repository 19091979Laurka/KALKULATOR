"""
ULDKClientFixed — klasa bazowa klienta ULDK GUGiK.
Zawiera metody: get_parcel_by_id, get_parcel_bbox, search_by_coords, _parse_response.
ULDKClient (uldk.py) dziedziczy z tej klasy i dodaje GetParcelByIdOrNr.
"""
import logging
import requests
from typing import Optional, Dict, Tuple

try:
    import wellknown
except ImportError:
    wellknown = None

logger = logging.getLogger(__name__)


class ULDKClientFixed:
    BASE_URL = "https://uldk.gugik.gov.pl"

    def get_parcel_by_id(self, parcel_id: str, srid: str = "4326") -> Optional[Dict]:
        """Pobierz działkę po ID (teryt+obręb+numer)."""
        params = {
            "request": "GetParcelById",
            "id": parcel_id,
            "result": "geom_wkt,teryt,voivodeship,county,commune,region,parcel",
            "srid": srid,
        }
        try:
            response = requests.get(self.BASE_URL, params=params, timeout=15)
            response.raise_for_status()
            parsed = self._parse_response(response.text, parcel_id)
            if parsed:
                parsed["ok"] = bool(parsed.get("geometry"))
            return parsed
        except Exception as e:
            logger.error("ULDK GetParcelById Error: %s", e)
            return {"ok": False, "error": str(e), "source": "ULDK/GUGiK"}

    def get_parcel_bbox(self, parcel_id: str, srid: str = "2180") -> Optional[Tuple[float, float, float, float]]:
        """Oblicz BBOX działki z geometrii (ULDK nie ma bezpośredniego GetBBox)."""
        params = {
            "request": "GetParcelById",
            "id": parcel_id,
            "result": "geom_wkt",
            "srid": srid,
        }
        try:
            response = requests.get(self.BASE_URL, params=params, timeout=10)
            if response.status_code == 200:
                parsed = self._parse_response(response.text, parcel_id)
                if parsed and parsed.get("geometry"):
                    geom = parsed["geometry"]
                    coords = geom.get("coordinates", [[]])[0]
                    if coords:
                        xs = [p[0] for p in coords]
                        ys = [p[1] for p in coords]
                        return (min(xs), min(ys), max(xs), max(ys))
        except Exception as e:
            logger.warning("ULDK get_parcel_bbox error: %s", e)
        return None

    def search_by_coords(self, lon: float, lat: float) -> Optional[Dict]:
        """Znajdź działkę po współrzędnych WGS84."""
        params = {
            "request": "GetParcelByXY",
            "xy": f"{lon},{lat},4326",
            "result": "geom_wkt,teryt,voivodeship,county,commune,region,parcel",
            "srid": "4326",
        }
        try:
            response = requests.get(self.BASE_URL, params=params, timeout=15)
            response.raise_for_status()
            return self._parse_response(response.text, None)
        except Exception as e:
            logger.error("ULDK GetParcelByXY Error: %s", e)
            return None

    def _parse_response(self, wkt_response: str, parcel_id: Optional[str] = None) -> Optional[Dict]:
        """Parser odpowiedzi pipe-delimited WKT → GeoJSON dict."""
        lines = [l.strip() for l in wkt_response.strip().split("\n") if l.strip()]
        if not lines:
            return None

        if lines[0] not in ("0", "1"):
            logger.error("ULDK API Error status: %s", lines[0])
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
            if "POLYGON" in data_line:
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
                else:
                    result["geometry"] = self._parse_polygon_wkt(wkt)
            except Exception as e:
                logger.warning("Failed to parse WKT: %s", e)
                result["geometry"] = None

        return result

    @staticmethod
    def _parse_polygon_wkt(wkt: str) -> Optional[Dict]:
        """Prosty parser WKT POLYGON → GeoJSON dict (bez zewnętrznych bibliotek)."""
        if not wkt.startswith("POLYGON"):
            return None
        clean = wkt.replace("POLYGON", "").strip()
        if not (clean.startswith("((") and clean.endswith("))")):
            return None
        coords_str = clean[2:-2].replace("),(", ",")
        coords = []
        for p in coords_str.split(","):
            parts = p.strip().split()
            if len(parts) >= 2:
                try:
                    coords.append([float(parts[0]), float(parts[1])])
                except ValueError:
                    continue
        return {"type": "Polygon", "coordinates": [coords]} if coords else None
