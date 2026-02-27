import requests
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

class GUNBClient:
    """
    Główny Urząd Nadzoru Budowlanego (GUNB) API Client.
    Dostęp do Rejestru Wniosków, Decyzji i Zgłoszeń (RWDZ).
    """
    BASE_URL = "https://wyszukiwarka.gunb.gov.pl/api/v1"

    async def get_permits(self, teryt_unit: str, parcel_nr: str) -> List[Dict[str, Any]]:
        """
        Pobiera historię pozwoleń na budowę dla działki.
        teryt_unit: kod jednostki terytorialnej (np. 061802_2)
        parcel_nr: numer działki (np. 109)
        """
        # GUNB API często wymaga sformatowanego numeru działki
        # Wersja publiczna/scraperska lub oficjalna API v1
        params = {
            "jednostka": teryt_unit,
            "numer": parcel_nr,
        }
        try:
            # Uproszczony mock/wywołanie - w realnych warunkach wymaga klucza lub specyficznego nagłówka
            import asyncio
            loop = asyncio.get_event_loop()
            # UWAGA: Publiczne API GUNB zwraca listę wniosków
            # Endpoint: /wynik/dzialka
            url = f"{self.BASE_URL}/wynik/dzialka"
            response = await loop.run_in_executor(None, lambda: requests.get(url, params=params, timeout=10))
            if response.status_code == 200:
                data = response.json()
                return data.get("results", [])
        except Exception as e:
            logger.warning(f"GUNB API Error: {e}")
        return []
