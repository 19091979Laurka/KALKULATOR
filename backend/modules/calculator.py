"""
Moduł: Wycena odszkodowawcza
- Pobiera ceny gruntu (RCN + fallback GUS)
- Oblicza WSP (służebność przesyłu) metodą KSWS F4/F5
- Dual track A (sądowy) / B (negocjacyjny)
"""
import logging
import asyncio
from decimal import Decimal
from typing import Dict, Any, Optional

from backend.integrations.rcn import RCNClient
from backend.integrations.gus import GUSClient
from backend.core.coeffs import get_coeffs
from backend.core.ksws_engine import KSWSEngine

logger = logging.getLogger(__name__)

_rcn = RCNClient()
_gus = GUSClient()

# Domyślne parametry finansowe
DEFAULT_R = Decimal("0.055")   # stopa kapitalizacji
DEFAULT_U = Decimal("0.060")   # relacja PDB
TRACK_B_MULTIPLIER = Decimal("1.56")  # TK P 10/16 × zakłócenia


async def _get_land_price(
    lon: float,
    lat: float,
    teryt: Optional[str],
    is_building: bool = True,
) -> Decimal:
    """Pobierz cenę 1m² — RCN (primary) → GUS (fallback)."""
    try:
        transactions = await _rcn.get_transactions(lon, lat, radius_km=5.0)
        if transactions:
            median = _rcn.calculate_median(transactions)
            if median and median > 0:
                logger.info(f"Cena z RCN: {median} PLN/m²")
                return median
    except Exception as e:
        logger.warning(f"RCN error: {e}")

    # Fallback GUS
    try:
        if teryt:
            woj = teryt[:2]
            pow_ = teryt[2:4]
            gmi = teryt[4:6]
            res = await _gus.fetch_market_price(woj, pow_, gmi)
            if res and res.get("price", 0) > 0:
                price = Decimal(str(res["price"]))
                logger.info(f"Cena z GUS: {price} PLN/m²")
                return price
    except Exception as e:
        logger.warning(f"GUS error: {e}")

    logger.warning("Fallback: domyślna cena 180 PLN/m²")
    return Decimal("180")


def _estimate_pas_m2(length_m: float, strefa_m: int) -> Decimal:
    """Powierzchnia pasa służebności = długość × szerokość strefy."""
    return Decimal(str(round(length_m * strefa_m, 1)))


async def calculate_valuation(
    lon: float,
    lat: float,
    area_m2: float,
    infra_type: str,
    infra_length_m: float,
    strefa_m: int,
    teryt: Optional[str] = None,
    years_unauthorized: int = 10,
) -> Dict[str, Any]:
    """
    Główna funkcja wyceny odszkodowawczej.
    """
    coeffs = get_coeffs(infra_type)
    S = Decimal(str(coeffs["S"]))
    k = Decimal(str(coeffs["k"]))
    R = DEFAULT_R
    u = DEFAULT_U

    W11 = await _get_land_price(lon, lat, teryt)
    PS = _estimate_pas_m2(infra_length_m, strefa_m)
    PN = Decimal(str(area_m2))
    WN = PN * W11

    # Wybór formuły: F5 gdy infrastruktura przechodzi przez środek lub PS > 30% PN
    use_f5 = (PN > 0) and (PS / PN > Decimal("0.30"))

    if use_f5:
        wsp_result = KSWSEngine.calculate_formula_5(WN, PN, PS, S, k, u, R)
    else:
        wsp_result = KSWSEngine.calculate_formula_4(PS, W11, S, k, R, u)

    WSP = Decimal(str(wsp_result["WSP"]))

    # Bezumowne korzystanie — sum over years
    wbk = Decimal("0")
    for i in range(min(years_unauthorized, 10)):
        year_w11 = W11 * (Decimal("1.03") ** i)  # uproszczona waloryzacja 3%/rok
        year_wbk = year_w11 * PS * u * k
        wbk += year_wbk

    # Obniżenie wartości nieruchomości
    impact = Decimal(str(coeffs.get("impact_judicial", 0.05)))
    obn = PN * W11 * impact

    # Tor A (sądowy)
    track_a_total = WSP + wbk + obn
    track_b_total = track_a_total * TRACK_B_MULTIPLIER

    return {
        "price_m2": float(W11),
        "price_source": "RCN/GUS",
        "pas_m2": float(PS),
        "property_value": float(WN),
        "formula": wsp_result.get("formula", "F4"),
        "track_a": {
            "wsp": round(float(WSP), 2),
            "wbk": round(float(wbk), 2),
            "obn": round(float(obn), 2),
            "total": round(float(track_a_total), 2),
            "years_unauthorized": min(years_unauthorized, 10),
        },
        "track_b": {
            "total": round(float(track_b_total), 2),
            "multiplier": float(TRACK_B_MULTIPLIER),
        },
        "coefficients": {
            "S": float(S),
            "k": float(k),
            "R": float(R),
            "u": float(u),
        },
    }
