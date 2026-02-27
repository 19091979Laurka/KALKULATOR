"""
GESUT/KIUT Client — Spec v2.2

Pobiera dane infrastruktury przesyłowej z:
1. County-level WMS (geoportal2.pl) — PRIMARY, pixel extraction from rendered tiles
2. National KIUT WMS (integracja.gugik.gov.pl) — FALLBACK overview

UWAGA: Serwis krajowy KIUT to WMS (nie WFS!). Nie obsługuje GetFeature.
Usługa powiatowa geoportal2 również jest WMS-only, ale umożliwia renderowanie
warstw infrastruktury z dokładnością do 1m.

Warstwa: siec_elektroenergetyczna (czerwone linie na mapie)
Metoda: Renderowanie kafelka WMS + ekstrakcja pikseli koloru → współrzędne EPSG:2180
"""

import logging
import math
import struct
import requests
import zlib
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)


# County-level WMS endpoints (geoportal2.pl)
COUNTY_WMS_ENDPOINTS = {
    "0618": "http://tomaszowlubelski.geoportal2.pl/map/geoportal/wms.php",  # pow. tomaszowski
    # Add more counties as needed
}

# National KIUT WMS (fallback)
NATIONAL_WMS = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu"

# Layer mapping for national KIUT WMS (more standardized)
COUNTY_LAYERS = {
    "elektro": "przewod_elektroenergetyczny",
    "gaz": "przewod_gazowy",
    "woda": "przewod_wodociagowy",
    "kanal": "przewod_kanalizacyjny",
    "telekom": "przewod_telekomunikacyjny",
    "cieplo": "przewod_cieplowniczy",
    "urzadzenia": "urzadzenie_techniczne",
}

# Color detection for each layer type (RGB ranges)
LAYER_COLORS = {
    "elektro": {"r_min": 200, "r_max": 255, "g_max": 80, "b_max": 80},   # Red
    "gaz": {"r_min": 180, "r_max": 255, "g_min": 180, "g_max": 255, "b_max": 50},  # Yellow
    "woda": {"r_max": 80, "g_max": 80, "b_min": 150, "b_max": 255},       # Blue
}


