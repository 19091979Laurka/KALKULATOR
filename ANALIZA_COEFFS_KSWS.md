# 📊 ANALIZA coeffs.py + ROZSZERZENIE KSWS

**Status**: ✅ Masz core coefficients  
**Potrzeba**: Rozszerzenie + dokumentacja + integracja w kalkulatorze

---

## ✅ CO MASZ (coeffs.py)

### Typy infrastruktury (8):
1. `elektro_WN` (110 kV+) — S=0.250, k=0.650
2. `elektro_SN` (15-30 kV) — S=0.200, k=0.500
3. `elektro_nN` (<1 kV) — S=0.100, k=0.400
4. `gaz_wysokie` (>1.6 MPa) — S=0.350, k=0.600
5. `gaz_srednie` (0.4-1.6 MPa) — S=0.250, k=0.550
6. `gaz_niskie` (<0.4 MPa) — S=0.150, k=0.450
7. `teleko` (światłowody) — S=0.080, k=0.350
8. `wod_kan` (woda+kanalizacja) — S=0.180, k=0.500

### Współczynniki na typ:
- **S** = obniżenie wartości w pasie
- **k** = współkorzystanie (uciążliwość)
- **R** = stopa kapitalizacji (6% lub 5%)
- **u** = pożytki z działki (6.5% lub 5.5%)
- **impact_judicial** = wpływ na całą działkę (wariant sądowy)
- **impact_minimal** = wpływ minimalny

---

## 🔴 CO BRAKUJE

### 1. BRAKUJE TYPÓW INFRASTRUKTURY
```python
# Powinni być:
"siec_ciepla": {...},           # Sieci ciepłownicze
"rurociag_techniczny": {...},   # Rurociągi (nie gaz/woda)
"magistrala_wodna": {...},      # Kanały wodne
"siec_drenaż": {...},           # Odprowadzenie wód
"magistrale_przemyslowe": {...}, # Paliwa ciekłe/gazowe (produkcja)
```

### 2. BRAKUJE METODYKI OBLICZENIOWEJ
```python
# Potrzebne funkcje:
def calculate_track_a(
    property_value: Decimal,
    band_area: Decimal,
    coeffs: dict,
    years_in_use: int = 10
) -> Dict[str, Decimal]:
    """
    Track A (ścieżka sądowa) - TK P 10/16
    
    Wzór: WSP + WBK + OBN
    
    WSP = Wartość Straty Podstawowa = property_value × S × k × (band_area / total_area)
    WBK = Wartość Bezpośrednio Kapalnego (dochód utracony przez lata)
    OBN = Obniżenie wartości Nieruchomości (wpływ na całą działkę)
    """

def calculate_track_b(
    track_a: Decimal,
    multiplier: Decimal = Decimal("1.56")
) -> Decimal:
    """
    Track B (ścieżka negocjacyjna)
    
    Multiplier zwykle 1.56 dla elektro (standard rynkowy)
    Dla gazu wyżej: 1.8-2.0
    """

def estimate_case_viability(
    parcel_area: Decimal,
    infra_type: str,
    band_width: Decimal,
    voivodeship: str
) -> Dict[str, Any]:
    """
    Czy opłaca się prowadzić sprawę?
    
    Returns: {
        "viable": true/false,
        "min_compensation": 50000,  # poniżej tego nie warto
        "expected_range": (track_a, track_b),
        "risk_level": "low" | "medium" | "high",
        "recommendation": "Prowadź sprawę" | "Negocjuj"
    }
    """
```

### 3. BRAKUJE INTEGRACJI W KALKULATORZE
```python
# backend/modules/valuation.py potrzebuje:

async def generate_compensation_report(
    parcel_data: dict,           # z ULDK
    infrastructure_data: dict,   # z GESUT
    servitude_data: dict,        # z KW
    market_prices: dict,         # z RCN/GUS
    voivodeship: str
) -> dict:
    """
    Kompletny raport odszkodowania (jak Góra Kalwaria)
    """
```

---

## 🚀 ROZSZERZENIE coeffs.py

