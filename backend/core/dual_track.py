"""
Layer 4: Dual-Track Valuation Engine — Spec v2.1
TOR A: Sądowy — 3 base claims + Claim 4 (scenarios)
TOR B: Negocjacyjny — Tor A × 1.56
Mnożnik 1.56 = TK P 10/16 (1.30) × dezorganizacja (1.20)
"""

import logging
from decimal import Decimal
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

TK_MULTIPLIER       = Decimal("1.30")
DEZORG_MULTIPLIER   = Decimal("1.20")
COMBINED_MULTIPLIER = TK_MULTIPLIER * DEZORG_MULTIPLIER  # 1.56
MAX_YEARS_BEZUMOWNE = 10  # przedawnienie


class DualTrackEngine:

    def calculate_track_a_judicial(
        self, data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        TOR A: SĄDOWY
        Claims: 1. Sluzebnosc, 2. Bezumowne, 3. Obnizenie, 4. Blokada (scenario dependent)
        """
        from app.core.coeffs import get_coeffs

        ps          = Decimal(str(data.get("ps", 0)))
        w11         = Decimal(str(data.get("w11", 0)))
        total_area  = Decimal(str(data.get("total_area", 0)))
        through_middle = data.get("through_middle", False)
        
        # Scenario 4: OCZYWISTE / OCZEKUJE_NA_WZ / WZ_ODMOWNE / NONE
        scenario_4 = data.get("scenario_4", "NONE")
        
        years_raw = data.get("years_bezumowne")
        flags = []
        
        if years_raw is None:
            years = 1
            flags.append("BRAK_DATY_WEJSCIA")
            logger.warning("Brak years_bezumowne, przyjęto 1")
        else:
            try:
                years_int = int(years_raw)
                years = min(years_int, MAX_YEARS_BEZUMOWNE)
                if years < 1:
                    years = 1
                    flags.append("BRAK_DATY_WEJSCIA")
                if years_int > 10:
                    flags.append("PRZEDAWNIENIE — przyjęto max 10 lat")
            except (ValueError, TypeError):
                years = 1
                flags.append("BRAK_DATY_WEJSCIA")

        # Współczynniki z coeffs.py
        infra_type = data.get("infra_type", "default")
        coeffs = get_coeffs(infra_type)
        S = Decimal(str(coeffs["S"]))
        k = Decimal(str(coeffs["k"]))
        R = Decimal(str(coeffs["R"]))
        u = Decimal(str(coeffs["u"]))

        # Wzór K (KSWS F4)
        if R == 0:
            logger.error("R_ZERO_FALLBACK")
            flags.append("R_ZERO_FALLBACK — K przyjęto 0.5")
            K = Decimal("0.5")
        elif abs(u - R) < Decimal("0.0001"):
            K = S + k * (Decimal("1") - S)
        else:
            K = (S * R + u * k * (Decimal("1") - S)) / R

        # ROSZCZENIE 1: Służebność przesyłu (WSP)
        wsp = ps * w11 * K

        # ROSZCZENIE 2: Bezumowne korzystanie (Wbk)
        wbk = ps * w11 * u * k * Decimal(str(years))

        # ROSZCZENIE 3: Obniżenie wartości nieruchomości (Obn)
        total_land_value = total_area * w11
        if through_middle:
            impact = coeffs["impact_judicial"]
            justification_impact = "linia przez środek działki (through_middle=true)"
        else:
            impact = coeffs["impact_minimal"]
            justification_impact = "linia z boku/po krawędzi (through_middle=false)"

        obn = total_land_value * impact

        # ROSZCZENIE 4: Blokada zabudowy
        blokada_kwota = total_area * w11
        include_blokada = False
        status_blokada = "INACTIVE"
        
        if scenario_4 == "OCZYWISTE" or scenario_4 == "WZ_ODMOWNE":
            include_blokada = True
            status_blokada = "AUTO"
        elif scenario_4 == "OCZEKUJE_NA_WZ":
            status_blokada = "PENDING"
            flags.append("ZAKTUALIZUJ PO OTRZYMANIU WZ")
        
        tor_a_bazowy = wsp + wbk + obn
        tor_a_z_blokada = tor_a_bazowy + blokada_kwota
        
        final_total_a = tor_a_z_blokada if include_blokada else tor_a_bazowy

        # Claims data for Section 9 formatting
        claims = {
            "sluzebnosc_przesylu": {
                "value": float(wsp),
                "formula": f"PS ({float(ps)}) × W11 ({float(w11)}) × K ({float(K):.4f})",
                "details": f"K = wzór KSWS F4 | infra_type: {infra_type} | S={float(S)}, k={float(k)}, R={float(R)}, u={float(u)}"
            },
            "bezumowne_korzystanie": {
                "value": float(wbk),
                "formula": f"PS ({float(ps)}) × W11 ({float(w11)}) × u ({float(u)}) × k ({float(k)}) × {years} lat",
                "details": f"Okres: {years} lat{' (PRZEDAWNIENIE)' if 'PRZEDAWNIENIE' in flags else ''}"
            },
            "obnizenie_wartosci": {
                "value": float(obn),
                "formula": f"total_area ({float(total_area)}) × W11 ({float(w11)}) × impact ({float(impact)})",
                "details": justification_impact
            },
            "blokada_zabudowy": {
                "value": float(blokada_kwota),
                "formula": f"total_area ({float(total_area)}) × W11 ({float(w11)})",
                "status": status_blokada,
                "scenario": scenario_4,
                "included": include_blokada
            }
        }

        # Ewentualne Claims (R7)
        grunt_type = data.get("grunt", "unknown")
        is_agricultural = grunt_type.lower() == "rolna"
        is_power_gas = any(x in infra_type.lower() for x in ["elektro", "gaz"])
        
        roszcz_5_val = ps * w11 * Decimal("0.10") if (is_agricultural and is_power_gas) else Decimal("0")
        
        immisje_val_manual = Decimal(str(data.get("immisje_val", 0)))
        requires_expert = infra_type == "elektro_WN"
        
        claims["ewentualne"] = {
            "blokada_automatyzacji_rolnej": {
                "value": float(roszcz_5_val),
                "active": (is_agricultural and is_power_gas),
                "formula": f"PS ({float(ps)}) × W11 ({float(w11)}) × 0.10",
                "trigger": f"grunt={grunt_type}, infra={infra_type}"
            },
            "immisje_pole_em": {
                "value": float(immisje_val_manual),
                "active": float(immisje_val_manual) > 0,
                "requires_expert": requires_expert,
                "note": "WYMAGA OPINII BIEGŁEGO — nie wliczaj bez dokumentu" if requires_expert else ""
            }
        }

        return {
            "track": "A",
            "track_name": "SĄDOWY",
            "confidence": 0.90,
            "claims": claims,
            "total_pln": float(final_total_a),
            "total_bez_blokady": float(tor_a_bazowy),
            "total_z_blokada": float(tor_a_z_blokada),
            "flags": flags,
            "params": {
                "infra_type": infra_type,
                "S": float(S), "k": float(k), "R": float(R), "u": float(u), "K": float(K),
                "years": years,
                "impact": float(impact),
                "through_middle": through_middle,
                "scenario_4": scenario_4
            }
        }

    def calculate_track_b_negotiation(
        self, judicial_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        TOR B: NEGOCJACYJNY
        Tor A × 1.56
        """
        judicial_total = Decimal(str(judicial_result["total_pln"]))
        tor_a_bez_blokady = Decimal(str(judicial_result["total_bez_blokady"]))
        tor_a_z_blokada = Decimal(str(judicial_result["total_z_blokada"]))

        return {
            "track": "B",
            "track_name": "NEGOCJACYJNY",
            "confidence": 0.70,
            "multiplier": float(COMBINED_MULTIPLIER),
            "total_pln": float(judicial_total * COMBINED_MULTIPLIER),
            "total_bez_blokady": float(tor_a_bez_blokady * COMBINED_MULTIPLIER),
            "total_z_blokada": float(tor_a_z_blokada * COMBINED_MULTIPLIER),
        }

    def calculate_both_tracks(self, data: Dict[str, Any]) -> Dict[str, Any]:
        track_a = self.calculate_track_a_judicial(data)
        track_b = self.calculate_track_b_negotiation(track_a)

        total_a = Decimal(str(track_a["total_pln"]))
        total_b = Decimal(str(track_b["total_pln"]))
        
        delta_pln = total_b - total_a
        delta_pct = (delta_pln / total_a * 100) if total_a > 0 else 0

        # Logika rekomendacji (R8)
        conf_score = data.get("confidence_score", "SREDNI")
        if conf_score == "NISKI":
            rekomendacja = "TOR_A"
        elif total_a > 0 and (total_b / total_a) > Decimal("1.80"):
            rekomendacja = "NEGOCJACJE_PRZED_SADEM"
        else:
            rekomendacja = "TOR_B"

        return {
            "track_a": track_a,
            "track_b": track_b,
            "comparison": {
                "delta_pln": float(delta_pln),
                "delta_pct": float(delta_pct),
                "rekomendacja": rekomendacja
            }
        }
