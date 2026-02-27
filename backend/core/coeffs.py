from decimal import Decimal

# Współczynniki KSWS - empiryczne
# Źródło: orzecznictwo SN 2024/2025, opinie biegłych rzeczoznawców,
# Standard KSWS-V.5
# S  = współczynnik obniżenia wartości w pasie służebności
# k  = współczynnik współkorzystania (uciążliwość dla właściciela)
# R  = stopa kapitalizacji (rynkowa stopa zwrotu z gruntu)
# u  = relacja PDB do wartości gruntu (pożytki z działki)
# impact_judicial = obniżenie wartości całej działki (wariant sądowy)
# impact_minimal  = obniżenie wartości całej działki (wariant minimalny)

KSWS_STANDARDS = {

    "elektro_WN": {          # Linie 110kV i wyżej
        "S": Decimal("0.250"),
        "k": Decimal("0.650"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.073"),
        "impact_minimal":  Decimal("0.030"),
    },

    "elektro_SN": {          # Linie 15-30kV
        "S": Decimal("0.200"),
        "k": Decimal("0.500"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.050"),
        "impact_minimal":  Decimal("0.020"),
    },

    "elektro_nN": {          # Linie niskiego napięcia do 1kV
        "S": Decimal("0.100"),
        "k": Decimal("0.400"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.025"),
        "impact_minimal":  Decimal("0.010"),
    },

    "gaz_wysokie": {         # Gazociągi wysokiego ciśnienia >1.6MPa
        "S": Decimal("0.350"),
        "k": Decimal("0.600"),
        "R": Decimal("0.0500"),
        "u": Decimal("0.0550"),
        "impact_judicial": Decimal("0.120"),
        "impact_minimal":  Decimal("0.050"),
    },

    "gaz_srednie": {         # Gazociągi średniego ciśnienia 0.4-1.6MPa
        "S": Decimal("0.250"),
        "k": Decimal("0.550"),
        "R": Decimal("0.0500"),
        "u": Decimal("0.0550"),
        "impact_judicial": Decimal("0.080"),
        "impact_minimal":  Decimal("0.035"),
    },

    "gaz_niskie": {          # Gazociągi niskiego ciśnienia <0.4MPa
        "S": Decimal("0.150"),
        "k": Decimal("0.450"),
        "R": Decimal("0.0500"),
        "u": Decimal("0.0550"),
        "impact_judicial": Decimal("0.040"),
        "impact_minimal":  Decimal("0.015"),
    },

    "teleko": {              # Sieci telekomunikacyjne, światłowody
        "S": Decimal("0.080"),
        "k": Decimal("0.350"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.020"),
        "impact_minimal":  Decimal("0.008"),
    },

    "wod_kan": {             # Wodociągi i kanalizacja
        "S": Decimal("0.180"),
        "k": Decimal("0.500"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.045"),
        "impact_minimal":  Decimal("0.018"),
    },

    "default": {             # Fallback - nieznany typ
        "S": Decimal("0.250"),
        "k": Decimal("0.500"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.073"),
        "impact_minimal":  Decimal("0.030"),
    },
}


def get_coeffs(infra_type: str = "default") -> dict:
    coeffs = KSWS_STANDARDS.get(infra_type)
    if coeffs is None:
        import logging
        logging.getLogger(__name__).warning(
            f"Nieznany infra_type='{infra_type}'. "
            f"Dostępne: {list(KSWS_STANDARDS.keys())}. "
            f"Używam 'default'."
        )
        return KSWS_STANDARDS["default"]
    return coeffs
