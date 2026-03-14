# 📊 MAPA DANYCH DO INTEGRACJI - APLIKACJA KALKULATOR
**Opracowanie**: Analiza raportu Góra Kalwaria  
**Data**: 2026-03-01  
**Cel**: Definicja API endpoints i źródeł danych dla każdej pozycji w raporcie

---

# 🎯 CZĘŚĆ 1: LOKALIZACJA I DANE EWIDENCYJNE

## 1.1 Działka nr 23/7
**Co to jest**: Identyfikator działki w ewidencji gruntów i budynków  
**Potrzebne dane**:
- `parcel_id`: "061802_2.0004.109" (przykład) lub "23/7" w GKN
- `voivodeship`: mazowieckie
- `county`: piaseczyński  
- `commune`: Góra Kalwaria
- `area_m2`: 1200
- `area_ha`: 0.12

**Źródła integracji**:
```
✅ ULDK (Ujednolicona Liczba Działek Katastralnych)
   API: https://uldk.gugik.gov.pl
   Endpoint: GetParcelById
   Parametry: parcel_id, result=geom_wkt,teryt,voivodeship,county,commune,region,parcel
   Returns: Geometria (WKT), powierzchnia, jednostka terytorialna

✅ GUGiK Geoportal (BDOT10k - Baza Danych Obiektów Topograficznych)
   API: https://mapy.geoportal.gov.pl
   WMS/WFS do pobrania działki + atrybutów
   
✅ Starostwo Powiatowe Piaseczyńskie
   Biuro Ewidencji Gruntów i Budynków (BEGB)
   Metoda: REST API (jeśli dostępne) lub scraping portalu ewidencji
```

**Implementacja w KALKULATOR**:
```python
# backend/integrations/uldk.py - JUŻ MASZ (uldk_fixed.py)
parcel_data = await uldk.fetch_parcel_geometry("061802_2.0004.109")
# Returns: {
#   "area_m2": 1200,
#   "area_ha": 0.12,
#   "voivodeship": "mazowieckie",
#   "county": "piaseczyński",
#   "commune": "Góra Kalwaria",
#   "geometry": {...}
# }
```

---

## 1.2 Klasa Gleby: SR, SRV

**Co to jest**: Klasyfikacja gleby dla celów rolnych (wpływa na wartość)  
**Potrzebne dane**:
- `soil_class`: "SR" (działka 23/7), "SRV" (działka 23/8)
- `soil_description`: Gleba średnia, Gleba słaba

**Źródła integracji**:
```
✅ KIEG (Krajowa Integracja Ewidencji Gruntów - GUGiK)
   API: https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow
   WFS GetFeature: ms:uzytek_gruntowy
   Returns: Klasoużytki (użytki: Ps, R, Lz, UR, etc.)
   NOTE: Klasy gleby (I-VI) są dostępne w bonitacji GUGiK

✅ BDOT10k (part II - Informacja Glebowo-Klimatyczna)
   Geoportal: https://mapy.geoportal.gov.pl
   Layer: Grunty ornych klasy bonitacyjne
   
✅ IUNG-PIB (Instytut Uprawy, Nawożenia i Gleboznawstwa)
   Mapa glebowo-bonitacyjna: https://www.iung.pulawy.pl
   Dane bonitacyjne (nie API, ale downloadable GeoTIFF)
```

**Implementacja**:
```python
# backend/integrations/kieg.py (POTRZEBUJE NAPRAWY - wersja current ma bug z BBOX)
soil_data = await kieg.get_land_use(bbox_2180)
# Returns: {
#   "soil_class": "SR",
#   "description": "Gleba średnia",
#   "bonitation_class": "III"
# }

# ALTERNATYWA: Jeśli KIEG nie działa
# backend/integrations/gugik_wms.py (nowa integracja)
# Query WMS GetInfo na współrzędnych = klasoużytki
```

---

## 1.3 Użytek Gruntowy: "Brak danych"

**Co to jest**: Klasyfikacja terenu (grunty orne, pastwiska, zabudowa, etc.)  
**Potrzebne dane**:
- `land_use`: "Brak danych" | "Grunty orne" | "Budowlana" | "Zabudowa"
- `egib_category`: Kod użytku (np. 1000 - grunty orne)

