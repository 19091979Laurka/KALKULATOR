"""
ULDK client — re-export ULDKClientFixed + GetParcelByIdOrNr dla wyszukiwania po nazwie (np. "Raciąż 302/6").
"""
import logging
import requests
from typing import Optional, Dict

from backend.integrations.uldk_fixed import ULDKClientFixed

logger = logging.getLogger(__name__)


class ULDKClient(ULDKClientFixed):
    """Klient ULDK z obsługą GetParcelByIdOrNr (nazwa jednostki + numer działki)."""

    def get_parcel_by_id_or_nr(self, search_str: str, srid: str = "4326") -> Optional[Dict]:
        """
        Pobierz działkę po ID lub po nazwie jednostki + numerze (np. "Raciąż 302/6", "Baboszewo 74/4").
        Zwraca ten sam format co get_parcel_by_id (ok, geometry, teryt, voivodeship, county, commune, region, parcel).
        """
        params = {
            "request": "GetParcelByIdOrNr",
            "id": search_str,
            "result": "geom_wkt,teryt,voivodeship,county,commune,region,parcel",
            "srid": srid,
        }
        logger.info("ULDK GetParcelByIdOrNr request: id=%r srid=%s", search_str, srid)
        try:
            response = requests.get(self.BASE_URL, params=params, timeout=15)
            logger.info("ULDK GetParcelByIdOrNr response: status=%s len=%s", response.status_code, len(response.text or ""))
            response.raise_for_status()
            parsed = self._parse_response(response.text, None)
            if parsed and parsed.get("ok"):
                logger.info("ULDK GetParcelByIdOrNr OK: teryt=%s commune=%s", parsed.get("teryt"), parsed.get("commune"))
                return parsed
            logger.warning("ULDK GetParcelByIdOrNr no result: id=%r", search_str)
            return {
                "ok": False,
                "error": f"ULDK: no results for '{search_str}'",
                "source": "ULDK/GUGiK",
            }
        except Exception as e:
            logger.error("ULDK GetParcelByIdOrNr Error: %s", e)
            return {
                "ok": False,
                "error": str(e),
                "source": "ULDK/GUGiK",
            }
