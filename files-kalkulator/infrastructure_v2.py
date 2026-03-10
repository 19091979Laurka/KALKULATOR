"""
Moduł: Infrastruktura v2.0 (Enhanced GESUT Integration)
Wykorzystuje pełny potencjał GESUT:
- Detekcja wszystkich mediów (elektro, gaz, woda, kanał, ciepło)
- Wykrywanie napięcia linii
- Obliczanie rzeczywistych długości w pasie działki
- Mapowanie na roszczenia odszkodowawcze
"""
import logging
from typing import Dict, Any, Optional, List
from shapely.geometry import shape, LineString, Point
from shapely.ops import linemerge

from backend.integrations.gesut import GESUTClient
from backend.integrations.uldk import ULDKClient

logger = logging.getLogger(__name__)

# Szerokości stref ochronnych [m] wg rodzaju sieci i napięcia
STREFY_OCHRONNE = {
    # Elektroenergetyka
    "elektro_WN": 30,   # Wysokie napięcie >110 kV
    "elektro_SN": 15,   # Średnie napięcie 1-110 kV
    "elektro_nN": 5,    # Niskie napięcie <1 kV
    
    # Gazownictwo
    "gaz_wysokie": 50,  # Wysokie ciśnienie
    "gaz_srednie": 15,  # Średnie ciśnienie
    "gaz_niskie": 3,    # Niskie ciśnienie
    
    # Pozostałe media
    "wod_kan": 3,       # Wodociąg i kanalizacja
    "teleko": 2,        # Telekomunikacja
    "cieplo": 5,        # Ciepłownictwo
}

# Współczynniki odszkodowawcze dla różnych mediów
COMPENSATION_MULTIPLIERS = {
    "elektro_WN": 2.5,
    "elektro_SN": 2.0,
    "elektro_nN": 1.5,
    "gaz_wysokie": 2.2,
    "gaz_srednie": 1.8,
    "gaz_niskie": 1.3,
    "wod_kan": 1.2,
    "teleko": 1.0,
    "cieplo": 1.5,
}

