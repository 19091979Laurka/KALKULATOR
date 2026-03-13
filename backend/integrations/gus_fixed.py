"""
GUSClientFixed — klient GUS BDL z podziałem na typ gruntu.
Ceny rolne (R, Ł, Ps) vs budowlane (B, Bi, Ba) są drastycznie różne.
Rolne mazowieckie: ~7-15 zł/m², Budowlane: ~300-500 zł/m².
"""
import asyncio
import logging
import requests
from typing import Dict, Optional, Any

logger = logging.getLogger(__name__)

# ============================================================
# CENY GRUNTÓW ROLNYCH (zł/m²) — GUS/ARiMR 2024
# Klasy: R, Ł (łąki), Ps (pastwiska), S (sady)
# Źródło: GUS "Ceny gruntów rolnych" BDL + ARiMR transakcje
# ============================================================
_AGRICULTURAL_PRICES: Dict[str, float] = {
    "mazowieckie": 6.50,
    "małopolskie": 12.00,
    "dolnośląskie": 10.50,
    "wielkopolskie": 11.00,
    "pomorskie": 9.50,
    "śląskie": 9.00,
    "łódzkie": 8.00,
    "zachodniopomorskie": 7.50,
    "kujawsko-pomorskie": 10.00,
    "lubelskie": 7.00,
    "podkarpackie": 6.50,
    "podlaskie": 6.00,
    "opolskie": 9.50,
    "lubuskie": 7.00,
    "świętokrzyskie": 6.50,
    "warmińsko-mazurskie": 6.00,
}

