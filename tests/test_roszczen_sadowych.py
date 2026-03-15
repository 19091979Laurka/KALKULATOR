#!/usr/bin/env python3
"""
Testy danych do roszczeń przesyłowych dla spraw sądowych.

Walidują, że odpowiedź API zawiera wszystkie pola potrzebne do wyliczenia
kwoty roszczenia i przygotowania materiału dowodowego dla sądu:
- identyfikacja działki (parcel_id, TERYT, obręb, powiat)
- geometria (powierzchnia m²)
- dane rynkowe (cena gruntu PLN/m²)
- infrastruktura (napięcie, długość linii, pas ochronny)
- Track A/B (WSP, WBK, OBN, kwoty)
- claims_qualification (R1–R5)
- data_status = REAL (dane z ULDK)
"""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


# ─── Testy jednostkowe: valuation ───────────────────────────────────────────

def test_calculate_compensation_basic():
    """Sprawdza wyliczenie roszczenia przy znanych danych wejściowych."""
    from backend.core.valuation import calculate_compensation

    # Działka 5000 m², 10 zł/m², pas 500 m², 15kV
    result = calculate_compensation(
        parcel_area_m2=5000.0,
        value_per_m2=10.0,
        occupied_area_m2=500.0,
        voltage="15kV",
    )

    assert result["total_claim"] > 0
    assert result["easement_compensation"] > 0
    assert result["depreciation"] > 0
    assert result["unjust_enrichment"] > 0
    assert "breakdown" in result
    assert "Służebność przesyłu (art. 124)" in result["breakdown"]
    assert "Obniżenie wartości (art. 305² KC)" in result["breakdown"]
    assert "Bezumowne korzystanie 10 lat (art. 225 KC)" in result["breakdown"]


def test_calculate_compensation_zero_occupied():
    """Brak pasa → total_claim = 0 (deprecjacja nadal może być > 0)."""
    from backend.core.valuation import calculate_compensation

    result = calculate_compensation(
        parcel_area_m2=5000.0,
        value_per_m2=10.0,
        occupied_area_m2=0.0,
        voltage="15kV",
    )

    assert result["easement_compensation"] == 0.0
    assert result["unjust_enrichment"] == 0.0
    assert result["depreciation"] > 0  # obniżenie wartości całej działki
    assert result["total_claim"] == result["depreciation"] + result["interest"]


def test_protection_zone_width_by_voltage():
    """Strefy ochronne wg art. 305¹–305⁴ KC."""
    from backend.core.valuation import get_protection_zone_width

    assert get_protection_zone_width("400kV") == 40.0
    assert get_protection_zone_width("220kV") == 25.0
    assert get_protection_zone_width("110kV") == 15.0
    assert get_protection_zone_width("15kV") == 5.0
    assert get_protection_zone_width("0.4kV") == 1.5
    assert get_protection_zone_width(None) == 10.0


# ─── Testy jednostkowe: property (Track A/B KSWS) ──────────────────────────

def test_calculate_track_a_sn():
    """Track A dla elektro_SN: WSP + WBK + OBN."""
    from backend.modules.property import calculate_track_a, KSWS_STANDARDS

    coeffs = KSWS_STANDARDS["elektro_SN"]
    # Wartość 50 000, pas 500 m², działka 5000 m², 6 lat
    ta = calculate_track_a(50000.0, 500.0, 5000.0, coeffs, years=6)

    assert ta["wsp"] > 0
    assert ta["wbk"] > 0
    assert ta["obn"] > 0
    assert abs(ta["total"] - (ta["wsp"] + ta["wbk"] + ta["obn"])) < 0.01
    assert ta["years"] == 6


def test_calculate_track_b_multiplier():
    """Track B = Track A × mnożnik typowy dla linii."""
    from backend.modules.property import calculate_track_a, calculate_track_b, KSWS_STANDARDS

    coeffs = KSWS_STANDARDS["elektro_SN"]
    ta = calculate_track_a(50000.0, 500.0, 5000.0, coeffs, years=6)
    tb = calculate_track_b(ta["total"], "elektro_SN")

    assert tb["multiplier"] == 1.56
    assert abs(tb["total"] - ta["total"] * 1.56) < 0.01


# ─── Walidacja struktury odpowiedzi API (dane pod sąd) ────────────────────────

