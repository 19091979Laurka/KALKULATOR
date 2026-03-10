"""
Konfiguracja województw — mapowanie TERYT, portale, operatorzy, sądy.
Źródło: MAPA_DANYCH_ROZSZERZENIE.md
Używane do automatycznego wyboru integracji per województwo.
"""

from typing import Dict, Any, Optional

# TERYT 6-cyfrowy (województwo), portale geoportalów, operatorzy sieci, typ SUiKZ, sąd
VOIVODESHIPS_CONFIG: Dict[str, Dict[str, Any]] = {
    "dolnośląskie": {
        "teryt": "020000",
        "teryt_2": "02",
        "portal": "https://geoportal.dolnoslaskie.pl/",
        "operators": ["PGE", "Tauron"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy we Wrocławiu",
    },
    "kujawsko-pomorskie": {
        "teryt": "040000",
        "teryt_2": "04",
        "portal": "https://geoportal.kujawskopomorskie.pl/",
        "operators": ["PGE", "Energa"],
        "suikz_type": "PDF+scraping",
        "court": "Sąd Rejonowy w Bydgoszczy",
    },
    "lubelskie": {
        "teryt": "060000",
        "teryt_2": "06",
        "portal": "https://geoportal.lubelskie.pl/",
        "operators": ["PGE"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Lublinie",
    },
    "lubuskie": {
        "teryt": "080000",
        "teryt_2": "08",
        "portal": "https://geoportal.lubuskie.pl/",
        "operators": ["Energa"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Gorzowie Wielkopolskim",
    },
    "łódzkie": {
        "teryt": "100000",
        "teryt_2": "10",
        "portal": "https://geoportal.lodzkie.pl/",
        "operators": ["PGE", "Tauron"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Łodzi",
    },
    "małopolskie": {
        "teryt": "120000",
        "teryt_2": "12",
        "portal": "https://geoportal.malopolska.pl/",
        "operators": ["Tauron", "PGE"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Krakowie",
    },
    "mazowieckie": {
        "teryt": "140000",
        "teryt_2": "14",
        "portal": "https://geoportal.mazowieckie.pl/",
        "operators": ["PGE", "Stoen", "Tauron"],
        "suikz_type": "Mixed",
        "court": "Sąd Rejonowy w Warszawie / Piasecznie",
    },
    "opolskie": {
        "teryt": "160000",
        "teryt_2": "16",
        "portal": "https://geoportal.opolskie.pl/",
        "operators": ["Tauron"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Opolu",
    },
    "podkarpackie": {
        "teryt": "180000",
        "teryt_2": "18",
        "portal": "https://geoportal.podkarpackie.pl/",
        "operators": ["PGE", "Tauron"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Rzeszowie",
    },
    "podlaskie": {
        "teryt": "200000",
        "teryt_2": "20",
        "portal": "https://geoportal.podlaskie.pl/",
        "operators": ["Energa"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Białymstoku",
    },
    "pomorskie": {
        "teryt": "220000",
        "teryt_2": "22",
        "portal": "https://geoportal.pomorskie.pl/",
        "operators": ["Energa", "PGE"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Gdańsku",
    },
    "śląskie": {
        "teryt": "240000",
        "teryt_2": "24",
        "portal": "https://geoportal.slaskie.pl/",
        "operators": ["Tauron", "PGE"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Katowicach",
    },
    "świętokrzyskie": {
        "teryt": "260000",
        "teryt_2": "26",
        "portal": "https://geoportal.swietokrzyskie.pl/",
        "operators": ["Tauron"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Kielcach",
    },
    "warmińsko-mazurskie": {
        "teryt": "280000",
        "teryt_2": "28",
        "portal": "https://geoportal.warmia.mazury.pl/",
        "operators": ["Energa"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Olsztynie",
    },
    "wielkopolskie": {
        "teryt": "300000",
        "teryt_2": "30",
        "portal": "https://geoportal.wielkopolskie.pl/",
        "operators": ["PGE", "Energa"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Poznaniu",
    },
    "zachodniopomorskie": {
        "teryt": "320000",
        "teryt_2": "32",
        "portal": "https://geoportal.zachodniopomorskie.pl/",
        "operators": ["Energa"],
        "suikz_type": "REST API",
        "court": "Sąd Rejonowy w Szczecinie",
    },
}


def get_config(voivodeship: str) -> Optional[Dict[str, Any]]:
    """Pobierz konfigurację dla województwa (nazwa lub kod TERYT 2-cyfrowy)."""
    voi = (voivodeship or "").lower().strip()
    if voi in VOIVODESHIPS_CONFIG:
        return VOIVODESHIPS_CONFIG[voi]
    # Mapowanie kodu TERYT na nazwę
    teryt_to_name = {c["teryt_2"]: name for name, c in VOIVODESHIPS_CONFIG.items() if "teryt_2" in c}
    if voi.isdigit() and len(voi) == 2 and voi in teryt_to_name:
        return VOIVODESHIPS_CONFIG[teryt_to_name[voi]]
    if len(voi) >= 2 and voi[:2].isdigit() and voi[:2] in teryt_to_name:
        return VOIVODESHIPS_CONFIG[teryt_to_name[voi[:2]]]
    return None


def get_teryt(voivodeship: str) -> Optional[str]:
    """Zwróć 6-cyfrowy kod TERYT województwa."""
    cfg = get_config(voivodeship)
    return cfg.get("teryt") if cfg else None


def get_operators(voivodeship: str) -> list:
    """Zwróć listę operatorów sieci dystrybucyjnej w województwie."""
    cfg = get_config(voivodeship)
    return cfg.get("operators", []) if cfg else []
