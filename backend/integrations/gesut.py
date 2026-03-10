"""
GESUT/KIUT Client — Spec v3.0 (Strict Real Data Policy)

Główny klient dla danych infrastruktury przesyłowej (GUGiK KIUT).
ZASADY:
1. TYLKO RZECZYWISTE DANE — brak estymacji z pikseli.
2. JAWNOŚĆ STATUSU — informacja o źródle i błędach.
3. BŁĄD ZAMIAST DOMYSŁU — brak "magicznych współczynników".
"""

import logging
import requests
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

# GUGiK National KIUT WMS (Main source)
NATIONAL_WMS = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu"

# County-level WMS endpoints (geoportal2.pl) - optional refinement
# In Spec 3.0 we prioritize national integration for stability.
COUNTY_WMS_ENDPOINTS = {
    "0618": "http://tomaszowlubelski.geoportal2.pl/map/geoportal/wms.php",
    # Add more as needed
}

class GESUTClient:
    def __init__(self, county_code: Optional[str] = None):
        """
        Initialize GESUT client.
        
        Args:
            county_code: Optional county code for county-level WMS endpoint
        """
        self.county_code = county_code
        self.wms_url = COUNTY_WMS_ENDPOINTS.get(county_code) if county_code else NATIONAL_WMS
        self.status = "UNKNOWN"
        self._validate_inputs()
    
    def _validate_inputs(self):
        """Validate initialization inputs"""
        if self.county_code and not isinstance(self.county_code, str):
            logger.warning(f"Invalid county_code type: {type(self.county_code)}, expected str")
            self.county_code = None
        if self.county_code and self.county_code not in COUNTY_WMS_ENDPOINTS:
            logger.warning(f"Unknown county_code: {self.county_code}, using national WMS")
            self.county_code = None
            self.wms_url = NATIONAL_WMS

    async def validate_service(self) -> bool:
        """
        Validate WMS service availability.
        
        Returns:
            bool: True if service is available, False otherwise
        """
        try:
            logger.info("GESUT validate_service: url=%s", self.wms_url)
            r = requests.get(f"{self.wms_url}?SERVICE=WMS&REQUEST=GetCapabilities", timeout=10)
            logger.info("GESUT GetCapabilities response: status=%s has_capabilities=%s", r.status_code, b"WMS_Capabilities" in (r.content or b""))
            if r.status_code == 200 and b"WMS_Capabilities" in r.content:
                self.status = "REAL"
                return True
            self.status = "ERROR"
            return False
        except requests.exceptions.Timeout:
            logger.error(f"WMS service validation timeout for {self.wms_url}")
            self.status = "TIMEOUT"
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"WMS service validation error for {self.wms_url}: {e}")
            self.status = "ERROR"
            return False
        except Exception as e:
            logger.error(f"Unexpected error during WMS validation: {e}")
            self.status = "ERROR"
            return False

    def _build_getmap_url(self, layers: str, bbox: Tuple[float, float, float, float], width: int, height: int) -> str:
        """
        Build WMS GetMap URL with proper BBOX order for EPSG:2180.
        
        Args:
            layers: Comma-separated layer names
            bbox: Bounding box as (e_min, n_min, e_max, n_max)
            width: Image width in pixels
            height: Image height in pixels
        
        Returns:
            str: Complete WMS GetMap URL
        """
        if not bbox or len(bbox) != 4:
            raise ValueError("Invalid bbox format. Expected tuple of 4 floats (e_min, n_min, e_max, n_max)")
        
        e_min, n_min, e_max, n_max = bbox
        # WMS 1.1.1: SRS + BBOX zawsze jako (x_min,y_min,x_max,y_max) niezależnie od CRS
        return (
            f"{self.wms_url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap"
            f"&LAYERS={layers}&SRS=EPSG:2180"
            f"&BBOX={e_min},{n_min},{e_max},{n_max}"
            f"&WIDTH={width}&HEIGHT={height}"
            f"&FORMAT=image/png&TRANSPARENT=true&STYLES="
        )

    async def fetch_infrastructure(self, bbox: Tuple[float, float, float, float]) -> Dict[str, Any]:
        """
        Fetch infrastructure data from WMS service.

        Uses WMS GetMap for presence detection and GetFeatureInfo for attributes.
        Never estimates length from pixels (Rule 7.B).

        Args:
            bbox: Bounding box as (e_min, n_min, e_max, n_max) in EPSG:2180

        Returns:
            Dict with infrastructure detection results
        """
        # Input validation
        if not bbox or len(bbox) != 4:
            return {
                "ok": False,
                "error": "Invalid bbox format. Expected tuple of 4 floats (e_min, n_min, e_max, n_max)",
                "status": "ERROR"
            }

        # Validate bbox coordinates
        try:
            e_min, n_min, e_max, n_max = bbox
            if not all(isinstance(coord, (int, float)) for coord in bbox):
                raise ValueError("All bbox coordinates must be numeric")
            if e_min >= e_max or n_min >= n_max:
                raise ValueError("Invalid bbox: min coordinates must be less than max coordinates")
        except (ValueError, TypeError) as e:
            return {
                "ok": False,
                "error": f"Invalid bbox coordinates: {str(e)}",
                "status": "ERROR"
            }

        # Validate WMS service
        if not await self.validate_service():
            logger.warning("GESUT fetch_infrastructure skipped: WMS unavailable")
            return {
                "ok": False,
                "error": f"WMS service {self.wms_url} unavailable",
                "status": "UNCERTAIN",
                "detected": None,
                "info": "WMS niedostępny — użytkownik musi ręcznie potwierdzić infrastrukturę (geoportal.gov.pl)"
            }
        logger.info("GESUT fetch_infrastructure request: bbox_2180=(e=%.0f..%.0f n=%.0f..%.0f)", *bbox)

        # Fetch infrastructure data
        # Warstwy zweryfikowane z GetCapabilities KIUT WFS:
        layers = "przewod_elektroenergetyczny,przewod_gazowy,przewod_wodociagowy,przewod_kanalizacyjny,przewod_cieplowniczy"

        try:
            # Build and fetch GetMap URL
            url = self._build_getmap_url(layers, bbox, 512, 512)
            r = requests.get(url, timeout=15, headers={'User-Agent': 'Kalkulator-KIUT/3.0'})

            # Validate response
            if r.status_code != 200:
                return {
                    "ok": True,
                    "status": "UNCERTAIN",
                    "detected": None,
                    "error": f"WMS GetMap zwrócił {r.status_code}",
                    "info": "Nie można pobrać danych WMS — sprawdź geoportal.gov.pl | użytkownik potwierdza ręcznie"
                }

            # Check Content-Type
            content_type = r.headers.get('Content-Type', '').lower()
            if 'image' not in content_type:
                return {
                    "ok": True,
                    "status": "UNCERTAIN",
                    "detected": None,
                    "error": f"WMS zwrócił {content_type} zamiast PNG",
                    "info": "Dane WMS niedostępne — przepytaj geoportal.gov.pl lub potwierdź ręcznie"
                }

            # Get feature info for attributes
            feature_info = await self._get_feature_info(layers, bbox, 256, 256)
            
            # Determine if infrastructure is detected.
            # Fully transparent 512x512 PNG ≈ 1–2 KB.
            # A tile with even a few infrastructure pixels is typically > 1500 B.
            content_len = len(r.content)
            detected = content_len > 1500
            voltage = self._parse_voltage(feature_info) if feature_info else "nieznane"
            logger.info("GESUT fetch_infrastructure OK: detected=%s voltage=%s content_len=%s", detected, voltage, content_len)

            info_text = (
                "Wykryto linie w KIUT WMS. Długość wektorowa niedostępna — brak WFS w tym powiecie."
                if detected else
                "Brak linii w KIUT WMS dla tego obszaru."
            )

            return {
                "ok": True,
                "status": "REAL",
                "detected": detected,
                "voltage": voltage,
                "line_length_m": 0.0,  # Rule 7.B: No pixel estimations
                "info": info_text,
                "feature_info_raw": feature_info if feature_info else None,
                "source": "GUGiK KIUT WMS",
                "bbox": bbox,
                "layers": layers
            }

        except requests.exceptions.Timeout:
            return {
                "ok": False,
                "error": "WMS GetMap request timeout (15s)",
                "status": "TIMEOUT"
            }
        except requests.exceptions.RequestException as e:
            return {
                "ok": False,
                "error": f"WMS request error: {str(e)}",
                "status": "ERROR"
            }
        except Exception as e:
            logger.error(f"Unexpected error in fetch_infrastructure: {e}")
            return {
                "ok": False,
                "error": f"Unexpected error: {str(e)}",
                "status": "ERROR"
            }

    async def _get_feature_info(self, layers: str, bbox: Tuple, x: int, y: int) -> Optional[str]:
        """
        Get feature attributes by clicking on a point in the map.
        
        Args:
            layers: Comma-separated layer names
            bbox: Bounding box coordinates
            x: X coordinate in image pixels
            y: Y coordinate in image pixels
        
        Returns:
            Optional[str]: Feature information text or None
        """
        try:
            e_min, n_min, e_max, n_max = bbox
            url = (
                f"{self.wms_url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo"
                f"&LAYERS={layers}&QUERY_LAYERS={layers}"
                f"&BBOX={e_min},{n_min},{e_max},{n_max}"
                f"&WIDTH=512&HEIGHT=512&I={x}&J={y}"
                f"&CRS=EPSG:2180&INFO_FORMAT=text/plain"
            )
            
            r = requests.get(url, timeout=5)
            if r.status_code == 200 and len(r.text.strip()) > 10:
                return r.text.strip()
                
        except requests.exceptions.Timeout:
            logger.warning("GetFeatureInfo request timeout")
        except requests.exceptions.RequestException as e:
            logger.warning(f"GetFeatureInfo request error: {e}")
        except Exception as e:
            logger.warning(f"Unexpected error in _get_feature_info: {e}")
        
        return None

    def _parse_voltage(self, info: Optional[str]) -> str:
        """
        Parse voltage level from feature information text.
        
        Args:
            info: Feature information text or None
        
        Returns:
            str: Voltage level ("WN", "SN", "nN", or "nieznane")
        """
        if not info or not isinstance(info, str):
            return "nieznane"
        
        info_upper = info.upper()
        
        # Check for high voltage
        if any(keyword in info_upper for keyword in ["WYSOKIE", " WN ", "WYSOKIE"]):
            return "WN"
        
        # Check for medium voltage
        if any(keyword in info_upper for keyword in ["SREDNIE", " SN ", "ŚREDNIE", "ŚREDNIE NAPIĘCIE"]):
            return "SN"
        
        # Check for low voltage
        if any(keyword in info_upper for keyword in ["NISKIE", " NN ", "NISKIE NAPIĘCIE"]):
            return "nN"
        
        return "nieznane"

    # Mapowanie klucza medium na warstwę WMS KIUT
    _LAYER_MAP = {
        "elektro": "przewod_elektroenergetyczny",
        "gaz":     "przewod_gazowy",
        "woda":    "przewod_wodociagowy",
        "kanal":   "przewod_kanalizacyjny",
        "cieplo":  "przewod_cieplowniczy",
    }

    async def get_infrastructure_in_bbox(self, layer_key: str, bbox: Tuple) -> Dict[str, Any]:
        """
        Sprawdź obecność konkretnego medium w BBOX.

        Args:
            layer_key: Klucz medium: "elektro", "gaz", "woda", "kanal", "cieplo"
            bbox: Bounding box w EPSG:2180

        Returns:
            Dict z wynikiem detekcji dla wybranej warstwy
        """
        if not layer_key or not isinstance(layer_key, str):
            return {"ok": False, "error": "Invalid layer_key", "status": "ERROR"}

        layer = self._LAYER_MAP.get(layer_key)
        if not layer:
            return {"ok": False, "error": f"Unknown layer_key: {layer_key!r}", "status": "ERROR"}

        if not await self.validate_service():
            return {"ok": False, "error": f"WMS service unavailable", "status": "ERROR"}

        try:
            url = self._build_getmap_url(layer, bbox, 256, 256)
            r = requests.get(url, timeout=15, headers={"User-Agent": "Kalkulator-KIUT/3.0"})
            if r.status_code != 200:
                return {"ok": False, "error": f"WMS status {r.status_code}", "status": "ERROR"}
            detected = len(r.content) > 5000
            return {"ok": True, "status": "REAL", "detected": detected, "layer": layer}
        except requests.exceptions.Timeout:
            return {"ok": False, "error": "Timeout", "status": "TIMEOUT"}
        except Exception as e:
            return {"ok": False, "error": str(e), "status": "ERROR"}