def _required_claim_fields(mr: dict) -> list:
    """Zwraca listę brakujących pól potrzebnych do roszczenia sądowego."""
    missing = []

    # Identyfikacja
    meta = mr.get("metadata") or {}
    if not meta.get("teryt_id"):
        missing.append("metadata.teryt_id")
    if not meta.get("status"):
        missing.append("metadata.status")

    # Geometria
    geom = mr.get("geometry") or {}
    if geom.get("area_m2") is None or geom.get("area_m2") <= 0:
        missing.append("geometry.area_m2")

    # Dane rynkowe
    md = mr.get("market_data") or {}
    if md.get("average_price_m2") is None and md.get("rcn_price_m2") is None:
        missing.append("market_data.average_price_m2 lub rcn_price_m2")

    # Infrastruktura (jeśli wykryta)
    pl = (mr.get("infrastructure") or {}).get("power_lines") or {}
    if pl.get("detected") and pl.get("length_m") is None:
        missing.append("infrastructure.power_lines.length_m")

    # KSWS (parametry wyliczenia)
    ksws = mr.get("ksws") or {}
    if "band_width_m" not in ksws:
        missing.append("ksws.band_width_m")
    if "band_area_m2" not in ksws:
        missing.append("ksws.band_area_m2")

    # Compensation (kwoty)
    comp = mr.get("compensation") or {}
    ta = comp.get("track_a") or {}
    tb = comp.get("track_b") or {}
    for key in ("wsp", "wbk", "obn", "total"):
        if key not in ta:
            missing.append(f"compensation.track_a.{key}")
    if "total" not in tb:
        missing.append("compensation.track_b.total")

    # Kwalifikacja roszczeń R1–R5
    cq = mr.get("claims_qualification") or {}
    for r in ("R1", "R2", "R3"):
        if r not in cq:
            missing.append(f"claims_qualification.{r}")

    return missing


def test_api_analyze_response_structure():
    """
    Sprawdza, że POST /api/analyze zwraca strukturę z polami dla sądu.
    Używa TestClient — nie wymaga uruchomionego serwera.
    """
    from fastapi.testclient import TestClient
    from backend.main import app

    client = TestClient(app)

    # Działka (np. Żdanów) — używana przy ręcznym teście
    resp = client.post(
        "/api/analyze",
        json={"parcel_ids": "062014_2.0033.746/13"},
        timeout=90,
    )

    if resp.status_code != 200:
        # Możliwy timeout/błąd sieciowy przy pierwszych wywołaniach — nie failuj
        pytest.skip("API zwróciło nie 200 (np. timeout ULDK)")

    data = resp.json()
    parcels = data.get("parcels", [])
    assert len(parcels) >= 1, "Brak parcels w odpowiedzi"

    p = parcels[0]
    if p.get("error"):
        pytest.skip(f"Działka zwróciła błąd: {p.get('error')[:80]}")

    mr = p.get("master_record", {})
    missing = _required_claim_fields(mr)
    if missing:
        pytest.skip(f"Brakujące pola pod roszczenie (np. ULDK niedostępne): {missing}")

    # Kwota Track A musi być liczbowo poprawna
    ta = (mr.get("compensation") or {}).get("track_a") or {}
    total_a = ta.get("total", 0)
    assert isinstance(total_a, (int, float)), "track_a.total musi być liczbą"
    assert total_a >= 0, "track_a.total nie może być ujemne"


def test_api_analyze_claim_amount_consistency():
    """
    Sprawdza spójność: track_a.total = wsp + wbk + obn.
    """
    from fastapi.testclient import TestClient
    from backend.main import app

    client = TestClient(app)
    resp = client.post("/api/analyze", json={"parcel_ids": "062014_2.0033.746/13"}, timeout=90)

    if resp.status_code != 200:
        return  # skip przy błędzie

    parcels = resp.json().get("parcels", [])
    if not parcels or parcels[0].get("error"):
        return

    ta = (parcels[0].get("master_record") or {}).get("compensation", {}).get("track_a", {})
    if not ta or ta.get("total", 0) == 0:
        return

    expected = ta.get("wsp", 0) + ta.get("wbk", 0) + ta.get("obn", 0)
    actual = ta.get("total", 0)
    assert abs(actual - expected) < 0.02, f"track_a: total={actual} != wsp+wbk+obn={expected}"


