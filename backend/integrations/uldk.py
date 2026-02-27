import requests
from typing import Optional, Dict, Tuple, Any
import logging

try:
    import wellknown
except ImportError:
    wellknown = None


logger = logging.getLogger(__name__)

class ULDKClient:
    BASE_URL = "https://uldk.gugik.gov.pl"

    # ── ZNANE OGRANICZENIA I EDGE CASES ───────────────────────────────────────
    # 1. Działki z ułamkiem w numerze (np. "119/1", "119/2") mogą nie być znalezione
    #    przez GetParcelById — ULDK zwraca "-1 brak wyników". Fallback: pomiń, nie rzucaj wyjątku.
    # 2. Geoportal WMS (geoportal.gov.pl) zwraca HTTP 401 dla zapytań skryptowych.
    #    Używaj OSM tiles lub WMTS GUGiK z kluczem API zamiast WMS.
    # 3. Parametr id dla GetParcelById: format "TERYT.OBREB.NR" np. "061802_2.0004.109"
    #    Działki z "/" w numerze: "061802_2.0004.119%2F1" (URL-encode slash).
    # 4. Odpowiedź ULDK to pipe-delimited WKT: "id|geom_wkt|pow_ha|..."
    #    Geometria w EPSG:2180 (PL-1992). Do konwersji na WGS84 użyj pyproj lub
    #    przybliżenia liniowego (LON ≈ 15 + E/85000, LAT ≈ 49.0 + N/111000).
    # ─────────────────────────────────────────────────────────────────────────────
    
    def get_parcel_by_id(self, parcel_id: str) -> Optional[Dict]:
        """
        Pobierz działkę po ID (teryt+obręb+numer)
        """
        params = {
            'request': 'GetParcelById',
            'id': parcel_id,
            'result': 'geom_wkt,teryt,voivodeship,county,commune,region,parcel',
            'srid': '4326'
        }
        try:
            print(f"DEBUG: ULDK Fetching {parcel_id} from {self.BASE_URL}")
            response = requests.get(self.BASE_URL, params=params, timeout=15)
            print(f"DEBUG: ULDK Status {response.status_code}, Length: {len(response.text)}")
            response.raise_for_status()
            return self._parse_response(response.text, parcel_id)
        except Exception as e:
            logger.error(f"ULDK GetParcelById Error: {e}")
            return None

    async def fetch_parcel_geometry(self, nr_dzialki: str, woj: str = "", pow: str = "", gmi: str = "", obreb_nr: str = "") -> Dict:
        """
        Wrapper as used in analyzer.py for Spec v2.1.
        """
        try:
            # We try to build a full ID or just use what we have
            parcel_id = nr_dzialki # simplified
            result = self.get_parcel_by_id(parcel_id)
            if result and result.get("geometry"):
                geom = result["geometry"]
                from shapely.geometry import shape
                s = shape(geom)
                # Przelicznik dla Polski ~52°N
                area_m2 = s.area * (111120.0 * 68500.0)
                return {
                    "source": "ULDK/GUGiK",
                    "geometry": geom,
                    "area_m2": round(area_m2, 1),
                    "voivodeship": result.get("voivodeship", woj),
                    "county": result.get("county", pow),
                    "commune": result.get("commune", gmi),
                    "ok": True,
                }
        except Exception as e:
            logger.warning(f"ULDK fetch failed: {e}")
        return {
            "source": "Szacunek (ULDK niedostepny)",
            "geometry": None,
            "area_m2": 1000.0,
            "ok": False,
        }
    
    def search_by_coords(self, lon: float, lat: float) -> Optional[Dict]:
        """
        Znajdź działkę po współrzędnych
        """
        params = {
            'request': 'GetParcelByXY',
            'xy': f'{lon},{lat},4326',
            'result': 'geom_wkt,teryt,voivodeship,county,commune,region,parcel',
            'srid': '4326'
        }
        try:
            response = requests.get(self.BASE_URL, params=params)
            response.raise_for_status()
            return self._parse_response(response.text, None)
        except Exception as e:
            logger.error(f"ULDK GetParcelByXY Error: {e}")
            return None
    
    def get_parcel_bbox(self, parcel_id: str, srid: str = "2180") -> Optional[Tuple[float, float, float, float]]:
        """
        Pobierz BBOX działki (ULDK nie ma bezpośredniego GetParcelBBox, obliczamy z geometrii).
        """
        params = {
            'request': 'GetParcelById',
            'id': parcel_id,
            'result': 'geom_wkt',
            'srid': srid
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
            logger.warning(f"ULDK get_parcel_bbox calculation error: {e}")
        return None


    def _parse_response(self, wkt_response: str, parcel_id: Optional[str] = None) -> Dict:
        """
        Parser odpowiedzi WKT -> GeoJSON
        """
        lines = [l.strip() for l in wkt_response.strip().split('\n') if l.strip()]
        if not lines:
            return None
            
        if lines[0] != '0':
            logger.error(f"ULDK API Error status: {lines[0]}")
            return None
            
        # Find the line that looks like data
        data_line = None
        for line in lines[1:]:
            if 'POLYGON' in line or 'MULTIPOLYGON' in line or '|' in line:
                data_line = line
                break
        
        if not data_line:
            return None
            
        result = {}
        if '|' in data_line:
            data_values = data_line.split('|')
            # Assuming standard order for multi-column requests
            headers = ['geom_wkt', 'teryt', 'voivodeship', 'county', 'commune', 'region', 'parcel']
            result = dict(zip(headers, data_values))
        else:
            # Single column or no separator
            if 'POLYGON' in data_line:
                result['geom_wkt'] = data_line
            else:
                result['teryt'] = data_line # fallback

        if 'geom_wkt' in result:

            wkt = result['geom_wkt']
            # Usuń prefiks SRID=...; jeśli istnieje
            if ';' in wkt:
                wkt = wkt.split(';')[-1]
            
            try:
                # Jeśli wellknown jest dostępny, użyj go
                if wellknown:
                    result['geometry'] = wellknown.loads(wkt)
                else:
                    # Prosty parser dla POLYGON
                    if wkt.startswith('POLYGON'):
                        # Usuń "POLYGON((" i "))"
                        clean_wkt = wkt.replace('POLYGON', '').strip()
                        if clean_wkt.startswith('((') and clean_wkt.endswith('))'):
                            coords_str = clean_wkt[2:-2]
                            # Clean potential Multipolygon indicators or inner rings
                            coords_str = coords_str.replace('),(', ',')
                            points = coords_str.split(',')
                            coords = []
                            for p in points:
                                parts = p.strip().split(' ')
                                if len(parts) >= 2:
                                    # GUGiK zwraca Lon Lat lub Lat Lon w zależności od SRID
                                    # Dla 4326 to zazwyczaj Lon Lat
                                    try:
                                        lon, lat = parts[0], parts[1]
                                        coords.append([float(lon), float(lat)])
                                    except (ValueError, IndexError):
                                        continue
                            result['geometry'] = {
                                "type": "Polygon",
                                "coordinates": [coords]
                            }
                        else:
                            result['geometry'] = None
                    else:
                        result['geometry'] = None
            except Exception as e:
                logger.warning(f"Failed to parse WKT: {e}")
                result['geometry'] = None
        
        return result
