"""
GUSClientFixed — klient GUS BDL (Bank Danych Lokalnych).
Interfejs uproszczony: fetch_market_price(voivodeship) → {"ok": bool, "price_m2": Optional[float]}
Używany przez PropertyAggregator (modules/property.py).
"""
import logging
import requests
from typing import Dict, Optional, Any

logger = logging.getLogger(__name__)

# Ceny bazowe wg województwa (zł/m², dane szacunkowe 2024/2025)
_VOIVODESHIP_PRICES: Dict[str, float] = {
    "mazowieckie": 450.0,
    "małopolskie": 350.0,
    "dolnośląskie": 320.0,
    "wielkopolskie": 300.0,
    "pomorskie": 280.0,
    "śląskie": 260.0,
    "łódzkie": 240.0,
    "zachodniopomorskie": 220.0,
    "kujawsko-pomorskie": 210.0,
    "lubelskie": 200.0,
    "podkarpackie": 190.0,
    "podlaskie": 185.0,
    "opolskie": 180.0,
    "lubuskie": 180.0,
    "świętokrzyskie": 175.0,
    "warmińsko-mazurskie": 170.0,
}

# Mapowanie kodów TERYT (2 cyfry) na cenę
_TERYT_CODE_PRICES: Dict[str, float] = {
    "02": 320.0, "04": 210.0, "06": 200.0, "08": 180.0,
    "10": 240.0, "12": 350.0, "14": 450.0, "16": 180.0,
    "18": 190.0, "20": 185.0, "22": 280.0, "24": 260.0,
    "26": 175.0, "28": 170.0, "30": 300.0, "32": 220.0,
}

_BDL_BASE = "https://bdl.stat.gov.pl/api/v1"
_VAR_ARABLE = 455437   # Cena 1 m² gruntów ornych


class GUSClientFixed:
    """Klient GUS BDL z uproszczonym API dla PropertyAggregator."""

    def __init__(self, api_key: Optional[str] = None):
        self._headers = {"accept": "application/json"}
        if api_key:
            self._headers["X-ClientId"] = api_key

    async def fetch_market_price(self, voivodeship: str) -> Dict[str, Any]:
        """
        Pobierz szacunkową cenę rynkową gruntu dla województwa.

        Args:
            voivodeship: Nazwa województwa (np. "mazowieckie") lub 2-cyfrowy kod TERYT.

        Returns:
            {"ok": bool, "price_m2": Optional[float]}
        """
        voi = (voivodeship or "").lower().strip()

        # 1. Próba pobrania z BDL API
        try:
            price = await self._fetch_from_bdl(voi)
            if price is not None:
                return {"ok": True, "price_m2": price}
        except Exception as e:
            logger.warning("GUS BDL API failed: %s", e)

        # 2. Fallback: hardcoded regional averages
        price = self._fallback_price(voi)
        if price is not None:
            return {"ok": True, "price_m2": price}

        return {"ok": False, "price_m2": None}

    async def _fetch_from_bdl(self, voi: str) -> Optional[float]:
        """Próba pobrania danych z GUS BDL API."""
        teryt_6 = self._resolve_teryt(voi)
        if not teryt_6:
            return None

        unit_id = self._get_bdl_unit_id(teryt_6)
        if not unit_id:
            return None

        url = f"{_BDL_BASE}/Data/ByUnit/{unit_id}?var-id={_VAR_ARABLE}&last=1"
        response = requests.get(url, headers=self._headers, timeout=10)
        if response.status_code != 200:
            return None

        data = response.json()
        try:
            val = data["results"][0]["values"][0].get("val")
            return float(val) if val is not None else None
        except (KeyError, IndexError, TypeError, ValueError):
            return None

    def _get_bdl_unit_id(self, teryt: str) -> Optional[str]:
        """Pobierz ID jednostki BDL po kodzie TERYT."""
        try:
            url = f"{_BDL_BASE}/Units?name={teryt}&page-size=1"
            response = requests.get(url, headers=self._headers, timeout=5)
            if response.status_code == 200:
                results = response.json().get("results")
                if results:
                    return results[0].get("id")
        except Exception:
            pass
        return None

    def _resolve_teryt(self, voi: str) -> Optional[str]:
        """Zamień nazwę lub kod 2-cyfrowy na 6-cyfrowy kod TERYT województwa."""
        name_to_6 = {
            "dolnośląskie": "020000", "kujawsko-pomorskie": "040000",
            "lubelskie": "060000", "lubuskie": "080000",
            "łódzkie": "100000", "małopolskie": "120000",
            "mazowieckie": "140000", "opolskie": "160000",
            "podkarpackie": "180000", "podlaskie": "200000",
            "pomorskie": "220000", "śląskie": "240000",
            "świętokrzyskie": "260000", "warmińsko-mazurskie": "280000",
            "wielkopolskie": "300000", "zachodniopomorskie": "320000",
        }
        if voi in name_to_6:
            return name_to_6[voi]
        if voi.isdigit() and len(voi) == 2:
            return voi + "0000"
        return None

    def _fallback_price(self, voi: str) -> Optional[float]:
        """Zwróć cenę z hardcoded tabeli regionalnej."""
        if voi in _VOIVODESHIP_PRICES:
            return _VOIVODESHIP_PRICES[voi]
        if voi.isdigit() and len(voi) == 2 and voi in _TERYT_CODE_PRICES:
            return _TERYT_CODE_PRICES[voi]
        # Jeśli voi zaczyna się od 2-cyfrowego kodu TERYT
        if len(voi) >= 6 and voi[:2].isdigit() and voi[:2] in _TERYT_CODE_PRICES:
            return _TERYT_CODE_PRICES[voi[:2]]
        return 180.0  # ogólna wartość domyślna