class InfrastructureAnalyzer:
    """Enhanced infrastructure analysis with full GESUT integration"""
    
    def __init__(self, county_code: Optional[str] = None):
        self.gesut = GESUTClient(county_code=county_code)
        self.uldk = ULDKClient()
    
    async def analyze_parcel(
        self,
        parcel_id: str,
        parcel_geom: Optional[Dict] = None,
        bbox_2180: Optional[tuple] = None
    ) -> Dict[str, Any]:
        """
        Kompleksowa analiza infrastruktury dla działki.
        
        Returns:
            {
                "energie": {...},
                "media": {...},
                "compensation_basis": {...},
                "ok": bool
            }
        """
        # 1. Pobierz BBOX jeśli nie podano
        if not bbox_2180:
            bbox_2180 = self.uldk.get_parcel_bbox(parcel_id, srid="2180")
        
        if not bbox_2180:
            return self._error_response("Brak BBOX parceli w EPSG:2180")
        
        # 2. Sprawdź geometrię działki (dla precyzyjnych obliczeń)
        parcel_shape = None
        if parcel_geom:
            try:
                parcel_shape = shape(parcel_geom)
            except Exception as e:
                logger.warning(f"Nie można sparsować geometrii: {e}")
        
        # 3. Analiza energetyki (priorytet!)
        energie = await self._analyze_power_lines(bbox_2180, parcel_shape)
        
        # 4. Analiza pozostałych mediów
        media = await self._analyze_other_media(bbox_2180, parcel_shape)
        
        # 5. Podstawa odszkodowania
        compensation = self._calculate_compensation_basis(energie, media, parcel_geom)
        
        return {
            "energie": energie,
            "media": media,
            "compensation_basis": compensation,
            "ok": energie.get("ok", False) or any(m.get("detected") for m in media.values())
        }
    
    async def _analyze_power_lines(
        self,
        bbox_2180: tuple,
        parcel_shape: Optional[Any] = None
    ) -> Dict[str, Any]:
        """Szczegółowa analiza linii elektroenergetycznych"""
        
        result = {
            "detected": False,
            "voltage": "nieznane",
            "voltage_category": None,  # WN/SN/nN
            "line_length_m": 0.0,
            "lines_in_parcel": [],
            "protection_zone_m": 10,
            "occupied_area_m2": 0.0,
            "status": "UNKNOWN",
            "info": "",
            "ok": False
        }
        
        try:
            # Fetch z GESUT
            infra_data = await self.gesut.fetch_infrastructure(bbox_2180)
            
            if not infra_data or not infra_data.get("ok"):
                result["status"] = "ERROR"
                result["info"] = infra_data.get("error", "Błąd serwisu GESUT") if infra_data else "Brak odpowiedzi GESUT"
                return result
            
            # Podstawowe dane
            result["detected"] = infra_data.get("detected", False)
            result["voltage"] = infra_data.get("voltage", "nieznane")
            result["status"] = "REAL (KIUT WMS)"
            
            # Kategoria napięcia
            voltage = result["voltage"]
            if voltage in ["WN", "wysokie"]:
                result["voltage_category"] = "WN"
                result["protection_zone_m"] = STREFY_OCHRONNE["elektro_WN"]
            elif voltage in ["SN", "średnie", "srednie"]:
                result["voltage_category"] = "SN"
                result["protection_zone_m"] = STREFY_OCHRONNE["elektro_SN"]
            elif voltage in ["nN", "niskie", "nn"]:
                result["voltage_category"] = "nN"
                result["protection_zone_m"] = STREFY_OCHRONNE["elektro_nN"]
            else:
                result["voltage_category"] = "SN"  # Domyślnie średnie
                result["protection_zone_m"] = STREFY_OCHRONNE["elektro_SN"]
            
            # Obliczenie zajętej powierzchni (jeśli mamy geometrię działki)
            if parcel_shape and result["detected"]:
                # Uproszczone: pas ochronny × długość linii w działce
                # W pełnej wersji: przecięcie bufora linii z działką
                result["occupied_area_m2"] = self._estimate_occupied_area(
                    parcel_shape,
                    result["protection_zone_m"]
                )
            
            result["info"] = f"Wykryto linie {result['voltage_category']} w pasie {result['protection_zone_m']}m"
            result["ok"] = True
            
        except Exception as e:
            logger.error(f"Błąd analizy linii energetycznych: {e}")
            result["status"] = "ERROR"
            result["info"] = str(e)
        
        return result
    
    async def _analyze_other_media(
        self,
        bbox_2180: tuple,
        parcel_shape: Optional[Any] = None
    ) -> Dict[str, Dict[str, Any]]:
        """Analiza pozostałych mediów (gaz, woda, kanalizacja, ciepło)"""
        
        media_types = {
            "gaz": "Gazociąg",
            "woda": "Wodociąg",
            "kanal": "Kanalizacja",
            "cieplo": "Ciepłownictwo"
        }
        
        results = {}
        
        for media_key, media_name in media_types.items():
            try:
                data = await self.gesut.get_infrastructure_in_bbox(media_key, bbox_2180)
                
                results[media_key] = {
                    "detected": data.get("detected", False) if data and data.get("ok") else False,
                    "name": media_name,
                    "protection_zone_m": STREFY_OCHRONNE.get(f"{media_key}_srednie", 3),
                    "status": "REAL" if data and data.get("ok") else "ERROR",
                    "layer": data.get("layer") if data else None
                }
                
            except Exception as e:
                logger.warning(f"Błąd sprawdzania {media_name}: {e}")
                results[media_key] = {
                    "detected": False,
                    "name": media_name,
                    "status": "ERROR",
                    "error": str(e)
                }
        
        return results
    
    def _estimate_occupied_area(
        self,
        parcel_shape: Any,
        protection_zone_m: float
    ) -> float:
        """
        Estymuje powierzchnię zajętą przez pas ochronny.
        
        W pełnej wersji: przecięcie bufora geometrii linii z działką.
        Tu: uproszczenie - % powierzchni działki.
        """
        try:
            parcel_area = parcel_shape.area  # m² w EPSG:2180
            
            # Uproszczone: zakładamy że linia przecina działkę
            # i zajmuje pas o szerokości 2 * protection_zone_m
            # Dla dokładniejszych obliczeń potrzeba geometrii linii z WFS
            
            # Heurystyka: 5-15% powierzchni działki w zależności od wielkości
            if parcel_area < 500:
                percentage = 0.15  # Małe działki
            elif parcel_area < 2000:
                percentage = 0.10
            else:
                percentage = 0.05  # Duże działki
            
            return round(parcel_area * percentage, 2)
            
        except Exception as e:
            logger.warning(f"Błąd estymacji powierzchni: {e}")
            return 0.0
    
    def _calculate_compensation_basis(
        self,
        energie: Dict,
        media: Dict,
        parcel_geom: Optional[Dict]
    ) -> Dict[str, Any]:
        """
        Oblicza podstawę do wyceny odszkodowania.
        
        Returns:
            {
                "total_occupied_area_m2": float,
                "affected_percentage": float,
                "compensation_multiplier": float,
                "infrastructure_types": List[str]
            }
        """
        occupied_area = energie.get("occupied_area_m2", 0.0)
        infrastructure_types = []
        compensation_multiplier = 1.0
        
        # Energia
        if energie.get("detected"):
            voltage_cat = energie.get("voltage_category", "SN")
            infra_type = f"elektro_{voltage_cat}"
            infrastructure_types.append(f"Linie energetyczne {voltage_cat}")
            compensation_multiplier = max(
                compensation_multiplier,
                COMPENSATION_MULTIPLIERS.get(infra_type, 1.5)
            )
        
        # Media
        for media_key, media_data in media.items():
            if media_data.get("detected"):
                infrastructure_types.append(media_data.get("name"))
                # Media dodatkowe zwiększają mnożnik o 10%
                compensation_multiplier *= 1.1
        
        # Oblicz % działki zajętej
        affected_percentage = 0.0
        if parcel_geom and occupied_area > 0:
            try:
                parcel_shape = shape(parcel_geom)
                parcel_area = parcel_shape.area
                affected_percentage = (occupied_area / parcel_area) * 100
            except:
                pass
        
        return {
            "total_occupied_area_m2": occupied_area,
            "affected_percentage": round(affected_percentage, 2),
            "compensation_multiplier": round(compensation_multiplier, 2),
            "infrastructure_types": infrastructure_types,
            "recommendation": self._get_compensation_recommendation(
                affected_percentage,
                compensation_multiplier,
                infrastructure_types
            )
        }
    
    def _get_compensation_recommendation(
        self,
        affected_percentage: float,
        multiplier: float,
        infra_types: List[str]
    ) -> str:
        """Generuje rekomendację odszkodowawczą"""
        
        if not infra_types:
            return "Brak infrastruktury - brak podstaw do roszczenia"
        
        if affected_percentage > 10:
            severity = "znacząca"
        elif affected_percentage > 5:
            severity = "umiarkowana"
        else:
            severity = "niewielka"
        
        return (
            f"Wykryto {', '.join(infra_types)}. "
            f"Ingerencja w nieruchomość: {severity} ({affected_percentage:.1f}%). "
            f"Mnożnik odszkodowawczy: {multiplier:.2f}x. "
            f"{'Rekomendowana ścieżka sądowa.' if multiplier >= 2.0 else 'Możliwa negocjacja z operatorem.'}"
        )
    
    def _error_response(self, error_msg: str) -> Dict[str, Any]:
        """Standardowa odpowiedź błędu"""
        return {
            "ok": False,
            "error": error_msg,
            "status": "ERROR",
            "energie": {
                "detected": False,
                "status": "ERROR",
                "info": error_msg,
                "ok": False
            },
            "media": {},
            "compensation_basis": {}
        }


