import requests
from xml.etree import ElementTree as ET
import time
import logging
import math
import statistics
from typing import List, Dict, Any, Optional
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

class GUGikRCNClient:
    """
    RCN Client based on GUGiK plugin logic.
    Provides robust WFS communication for property transaction history.
    """
    def __init__(self, url="https://mapy.geoportal.gov.pl/wss/service/rcn", obj_layer="dzialki"):
        self.url = url
        self.obj_layer = obj_layer
        self.ns = {
            'wfs': 'http://www.opengis.net/wfs/2.0',
            'fes': 'http://www.opengis.net/fes/2.0',
            'gml': 'http://www.opengis.net/gml/3.2',
            'ms': 'http://mapserver.gis.umn.edu/mapserver'
        }
        self.session = requests.Session()
        
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["POST", "GET"]
        )
            
        adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=10)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
        
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Content-Type': 'application/xml',
            'Connection': 'close'
        })

    async def get_transactions_near_bbox(self, e_min, n_min, e_max, n_max) -> List[Dict[str, Any]]:
        """
        Download transaction data for a specific BBOX in EPSG:2180.
        """
        filter_xml = f'<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"><fes:BBOX><fes:ValueReference>geom</fes:ValueReference><gml:Envelope srsName="EPSG:2180"><gml:lowerCorner>{n_min} {e_min}</gml:lowerCorner><gml:upperCorner>{n_max} {e_max}</gml:upperCorner></gml:Envelope></fes:BBOX></fes:Filter>'
        
        import urllib.parse
        params = {
            'service': 'WFS',
            'version': '2.0.0',
            'request': 'GetFeature',
            'typenames': f'ms:{self.obj_layer}',
            'filter': filter_xml.strip(),
            'count': 100
        }
        
        url = f"{self.url}?{urllib.parse.urlencode(params)}"
        
        try:
            import asyncio
            response = await asyncio.to_thread(self.session.get, url, **{"timeout": 30})
            response.raise_for_status()
            return self._parse_rcn_gml(response.content)
        except Exception as e:
            logger.error(f"GUGiK RCN Fetch Error: {e}")
            return []

    async def get_transactions(self, lon: float, lat: float, radius_km: float = 5.0) -> Dict[str, Any]:
        """
        Pobierz transakcje RCN w promieniu radius_km od punktu (lon, lat WGS84).
        Konwertuje WGS84 → przybliżone EPSG:2180 przez przelicznik metryczny.
        Zwraca: {ok, count, transactions, price_median, price_min, price_max, sample_size}
        """
        # Przybliżona konwersja WGS84 → EPSG:2180 (PL-1992)
        # 1° lat ≈ 111 320 m; 1° lon ≈ 111 320 * cos(lat) m
        meters_per_deg_lat = 111_320.0
        meters_per_deg_lon = 111_320.0 * math.cos(math.radians(lat))
        delta_lat = (radius_km * 1000) / meters_per_deg_lat
        delta_lon = (radius_km * 1000) / meters_per_deg_lon

        # EPSG:2180 centroid (przybliżenie: PL-1992 origin offset)
        # Dla obszaru Polski: E ≈ 5_500_000 + (lon-19)*111320*cos(lat), N ≈ -5_300_000 + lat*111320
        e_c = 5_500_000 + (lon - 19.0) * meters_per_deg_lon
        n_c = -5_300_000 + lat * meters_per_deg_lat
        r_m = radius_km * 1000

        transactions = await self.get_transactions_near_bbox(
            e_c - r_m, n_c - r_m, e_c + r_m, n_c + r_m
        )

        prices = []
        for t in transactions:
            raw = t.get("cena_jednostkowa") or t.get("cena") or t.get("wartosc")
            if raw:
                try:
                    prices.append(float(str(raw).replace(",", ".")))
                except (ValueError, TypeError):
                    pass

        if prices:
            return {
                "ok": True,
                "count": len(transactions),
                "transactions": transactions,
                "price_median": round(statistics.median(prices), 2),
                "price_min": round(min(prices), 2),
                "price_max": round(max(prices), 2),
                "sample_size": len(prices),
            }
        return {
            "ok": bool(transactions),
            "count": len(transactions),
            "transactions": transactions,
            "price_median": None,
            "price_min": None,
            "price_max": None,
            "sample_size": 0,
        }

    def _parse_rcn_gml(self, content: bytes) -> List[Dict[str, Any]]:
        """
        Parses RCN GML response into a list of simplified transaction dicts.
        """
        try:
            root = ET.fromstring(content)
            transactions = []
            
            # Find all feature members
            for member in root.findall('.//{http://www.opengis.net/gml/3.2}featureMember'):
                for item in member: # Usually ms:dzialki
                    props = {}
                    for child in item:
                        tag = child.tag.split('}')[-1]
                        props[tag] = child.text
                    
                    transactions.append(props)
            return transactions
        except Exception as e:
            logger.error(f"GUGiK RCN GML Parse Error: {e}")
            return []