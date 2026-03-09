"""
Moduł: Kalkulacja Roszczeń Odszkodowawczych (Spec v3.0)
Wycena na podstawie art. 124, 305¹-305⁴ KC, art. 225 KC

Metodyka:
1. Służebność przesyłu (art. 124) = 20% wartości zajętego gruntu
2. Obniżenie wartości (art. 305²) = 5-12% całej działki (zależy od napięcia)
3. Bezumowne korzystanie (art. 225 KC) = 3% rocznie × 10 lat
4. Odsetki ustawowe = 2% od bezumownego korzystania
"""
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# PARAMETRY PRAWNE
EASEMENT_MULTIPLIER = 0.20  # Art. 124: 20% wartości zajętego gruntu
UNJUST_ENRICHMENT_YEARS = 10  # Art. 225 KC: 10 lat wstecz
UNJUST_ENRICHMENT_RATE = 0.03  # 3% rocznie z wartości służebności
INTEREST_RATE = 0.02  # Odsetki ustawowe: 2%

# STREFY OCHRONNE (m) - Art. 305¹-305⁴ KC
PROTECTION_ZONES = {
    '400kV': 40.0,
    '220kV': 25.0,
    '110kV': 15.0,
    '15kV': 5.0,
    '0.4kV': 1.5,
    # Fallback
    'default': 10.0
}

# STAWKI OBNIŻENIA WARTOŚCI (art. 305² KC)
# Zależy od napięcia linii energetycznej
DEPRECIATION_RATES = {
    '400kV': 0.12,   # 12% dla linii najwyższego napięcia
    '220kV': 0.10,   # 10%
    '110kV': 0.08,   # 8% dla średniego napięcia
    '15kV': 0.06,    # 6%
    '0.4kV': 0.05,   # 5% dla niskiego napięcia
    'default': 0.07  # 7% fallback
}


def get_protection_zone_width(voltage: Optional[str]) -> float:
    """
    Określa szerokość strefy ochronnej na podstawie napięcia.
    Źródło: Art. 305¹-305⁴ KC (obowiązująca interpretacja)
    """
    if not voltage:
        return PROTECTION_ZONES['default']

    # Znormalizuj: usuń spacje (но zachowaj format klucza: 400kV, nie 400KV)
    voltage_norm = (voltage or '').strip()
    return PROTECTION_ZONES.get(voltage_norm, PROTECTION_ZONES['default'])


def get_depreciation_rate(voltage: Optional[str]) -> float:
    """
    Określa stawkę obniżenia wartości nieruchomości.
    Im wyższe napięcie, tym większe obniżenie wartości działki.
    """
    if not voltage:
        return DEPRECIATION_RATES['default']

    # Znormalizuj: usuń spacje (zachowaj format klucza: 400kV, nie 400KV)
    voltage_norm = (voltage or '').strip()
    return DEPRECIATION_RATES.get(voltage_norm, DEPRECIATION_RATES['default'])