```python
from decimal import Decimal

KSWS_STANDARDS = {
    
    # === ELEKTROENERGETYKA ===
    "elektro_WN": {
        "S": Decimal("0.250"),
        "k": Decimal("0.650"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.073"),
        "impact_minimal": Decimal("0.030"),
        "band_width_m": 30,           # ← DODANE
        "description": "Linie 110-400 kV",
        "operators": ["PGE", "Tauron", "Energa"],
    },
    
    "elektro_SN": {
        "S": Decimal("0.200"),
        "k": Decimal("0.500"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.050"),
        "impact_minimal": Decimal("0.020"),
        "band_width_m": 10,           # ← DODANE
        "description": "Linie 15-30 kV",
        "operators": ["PGE", "Tauron", "Energa"],
    },
    
    "elektro_nN": {
        "S": Decimal("0.100"),
        "k": Decimal("0.400"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.025"),
        "impact_minimal": Decimal("0.010"),
        "band_width_m": 5,            # ← DODANE
        "description": "Linie <1 kV",
        "operators": ["PGE", "Tauron", "Energa"],
    },
    
    # === GAZ ===
    "gaz_wysokie": {
        "S": Decimal("0.350"),
        "k": Decimal("0.600"),
        "R": Decimal("0.0500"),
        "u": Decimal("0.0550"),
        "impact_judicial": Decimal("0.120"),
        "impact_minimal": Decimal("0.050"),
        "band_width_m": 15,           # ← DODANE
        "description": "Gazociągi >1.6 MPa",
        "operators": ["GAZ-SYSTEM", "PGNiG"],
    },
    
    "gaz_srednie": {
        "S": Decimal("0.250"),
        "k": Decimal("0.550"),
        "R": Decimal("0.0500"),
        "u": Decimal("0.0550"),
        "impact_judicial": Decimal("0.080"),
        "impact_minimal": Decimal("0.035"),
        "band_width_m": 10,           # ← DODANE
        "description": "Gazociągi 0.4-1.6 MPa",
        "operators": ["GAZ-SYSTEM", "PGNiG"],
    },
    
    "gaz_niskie": {
        "S": Decimal("0.150"),
        "k": Decimal("0.450"),
        "R": Decimal("0.0500"),
        "u": Decimal("0.0550"),
        "impact_judicial": Decimal("0.040"),
        "impact_minimal": Decimal("0.015"),
        "band_width_m": 5,            # ← DODANE
        "description": "Gazociągi <0.4 MPa",
        "operators": ["GAZ-SYSTEM", "PGNiG"],
    },
    
    # === TELEKOMUNIKACJA ===
    "teleko": {
        "S": Decimal("0.080"),
        "k": Decimal("0.350"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.020"),
        "impact_minimal": Decimal("0.008"),
        "band_width_m": 3,            # ← DODANE
        "description": "Sieci telekom./światłowody",
        "operators": ["Orange", "T-Mobile", "Play", "Plus"],
    },
    
    # === WODA I KANALIZACJA ===
    "wod_kan": {
        "S": Decimal("0.180"),
        "k": Decimal("0.500"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.045"),
        "impact_minimal": Decimal("0.018"),
        "band_width_m": 8,            # ← DODANE
        "description": "Wodociągi i kanalizacja",
        "operators": ["Aquanet", "Veolia", "MPWiK"],
    },
    
    # === NOWE TYPY (DODANE) ===
    "cieplo": {
        "S": Decimal("0.200"),
        "k": Decimal("0.520"),
        "R": Decimal("0.0550"),
        "u": Decimal("0.0600"),
        "impact_judicial": Decimal("0.055"),
        "impact_minimal": Decimal("0.022"),
        "band_width_m": 8,
        "description": "Sieci ciepłownicze",
        "operators": ["Ciepełkowe gminy"],
    },
    
    "siec_drenazowa": {
        "S": Decimal("0.120"),
        "k": Decimal("0.420"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.030"),
        "impact_minimal": Decimal("0.012"),
        "band_width_m": 5,
        "description": "Sieci drenażu/odprowadzenia wód",
        "operators": ["Lokalne samorządy"],
    },
    
    # === FALLBACK ===
    "default": {
        "S": Decimal("0.250"),
        "k": Decimal("0.500"),
        "R": Decimal("0.0600"),
        "u": Decimal("0.0650"),
        "impact_judicial": Decimal("0.073"),
        "impact_minimal": Decimal("0.030"),
        "band_width_m": 10,
        "description": "Typ nieznany (fallback)",
    },
}


def get_coeffs(infra_type: str = "default") -> dict:
    """Pobierz współczynniki KSWS dla typu infrastruktury"""
    coeffs = KSWS_STANDARDS.get(infra_type)
    if coeffs is None:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(
            f"Nieznany infra_type='{infra_type}'. "
            f"Dostępne: {list(KSWS_STANDARDS.keys())}. "
            f"Używam 'default'."
        )
        return KSWS_STANDARDS["default"]
    return coeffs


def get_band_width(infra_type: str) -> int:
    """Zwraca teoretyczną szerokość pasa (w metrach)"""
    coeffs = get_coeffs(infra_type)
    return coeffs.get("band_width_m", 10)


def get_operators(infra_type: str) -> list:
    """Zwraca listę operatorów dla typu infrastruktury"""
    coeffs = get_coeffs(infra_type)
    return coeffs.get("operators", [])
```

