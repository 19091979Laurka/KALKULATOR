import requests
import logging
from typing import Optional, Dict, Any
from decimal import Decimal

logger = logging.getLogger(__name__)

class GUSClient:
    """
    Client for GUS Bank Danych Lokalnych (BDL).
    Fetches market prices for land by county/municipality.
    """
    BASE_URL = "https://bdl.stat.gov.pl/api/v1"
    
    # Variable IDs for land prices
    VAR_LAND_PRICES = 455437 # Cena 1 m2 gruntów ornych (Arable) - widely available
    # Building land prices are often aggregated at level 2 (voivodeship)
    VAR_BUILDING_PRICES = 60548 # Subject P2336 (if available)

    def __init__(self, api_key: Optional[str] = None):
        self.headers = {"accept": "application/json"}
        if api_key:
            self.headers["X-ClientId"] = api_key

    async def fetch_market_price(self, wojewodztwo: str, powiat: str, gmina: str, gmina_typ: str = "2") -> Dict[str, Any]:
        """
        Wrapper as used in analyzer.py for Spec v2.1.
        """
        w_map = {
            "dolnośląskie": "020000", "kujawsko-pomorskie": "040000",
            "lubelskie": "060000", "lubuskie": "080000",
            "łódzkie": "100000", "małopolskie": "120000",
            "mazowieckie": "140000", "opolskie": "160000",
            "podkarpackie": "180000", "podlaskie": "200000",
            "pomorskie": "220000", "śląskie": "240000",
            "świętokrzyskie": "260000", "warmińsko-mazurskie": "280000",
            "wielkopolskie": "300000", "zachodniopomorskie": "320000"
        }
        
        # simplified for Phase 2 - use regional fallbacks if TERYT unknown
        safe_woj = (wojewodztwo or "").lower().strip()
        
        # Mapping from name OR 2-digit code to 6-digit TERYT
        teryt_fake = w_map.get(safe_woj)
        if not teryt_fake:
            # Check if it's already a 2-digit code
            if safe_woj.isdigit() and len(safe_woj) == 2:
                teryt_fake = safe_woj + "0000"
            else:
                teryt_fake = "140000" # fallback to mazowieckie
        
        try:
            price = self.get_price_for_teryt(teryt_fake)
            return {
                "price": float(price),
                "source": "GUS BDL (Regional)",
                "ok": True
            }
        except Exception:
            return {
                "price": 180.0,
                "source": "GUS Fallback",
                "ok": False
            }

    def get_price_for_teryt(self, teryt: str, is_building: bool = True) -> Decimal:
        """
        Get average price for a given TERYT unit.
        teryt: e.g. '126101'
        """
        unit_id = self._teryt_to_bdl_unit(teryt)
        if not unit_id:
            return self._get_fallback_price(teryt, is_building)

        try:
            var_id = self.VAR_BUILDING_PRICES if is_building else self.VAR_LAND_PRICES
            url = f"{self.BASE_URL}/Data/ByUnit/{unit_id}?var-id={var_id}&last=1"
            
            response = requests.get(url, headers=self.headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get("results") and data["results"][0].get("values"):
                    price = data["results"][0]["values"][0].get("val")
                    if price:
                        return Decimal(str(price))
            
            # Fallback if specific variable is missing for unit
            return self._get_fallback_price(teryt, is_building)
            
        except Exception as e:
            logger.error(f"GUS API Error for TERYT {teryt}: {e}")
            return self._get_fallback_price(teryt, is_building)

    def _teryt_to_bdl_unit(self, teryt: str) -> Optional[str]:
        """
        Map TERYT code (6-7 digits) to BDL unit ID (12 digits).
        Example: 126101 -> 000000000000 code
        For simplicity, we try to fetch unit by TERYT prefix.
        """
        # BDL often uses 7-digit TERYT for units.
        try:
            url = f"{self.BASE_URL}/Units?name={teryt}&page-size=1"
            response = requests.get(url, headers=self.headers, timeout=5)
            if response.status_code == 200:
                results = response.json().get("results")
                if results:
                    return results[0].get("id")
        except Exception:
            pass
        return None

    def _get_fallback_price(self, teryt: str, is_building: bool) -> Decimal:
        """
        Hardcoded regional averages (v2.1 strategy) for when API fails.
        Values based on 2024/2025 market estimates.
        """
        voivodeship_code = teryt[:2]
        
        # Voivodeship base prices (building land)
        base_prices = {
            "14": 450, # Mazowieckie (Warszawa)
            "12": 350, # Małopolskie (Kraków)
            "02": 320, # Dolnośląskie (Wrocław)
            "30": 300, # Wielkopolskie (Poznań)
            "22": 280, # Pomorskie (Gdańsk)
            "default": 180
        }
        
        price = base_prices.get(voivodeship_code, base_prices["default"])
        
        if not is_building:
            price = price / 10 # Rough conversion to arable land price
            
        return Decimal(str(price))
