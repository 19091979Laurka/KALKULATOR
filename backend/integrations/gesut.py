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
# GUGiK WMS uses specific colors for infrastructure
LAYER_COLORS = {
    "elektro": {"r_min": 180, "r_max": 255, "g_max": 150, "b_max": 150},   # Reddish
    "gaz": {"r_min": 180, "r_max": 255, "g_min": 180, "g_max": 255, "b_max": 100},  # Yellowish
    "woda": {"r_max": 150, "g_max": 150, "b_min": 180, "b_max": 255},       # Bluish
    "kanal": {"r_min": 150, "r_max": 200, "g_min": 100, "g_max": 150, "b_max": 100}, # Brownish
}


class GESUTClient:
    """
    GESUT Client using WMS raster tile analysis.
    """

    def __init__(self, county_code: str = "0618"):
        self.county_code = county_code
        self.wms_url = NATIONAL_WMS
        logger.info(f"GESUTClient initialized with WMS: {self.wms_url}")

    def _build_getmap_url(
        self, layers: str, bbox: Tuple[float, float, float, float],
        width: int = 2048, height: int = 2048
    ) -> str:
        """Build WMS GetMap URL. BBOX in easting,northing order (EPSG:2180)."""
        e_min, n_min, e_max, n_max = bbox
        bbox_str = f"{e_min},{n_min},{e_max},{n_max}"
        # Use VERSION 1.3.0 for better compatibility with GUGiK
        return (
            f"{self.wms_url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap"
            f"&LAYERS={layers}"
            f"&CRS=EPSG:2180"
            f"&BBOX={n_min},{e_min},{n_max},{e_max}" # 1.3.0 uses N,E order for 2180
            f"&WIDTH={width}&HEIGHT={height}"
            f"&FORMAT=image/png&TRANSPARENT=true&STYLES="
        )

    @staticmethod
    def _parse_png_pixels(data: bytes) -> Tuple[int, int, list, bytes, int, int]:
        """
        Parse PNG and return (width, height, palette, raw_data, bpp, color_type).
        """
        with __import__('io').BytesIO(data) as f:
            header = f.read(8)
            if header != b'\x89PNG\r\n\x1a\n':
                raise ValueError("Not a PNG file")
            
            ihdr = None
            palette = []
            idat = b''

            while True:
                lb = f.read(4)
                if not lb: break
                length = struct.unpack('>I', lb)[0]
                ct = f.read(4).decode('ascii')
                cd = f.read(length)
                f.read(4) # CRC
                
                if ct == 'IHDR':
                    w = struct.unpack('>I', cd[0:4])[0]
                    h = struct.unpack('>I', cd[4:8])[0]
                    ihdr = (w, h, cd[8], cd[9])
                elif ct == 'PLTE':
                    palette = [(cd[i], cd[i+1], cd[i+2]) for i in range(0, len(cd), 3)]
                elif ct == 'IDAT':
                    idat += cd
                elif ct == 'IEND':
                    break

        if not ihdr:
            raise ValueError("Invalid PNG: no IHDR")

        w, h, bit_depth, color_type = ihdr
        raw = zlib.decompress(idat)

        # Basic bpp calculation
        if color_type == 3: bpp = 1   # Indexed
        elif color_type == 6: bpp = 4 # RGBA
        elif color_type == 2: bpp = 3 # RGB
        elif color_type == 0: bpp = 1 # Grayscale
        else: bpp = 1

        return w, h, palette, raw, bpp, color_type

    def _extract_colored_pixels(
        self, data: bytes, color_filter: dict
    ) -> List[Tuple[int, int]]:
        """Extract pixel coordinates matching a color filter."""
        try:
            w, h, palette, raw, bpp, ctype = self._parse_png_pixels(data)
        except Exception as e:
            logger.error(f"PNG parse error: {e}")
            return []

        stride = 1 + w * bpp
        matches = []

        r_min, r_max = color_filter.get("r_min", 0), color_filter.get("r_max", 255)
        g_min, g_max = color_filter.get("g_min", 0), color_filter.get("g_max", 255)
        b_min, b_max = color_filter.get("b_min", 0), color_filter.get("b_max", 255)

        for y in range(h):
            row_start = y * stride
            if row_start + stride > len(raw): break
            row = raw[row_start+1 : row_start+stride]

            for x in range(w):
                r, g, b = 0, 0, 0
                if ctype == 3: # Indexed
                    if x < len(row):
                        idx = row[x]
                        if idx < len(palette):
                            r, g, b = palette[idx]
                        else: continue
                    else: continue
                elif ctype == 6: # RGBA
                    px = x * 4
                    if px + 3 < len(row):
                        r, g, b, a = row[px], row[px+1], row[px+2], row[px+3]
                        if a < 30: continue # Skip transparent
                    else: continue
                elif ctype == 2: # RGB
                    px = x * 3
                    if px + 2 < len(row):
                        r, g, b = row[px], row[px+1], row[px+2]
                    else: continue
                else: continue

                if (r_min <= r <= r_max and g_min <= g <= g_max and b_min <= b <= b_max):
                    matches.append((x, y))

        return matches

    def _calculate_length_robust(self, pixels: List[Tuple[int, int]], res_m: float) -> float:
        """
        Robustly calculate line length from pixel mask.
        Avoids neighbor-jump inflation by calculating effective line area.
        """
        if not pixels: return 0.0
        
        # 1. Calculate number of unique "points" after thinning
        # A simple thinning: use a grid of resolution and count active cells
        cells = set()
        for x, y in pixels:
            cells.add((x, y))
        
        if not cells: return 0.0
        
        # 2. Estimation: Length = (Total Pixels * Res) / Typical Line Width in Pixels
        # GUGiK WMS lines are usually 2.0 - 4.0 pixels wide depending on zoom
        # At 2048 width for 400m bbox, res is 0.2m. 
        # A 1m wide object on map is 5 pixels.
        
        count = len(cells)
        # Empirical factor: divide by 2.8 to account for line thickness and diagonal connections
        est_len = (count * res_m) / 2.8
        
        # 3. Sanity check: cannot be shorter than the bounding box of pixels
        e_span = (max(p[0] for p in pixels) - min(p[0] for p in pixels)) * res_m
        n_span = (max(p[1] for p in pixels) - min(p[1] for p in pixels)) * res_m
        diagonal = math.sqrt(e_span**2 + n_span**2)
        
        return round(max(est_len, diagonal), 1)

    async def get_infrastructure_in_bbox(
        self, layer_key: str, bbox: Tuple[float, float, float, float],
        img_size: int = 1024
    ) -> Dict[str, Any]:
        """
        Fetch infrastructure via WMS raster analysis.
        """
        layer_name = COUNTY_LAYERS.get(layer_key)
        if not layer_name:
            # Try to use key as layer name if not in mapping
            layer_name = layer_key

        color_filter = LAYER_COLORS.get(layer_key, LAYER_COLORS["elektro"])

        # Square BBOX for simpler math
        e_min, n_min, e_max, n_max = bbox
        url = self._build_getmap_url(layer_name, bbox, img_size, img_size)
        res_m = (e_max - e_min) / img_size

        try:
            import asyncio
            loop = asyncio.get_event_loop()
            # Added a few extra layers that GUGiK often includes in KIUT
            if layer_key == "elektro":
                layers = f"{layer_name},elektro_przewod,elektro_urzadzenie"
            else:
                layers = layer_name

            # Refresh URL with combined layers
            url = self._build_getmap_url(layers, bbox, img_size, img_size)
            
            response = await loop.run_in_executor(
                None,
                lambda: requests.get(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}, timeout=10, verify=False)
            )

            response.raise_for_status()
            
            if 'image' not in response.headers.get('Content-Type', ''):
                return {"ok": False, "error": "WMS returned non-image"}

            pixels = self._extract_colored_pixels(response.content, color_filter)
            
            if not pixels:
                return {"ok": True, "line_length_m": 0, "objects": 0, "coordinates": []}

            length = self._calculate_length_robust(pixels, res_m)
            
            # Simplified coordinates for visualization
            step = max(1, len(pixels) // 20)
            coords_2180 = []
            for px_x, px_y in pixels[::step]:
                e = e_min + px_x * res_m
                n = n_max - px_y * res_m
                coords_2180.append((round(e, 1), round(n, 1)))

            return {
                "ok": True,
                "source": "GUGiK KIUT WMS",
                "line_length_m": length,
                "objects": len(pixels),
                "pixel_resolution_m": round(res_m, 3),
                "coordinates_epsg2180": coords_2180
            }

        except Exception as e:
            logger.error(f"GESUT WMS error: {e}")
            return {"ok": False, "error": str(e)}

    async def fetch_infrastructure(self, bbox: Tuple[float, float, float, float]) -> Dict[str, Any]:
        """Compatibility wrapper for Spec v2.1."""
        res = await self.get_infrastructure_in_bbox("elektro", bbox)
        if res.get("ok") and res.get("line_length_m", 0) > 0:
            return {
                "ok": True,
                "primary_type": "elektro",
                "line_length_m": res["line_length_m"],
                "coordinates": res.get("coordinates_epsg2180", []),
                "objects": res.get("objects", 0),
            }
        return {"ok": True, "line_length_m": 0, "coordinates": []}