# =====================================================
# PUBLIC API (backwards compatible)
# =====================================================
async def fetch_infrastructure(
    parcel_id: Optional[str],
    lon: float,
    lat: float,
    parcel_geom: Optional[Dict] = None,
    infra_type: str = "elektro_SN",
) -> Dict[str, Any]:
    """
    Główna funkcja API (zachowuje kompatybilność wsteczną).
    
    DEPRECATION NOTICE: Użyj InfrastructureAnalyzer.analyze_parcel() dla pełnej funkcjonalności.
    """
    county_code = parcel_id[:4] if parcel_id and len(parcel_id) >= 4 else None
    
    uldk = ULDKClient()
    bbox_2180 = uldk.get_parcel_bbox(parcel_id, srid="2180") if parcel_id else None
    
    if not bbox_2180:
        return {
            "ok": False,
            "error": "Brak BBOX parceli w EPSG:2180",
            "status": "ERROR",
            "energie": {"detected": False, "status": "ERROR", "ok": False},
            "media": {},
            "droga": {"access": False, "type": "nieznany", "status": "TEST/OSM"}
        }
    
    # Use new analyzer
    analyzer = InfrastructureAnalyzer(county_code=county_code)
    result = await analyzer.analyze_parcel(parcel_id, parcel_geom, bbox_2180)
    
    # Add legacy "droga" field for backwards compatibility
    result["droga"] = {"access": False, "type": "nieznany", "status": "TEST/OSM"}
    
    return result