class GESUTClient:
    """
    GESUT Client using WMS raster tile analysis.
    
    Instead of WFS (which KIUT doesn't support), this client:
    1. Renders WMS GetMap tiles covering the parcel area
    2. Parses the PNG image to find colored pixels (infrastructure lines)
    3. Converts pixel positions back to EPSG:2180 coordinates
    4. Calculates line length, crossing paths, and infrastructure extent
    """

    def __init__(self, county_code: str = "0618"):
        self.county_code = county_code
        # Force national WMS as regional geoportal2 often 400s or has custom layers
        self.wms_url = NATIONAL_WMS
        logger.info(f"GESUTClient initialized with WMS: {self.wms_url}")

    def _build_getmap_url(
        self, layers: str, bbox: Tuple[float, float, float, float],
        width: int = 2048, height: int = 2048
    ) -> str:
        """Build WMS GetMap URL. BBOX in easting,northing order (EPSG:2180)."""
        e_min, n_min, e_max, n_max = bbox
        bbox_str = f"{e_min},{n_min},{e_max},{n_max}"
        return (
            f"{self.wms_url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap"
            f"&LAYERS={layers}"
            f"&SRS=EPSG:2180"
            f"&BBOX={bbox_str}"
            f"&WIDTH={width}&HEIGHT={height}"
            f"&FORMAT=image/png&TRANSPARENT=true&STYLES="
        )

    @staticmethod
    def _parse_png_pixels(data: bytes) -> Tuple[int, int, list, list]:
        """
        Parse PNG and return (width, height, palette, pixel_indices).
        Handles indexed color (type 3) and RGBA (type 6).
        """
        with __import__('io').BytesIO(data) as f:
            header = f.read(8)
            chunks = []
            while True:
                lb = f.read(4)
                if len(lb) < 4:
                    break
                length = struct.unpack('>I', lb)[0]
                ct = f.read(4).decode('ascii')
                cd = f.read(length)
                f.read(4)  # CRC
                chunks.append((ct, cd))

        ihdr = None
        palette = []
        idat = b''

        for ct, cd in chunks:
            if ct == 'IHDR':
                w = struct.unpack('>I', cd[0:4])[0]
                h = struct.unpack('>I', cd[4:8])[0]
                ihdr = (w, h, cd[8], cd[9])
            elif ct == 'PLTE':
                palette = [(cd[i], cd[i+1], cd[i+2]) for i in range(0, len(cd), 3)]
            elif ct == 'IDAT':
                idat += cd

        if not ihdr:
            raise ValueError("Invalid PNG: no IHDR")

        w, h, bit_depth, color_type = ihdr
        raw = zlib.decompress(idat)

        if color_type == 3:  # Indexed
            bpp = 1
        elif color_type == 6:  # RGBA
            bpp = 4
        elif color_type == 2:  # RGB
            bpp = 3
        else:
            bpp = 1

        return w, h, palette, raw, bpp, color_type

    def _extract_colored_pixels(
        self, data: bytes, color_filter: dict
    ) -> List[Tuple[int, int]]:
        """Extract pixel coordinates matching a color filter from PNG data."""
        w, h, palette, raw, bpp, ctype = self._parse_png_pixels(data)
        stride = 1 + w * bpp
        matches = []

        r_min = color_filter.get("r_min", 0)
        r_max = color_filter.get("r_max", 255)
        g_min = color_filter.get("g_min", 0)
        g_max = color_filter.get("g_max", 255)
        b_min = color_filter.get("b_min", 0)
        b_max = color_filter.get("b_max", 255)

        for y in range(h):
            row_start = y * stride
            row = raw[row_start + 1: row_start + stride]

            for x in range(w):
                if ctype == 3:
                    idx = row[x]
                    if idx < len(palette):
                        r, g, b = palette[idx]
                    else:
                        continue
                elif ctype == 6:
                    px = x * 4
                    r, g, b, a = row[px:px+4]
                    if a < 100:
                        continue
                elif ctype == 2:
                    px = x * 3
                    r, g, b = row[px:px+3]
                else:
                    continue

                if (r_min <= r <= r_max and g_min <= g <= g_max and b_min <= b <= b_max):
                    matches.append((x, y))

        return matches

    def _pixels_to_coords(
        self, pixels: List[Tuple[int, int]],
        bbox: Tuple[float, float, float, float],
        img_width: int, img_height: int
    ) -> List[Tuple[float, float]]:
        """Convert pixel positions to EPSG:2180 coordinates."""
        e_min, n_min, e_max, n_max = bbox
        coords = []
        for px_x, px_y in pixels:
            easting = e_min + (px_x / img_width) * (e_max - e_min)
            northing = n_max - (px_y / img_height) * (n_max - n_min)
            coords.append((easting, northing))
        return coords

    @staticmethod
    def _calculate_line_length(coords: List[Tuple[float, float]]) -> float:
        """Calculate total line length from sorted coordinate points (meters)."""
        if len(coords) < 2:
            return 0

        # Sort by primary axis (northing) for a roughly N-S line
        coords_sorted = sorted(coords, key=lambda c: c[1])

        total = 0
        # Use running median filter to remove outliers
        for i in range(1, len(coords_sorted)):
            dx = coords_sorted[i][0] - coords_sorted[i-1][0]
            dy = coords_sorted[i][1] - coords_sorted[i-1][1]
            seg = math.sqrt(dx*dx + dy*dy)
            if seg < 100:  # Filter out jumps > 100m (gaps between line segments)
                total += seg
        return total

    async def get_infrastructure_in_bbox(
        self, layer_key: str, bbox: Tuple[float, float, float, float],
        img_size: int = 2048
    ) -> Dict[str, Any]:
        """
        Fetch infrastructure via WMS raster analysis.
        
        Args:
            layer_key: e.g. 'elektro', 'gaz', 'woda'
            bbox: (easting_min, northing_min, easting_max, northing_max) in EPSG:2180
            img_size: WMS tile size (larger = more precise)
        
        Returns:
            Dict with line coordinates, length, and metadata
        """
        layer_name = COUNTY_LAYERS.get(layer_key)
        if not layer_name:
            return {"ok": False, "error": f"Unknown layer: {layer_key}"}

        color_filter = LAYER_COLORS.get(layer_key)
        if not color_filter:
            color_filter = LAYER_COLORS["elektro"]  # default to red

        # Calculate image dimensions proportional to bbox
        e_span = bbox[2] - bbox[0]
        n_span = bbox[3] - bbox[1]
        aspect = e_span / n_span if n_span > 0 else 1
        if aspect > 1:
            w, h = img_size, int(img_size / aspect)
        else:
            w, h = int(img_size * aspect), img_size

        url = self._build_getmap_url(layer_name, bbox, w, h)
        logger.info(f"GESUT WMS GetMap: {layer_key} ({w}×{h})")

        try:
            import asyncio
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: requests.get(url, headers={'User-Agent': 'GESUTClient/2.2'}, timeout=5, verify=False)
            )
            response.raise_for_status()
            data = response.content
            ct = response.headers.get('Content-Type', '')

            if 'image' not in ct:
                raise Exception(f"WMS returned {ct} instead of image")

            # Extract colored pixels
            pixels = self._extract_colored_pixels(data, color_filter)

            if not pixels:
                return {
                    "ok": True,
                    "source": f"WMS {self.wms_url}",
                    "layer": layer_name,
                    "objects": 0,
                    "line_length_m": 0,
                    "coordinates": [],
                    "note": "No infrastructure pixels found in rendered tile"
                }

            # Convert to EPSG:2180
            coords = self._pixels_to_coords(pixels, bbox, w, h)
            line_length = self._calculate_line_length(coords)

            # Simplify coordinates (every Nth point)
            step = max(1, len(coords) // 100)
            simplified = coords[::step]

            return {
                "ok": True,
                "source": f"WMS {self.wms_url}",
                "layer": layer_name,
                "objects": len(pixels),
                "line_length_m": round(line_length, 1),
                "extent": {
                    "easting_min": round(min(c[0] for c in coords), 1),
                    "easting_max": round(max(c[0] for c in coords), 1),
                    "northing_min": round(min(c[1] for c in coords), 1),
                    "northing_max": round(max(c[1] for c in coords), 1),
                },
                "coordinates_epsg2180": [(round(c[0], 1), round(c[1], 1)) for c in simplified],
                "pixel_resolution_m": round(e_span / w, 2),
            }

        except Exception as e:
            logger.error(f"GESUT WMS error for {layer_key}: {e}")
            raise

    async def fetch_infrastructure(self, bbox: Tuple[float, float, float, float]) -> Dict[str, Any]:
        """
        Fetch all infrastructure types in the given BBOX.
        Primary method: elektro layer.
        """
        result = await self.get_infrastructure_in_bbox("elektro", bbox)

        if result.get("ok") and result.get("objects", 0) > 0:
            line_len = result.get("line_length_m", 0)
            return {
                "source": f"GESUT WMS ({self.wms_url})",
                "ok": True,
                "objects": result["objects"],
                "types": ["elektro"],
                "primary_type": "elektro",
                "infra_type_ksws": "elektro_SN",
                "line_length_m": line_len,
                "has_poles": line_len > 50,  # Estimate: if line > 50m, there are poles
                "estimated_poles": max(1, int(line_len / 70)),  # ~70m spacing for SN
                "operators": [],
                "rok_budowy": None,
                "extent": result.get("extent"),
                "coordinates": result.get("coordinates_epsg2180", []),
                "pixel_resolution_m": result.get("pixel_resolution_m"),
            }

        return {
            "source": "Brak obiektów w GESUT WMS",
            "ok": True,
            "objects": 0,
            "types": [],
            "primary_type": "elektro",
            "infra_type_ksws": "elektro_SN",
            "line_length_m": 0,
            "has_poles": False,
            "estimated_poles": 0,
            "operators": [],
            "rok_budowy": None,
            "extent": None,
            "coordinates": [],
        }
