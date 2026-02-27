import requests
import logging
from typing import Dict, Any, List, Optional
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)

class KIEGClient:
    """
    Krajowa Integracja Ewidencji Gruntów (KIEG) WFS Client.
    Zapewnia dostęp do:
    1. Budynków (obrysy 2D)
    2. Klasoużytków (Ps, R, Lz, etc.)
    3. Konturów klasyfikacyjnych
    """
    WFS_URL = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow"

    async def get_features_in_bbox(self, type_name: str, bbox_2180: tuple) -> List[Dict[str, Any]]:
        """
        Pobiera obiekty z WFS w układzie EPSG:2180.
        """
        e_min, n_min, e_max, n_max = bbox_2180
        # WFS 2.0.0 uses different axis order for 2180 (N, E)
        params = {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeNames": type_name,
            "outputFormat": "application/json",
            "srsName": "EPSG:2180",
            "bbox": f"{n_min},{e_min},{n_max},{e_max},EPSG:2180"
        }
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(None, lambda: requests.get(self.WFS_URL, params=params, timeout=15))
            if response.status_code == 200:
                content_type = response.headers.get("Content-Type", "")
                if "json" in content_type:
                    data = response.json()
                    return data.get("features", [])
                else:
                    try:
                        # Fallback: simple GML parsing for ms:* features
                        root = ET.fromstring(response.content)
                        features = []
                        # Standard WFS features are in members
                        for member in root.findall('.//{http://www.opengis.net/gml/3.2}featureMember'):
                            for item in member:
                                props = {}
                                for child in item:
                                    tag = child.tag.split('}')[-1]
                                    if tag != 'geom' and tag != 'geometry':
                                        props[tag] = child.text
                                features.append({"properties": props})
                        return features
                    except ET.ParseError as pe:
                        logger.error(f"KIEG WFS XML Parse Error: {pe}. Response start: {response.text[:200]}")
                        return []
        except Exception as e:
            logger.error(f"KIEG WFS Error (layer={type_name}): {e}")
        return []


    async def get_buildings(self, bbox_2180: tuple) -> List[Dict[str, Any]]:
        """Pobiera obrysy budynków."""
        return await self.get_features_in_bbox("ms:budynek", bbox_2180)

    async def get_land_use(self, bbox_2180: tuple) -> List[Dict[str, Any]]:
        """Pobiera użytki gruntowe (klasoużytki)."""
        return await self.get_features_in_bbox("ms:uzytek_gruntowy", bbox_2180)
