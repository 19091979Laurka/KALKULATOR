# 🌍 ROZSZERZENIE: DANE DODATKOWE I UNIWERSALNOŚĆ (WSZYSTKIE WOJEWÓDZTWA)

---

# 🎯 CZĘŚĆ 5: DANE DODATKOWE (KRYTYCZNE DLA KAŻDEGO WOJEWÓDZTTWA)

## 5.1 Służebność Przesyłu — KSIĘGA WIECZYSTA (KW)

**Co to jest**: Obciążenie nieruchomości zapisane w Dziale III KW — NAJWAŻNIEJSZE dla Twojej praktyki!  
**Potrzebne dane**:
```
- servitude_id: "123456/2005"
- operator_name: "PGE" | "Tauron" | "Energa" | "Innogy"
- infrastructure_type: "Linie elektroenergetyczne SN"
- protection_band_width: 10.0  (w metrach - faktyczna, nie teoretyczna!)
- servitude_text: Pełna treść zaciążenia
- establishment_date: "2005-06-15"
- property_loss_percentage: 8.5  (% działki zajętej przez pas)
- loss_value_pln: 102,000  (wartość utraconej części)
```

**Źródła integracji**:
```
✅ E-Rejestr (https://erejestr.ms.gov.pl/)
   - Nowy system Ministerstwa Sprawiedliwości
   - API dostęp dla adwokatów/radców
   - Returns: Wypis z KW w JSON/XML
   
✅ EZK (https://ezk.ms.gov.pl/)
   - Elektroniczna Księga Wieczysta
   - Pełny dostęp do Dz. III (obciążenia)
   
✅ Lokalny Sąd Rejonowy (Wydział Ksiąg Wieczystych)
   - Tradycyjny sposób: zapytanie pisemne
   - Nowocześnie: portal internetowy sądu
   - Średni czas: 1-2 dni robocze
```

**Implementacja**:
```python
# backend/integrations/kw.py (NOWY - KRYTYCZNY!)

class KWClient:
    """Królestwa Wieczysta - Dane o służebnościach przesyłu"""
    
    BASE_URL = "https://erejestr.ms.gov.pl/api/v1"
    
    async def get_servitudes_for_parcel(
        self,
        parcel_id: str,
        voivodeship: str,
        county: str,
        court_url: str = None  # URL lokalnego sądu
    ) -> Dict[str, Any]:
        """
        Pobiera służebności z Księgi Wieczystej
        
        Args:
            parcel_id: np. "061802_2.0004.109"
            voivodeship: "mazowieckie"
            court_url: URL Sądu Rejonowego (fallback)
        
        Returns: {
            "ok": true,
            "status": "REAL" | "ERROR" | "BRAK",
            "servitudes": [{
                "id": "123456/2005",
                "type": "Służebność przesyłu",
                "operator": "PGE",
                "band_width": 10,
                "loss_percentage": 8.5,
                "loss_value": 102000
            }],
            "source": "E-Rejestr" | "Sąd Rejonowy"
        }
        """

    async def get_court_contact(self, voivodeship: str, county: str):
        """Zwraca URL i kontakt do sądu rejonowego"""
        COURTS = {
            "mazowieckie": {
                "piaseczyński": {
                    "name": "Sąd Rejonowy w Piasecznie",
                    "url": "https://www.ms.gov.pl/sady/wydzial-ksiag-wieczystych",
                    "email": "kw@sr.piaseczno.pl"
                }
            },
            # ... (16 województw)
        }
```

---

## 5.2 Studium Uwarunkowań i Kierunków Zagospodarowania (SUIKZ)

**Co to jest**: Wytyczne gminne dla zabudowy i zagospodarowania  
**Potrzebne dane**:
```
- suikz_exists: true
- allowed_uses: ["mieszkalnictwo", "usługi", "produkcja"]
- building_restrictions: "Pas ochronny linii SN - brak zabudowy"
- max_floor_ratio: 0.5
- max_coverage: 40  (procent)
- zone_designation: "MN"  (Zabudowa mieszkaniowo-usługowa)
```

**Źródła**:
```
✅ Portal Danych Przestrzennych każdej GMINY
   URL: https://geoportal.GMINA.pl/
   
   Przykłady:
   - https://geoportal.piaseczno.pl/ (Piaseczyńskie)
   - https://geoportal.gostynin.pl/ (Gostynin)
   - https://geoportal.warszawa.pl/ (Warszawa)
   
✅ GUGiK PZGIK (https://www.pzgik.pl/)
   - Krajowy Rejestr SUIKZ
   - Search: gmina → SUIKZ
   
✅ WFS Layer: mpzp_jednostka (jeśli dostępne)
```