**Źródła integracji**:
```
✅ EGIB (Ewidencja Gruntów i Budynków) - najaktualniejsza
   Portal: https://pvs.gugik.gov.pl/ lub miejscowy urząd gminy
   Format: WFS / REST API (jeśli dostępne)
   Returns: detailed land use classification

✅ GUGiK BDOT10k (Baza Danych Obiektów Topograficznych)
   API: https://mapy.geoportal.gov.pl/wss/service/...
   WFS typeName: ms:uz_plan_gminy, ms:uzytek_gruntowy
   
✅ Miejscowy Portal Danych Przestrzennych (PZGIK)
   Wiele gmin ma własne API
   Piaseczyńskie: https://geoportal.piaseczno.pl/
```

**Implementacja**:
```python
# backend/modules/egib.py (NOWY MODUŁ)
egib_data = await egib_client.get_land_use(parcel_id)
# Returns: {
#   "land_use": "Brak danych" | "Grunty orne",
#   "egib_code": 1000,
#   "status": "REAL" | "ERROR" | "BRAK"
# }
```

---

# 🎯 CZĘŚĆ 2: ANALIZA ZABUDOWY I OTOCZENIA

## 2.1 Budynki w sąsiedztwie (6 obiektów)

**Co to jest**: Ewidencja budynków w promieniu 50 m  
**Potrzebne dane**:
```
Typ budynku | Pow. [m²] | Wysokość [m] | Odległość [m]
Gospodarstwa | 418.94    | 4.85         | 14
Mieszkalny   | 197.76    | 7.66         | 18
...
```

**Źródła integracji**:
```
✅ BDOT10k (Baza Danych Obiektów Topograficznych) - NAJLEPSZE
   API: https://mapy.geoportal.gov.pl
   WFS: ms:budynek
   Returns: Geometria budynku, pow., wysokość, typ
   
✅ GUGiK 3DMAPA (jeśli dostępna dla regionu)
   https://mapy.geoportal.gov.pl/3dmapa
   Returns: 3D model budynków, dokładna wysokość z LiDAR

✅ OSM (OpenStreetMap) - ALTERNATYWA, gorsza jakość
   API: https://overpass-api.de/api/interpreter
   Query: Bounding box → building objects
   Returns: Geometria, höhe (jeśli dostępna)

✅ EGIB (miejscowy urząd gminy)
   Dane dotyczące budynków w rejestrze
```

**Implementacja**:
```python
# backend/integrations/kieg.py (istnieje, ale needs BBOX fix)
buildings = await kieg.get_buildings(bbox_2180)
# Returns: [{
#   "type": "budynek mieszkalny",
#   "area_m2": 197.76,
#   "height_m": 7.66,
#   "distance_from_parcel": 18,
#   "geometry": {...}
# }, ...]

# Distance calculation:
from shapely.geometry import shape, Point
parcel_geom = shape(parcel_geometry)
parcel_centroid = parcel_geom.centroid

for building in buildings:
    building_geom = shape(building["geometry"])
    distance = parcel_centroid.distance(building_geom)  # in meters (PL-1992)
```

---

# 🎯 CZĘŚĆ 3: INFRASTRUKTURA TECHNICZNA I MEDIA

## 3.1 Linie średniego napięcia (SN): 4 m, 91 m, 167 m, 198 m

**Co to jest**: Lokalizacja linii elektroenergetycznych — KLUCZOWE dla służebności!  
**Potrzebne dane**:
- `line_type`: "średnie napięcie" (6-30 kV)
- `distance_m`: [4, 91, 167, 198]
- `coordinates`: [(E, N), ...]
- `protection_band_width`: ~10 m (5 m od osi w obie strony)

**Źródła integracji**:
```
✅ GESUT (Geoportal Esri - System Uzbrojenia Terenu)
   API: https://mapy.geoportal.gov.pl/wss/service/gesut
   WFS: Linie elektroenergetyczne (SN/nn)
   Returns: Geometria linii, typ (SN/WN/nn), klasa napięcia
   
✅ PGE / Tauron / Energa (Operatorzy Sieci Dystrybucyjnych)
   Portal: https://www.pge.pl/o-nas/mapa-sieci (przykład PGE)
   API dostęp (ograniczony - wymaga umowy)
   
✅ OpenStreetMap - power lines
   API: https://overpass-api.de
   Query: power=line, voltage=*
   Returns: Geometria linii, napięcie
```

**Implementacja**:
```python
# backend/integrations/gesut.py (BRAKUJE - TO JEST TIER 2 PROBLEM!)
# Trzeba zaimplementować:

infrastructure = await gesut.fetch_infrastructure(
    parcel_id="061802_2.0004.109",
    lon=23.450637,
    lat=50.35607,
    infrastructure_type="elektro_SN"
)
# Returns: {
#   "type": "elektro_SN",
#   "lines": [{
#       "distance_m": 4,
#       "coordinates": [(E, N)],
#       "voltage_kv": 20,
#       "protection_band_width": 10
#   }, ...]
# }
```

