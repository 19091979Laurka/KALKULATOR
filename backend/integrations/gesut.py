"""
GESUT/KIUT Client — Spec v3.0 (Strict Real Data Policy)
WFS Vector Implementation (KROK 1)

Główny klient dla danych infrastruktury przesyłowej (GUGiK KIUT).
ZASADY:
1. TYLKO RZECZYWISTE DANE — wektor zamiast pikseli.
2. JAWNOŚĆ STATUSU — informacja o źródle i błędach.
3. BŁĄD ZAMIAST DOMYSŁU — brak "magicznych współczynników".
4. WEKTOR GEOMETRII — rzeczywista długość i atrybuty z WFS GetFeature.
"""

import logging
import requests
import json
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

# GUGiK National KIUT WFS (Main source) — VECTOR DATA
NATIONAL_WFS = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu"

# Layer mapping: medium → WFS typeNames
# https://integracja.gugik.gov.pl provides these feature types
LAYER_MAPPING = {
    "elektro": "przewod_elektroenergetyczny",
    "gaz": "przewod_gazowy",
    "woda": "przewod_wodociagowy",
    "kanal": "przewod_kanalizacyjny",
    "cieplo": "przewod_cieplowniczy",
}

class GESUTClient:
    def __init__(self, county_code: Optional[str] = None):
        """
        Initialize GESUT WFS client for vector infrastructure data.

        Args:
            county_code: Optional county code (reserved for future county-level WFS)
        """
        self.county_code = county_code
        self.wfs_url = NATIONAL_WFS  # Currently using national WFS for all
        self.status = "UNKNOWN"

    async def validate_service(self) -> bool:
        """
        Validate WFS service availability by requesting GetCapabilities.

        Returns:
            bool: True if service is available, False otherwise
        """
        try:
            logger.info("GESUT validate_service (WFS): url=%s", self.wfs_url)
            r = requests.get(
                f"{self.wfs_url}?SERVICE=WFS&REQUEST=GetCapabilities&VERSION=2.0.0",
                timeout=10,
                headers={"User-Agent": "Kalkulator-KIUT/3.0"}
            )
            logger.info(
                "GESUT GetCapabilities response: status=%s has_wfs=%s",
                r.status_code,
                b"WFS_Capabilities" in (r.content or b"") or b"FeatureType" in (r.content or b"")
            )
            if r.status_code == 200 and (b"WFS_Capabilities" in r.content or b"FeatureType" in r.content):
                self.status = "REAL"
                return True
            self.status = "ERROR"
            return False
        except requests.exceptions.Timeout:
            logger.error(f"WFS service validation timeout for {self.wfs_url}")
            self.status = "TIMEOUT"
            return False
        except requests.exceptions.RequestException as e:
            logger.error(f"WFS service validation error for {self.wfs_url}: {e}")
            self.status = "ERROR"
            return False
        except Exception as e:
            logger.error(f"Unexpected error during WFS validation: {e}")
            self.status = "ERROR"
            return False

    def _build_wfs_url(self, type_names: str, bbox: Tuple[float, float, float, float]) -> str:
        """
        Build WFS GetFeature URL for vector data extraction.

        Args:
            type_names: Comma-separated WFS typeNames (e.g. 'przewod_elektroenergetyczny')
            bbox: Bounding box as (e_min, n_min, e_max, n_max) in EPSG:2180

        Returns:
            str: Complete WFS GetFeature URL
        """
        if not bbox or len(bbox) != 4:
            raise ValueError("Invalid bbox format. Expected tuple of 4 floats (e_min, n_min, e_max, n_max)")

        e_min, n_min, e_max, n_max = bbox
        # WFS 2.0.0: BBOX format is (e_min,n_min,e_max,n_max)
        return (
            f"{self.wfs_url}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature"
            f"&typeNames={type_names}&outputFormat=application/json"
            f"&BBOX={e_min},{n_min},{e_max},{n_max},urn:ogc:def:crs:EPSG:2180"
        )

    async def fetch_infrastructure(self, bbox: Tuple[float, float, float, float], layer_key: str = "elektro") -> Dict[str, Any]:
        """
        Fetch infrastructure data from WFS service (vector data).

        Returns actual geometry features with properties (voltage, type, etc.).
        KROK 1: Vector-based detection with real measurements (no pixels).

        Args:
            bbox: Bounding box as (e_min, n_min, e_max, n_max) in EPSG:2180
            layer_key: Medium type: "elektro", "gaz", "woda", "kanal", "cieplo"

        Returns:
            Dict with vector features, geometry coordinates, voltage, and raw GeoJSON
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

        # Validate WFS service
        if not await self.validate_service():
            logger.warning("GESUT fetch_infrastructure skipped: WFS unavailable")
            return {
                "ok": False,
                "error": f"WFS service {self.wfs_url} unavailable",
                "status": "UNCERTAIN",
                "detected": None,
                "info": "WFS niedostępny — użytkownik musi ręcznie potwierdzić infrastrukturę (geoportal.gov.pl)"
            }

        logger.info("GESUT fetch_infrastructure request: layer=%s bbox_2180=(e=%.0f..%.0f n=%.0f..%.0f)", layer_key, *bbox)

        # Get WFS type name for requested layer
        type_name = LAYER_MAPPING.get(layer_key.lower())
        if not type_name:
            return {
                "ok": False,
                "error": f"Unknown layer_key: {layer_key}",
                "status": "ERROR"
            }

        try:
            # Build and fetch GetFeature URL (returns GeoJSON)
            url = self._build_wfs_url(type_name, bbox)
            logger.info("GESUT WFS request URL: %s", url)
            r = requests.get(url, timeout=15, headers={"User-Agent": "Kalkulator-KIUT/3.0"})

            # Validate response
            if r.status_code != 200:
                return {
                    "ok": True,
                    "status": "UNCERTAIN",
                    "detected": None,
                    "error": f"WFS GetFeature zwrócił {r.status_code}",
                    "info": "Nie można pobrać danych WFS — sprawdź geoportal.gov.pl | użytkownik potwierdza ręcznie"
                }

            # Parse GeoJSON response
            try:
                geojson = r.json()
            except json.JSONDecodeError as e:
                return {
                    "ok": False,
                    "error": f"WFS zwrócił invalid JSON: {str(e)}",
                    "status": "ERROR"
                }

            # Extract features from GeoJSON
            features = geojson.get("features", [])
            detected = len(features) > 0

            if detected:
                # Parse voltage from features
                voltages = set()
                for feature in features:
                    props = feature.get("properties", {})
                    voltage = self._parse_voltage_from_properties(props)
                    if voltage != "nieznane":
                        voltages.add(voltage)

                primary_voltage = list(voltages)[0] if voltages else "nieznane"
                logger.info("GESUT fetch_infrastructure OK: detected=%s count=%d primary_voltage=%s", detected, len(features), primary_voltage)

                return {
                    "ok": True,
                    "status": "REAL",
                    "detected": detected,
                    "voltage": primary_voltage,
                    "feature_count": len(features),
                    "features": features,  # Full GeoJSON features for Shapely processing
                    "geojson": geojson,  # Full GeoJSON response
                    "info": f"Pobrano {len(features)} linii z WFS",
                    "source": "GUGiK KIUT WFS (Vector)",
                    "bbox": bbox,
                    "layer": type_name
                }
            else:
                return {
                    "ok": True,
                    "status": "REAL",
                    "detected": False,
                    "voltage": "brak",
                    "feature_count": 0,
                    "features": [],
                    "geojson": geojson,
                    "info": f"Brak linii {type_name} w tym obszarze",
                    "source": "GUGiK KIUT WFS (Vector)",
                    "bbox": bbox,
                    "layer": type_name
                }

        except requests.exceptions.Timeout:
            return {
                "ok": False,
                "error": "WFS GetFeature request timeout (15s)",
                "status": "TIMEOUT"
            }
        except requests.exceptions.RequestException as e:
            return {
                "ok": False,
                "error": f"WFS request error: {str(e)}",
                "status": "ERROR"
            }
        except Exception as e:
            logger.error(f"Unexpected error in fetch_infrastructure: {e}", exc_info=True)
            return {
                "ok": False,
                "error": f"Unexpected error: {str(e)}",
                "status": "ERROR"
            }

    def _parse_voltage_from_properties(self, properties: Dict[str, Any]) -> str:
        """
        Extract voltage level from WFS feature properties.

        Args:
            properties: GeoJSON feature properties dict

        Returns:
            str: Voltage level ("WN", "SN", "nN", or "nieznane")
        """
        if not properties or not isinstance(properties, dict):
            return "nieznane"

        # Common property names for voltage in KIUT WFS
        voltage_keys = ["napięcie", "napiecie", "voltage", "NAPIĘCIE", "NAPIECIE", "VOLTAGE",
                       "klasa_napięcia", "klasa_napieciai", "kv", "KV"]

        for key in voltage_keys:
            value = properties.get(key)
            if value:
                value_str = str(value).upper().strip()

                # WN - High Voltage
                if any(kw in value_str for kw in ["WYSOKIE", "WN", "110", "220", "330", "400"]):
                    return "WN"

                # SN - Medium Voltage
                if any(kw in value_str for kw in ["ŚREDNIE", "SREDNIE", "SN", "10", "15", "20"]):
                    return "SN"

                # nN - Low Voltage
                if any(kw in value_str for kw in ["NISKIE", "NN", "0.4", "0,4"]):
                    return "nN"

        return "nieznane"

    def _parse_voltage(self, info: Optional[str]) -> str:
        """
        Legacy text-based voltage parsing (fallback).

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

    async def get_infrastructure_in_bbox(self, layer_key: str, bbox: Tuple) -> Dict[str, Any]:
        """
        Check presence of specific medium in BBOX using WFS.

        Args:
            layer_key: Medium key: "elektro", "gaz", "woda", "kanal", "cieplo"
            bbox: Bounding box in EPSG:2180

        Returns:
            Dict with detection results and feature count
        """
        if not layer_key or not isinstance(layer_key, str):
            return {"ok": False, "error": "Invalid layer_key", "status": "ERROR"}

        layer = LAYER_MAPPING.get(layer_key.lower())
        if not layer:
            return {"ok": False, "error": f"Unknown layer_key: {layer_key!r}", "status": "ERROR"}

        if not await self.validate_service():
            return {"ok": False, "error": f"WFS service unavailable", "status": "ERROR"}

        try:
            url = self._build_wfs_url(layer, bbox)
            r = requests.get(url, timeout=15, headers={"User-Agent": "Kalkulator-KIUT/3.0"})
            if r.status_code != 200:
                return {"ok": False, "error": f"WFS status {r.status_code}", "status": "ERROR"}

            geojson = r.json()
            features = geojson.get("features", [])
            detected = len(features) > 0

            return {
                "ok": True,
                "status": "REAL",
                "detected": detected,
                "feature_count": len(features),
                "layer": layer,
                "geojson": geojson
            }
        except requests.exceptions.Timeout:
            return {"ok": False, "error": "Timeout", "status": "TIMEOUT"}
        except Exception as e:
            return {"ok": False, "error": str(e), "status": "ERROR"}