**Implementacja**:
```python
# backend/integrations/suikz.py (NOWY)

class SUIKZClient:
    """SUIKZ dla każdej gminy"""
    
    GMINA_PORTALS = {
        "Góra Kalwaria": "https://geoportal.piaseczno.pl/",
        # ... (2000+ gmin w Polsce)
    }
    
    async def get_suikz(
        self,
        gmina: str,
        voivodeship: str,
        parcel_id: str = None,
        lon: float = None,
        lat: float = None
    ) -> Dict[str, Any]:
        """
        Dynamicznie pobiera SUIKZ dla gminy
        
        Strategie:
        1. WFS GetFeature (jeśli dostępne)
        2. PDF scraping ze strony WWW gminy
        3. REST API (kilka gmin ma)
        4. Fallback: Urząd gminy HTTP request
        """

    async def _get_suikz_wfs(self, gmina: str):
        """Pobierz przez WFS"""
        
    async def _get_suikz_pdf(self, gmina: str):
        """Pobierz PDF i parsuj"""
        
    async def _get_suikz_api(self, gmina: str):
        """REST API (mniej gmin)"""
```

---

## 5.3 Plan Miejscowy (MPZP)

**Co to jest**: Szczegółowe przepisy dla konkretnego terenu  
**Potrzebne dane**:
```
- mpzp_exists: true
- designation: "MN" | "UT" | "UP"
- floor_area_ratio: 1.5
- coverage_percentage: 50
- setback_from_road: 10  (metry)
- restrictions: "Zakazana zabudowa w pasie SN"
```

**Źródła**: Te same co SUIKZ + WFS ms:mpzp_jednostka

---

## 5.4 Ochrona Środowiska & Natura 2000

**Co to jest**: Czy teren jest w strefach ochrony  
**Potrzebne dane**:
```
- natura_2000: true/false
- protected_area_type: "Obszar Chronionego Krajobrazu" | "Rezerwat"
- water_protection_zone: true/false
- archaeological_site: true/false
```

**Źródła**:
```
✅ GIOŚ (Główny Inspektor Ochrony Środowiska)
   https://www.gios.gov.pl/
   
✅ BDOŚ (Baza Danych o Ochronie Środowiska)
   https://bdos.gdos.gov.pl/
   
✅ Geoportal: WFS natura_2000, protected_areas
```

---

## 5.5 Historia Pozwoleń Budowlanych & Dokumenty Sądowe

**Co to jest**: Czy były sądy/spory o nieruchomość  
**Potrzebne dane**:
```
- building_permits: [{year: 2010, type: "budowlane"}]
- court_cases: true/false
- pending_disputes: true/false
```

**Źródła**:
```
✅ GUNB (https://wyszukiwarka.gunb.gov.pl/) - pozwolenia
✅ Sąd Rejonowy - sprawy sądowe
✅ KW Dział II - prawo własności
```

---

## 5.6 Wycena Nieruchomości — Standardy KSWS

**Co to jest**: Metodyki do obliczenia odszkodowania za służebności  
**Potrzebne dane**:
```
- valuation_method: "KSWS-4" | "KSWS-V.5"
- market_value_m2: 168.0
- track_a_compensation: 2_143_177  # ścieżka sądowa
- track_b_compensation: 3_343_357  # ścieżka negocjacyjna
- multiplier: 1.56  # dla negocjacji
```

**Źródła**:
```
✅ KRN (Krajowa Rada Rzeczoznawców)
   https://www.arn.org.pl/
   Wytyczne KSWS-4, KSWS-V.5
   
✅ Orzecznictwo Sądów (CoI)
   Praktyka wyceny w sprawach służebności
```

---

# 🌍 UNIWERSALNOŚĆ: OBSŁUGA WSZYSTKICH 16 WOJEWÓDZTW

## Automatyczne Wybieranie Integracji per Województwo