# ============================================================
# CENY GRUNTÓW BUDOWLANYCH (zł/m²) — RCN GUGiK 2024
# Klasy: B, Bi, Ba, Bp, zurbanizowane
# ============================================================
_BUILDING_PRICES: Dict[str, float] = {
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

# Kody TERYT 2-cyfrowe → cena rolna
_TERYT_AGRI_PRICES: Dict[str, float] = {
    "02": 10.50, "04": 10.00, "06": 7.00,  "08": 7.00,
    "10": 8.00,  "12": 12.00, "14": 6.50,  "16": 9.50,
    "18": 6.50,  "20": 6.00,  "22": 9.50,  "24": 9.00,
    "26": 6.50,  "28": 6.00,  "30": 11.00, "32": 7.50,
}

# Klasy użytku rolnego
_AGRICULTURAL_CLASSES = {"R", "Ł", "Ps", "S", "Lz", "W", "N"}

_BDL_BASE = "https://bdl.stat.gov.pl/api/v1"
_VAR_ARABLE = 4899    # ID zmiennej: Przeciętne ceny gruntów ornych ogółem [zł/ha] — P1460
_VAR_ARABLE_GOOD = 4902   # grunty dobre (pszenno-buraczane)
_VAR_ARABLE_MED  = 4905   # grunty średnie (żytnio-ziemniaczane)
_VAR_ARABLE_POOR = 4908   # grunty słabe (piaszczyste)


def is_agricultural(land_class: str) -> bool:
    """Sprawdza czy klasa OZK to grunt rolny."""
    if not land_class:
        return False
    # R, R I, R II, Ł III, Ps IV itp.
    prefix = land_class.strip()[:2].rstrip()
    return prefix in _AGRICULTURAL_CLASSES or land_class[0] in {"R", "Ł", "P", "S", "L", "W", "N"}


class GUSClientFixed:
    """Klient GUS BDL z obsługą typu gruntu (rolny/budowlany)."""

    def __init__(self, api_key: Optional[str] = None):
        self._headers = {"accept": "application/json"}
        if api_key:
            self._headers["X-ClientId"] = api_key

    async def fetch_market_price(
        self,
        voivodeship: str,
        land_class: Optional[str] = None,
        use_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Pobierz cenę rynkową gruntu z uwzględnieniem klasy użytku.

        Args:
            voivodeship: Nazwa lub kod TERYT województwa
            land_class:  Klasa OZK np. "R", "R II", "Ł III", "B", "Bi"
            use_type:    Typ użytku: "agricultural" | "building" | None (auto)
        """
        voi = (voivodeship or "").lower().strip()

        # Determine grunt type
        if use_type == "agricultural":
            agri = True
        elif use_type == "building":
            agri = False
        elif land_class:
            agri = is_agricultural(land_class)
        else:
            # default: assume rolny (bezpieczniejszy fallback dla kalkulatora)
            agri = True

        # 1. Próba BDL API (tylko dla rolnych — ma te dane)
        if agri:
            try:
                price = await self._fetch_agri_from_bdl(voi)
                if price is not None:
                    return {
                        "ok": True,
                        "price_m2": price,
                        "land_type": "agricultural",
                        "source": "GUS BDL",
                    }
            except Exception as e:
                logger.warning("GUS BDL API failed: %s", e)

        # 2. Fallback z tabel regionalnych
        price = self._fallback_price(voi, agri)
        return {
            "ok": price is not None,
            "price_m2": price,
            "land_type": "agricultural" if agri else "building",
            "source": "GUS tabela regionalna (fallback)",
        }

    async def _fetch_agri_from_bdl(self, voi: str) -> Optional[float]:
        """Pobiera cenę gruntów ornych z GUS BDL API (non-blocking — thread executor)."""
        # Synchroniczne requests.get() uruchamiane w wątku aby nie blokować event loop.
        return await asyncio.to_thread(self._fetch_agri_sync, voi)

    def _fetch_agri_sync(self, voi: str) -> Optional[float]:
        """Synchroniczna implementacja pobierania ceny BDL — uruchamiana w thread."""
        teryt_6 = self._resolve_teryt(voi)
        if not teryt_6:
            return None
        unit_id = self._get_bdl_unit_id(teryt_6)
        if not unit_id:
            return None
        # Poprawny endpoint: data/by-unit/{id}?var-Id={var}&last=1
        url = f"{_BDL_BASE}/data/by-unit/{unit_id}?var-Id={_VAR_ARABLE}&last=1"
        try:
            response = requests.get(url, headers=self._headers, timeout=10)
            if response.status_code != 200:
                return None
            data = response.json()
            # Wyniki: results[0].values — posortowane od najstarszego; bierzemy ostatni
            values = data["results"][0].get("values", [])
            if not values:
                return None
            last_val = values[-1].get("val")  # najnowszy rok
            if last_val is not None:
                # BDL zwraca ceny w zł/ha — przelicz na zł/m²
                return round(float(last_val) / 10000.0, 4)
        except (KeyError, IndexError, TypeError, ValueError, Exception) as e:
            logger.warning("BDL fetch_agri_sync error: %s", e)
        return None

    # Stała tabela BDL unit ID dla województw (poziom 2) — pobrana z API
    _BDL_VOIV_IDS: Dict[str, str] = {
        "020000": "030200000000",  # dolnośląskie
        "040000": "040400000000",  # kujawsko-pomorskie
        "060000": "060600000000",  # lubelskie
        "080000": "020800000000",  # lubuskie
        "100000": "051000000000",  # łódzkie
        "120000": "011200000000",  # małopolskie
        "140000": "071400000000",  # mazowieckie
        "160000": "031600000000",  # opolskie
        "180000": "061800000000",  # podkarpackie
        "200000": "062000000000",  # podlaskie
        "220000": "042200000000",  # pomorskie
        "240000": "012400000000",  # śląskie
        "260000": "052600000000",  # świętokrzyskie
        "280000": "042800000000",  # warmińsko-mazurskie
        "300000": "023000000000",  # wielkopolskie
        "320000": "023200000000",  # zachodniopomorskie
    }

    def _get_bdl_unit_id(self, teryt: str) -> Optional[str]:
        """Zwróć ID jednostki BDL dla kodu TERYT województwa (6 cyfr)."""
        return self._BDL_VOIV_IDS.get(teryt)

    def _resolve_teryt(self, voi: str) -> Optional[str]:
        """Zamień nazwę lub kod na 6-cyfrowy kod TERYT województwa."""
        name_to_6 = {
            "dolnośląskie": "020000",
            "kujawsko-pomorskie": "040000",
            "lubelskie": "060000",
            "lubuskie": "080000",
            "łódzkie": "100000",
            "małopolskie": "120000",
            "mazowieckie": "140000",
            "opolskie": "160000",
            "podkarpackie": "180000",
            "podlaskie": "200000",
            "pomorskie": "220000",
            "śląskie": "240000",
            "świętokrzyskie": "260000",
            "warmińsko-mazurskie": "280000",
            "wielkopolskie": "300000",
            "zachodniopomorskie": "320000",
        }
        if voi in name_to_6:
            return name_to_6[voi]
        if voi.isdigit() and len(voi) == 2:
            return voi + "0000"
        return None

    # GUS BDL var 410772: Produkcja globalna rolnicza na 1 ha UR [zł/ha] — dane 2023
    # Źródło: BDL GUS, Produkcja rolnicza (P2309), nowa definicja gosp. rolnego
    _AGRI_PRODUCTION_PER_HA: Dict[str, int] = {
        "dolnośląskie": 9391,
        "kujawsko-pomorskie": 18778,
        "lubelskie": 13497,
        "lubuskie": 9194,
        "łódzkie": 22090,
        "małopolskie": 18313,
        "mazowieckie": 21419,
        "opolskie": 13313,
        "podkarpackie": 8611,
        "podlaskie": 14796,
        "pomorskie": 13088,
        "śląskie": 27076,
        "świętokrzyskie": 19210,
        "warmińsko-mazurskie": 10983,
        "wielkopolskie": 21056,
        "zachodniopomorskie": 10011,
    }

    def get_agri_production_per_ha(self, voivodeship: str) -> float:
        """Zwraca globalną produkcję rolniczą na 1 ha UR [zł/ha/rok] wg województwa (GUS 2023)."""
        voi = (voivodeship or "").lower().strip()
        return float(self._AGRI_PRODUCTION_PER_HA.get(voi, 12000))  # ~12k PLN/ha fallback

    def _fallback_price(self, voi: str, agricultural: bool = True) -> Optional[float]:
        """Zwróć cenę z tabel regionalnych."""
        price_table = _AGRICULTURAL_PRICES if agricultural else _BUILDING_PRICES
        teryt_table = _TERYT_AGRI_PRICES if agricultural else {}

        if voi in price_table:
            return price_table[voi]
        if voi.isdigit() and len(voi) == 2 and voi in teryt_table:
            return teryt_table[voi]
        if len(voi) >= 6 and voi[:2].isdigit() and voi[:2] in teryt_table:
            return teryt_table[voi[:2]]
        # Ogólny fallback
        return 7.50 if agricultural else 200.0