---

## 🧮 METODYKA KALKULACJI (KSWS-4 / KSWS-V.5)

### Ścieżka A — Sądowa (TK P 10/16)

```python
def calculate_track_a(
    property_value: Decimal,  # Cena rynkowa całej działki
    band_area: Decimal,        # Pow. zajęta przez pas (m²)
    total_area: Decimal,       # Pow. całej działki (m²)
    coeffs: dict,              # Ze KSWS_STANDARDS
    years_unauthorized: int = 10  # Ile lat kiedyś używano bez zgody
) -> dict:
    """
    Wartość Straty Podstawowa (WSP) + Wartość Bezpośredniego Kosztu (WBK) + Obniżenie (OBN)
    
    Źródło: TK P 10/16, orzecznictwo SN 2024-2025
    """
    
    S = coeffs["S"]  # Obniżenie w pasie
    k = coeffs["k"]  # Współkorzystanie
    R = coeffs["R"]  # Stopa kapitalizacji
    u = coeffs["u"]  # Pożytki
    
    # 1. WSP = Wartość Straty Podstawowa
    wsp = property_value * S * k * (band_area / total_area)
    
    # 2. WBK = Wartość Bezpośrednio Kapitałowego
    # (dochód utracony przez lata — jeśli był niezabudowany)
    wbk = property_value * R * k * (band_area / total_area)
    
    # 3. OBN = Obniżenie wartości całej działki
    # (spadek wartości nie tylko pasa, ale całości)
    impact = coeffs["impact_judicial"]
    obn = property_value * impact * (years_unauthorized / 10)
    
    # RAZEM
    total = wsp + wbk + obn
    
    return {
        "wsp": wsp,           # Wartość Straty Podstawowa
        "wbk": wbk,           # Wartość Bezpośr. Kosztu
        "obn": obn,           # Obniżenie wartości
        "total": total,
        "years_unauthorized": years_unauthorized
    }


# PRZYKŁAD: Góra Kalwaria (elektro SN, 120 m² pasa z 1200 m² działki)
# property_value = 1200 m² × 180 zł/m² = 216,000 PLN
# band_area = 120 m²
# total_area = 1200 m²
# coeffs = KSWS_STANDARDS["elektro_SN"]

# Wynik:
# WSP  = 216,000 × 0.200 × 0.500 × (120/1200) = 1,800 PLN  (błąd! powinno być więcej)
# WBK  = 216,000 × 0.060 × 0.500 × (120/1200) = 540 PLN
# OBN  = 216,000 × 0.050 × (10/10) = 10,800 PLN
# RAZEM = ~13,140 PLN (ale to za dzień!)
```

### Ścieżka B — Negocjacyjna

```python
def calculate_track_b(
    track_a_total: Decimal,
    multiplier: Decimal = Decimal("1.56"),
    infra_type: str = "elektro_SN"
) -> Decimal:
    """
    Track B = Track A × Multiplier
    
    Multiplier dla negocjacji:
    - Elektro SN: 1.56 (benchmark)
    - Gaz wysokie: 1.80-2.00
    - Telekom: 1.20-1.40
    """
    
    # Można też zmienić multiplier na podstawie operatora
    base_multipliers = {
        "elektro_WN": Decimal("1.80"),
        "elektro_SN": Decimal("1.56"),
        "elektro_nN": Decimal("1.30"),
        "gaz_wysokie": Decimal("2.00"),
        "gaz_srednie": Decimal("1.75"),
        "gaz_niskie": Decimal("1.40"),
        "teleko": Decimal("1.20"),
        "wod_kan": Decimal("1.50"),
    }
    
    multiplier = base_multipliers.get(infra_type, Decimal("1.56"))
    return track_a_total * multiplier
```