def calculate_compensation(
    parcel_area_m2: float,
    value_per_m2: float,
    occupied_area_m2: float,
    voltage: Optional[str] = None,
    years_of_use: int = UNJUST_ENRICHMENT_YEARS
) -> Dict[str, Any]:
    """
    Główna funkcja do obliczenia roszczenia odszkodowawczego.

    Args:
        parcel_area_m2: Całkowita powierzchnia działki [m²]
        value_per_m2: Jednostkowa wartość gruntu [PLN/m²]
        occupied_area_m2: Powierzchnia zajęta przez pas ochronny [m²]
        voltage: Napięcie linii (np. "400kV", "15kV")
        years_of_use: Liczba lat bezumownego korzystania (domyślnie 10)

    Returns:
        Dict z podpodziałem roszczeń i łączną kwotą
    """

    try:
        # Walidacja
        if parcel_area_m2 <= 0 or value_per_m2 <= 0:
            logger.warning(f"Nieprawidłowe dane: area={parcel_area_m2}, value={value_per_m2}")
            return {
                'occupied_value': 0.0,
                'easement_compensation': 0.0,
                'depreciation': 0.0,
                'unjust_enrichment': 0.0,
                'interest': 0.0,
                'total_claim': 0.0,
                'breakdown': {
                    'Służebność przesyłu (art. 124)': 0.0,
                    'Obniżenie wartości (art. 305² KC)': 0.0,
                    'Bezumowne korzystanie 10 lat (art. 225 KC)': 0.0,
                    'Odsetki': 0.0
                }
            }

        # 1. WARTOŚĆ ZAJĘTEGO GRUNTU
        # Tylko fragment działki zajęty pasem ochronnym
        occupied_area = min(occupied_area_m2, parcel_area_m2)  # Nie więcej niż cała działka
        occupied_value = occupied_area * value_per_m2

        # 2. SŁUŻEBNOŚĆ PRZESYŁU (art. 124 KC)
        # Zazwyczaj 20% wartości zajętego gruntu (KSWS-4)
        easement_compensation = occupied_value * EASEMENT_MULTIPLIER

        # 3. OBNIŻENIE WARTOŚCI CAŁEJ DZIAŁKI (art. 305² KC)
        # Działka traci wartość ze względu na:
        # - Ograniczenia użytkowania (nie można budować)
        # - Emisje (dla linii energetycznych - pola elektromagnetyczne)
        # - Brak prawa użytkowania (operator ma prawo dostępu)
        depreciation_rate = get_depreciation_rate(voltage)
        total_parcel_value = parcel_area_m2 * value_per_m2
        depreciation = total_parcel_value * depreciation_rate

        # 4. BEZUMOWNE KORZYSTANIE (art. 225 KC)
        # Operator korzystał bez umowy/odszkodowania przez wiele lat
        # Zasada: 3% rocznych z wartości służebności za każdy rok
        annual_enrichment = easement_compensation * UNJUST_ENRICHMENT_RATE
        unjust_enrichment = annual_enrichment * years_of_use

        # 5. ODSETKI USTAWOWE
        # Art. 481 KC: 2% rocznie od sumy bezumownego korzystania
        interest = unjust_enrichment * INTEREST_RATE

        # ŁĄCZNE ROSZCZENIE
        total_claim = easement_compensation + depreciation + unjust_enrichment + interest

        return {
            'occupied_value': round(occupied_value, 2),
            'easement_compensation': round(easement_compensation, 2),
            'depreciation': round(depreciation, 2),
            'unjust_enrichment': round(unjust_enrichment, 2),
            'interest': round(interest, 2),
            'total_claim': round(total_claim, 2),
            'breakdown': {
                'Służebność przesyłu (art. 124)': round(easement_compensation, 2),
                'Obniżenie wartości (art. 305² KC)': round(depreciation, 2),
                'Bezumowne korzystanie 10 lat (art. 225 KC)': round(unjust_enrichment, 2),
                'Odsetki': round(interest, 2)
            }
        }

    except Exception as e:
        logger.error(f"Błąd kalkulacji roszczeń: {e}")
        return {
            'occupied_value': 0.0,
            'easement_compensation': 0.0,
            'depreciation': 0.0,
            'unjust_enrichment': 0.0,
            'interest': 0.0,
            'total_claim': 0.0,
            'breakdown': {}
        }


def calculate_infrastructure_impact(
    infrastructure_list: list,
    parcel_area_m2: float,
    value_per_m2: float
) -> Dict[str, Any]:
    """
    Oblicza wpływ wszystkich linii infrastruktury na działkę.

    Args:
        infrastructure_list: Lista obiektów infrastruktury z terrain.py
        parcel_area_m2: Powierzchnia działki
        value_per_m2: Wartość jednostkowa

    Returns:
        Dict z sumą wpływów i szczegółami dla każdej linii
    """

    total_compensation = 0.0
    total_depreciation = 0.0
    claims_by_line = []

    try:
        for infra in infrastructure_list:
            # Ekstrahuj dane
            line_length = infra.get('properties', {}).get('length_m', 0)
            if line_length == 0 and 'length_m' in infra:
                line_length = infra['length_m']

            infra_type = infra.get('type', 'Unknown')
            voltage = infra.get('voltage', infra.get('properties', {}).get('voltage'))

            # Oblicz zajętą powierzchnię: długość × szerokość strefy ochronnej × 2
            zone_width = get_protection_zone_width(voltage)
            occupied_area = line_length * (zone_width * 2) if line_length > 0 else 0

            if occupied_area > 0:
                comp = calculate_compensation(
                    parcel_area_m2,
                    value_per_m2,
                    occupied_area,
                    voltage
                )

                total_compensation += comp['easement_compensation']
                total_depreciation += comp['depreciation']

                claims_by_line.append({
                    'type': infra_type,
                    'voltage': voltage,
                    'length_m': line_length,
                    'protection_zone_m': zone_width,
                    'occupied_area_m2': occupied_area,
                    'compensation': comp
                })

        return {
            'ok': True,
            'total_compensation': round(total_compensation, 2),
            'total_depreciation': round(total_depreciation, 2),
            'total_claim': round(total_compensation + total_depreciation, 2),
            'lines': claims_by_line,
            'count': len(claims_by_line)
        }

    except Exception as e:
        logger.error(f"Błąd obliczania wpływu infrastruktury: {e}")
        return {
            'ok': False,
            'error': str(e),
            'total_compensation': 0.0,
            'total_depreciation': 0.0,
            'total_claim': 0.0,
            'lines': [],
            'count': 0
        }
