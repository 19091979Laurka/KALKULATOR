"""
ULDK Client - pobieranie danych działek z ULDK GUGiK
"""
import requests
import json
from pathlib import Path
from typing import Dict, Optional
import time
import logging

logger = logging.getLogger(__name__)

class ULDKClient:
    def __init__(self, cache_dir: Path = Path("cache/uldk")):
        self.base_url = "https://uldk.gugik.gov.pl/"
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()

    def get_parcel_wkt(self, parcel_id: str) -> Optional[str]:
        """Pobiera geometrię działki w formacie WKT z ULDK"""

        # Sprawdź cache
        cache_file = self.cache_dir / f"{parcel_id.replace('/', '_')}.wkt"
        if cache_file.exists():
            logger.info(f"📦 Geometria {parcel_id} z cache")
            return cache_file.read_text()

        try:
            params = {
                'request': 'GetParcelById',
                'id': parcel_id,
                'result': 'geom_wkt'
            }

            logger.info(f"🌐 Pobieranie geometrii {parcel_id} z ULDK...")
            response = self.session.get(self.base_url, params=params, timeout=10)
            response.raise_for_status()

            wkt = response.text.strip()

            # Zapisz do cache
            cache_file.write_text(wkt)
            logger.info(f"✓ Geometria {parcel_id} pobrana")

            time.sleep(1)  # Throttle API
            return wkt

        except requests.exceptions.RequestException as e:
            logger.error(f"❌ Błąd ULDK dla {parcel_id}: {e}")
            return None

    def get_parcel_geojson(self, parcel_id: str) -> Optional[Dict]:
        """Pobiera geometrię działki jako GeoJSON"""

        try:
            params = {
                'request': 'GetParcelById',
                'id': parcel_id,
                'result': 'geojson'
            }

            response = self.session.get(self.base_url, params=params, timeout=10)
            response.raise_for_status()

            data = response.json()
            logger.info(f"✓ GeoJSON {parcel_id} pobrana")

            time.sleep(1)
            return data

        except Exception as e:
            logger.error(f"❌ Błąd GeoJSON dla {parcel_id}: {e}")
            return None

    def get_parcel_bbox(self, parcel_id: str) -> Optional[Dict]:
        """Pobiera bbox działki (potrzebne do WFS)"""

        try:
            params = {
                'request': 'GetParcelById',
                'id': parcel_id,
                'result': 'bbox'
            }

            response = self.session.get(self.base_url, params=params, timeout=10)
            response.raise_for_status()

            bbox_str = response.text.strip()
            # bbox: minx,miny,maxx,maxy
            parts = bbox_str.split(',')
            bbox = {
                'minx': float(parts[0]),
                'miny': float(parts[1]),
                'maxx': float(parts[2]),
                'maxy': float(parts[3])
            }

            logger.info(f"✓ BBOX {parcel_id}: {bbox}")
            return bbox

        except Exception as e:
            logger.error(f"❌ Błąd BBOX dla {parcel_id}: {e}")
            return None