---

## 3.2 Linie niskiego napięcia (nn): 163 m, 184 m

**Co to jest**: Linie elektroenergetyczne <1 kV  
**Potrzebne dane**:
- `line_type`: "niskie napięcie"
- `distance_m`: [163, 184]
- `protection_band_width`: ~5 m (2-3 m od osi)

**Źródła**: Te same co 3.1 (GESUT, OSM, PGE)

---

## 3.3 Transformator: 91 m

**Co to jest**: Urządzenie zamieniające napięcie  
**Potrzebne dane**:
- `device_type`: "transformator"
- `distance_m`: 91
- `coordinates`: (E, N)
- `voltage_primary`: 10 kV (lub 15-20 kV)
- `voltage_secondary`: 0.4 kV

**Źródła**:
```
✅ GESUT (ma obiekty punktowe - transformatory)
✅ PGE/Tauron - mapy sieci
✅ OSM: power=transformer, voltage
```

---

## 3.4 Podstacja: 1439 m

**Co to jest**: Główne urządzenie przekształcające zasilania  
**Potrzebne dane**:
- `device_type`: "podstacja"
- `distance_m`: 1439
- `voltage_primary`: 110 kV (lub wyższa)

**Źródła**: GESUT, PGE/Tauron

---

## 3.5 Media (woda, gaz, kanalizacja, telekomunikacja)

**Co to jest**: Sieci infrastrukturalne  
**Potrzebne dane**:
- `media_type`: ["wodociąg", "gazociąg", "kanalizacja", "telekomunikacja"]
- `present`: true/false
- `distance_m`: (jeśli dotyczy)

**Źródła**:
```
✅ GESUT (wszystkie media)
   WFS: media, gazociąg, wodociąg, kanalizacja, swiatlowod
   
✅ Gminne sieci (woda, gaz, kanalizacja)
   Portal: https://geoportal.piaseczno.pl/
   
✅ UKE (Urząd Komunikacji Elektronicznej) - telekomunikacja
   Portal PIT: https://get-pit.uke.gov.pl/
```

**Implementacja**:
```python
# backend/modules/infrastructure.py (ROZSZERZYĆ)
infrastructure = await fetch_infrastructure(
    parcel_id, lon, lat, geometry
)
# Returns: {
#   "media": {
#       "water": true,
#       "gas": true,
#       "sewage": true,
#       "telecom": true
#   },
#   "lines": [...]
# }
```

---

# 🎯 CZĘŚĆ 4: ANALIZA CEN RYNKOWYCH

## 4.1 Działki Budowlane: 168 zł/m²

**Co to jest**: Mediana cen transakcji gruntów budowlanych w promieniu 5 km  
**Potrzebne dane**:
- `price_median`: 168.0
- `price_min`: 52.0
- `price_max`: 550.0
- `sample_size`: liczba transakcji
- `date_from`: październik 2025
- `date_to`: grudzień 2025

**Źródła integracji**:
```
✅ RCN (Rejestr Cen Nieruchomości) - GŁÓWNE ŹRÓDŁO
   API: https://mapy.geoportal.gov.pl/wss/service/rcn
   WFS 2.0.0: GetFeature, filter BBOX
   Returns: Transakcje, ceny, daty, typ gruntu
   
✅ GUS RCN (oficjalne dane statystyczne)
   Portal: https://www.geoportal.gov.pl
   Dostęp: API lub pobieranie danych
   
✅ AGHM (Agencja Głównego Geodety i Kartografa) - alternatywa
   
✅ Portale nieruchomości (OLX, Otodom) - SUPLEMENTACJA
   Web scraping: https://www.olx.pl, https://otodom.pl
   Returns: Oferty sprzedaży (nie zawsze wykonane transakcje)
```

**Implementacja**:
```python
# backend/integrations/rcn.py - JUŻ MASZ (rcn_fixed.py)
transactions = await rcn.get_transactions(lon=23.450637, lat=50.35607, radius_km=5.0)
# Returns: {
#   "ok": true,
#   "status": "SUCCESS",
#   "count": 15,
#   "transactions": [{
#       "price": Decimal("168"),
#       "date": datetime(2025, 12, 1),
#       "type": "budowlana",
#       "area_m2": 1200
#   }, ...],
#   "median_price": Decimal("168.0")
# }
```

---

