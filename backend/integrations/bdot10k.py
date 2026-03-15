"""
BDOT10k Client — Baza Danych Obiektów Topograficznych
Spec v4.0 (Enhanced Infrastructure Detection)

BDOT10k zawiera szczegółowe dane topograficzne Polski, w tym:
- Linie energetyczne (BDOT10k_L)
- Słupy elektroenergetyczne (BDOT10k_PTWP_A)
- Stacje transformatorowe (BDOT10k_PTWP_A)
- Infrastruktura gazowa, wodociągowa, kanalizacyjna

Źródła:
- https://services.gugik.gov.pl/uug/ (WFS)
- https://mapy.geoportal.gov.pl (WMS)
"""

import logging
import requests
import asyncio
from typing import Dict, Any, List, Optional, Tuple
from shapely.geometry import shape

logger = logging.getLogger(__name__)

# BDOT10k WFS Service
BDOT_WFS_URL = "https://services.gugik.gov.pl/uug/"

# BDOT10k Feature Types (warstwy) - poprawione nazwy
BDOT_LAYERS = {
    "power_lines": "BDOT10k:PTWP_L",  # Linie energetyczne
    "power_towers": "BDOT10k:PTWP_A",  # Słupy i wieże
    "gas_lines": "BDOT10k:PTG_L",  # Gazociągi
    "water_lines": "BDOT10k:PTW_L",  # Wodociągi
    "sewer_lines": "BDOT10k:PTK_L",  # Kanalizacja
}

# CQL Filters dla różnych typów infrastruktury
INFRA_FILTERS = {
    "power_lines": "x_kod = 'PTWP_L' OR x_kod = 'PTTR_L'",
    "power_towers": "x_kod = 'PTWP_A' OR x_kod = 'PTTR_A'",
    "gas_lines": "x_kod = 'PTG_L'",
    "water_lines": "x_kod = 'PTW_L'",
    "sewer_lines": "x_kod = 'PTK_L'",
}

class BDOT10kClient:
    """Klient dla BDOT10k - szczegółowe dane topograficzne"""

    def __init__(self):
        self.wfs_url = BDOT_WFS_URL
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Kalkulator-Roszczen/4.0'
        })

    async def get_infrastructure_by_type(
        self,
        infra_type: str,
        bbox: Dict[str, float],
        srid: str = "4326"
    ) -> Optional[List[Dict]]:
        """Pobierz w BDOT10k obiekty infrastruktury dla danego typu i bbox.

        Args:
            infra_type: "power_lines", "power_towers", "gas_lines", etc.
            bbox: {'minx': float, 'miny': float, 'maxx': float, 'maxy': float}
            srid: EPSG code (4326 for WGS84)

        Returns:
            Lista funkcji GeoJSON lub None
        """
        if infra_type not in BDOT_LAYERS:
            logger.warning(f"BDOT10k: Unknown infra_type {infra_type}")
            return None

        layer_name = BDOT_LAYERS[infra_type]
        cql_filter = INFRA_FILTERS.get(infra_type, "")

        params = {
            'service': 'WFS',
            'version': '2.0.0',
            'request': 'GetFeature',
            'typeName': layer_name,
            'bbox': f"{bbox['minx']},{bbox['miny']},{bbox['maxx']},{bbox['maxy']},{srid}",
            'outputFormat': 'application/json',
            'srsName': f'EPSG:{srid}'
        }

        if cql_filter:
            params['cql_filter'] = cql_filter

        try:
            logger.info(f"BDOT10k: Querying {infra_type} in bbox {bbox}")

            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.session.get(self.wfs_url, params=params, timeout=30)
            )

            if response.status_code == 200:
                data = response.json()
                features = data.get('features', [])

                logger.info(f"BDOT10k: Found {len(features)} {infra_type} features")
                return features
            else:
                logger.warning(f"BDOT10k: HTTP {response.status_code} for {infra_type}")
                return None

        except Exception as e:
            logger.error(f"BDOT10k: Error querying {infra_type}: {e}")
            return None

    async def get_power_infrastructure(
        self,
        bbox: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        Pobierz kompletną infrastrukturę energetyczną (linie + słupy)

        Returns:
            {
                "lines": [GeoJSON features],
                "towers": [GeoJSON features],
                "substations": [GeoJSON features]
            }
        """
        result = {
            "lines": [],
            "towers": [],
            "substations": []
        }

        # Linie energetyczne
        lines = await self.get_infrastructure_by_type("power_lines", bbox)
        if lines:
            result["lines"] = lines

        # Słupy i wieże
        towers = await self.get_infrastructure_by_type("power_towers", bbox)
        if towers:
            result["towers"] = towers

        return result

    async def get_infrastructure_in_bbox(self, bbox: Tuple[float, float, float, float]) -> Optional[List[Dict]]:
        """
        Pobierz infrastrukturę z BDOT10k dla danego bbox (tuple format).

        Args:
            bbox: (minx, miny, maxx, maxy) w EPSG:4326

        Returns:
            Lista GeoJSON features
        """
        try:
            # Konwertuj tuple na dict format
            bbox_dict = {
                'minx': bbox[0],
                'miny': bbox[1],
                'maxx': bbox[2],
                'maxy': bbox[3]
            }

            # Pobierz linie energetyczne
            power_lines = await self.get_infrastructure_by_type("power_lines", bbox_dict)
            if power_lines:
                # Dodaj typ do properties dla filtrowania
                for feature in power_lines:
                    if "properties" not in feature:
                        feature["properties"] = {}
                    feature["properties"]["type"] = "power_line"

                logger.info(f"BDOT10k: Found {len(power_lines)} power line features")
                return power_lines

            return []

        except Exception as e:
            logger.error(f"BDOT10k: Error getting infrastructure: {e}")
            return None

    def count_poles_in_parcel(self, poles_features: List[Dict], parcel_geom: Dict) -> int:
        """Policz słupy znajdujące się na działce"""
        if not poles_features or not parcel_geom:
            return 0

        try:
            parcel = shape(parcel_geom)
            # Bufor dla tolerancji pozycjonowania
            parcel_buffered = parcel.buffer(0.0001)  # ~10m

            count = 0
            for feature in poles_features:
                geom = feature.get('geometry')
                if geom and geom.get('type') == 'Point':
                    coords = geom.get('coordinates')
                    if coords and len(coords) >= 2:
                        point = shape({
                            'type': 'Point',
                            'coordinates': [coords[0], coords[1]]
                        })
                        if parcel_buffered.contains(point):
                            count += 1

            return count

        except Exception as e:
            logger.error(f"BDOT10k: Error counting poles: {e}")
            return 0