```python
# backend/config/voivodeships.py

VOIVODESHIPS_CONFIG = {
    "dolnośląskie": {
        "teryt": "020000",
        "portal": "https://geoportal.dolnoslaskie.pl/",
        "operators": ["PGE", "Tauron"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy we Wrocławiu"
    },
    "kujawsko-pomorskie": {
        "teryt": "040000",
        "portal": "https://geoportal.kujawskopomorskie.pl/",
        "operators": ["PGE", "Energa"],
        "suikz_type": "PDF+scraping",
        "court": "Sąd Rejonowy w Bydgoszczy"
    },
    "lubelskie": {
        "teryt": "060000",
        "portal": "https://geoportal.lubelskie.pl/",
        "operators": ["PGE"],
        "suikz_type": "WFS",
        "court": "Sąd Rejonowy w Lublinie"
    },
    # ... (13 województw więcej)
    "mazowieckie": {
        "teryt": "140000",
        "portal": "https://geoportal.mazowieckie.pl/",
        "operators": ["PGE", "Tauron"],
        "suikz_type": "Mixed",
        "court": "Sąd Rejonowy w Warszawie / Piasecznie"
    },
    "zachodniopomorskie": {
        "teryt": "320000",
        "portal": "https://geoportal.zachodniopomorskie.pl/",
        "operators": ["Energa"],
        "suikz_type": "REST API",
        "court": "Sąd Rejonowy w Szczecinie"
    }
}

class VoivodeshipConfig:
    def __init__(self, voivodeship: str):
        self.config = VOIVODESHIPS_CONFIG[voivodeship.lower()]
        self.teryt = self.config["teryt"]
        self.operators = self.config["operators"]
        self.suikz_type = self.config["suikz_type"]
    
    async def get_suikz(self, gmina: str):
        """Automatycznie wybiera metodę"""
        if self.suikz_type == "WFS":
            return await get_suikz_wfs()
        elif self.suikz_type == "PDF+scraping":
            return await get_suikz_pdf()
        elif self.suikz_type == "REST API":
            return await get_suikz_api()
        elif self.suikz_type == "Mixed":
            return await get_suikz_mixed()
```

---

## Uniwersalny Flow Analiz

```python
# backend/modules/analyzer.py

async def analyze_parcel_complete(
    voivodeship: str,  # "mazowieckie"
    county: str,       # "piaseczyński"
    commune: str,      # "Góra Kalwaria"
    parcel_id: str     # "23/7"
) -> Dict[str, Any]:
    """
    Kompletna analiza działki dla KAŻDEGO województwa
    
    Returns raport jak "Góra Kalwaria"
    """
    
    config = VoivodeshipConfig(voivodeship)
    
    # Parallel fetch wszystkich danych
    results = await asyncio.gather(
        uldk.fetch_parcel_geometry(parcel_id),           # ✅ Gotowe
        kieg.get_land_use(bbox),                         # ⚠️ Fix BBOX
        gesut.fetch_infrastructure(parcel_id, bbox),     # 🔴 TODO
        rcn.get_transactions(lon, lat),                  # ✅ Gotowe
        gus.fetch_market_price(voivodeship),             # ✅ Gotowe
        kw.get_servitudes_for_parcel(parcel_id),         # 🔴 TODO
        config.get_suikz(commune),                       # 🔴 TODO
        get_mpzp(commune),                               # 🔴 TODO
        gios.check_environmental_zones(lon, lat)         # 🔴 TODO
    )
    
    # Struktura raportu (jak Góra Kalwaria)
    return {
        "section_1_ewidencja": results[0],
        "section_2_zabudowa": results[1] + results[8],  # + buildings
        "section_3_infrastruktura": results[2],
        "section_4_ceny": {results[3], results[4]},
        "section_5_prawne": {results[5], results[6], results[7]},
        "legal_recommendations": calculate_compensation(...)
    }
```

---

# 📋 PEŁNY CHECKLIST IMPLEMENTACJI

## TIER 1 — KRYTYCZNE (Ta kadencja)
- [x] ULDK — geometria, pow., TERYT
- [x] RCN — ceny budowlane
- [x] GUS — ceny gruntów rolnych
- [ ] **GESUT** — infrastruktura (SN/WN/nn/media)
- [ ] **KW** — służebności przesyłu (e-Rejestr)
- [ ] **SUIKZ** — wytyczne gminne (uniwersalne dla 16 woj.)

## TIER 2 — WAŻNE (2-4 tygodnie)
- [ ] **Fix KIEG** — BBOX bug (E,N,E,N)
- [ ] **MPZP** — plany miejscowe
- [ ] **GIOS** — ochrona środowiska
- [ ] **GUNB** — pozwolenia budowlane

## TIER 3 — NICE TO HAVE
- [ ] Court integration — automatyczne zapytania do sądów
- [ ] PDF parser — SUIKZ/MPZP z PDF
- [ ] Valuation calculator — KSWS-4/V.5

---

# 🚀 AKCJA NATYCHMIAST

1. **Implementuj GESUT** (2-3 dni)
   - WFS GetFeature dla linii elektro
   - Wszystkie 16 województw

2. **Implementuj KW** (2-3 dni)
   - e-Rejestr API lub court scraping
   - Fallback: lokalny Sąd Rejonowy

3. **Implementuj SUIKZ** (3-4 dni)
   - Dynamiczne: WFS / PDF / API
   - 2000+ gmin w Polsce

4. **Test na 5 województwach**
   - Góra Kalwaria (mazowieckie)
   - Po 1 z każdego województwa

---

**Status**: ✅ Kompletna mapa dla WSZYSTKICH województw  
**Następny krok**: Detailed spec dla GESUT + KW  

Chcesz kod do **GESUT** teraz? 👇
