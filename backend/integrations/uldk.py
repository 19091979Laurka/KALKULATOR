import requests
from typing import Optional, Dict
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
    
    def _parse_response(self, wkt_response: str, parcel_id: Optional[str] = None) -> Dict:
        """
        Parser odpowiedzi WKT -> GeoJSON
        """
        lines = wkt_response.strip().split('\n')
        if not lines:
            return None
            
        # ULDK response format:
        # Line 0: Status (0=OK)
        # Line 1+: Data or Headers
        
        if lines[0] != '0':
            logger.error(f"ULDK API Error: {lines[0]}")
            return None
            
        # Używamy kontrolowanych nagłówków zgodnych z 'result' param
        requested_headers = ['geom_wkt', 'teryt', 'voivodeship', 'county', 'commune', 'region', 'parcel']
        
        # Znajdź linię z danymi (zawiera | i albo nasz teryt albo POLYGON)
        data_line = None
        for line in lines[1:]:
            if '|' in line:
                if (parcel_id and parcel_id[:6] in line) or 'POLYGON' in line:
                    data_line = line
                    break
        
        if not data_line:
            # Fallback: weź pierwszą linię po statusie jeśli ma rurę
            if len(lines) > 1 and '|' in lines[1]:
                data_line = lines[1]
            else:
                return None
            
        data_values = data_line.split('|')
        result = dict(zip(requested_headers, data_values))
        
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
                            points = coords_str.split(',')
                            coords = []
                            for p in points:
                                parts = p.strip().split(' ')
                                if len(parts) >= 2:
                                    # GUGiK zwraca Lon Lat lub Lat Lon w zależności od SRID
                                    # Dla 4326 to zazwyczaj Lon Lat
                                    lon, lat = parts[0], parts[1]
                                    coords.append([float(lon), float(lat)])
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
