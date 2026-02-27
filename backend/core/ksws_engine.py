from decimal import Decimal
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


class KSWSEngine:

    @staticmethod
    def calculate_formula_4(
        PS: Decimal,    # powierzchnia pasa służebności [m²]
        W11: Decimal,   # wartość 1m² gruntu [PLN/m²]
        S: Decimal,     # współczynnik obniżenia wartości [0-1]
        k: Decimal,     # współczynnik współkorzystania [0-1]
        R: Decimal,     # stopa kapitalizacji
        u: Decimal,     # relacja PDB/wartość
    ) -> Dict[str, Any]:
        """
        Wzór KSWS F4: gdy urządzenie NIE wpływa na walory użytkowe.
        WSP = PS × W11 × K
        K = (S×R + u×k×(1-S)) / R
        """
        if R == 0:
            logger.warning("R=0 - fallback K=0.5")
            K = Decimal("0.5")
        elif abs(u - R) < Decimal("0.0001"):
            K = S + k * (Decimal("1") - S)
        else:
            K = (S * R + u * k * (Decimal("1") - S)) / R

        WSP = PS * W11 * K
        return {
            "WSP": float(WSP),
            "K": float(K),
            "formula": "F4",
            "params": {
                "PS": float(PS), "W11": float(W11),
                "S": float(S), "k": float(k),
                "R": float(R), "u": float(u),
            }
        }

    # ── UWAGA METODOLOGICZNA: Obliczanie R3 (obniżenie wartości) ──────────────
    # R3 = A_total × W11 × impact_judicial
    # A_total MUSI pochodzić z wyrysu z rejestru gruntów (RG/EGiB) — tylko użytki rolne.
    # NIE używaj sumy areałów per działka z ULDK (ULDK = pełna pow. ewidencyjna,
    # wlicza nieużytki, drogi wewn., rowy) → zawyżenie ~5–15% vs. RG.
    # Zweryfikowane empirycznie: sprawa Piłat/PGE — ULDK 45,22 ha vs RG 40,66 ha (Δ=4,56 ha).
    # Źródło: KSWS-V.5 §4.1; SN III CZP 104/11.
    # ─────────────────────────────────────────────────────────────────────────────
    @staticmethod
    def calculate_formula_5(
        WN: Decimal,    # wartość rynkowa całej nieruchomości [PLN]
        PN: Decimal,    # powierzchnia całej nieruchomości [m²]
        PS: Decimal,    # powierzchnia pasa służebności [m²]
        S: Decimal,
        k: Decimal,
        u: Decimal,
        R: Decimal,
    ) -> Dict[str, Any]:
        """
        Wzór KSWS F5: gdy urządzenie WPŁYWA na walory użytkowe.
        WSP = K1 × WN
        K1 = S + (PS × u × k × (1-S)) / (PN × R)
        """
        if R == 0 or PN == 0:
            logger.warning("R=0 lub PN=0 w F5 - fallback K1=S")
            K1 = S
        else:
            K1 = S + (PS * u * k * (Decimal("1") - S)) / (PN * R)

        WSP = K1 * WN
        return {
            "WSP": float(WSP),
            "K1": float(K1),
            "formula": "F5",
            "params": {
                "WN": float(WN), "PN": float(PN), "PS": float(PS),
                "S": float(S), "k": float(k),
                "R": float(R), "u": float(u),
            }
        }

    @staticmethod
    def calculate_non_contractual_use(
        W11_list: list,   # ceny m² dla każdego roku [Decimal]
        PSO: Decimal,     # powierzchnia strefy [m²]
        k: Decimal,
        u: Decimal,
        val_list: list,   # współczynniki waloryzacji dla każdego roku
    ) -> Dict[str, Any]:
        """
        Bezumowne korzystanie z waloryzacją roczną.
        Wbk = Σ(W11i × PSO × u × k × wi)
        """
        if len(W11_list) != len(val_list):
            raise ValueError(
                f"W11_list ({len(W11_list)}) i val_list ({len(val_list)}) "
                f"muszą mieć tę samą długość."
            )

        total = Decimal("0")
        yearly = []
        for i in range(len(W11_list)):
            roczna = W11_list[i] * PSO * u * k * val_list[i]
            total += roczna
            yearly.append(float(roczna))

        return {
            "Wbk": float(total),
            "years": len(W11_list),
            "yearly_breakdown": yearly,
            "formula": "Σ(W11i × PSO × u × k × wi)",
        }
