"""
PSE API Client — Polskie Sieci Elektroenergetyczne
Spec v4.0 (Official Infrastructure Data)

PSE udostępnia oficjalne dane o infrastrukturze elektroenergetycznej:
- Linie przesyłowe WN (220kV, 400kV)
- Stacje elektroenergetyczne
- Dane techniczne linii

API Endpoints:
- https://www.pse.pl/web/pse/dane-techniczne
- REST API dla danych infrastrukturalnych
"""

import logging
import requests
import asyncio
import json
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)

class PSEClient:
    """Klient PSE dla oficjalnych danych infrastruktury elektroenergetycznej"""

    def __init__(self):
        self.base_url = "https://www.pse.pl/web/pse/dane-techniczne"
        self.api_url = "https://api.pse.pl/api/v1"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Kalkulator-Roszczen/4.0',
            'Accept': 'application/json'
        })

    async def get_transmission_lines(self, region: str = "all") -> Optional[List[Dict]]:
        """
        Pobierz linie przesyłowe PSE dla regionu.

        Args:
            region: kod województwa lub "all"

        Returns:
            Lista linii z danymi technicznymi
        """
        try:
            # PSE API dla linii przesyłowych
            endpoint = f"{self.api_url}/transmission-lines"
            params = {'region': region} if region != 'all' else {}

            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.session.get(endpoint, params=params, timeout=30)
            )

            if response.status_code == 200:
                data = response.json()
                lines = data.get('lines', [])

                logger.info(f"PSE: Found {len(lines)} transmission lines")
                return lines
            else:
                logger.warning(f"PSE: HTTP {response.status_code} for transmission lines")
                return None

        except Exception as e:
            logger.error(f"PSE: Error getting transmission lines: {e}")
            return None

    async def get_substations(self, region: str = "all") -> Optional[List[Dict]]:
        """
        Pobierz stacje elektroenergetyczne PSE.

        Returns:
            Lista stacji z parametrami technicznymi
        """
        try:
            endpoint = f"{self.api_url}/substations"
            params = {'region': region} if region != 'all' else {}

            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.session.get(endpoint, params=params, timeout=30)
            )

            if response.status_code == 200:
                data = response.json()
                substations = data.get('substations', [])

                logger.info(f"PSE: Found {len(substations)} substations")
                return substations
            else:
                logger.warning(f"PSE: HTTP {response.status_code} for substations")
                return None

        except Exception as e:
            logger.error(f"PSE: Error getting substations: {e}")
            return None

    async def get_line_details(self, line_id: str) -> Optional[Dict]:
        """
        Pobierz szczegółowe dane techniczne linii.

        Args:
            line_id: identyfikator linii PSE

        Returns:
            Szczegółowe parametry linii
        """
        try:
            endpoint = f"{self.api_url}/transmission-lines/{line_id}"

            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.session.get(endpoint, timeout=30)
            )

            if response.status_code == 200:
                data = response.json()
                logger.info(f"PSE: Got details for line {line_id}")
                return data
            else:
                logger.warning(f"PSE: HTTP {response.status_code} for line {line_id}")
                return None

        except Exception as e:
            logger.error(f"PSE: Error getting line details {line_id}: {e}")
            return None

    def parse_voltage_from_pse(self, line_data: Dict) -> str:
        """Parsuj napięcie z danych PSE"""
        voltage = line_data.get('voltage', '')
        if isinstance(voltage, str):
            voltage = voltage.lower()
            if '400' in voltage or '220' in voltage:
                return 'WN'
            elif '110' in voltage:
                return 'WN'  # 110kV też WN
            elif '30' in voltage or '15' in voltage:
                return 'SN'
        elif isinstance(voltage, (int, float)):
            if voltage >= 110:
                return 'WN'
            elif voltage >= 1:
                return 'SN'

        return 'SN'  # Default

    def convert_pse_to_geojson(self, lines: List[Dict]) -> List[Dict]:
        """Konwertuj dane PSE na format GeoJSON"""
        features = []

        for line in lines:
            try:
                # PSE może mieć współrzędne jako string lub listę
                coords_str = line.get('coordinates', '')
                if isinstance(coords_str, str):
                    # Parse współrzędnych z formatu PSE
                    coords = self._parse_coordinates_string(coords_str)
                else:
                    coords = coords_str

                if coords and len(coords) > 1:
                    feature = {
                        'type': 'Feature',
                        'geometry': {
                            'type': 'LineString',
                            'coordinates': coords
                        },
                        'properties': {
                            'voltage': self.parse_voltage_from_pse(line),
                            'pse_id': line.get('id'),
                            'name': line.get('name'),
                            'length_km': line.get('length_km'),
                            'source': 'PSE API'
                        }
                    }
                    features.append(feature)

            except Exception as e:
                logger.warning(f"PSE: Error converting line {line.get('id')}: {e}")

        return features

    def _parse_coordinates_string(self, coords_str: str) -> List[List[float]]:
        """Parse współrzędnych z formatu tekstowego PSE"""
        try:
            # Zakładamy format: "lat1,lng1 lat2,lng2 ..." lub "lat1,lng1;lat2,lng2"
            coords = []
            if ';' in coords_str:
                points = coords_str.split(';')
            else:
                points = coords_str.split()

            for point in points:
                if ',' in point:
                    lat, lng = point.split(',')
                    coords.append([float(lng.strip()), float(lat.strip())])

            return coords if len(coords) >= 2 else []

        except Exception as e:
            logger.warning(f"PSE: Error parsing coordinates '{coords_str}': {e}")
            return []