## 4.2 Działki Rolne: 61,982 zł/ha (średnia woj. mazowieckie)

**Co to jest**: Średnia cena gruntów rolnych (nie konkretne transakcje)  
**Potrzebne dane**:
- `price_per_ha`: 61982.0
- `price_per_m2`: 6.2 (=61982/10000)
- `soil_quality`: ["dobra", "średnia", "słaba"]
- `prices_by_quality`: {
#     "good": 70756,
#     "medium": 66683,
#     "bad": 53443
#   }
- `date`: 01.03.2025 (kedy dane)

**Źródła integracji**:
```
✅ GUS BDL (Bank Danych Lokalnych) - GŁÓWNE
   API: https://bdl.stat.gov.pl/api/v1
   Zmienne: 455437 (ceny gruntów), 60548 (grunty budowlane)
   Returns: Cena dla TERYT (województwa/powiatu/gminy)
   
✅ IUNG-PIB (bonitacja glebowa dla cen)
   https://www.iung.pulawy.pl
   
✅ GUS StatDB (baza danych statystycznej)
   Portal: https://www.stat.gov.pl
```

**Implementacja**:
```python
# backend/integrations/gus.py - JUŻ MASZ (gus_fixed.py)
price_data = await gus.fetch_market_price(
    wojewodztwo="mazowieckie",
    powiat="piaseczyński",
    land_type="rolna"
)
# Returns: {
#   "ok": true,
#   "status": "REAL",
#   "price_m2": 6.2,
#   "price_ha": 61982,
#   "source": "GUS BDL (Regional)"
# }
```

---

# 📋 PODSUMOWANIE - CO ZAIMPLEMENTOWAĆ

## ✅ JUŻ MASZ (fixed versions)
1. **ULDK** (uldk_fixed.py) — Geometria działki, powierzchnia, TERYT
2. **RCN** (rcn_fixed.py) — Transakcje budowlane, ceny medianowe
3. **GUS** (gus_fixed.py) — Ceny gruntów rolnych regionalne

## 🔴 BRAKUJE (TIER 1-2)
1. **GESUT** (infrastructure.py) — Linie elektroenergetyczne, media
   - Status: Brakuje implementacji
   - Priorytet: WYSOKI (służebność przesyłu!)
   - Szacunkowy kod: 400-500 linii

2. **KIEG** (kieg.py) — Klasoużytki, klasy gleby
   - Status: Istnieje, ale ma bug z BBOX (TIER 3)
   - Priorytet: ŚREDNI
   - Fix: Zmienić kolejność BBOX z (N,E,N,E) na (E,N,E,N)

3. **Scalper OLX/Otodom** (web_scraping.py) — Oferty na rynku
   - Status: Nie ma
   - Priorytet: NISKI (suplementacja do RCN)
   - Uwaga: Selenium-based scraping

4. **EGIB** (egib.py) — Użytek gruntowy, rejestr budynków
   - Status: Nie ma
   - Priorytet: ŚREDNI
   - Źródło: Lokalny urząd gminy + GUGiK portal

---

# 🎯 FLOW DANYCH W KALKULATORZE (NOWY WORKFLOW)

```
USER INPUT:
├─ Parcel ID (np. "23/7") lub geometria
└─ Lokalizacja (województwo/powiat/gmina)

↓

INTEGRACJE (parallel):
├─ ULDK → Geometria + powierzchnia + TERYT ✅
├─ KIEG → Klasoużytki + klasy gleby (bug fix)
├─ GESUT → Linie elektroenergetyczne + media ⚠️ TODO
├─ RCN → Transakcje budowlane + ceny ✅
├─ GUS → Ceny gruntów rolnych ✅
├─ BDOT10k → Budynki w otoczeniu (via WFS)
└─ EGIB → Użytek gruntowy (local API or scrape)

↓

RAPORT (jak Góra Kalwaria):
├─ Sekcja 1: Dane ewidencyjne
├─ Sekcja 2: Zabudowa otoczenia
├─ Sekcja 3: Infrastruktura ← GESUT CRITICAL
├─ Sekcja 4: Ceny rynkowe
└─ Sekcja 5: Rekomendacje do sądu
```

---

# 🚀 AKCJA NATYCHMIASTOWA

1. **Implementuj GESUT** (Tier 1 - służebność przesyłu!)
2. **Fix KIEG** BBOX bug (Tier 3, szybka poprawka)
3. **Add EGIB scraper** dla użytku gruntowego (Tier 2)

Chcesz, żebym przygotował **detailed spec** dla GESUT integracji? 👇

