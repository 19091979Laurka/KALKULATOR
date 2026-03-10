"""
GESUT Client - pobieranie danych infrastruktury z WFS/WMS
Źródła: GESUT, KIUT, BDOT10k
"""
import requests
from typing import List, Dict, Optional
import logging
import time

logger = logging.getLogger(__name__)

class GESUTClient:
    """Klient do pobierania danych infrastruktury przesyłowej"""

    def __init__(self):
        # WFS endpoints dla infrastruktury
        self.gesut_wfs = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaGEBUL"
        # Fallback: publiczne WFS
        self.public_wfs = "https://services.gugik.gov.pl/uug"

    def get_infrastructure_wfs(self, bbox: Dict) -> Optional[List[Dict]]:
        """
        Pobiera infrastrukturę z WFS dla bbox działki
        bbox = {'minx': float, 'miny': float, 'maxx': float, 'maxy': float}
        """
        try:
            # Format bbox dla WFS: minx,miny,maxx,maxy
            bbox_str = f"{bbox['minx']},{bbox['miny']},{bbox['maxx']},{bbox['maxy']}"

            params = {
                'service': 'WFS',
                'version': '2.0.0',
                'request': 'GetFeature',
                'typeName': 'GESUT:linie_przesylowe',
                'bbox': bbox_str,
                'srsname': 'EPSG:4326',
                'outputFormat': 'application/json'
            }

            logger.info(f"Pobieranie GESUT dla bbox: {bbox_str}")
            response = requests.get(self.gesut_wfs, params=params, timeout=10)
            response.raise_for_status()

            data = response.json()
            features = data.get('features', [])

            logger.info(f"✓ Pobrano {len(features)} obiektów infrastruktury")
            time.sleep(1)  # Throttle API

            return features if features else None

        except Exception as e:
            logger.warning(f"GESUT niedostępny: {e}")
            return None

    def extract_infrastructure_info(self, features: List[Dict]) -> List[Dict]:
        """Ekstrahuje informacje o infrastrukturze z GeoJSON"""
        infrastructure = []

        for feature in features:
            props = feature.get('properties', {})
            geom = feature.get('geometry', {})

            # Klasyfikacja typu
            type_code = props.get('TYPE', '').upper()
            if 'E' in type_code or 'ELEKTR' in type_code.upper():
                infra_type = 'E'
                name = 'Linia energetyczna'
                color = '#ff6b6b'
            elif 'G' in type_code or 'GAZ' in type_code.upper():
                infra_type = 'G'
                name = 'Gazociąg'
                color = '#ffa500'
            elif 'W' in type_code or 'WOD' in type_code.upper():
                infra_type = 'W'
                name = 'Wodociąg'
                color = '#4ecdc4'
            elif 'K' in type_code or 'KAN' in type_code.upper():
                infra_type = 'K'
                name = 'Kanalizacja'
                color = '#95e1d3'
            elif 'T' in type_code or 'TEL' in type_code.upper():
                infra_type = 'T'
                name = 'Telekomunikacja'
                color = '#9d84b7'
            else:
                continue

            infrastructure.append({
                'type': infra_type,
                'name': name,
                'color': color,
                'geometry': geom,
                'operator': props.get('OPERATOR', 'Nieznany'),
                'voltage': props.get('VOLTAGE', props.get('NAPIĘCIE', 'N/A')),
                'properties': props
            })

        return infrastructure

    def fallback_bdot10k(self, bbox: Dict) -> Optional[List[Dict]]:
        """
        Fallback: próbuje pobrać z BDOT10k (Bazowa Danych Obiektów Topograficznych)
        Jest publiczna i zawiera sieci uzbrojenia terenu
        """
        try:
            logger.info("Próbuję fallback BDOT10k...")

            params = {
                'service': 'WFS',
                'version': '2.0.0',
                'request': 'GetFeature',
                'typeName': 'BDOT10k:PZGIK_LINIOWE',  # Obiekty liniowe
                'bbox': f"{bbox['minx']},{bbox['miny']},{bbox['maxx']},{bbox['maxy']}",
                'srsname': 'EPSG:4326',
                'outputFormat': 'application/json',
                'maxfeatures': 100
            }

            response = requests.get(self.public_wfs, params=params, timeout=10)
            response.raise_for_status()

            data = response.json()
            features = data.get('features', [])

            logger.info(f"✓ BDOT10k: {len(features)} obiektów")

            return features if features else None

        except Exception as e:
            logger.warning(f"BDOT10k niedostępny: {e}")
            return None

    def get_infrastructure(self, bbox: Dict) -> List[Dict]:
        """
        Pobiera infrastrukturę z dostępnych źródeł w kolejności:
        1. GESUT (najlepsze dane)
        2. BDOT10k (fallback)
        3. Pusta lista (no data)
        """

        # Próba 1: GESUT
        features = self.get_infrastructure_wfs(bbox)

        # Próba 2: Fallback BDOT10k
        if not features:
            logger.info("Fallback do BDOT10k...")
            features = self.fallback_bdot10k(bbox)

        if features:
            return self.extract_infrastructure_info(features)

        logger.warning("Brak danych infrastruktury dla tego obszaru")
        return []