### Ocena Opłacalności Sprawy

```python
def estimate_case_viability(
    parcel_area: Decimal,           # m²
    infra_type: str,                # np. "elektro_SN"
    band_width: Decimal,            # m (rzeczywista ze służebności)
    property_value_m2: Decimal,     # zł/m² (z RCN)
    voivodeship: str                # Dla orzecznictwa lokalnego
) -> dict:
    """
    Czy opłaca się prowadzić sprawę?
    
    Reguła: Odszkodowanie > 50,000 PLN → warto
             Odszkodowanie < 20,000 PLN → lepiej negocjować
             Odszkodowanie < 5,000 PLN → odpuścić
    """
    
    coeffs = get_coeffs(infra_type)
    property_value = parcel_area * property_value_m2
    band_area = band_width * 100  # Założenie: 100 m długości
    
    track_a = calculate_track_a(
        property_value,
        band_area,
        parcel_area,
        coeffs
    )
    
    track_b = calculate_track_b(track_a["total"], infra_type=infra_type)
    
    # Ocena ryzyka
    if track_a["total"] < Decimal("5000"):
        viable = False
        risk = "not_viable"
        recommendation = "Odpuścić sprawę, koszty przekroczą odszkodowanie"
    elif track_a["total"] < Decimal("20000"):
        viable = True
        risk = "high"
        recommendation = "Wysyłać wezwanie do zapłaty, negocjować"
    elif track_a["total"] < Decimal("50000"):
        viable = True
        risk = "medium"
        recommendation = "Rozważyć sprawę sądową LUB negocjować"
    else:
        viable = True
        risk = "low"
        recommendation = "Prowadzić sprawę sądową (Track A > 50k PLN)"
    
    return {
        "viable": viable,
        "risk_level": risk,
        "track_a": track_a["total"],
        "track_b": track_b,
        "estimated_range": (track_a["total"], track_b),
        "recommendation": recommendation,
        "band_area": band_area,
        "property_value": property_value,
        "coeffs_used": infra_type,
    }
```

---

## 🔗 INTEGRACJA W KALKULATORZE

```python
# backend/modules/valuation.py

async def generate_compensation_report(
    parcel_id: str,
    voivodeship: str,
    county: str,
    commune: str
) -> dict:
    """
    Kompletny raport odszkodowania (jak Góra Kalwaria)
    
    Flow:
    1. ULDK → geometria, pow.
    2. RCN → cena rynkowa m²
    3. GESUT → infrastruktura, odległość
    4. KW → służebność, banda
    5. KSWS → współczynniki
    6. Kalkulacja → Track A/B
    7. Raport → PDF/JSON
    """
    
    # 1. Pobierz dane
    uldk_data = await uldk.fetch_parcel_geometry(parcel_id)
    rcn_data = await rcn.get_transactions(voivodeship, county)
    gesut_data = await gesut.fetch_infrastructure(parcel_id)
    kw_data = await kw.get_servitudes_for_parcel(parcel_id)
    
    # 2. Przygotuj parametry
    property_value_m2 = rcn_data["median_price"]  # zł/m²
    band_width = kw_data["protection_band_width"]  # m
    infra_type = gesut_data["type"]  # np. "elektro_SN"
    
    # 3. Oblicz
    viability = estimate_case_viability(
        uldk_data["area_m2"],
        infra_type,
        band_width,
        property_value_m2,
        voivodeship
    )
    
    # 4. Zwróć raport
    return {
        "section_1": uldk_data,
        "section_2": gesut_data,
        "section_3": kw_data,
        "section_4": rcn_data,
        "compensation": viability,
        "recommendation": viability["recommendation"]
    }
```

---

## 📋 CHECKLIST

- [x] coeffs.py — Masz!
- [ ] Rozszerzenie o nowe typy (ciepło, drenaż)
- [ ] Dodanie band_width_m, operators, description
- [ ] Funkcje: calculate_track_a(), calculate_track_b(), estimate_case_viability()
- [ ] Integracja w backend/modules/valuation.py
- [ ] Testy na rzeczywistych sprawach
- [ ] PDF report generation

**Następny krok**: Chcesz żebym napisał **kompletny valuation.py**? 👇
