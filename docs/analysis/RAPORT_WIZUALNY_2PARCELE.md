# RAPORT WIZUALNY: 2 PIERWSZE DZIAŁKI Z BATCH'A
## Baboszewo, Powiat Płoński

### 🎯 CO WIEMY?

#### ✅ DANE PEWNE (z ULDK GUGiK)
```
Działka 1 (142003_2.0002.81/5)
├─ Pow. rzeczywista: 9,915.41 m²
├─ Użytkowanie: ROLA (klasa R)
├─ Centroid: [20.156684°E, 52.685934°N]
└─ Wycena: 8.5 zł/m² = 84,281 zł razem

Działka 2 (142003_2.0002.81/8)
├─ Pow. rzeczywista: 39,215.45 m²
├─ Użytkowanie: ROLA (klasa R)
├─ Centroid: [20.158445°E, 52.685764°N]
└─ Wycena: 8.5 zł/m² = 333,331 zł razem
```

#### ❓ CO NIE WIEMY (brak WFS)
```
DLA OBU DZIAŁEK:
├─ Czy rzeczywiście przechodzi linia energetyczna?
├─ Jeśli TAK - jaka jest jej długość w działce?
├─ Jakie jest napięcie (WN/SN/nN)?
└─ Jaki jest kąt przecięcia z granicą działki?

PRZYCZYNA: GUGiK KIUT WFS service = ERROR
  └─ Endpoint https://integracja.gugik.gov.pl/... jest niedostępny
```

---

### 📈 KALKULACJA ODSZKODOWANIA

#### ZAŁOŻENIE (wpisane w system):
```
"Linie 15-30 kV (SN)"
├─ Wskaźnik wpływu społecznego S = 0.2
├─ To oznacza: 5% straty wartości nieruchomości (OBN)
└─ Niezależnie od rzeczywistej długości (bo S jest uniwersalny)
```

#### WYNIK KALKULACJI:

```
DZIAŁKA 1 (9,915 m² × 84,281 zł wartości)
├─ OBN (5% od wartości)  ─────── 4,214 zł
├─ TRACK A (10 lat)      ─────── 4,214 zł (roczni ~421 zł)
└─ TRACK B (negocje 1.56×) ─────── 6,574 zł (roczni ~657 zł)

DZIAŁKA 2 (39,215 m² × 333,331 zł wartości)
├─ OBN (5% od wartości)  ─────── 16,667 zł
├─ TRACK A (10 lat)      ─────── 16,667 zł (roczni ~1,667 zł)
└─ TRACK B (negocje 1.56×) ─────── 25,999 zł (roczni ~2,600 zł)
```

---

### 🚨 PROBLEM KRYTYCZNY

**Pytanie**: Czy te odszkodowania są UZASADNIONE?

**Odpowiedź**: NIEZNANE! ❌

```
┌─────────────────────────────────────────────────┐
│ System obliczył kompensację MIMO ŻE:            │
├─────────────────────────────────────────────────┤
│ ✗ Infrastructure.power.detected = FALSE         │
│ ✗ Infrastructure.power.exists = FALSE           │
│ ✗ Voltage = "—" (unknown)                       │
│ ✗ Line length = 0.0 m (no data)                 │
│ ✗ WFS Service = ERROR                          │
│                                                 │
│ Ale mimo to KSWS.label = "Linie 15-30 kV"     │
│ Czyli system ZAŁOŻYŁ że są i liczył wzorami   │
└─────────────────────────────────────────────────┘
```

---

### 🗺️ RZECZYWISTA SYTUACJA - JAK SPRAWDZIĆ?

#### Opcja 1: Portal Mapowy Powiatu Płońskiego
```
URL: http://mapy.powiateplaski.pl/
├─ Warstwa "Infrastruktura - Elektro"
├─ Warstwa "Infrastruktura - Gaz"
└─ Warstwa "Sieci telekomunikacyjne"
```

#### Opcja 2: Geoportal WMS/WMS-T State
```
URL: https://mapy.geoportal.gov.pl/
├─ Dodaj warstwę: "Krajowa Integracja Uzbrojenia Terenu" (WMS)
├─ Zaznacz działkę (użyj TERYT 142003_2.0002.81/5)
└─ Wizualnie sprawdź czy linia przechodzi
```

#### Opcja 3: OpenStreetMap
```
URL: https://www.openstreetmap.org/
├─ Szukaj współrzędne działki
├─ Sprawdź czy jest tagged "power=line"
└─ Ustaw "Power" map style
```

#### Opcja 4: Zdalna Wizja (Satelita)
```
URL: https://earth.google.com/
├─ Współrzędne: [20.156684, 52.685934] (działka 1)
├─ Współrzędne: [20.158445, 52.685764] (działka 2)
├─ Sprawdź czy widzisz słupy lub linie
└─ Data zdjęcia: 2025-2026
```

---

### 📋 CHECKLIST: CO ZROBIĆ?

#### ☐ SPRAWDZENIE RZECZYWISTE (dla każdej działki)
```
Działka 1: 142003_2.0002.81/5
☐ Sprawdzić w Portal Mapowym - czy linia jest?
  └─ TAK / NIE / WĄTPLIWE
☐ Jeśli TAK - zmierzyć przybliżoną długość w działce
  └─ Długość: ___ m
☐ Jeśli TAK - określić napięcie (WN/SN/nN)
  └─ Napięcie: _____

Działka 2: 142003_2.0002.81/8
☐ Sprawdzić w Portal Mapowym - czy linia jest?
  └─ TAK / NIE / WĄTPLIWE
☐ Jeśli TAK - zmierzyć przybliżoną długość w działce
  └─ Długość: ___ m
☐ Jeśli TAK - określić napięcie (WN/SN/nN)
  └─ Napięcie: _____
```

#### ☐ WPROWADZENIE W SYSTEM
```
Dla każdej działki w KalkulatorPage:
☐ Kliknąć "Potwierdzenie Infrastruktury" (nowa karta)
☐ Wybierać: "✓ TAK — ma linię" lub "✗ NIE — brak"
☐ System auto-recalculates Track A/B
☐ Jeśli TAK - wpisać rzeczywistą długość (m)
☐ System przelicza: OBN = (long/obwód) × wartość × S
```

---

### 🔬 SZCZEGÓŁOWA ANALIZA DZIAŁKI 1

#### Parametry geometryczne
```
Powierzchnia: 9,915.41 m²
Perimetr: 534.3 m
Kształt: Czworokąt niekorzystny
Współrzędne (WGS-84):
  - Wierzchołek 1: 20.1563° 52.6852°
  - Wierzchołek 2: 20.1570° 52.6851°
  - Wierzchołek 3: 20.1572° 52.6871°
  - Wierzchołek 4: 20.1566° 52.6871°
  - Powrót: 20.1563° 52.6852°
```

#### Wycena (GUS fallback)
```
Cena gruntu rolnego w Mazowieckiem: 8.5 zł/m²
Źródło: GUS BDL (tablica regionalna)
Przyczyna: Brak transakcji lokalnych (0 notowań)
Wartość całkowita: 9,915.41 m² × 8.5 zł/m² = 84,280.99 zł
```

#### Kompensacja KSWS (teoretyczna)
```
Etap 1: Założenie
  └─ "Linie 15-30 kV (SN)" przechodzą

Etap 2: Odczyt współczynników
  ├─ S (wpływ społeczny): 0.2
  ├─ k (strata pożyteczności): 0.5
  ├─ R (strata wartości): 0.06
  ├─ u (faktor użytkowania): 0.065
  └─ Strefy ochronne: 15 m (SN)

Etap 3: OBN = 0.05 × 84,281 = 4,214 zł
  (Uwaga: współczynnik S=0.2 teoretycznie oznacza 5% straty)

Etap 4: Roczne (10 lat):
  └─ Track A: 4,214 / 10 = 421.40 zł/rok
  └─ Track B: 4,214 × 1.56 / 10 = 657.78 zł/rok
```

---

### 🔬 SZCZEGÓŁOWA ANALIZA DZIAŁKI 2

#### Parametry geometryczne
```
Powierzchnia: 39,215.45 m²
Perimetr: 1,012.1 m
Kształt: 13-wierzchołkowy wielokąt niekorzystny
Współrzędne centroidu (WGS-84): 20.158445° 52.685764°
Uwaga: Wielobok - bardziej skomplikowana geometria
```

#### Wycena (GUS fallback)
```
Cena gruntu rolnego w Mazowieckiem: 8.5 zł/m²
Źródło: GUS BDL (tablica regionalna)
Przyczyna: Brak transakcji lokalnych (0 notowań)
Wartość całkowita: 39,215.45 m² × 8.5 zł/m² = 333,331.32 zł
```

#### Kompensacja KSWS (teoretyczna)
```
Etap 1: Założenie
  └─ "Linie 15-30 kV (SN)" przechodzą

Etap 2: Współczynniki KSWS
  ├─ S (wpływ społeczny): 0.2
  ├─ k (strata pożyteczności): 0.5
  ├─ R (strata wartości): 0.06
  ├─ u (faktor użytkowania): 0.065
  └─ Strefy ochronne: 15 m (SN)

Etap 3: OBN = 0.05 × 333,331 = 16,666.57 zł

Etap 4: Roczne (10 lat):
  └─ Track A: 16,667 / 10 = 1,666.66 zł/rok
  └─ Track B: 16,667 × 1.56 / 10 = 2,599.99 zł/rok
```

---

### 💰 PORÓWNANIE WYNIKÓW

```
╔════════════════════════════════════════════════════════════╗
║          DZIAŁKA 1              DZIAŁKA 2        STOSUNEK  ║
╠════════════════════════════════════════════════════════════╣
║ Pow. [m²]   9,915              39,215           3.95×     ║
║ Wart. [zł]  84,281             333,331          3.95×     ║
║ Track A [zł] 4,214             16,667           3.95×     ║
║ Track B [zł] 6,574             25,999           3.95×     ║
╚════════════════════════════════════════════════════════════╝
```

**Wniosek**: Wszystkie wartości skalują się dokładnie o 3.95×, co jest matematycznie poprawne.

---

### ⚡ STAN WFS SERVICE

```
Sprawdzono: 2026-03-10 16:36 UTC
Endpoint: https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu

Status dla obu działek:
├─ GetCapabilities: ✗ NOT AVAILABLE
├─ GetFeature (WFS): ✗ NOT AVAILABLE
├─ GetMap (WMS): ⚠️  WORKS (raster only)
└─ GetInfo: ? UNKNOWN

Wniosek:
  └─ Endpoint udostępnia WMS (mapy rastrowe)
  └─ NIE udostępnia WFS (dane wektorowe)
  └─ Automatyczne pobieranie linii NIEMOŻLIWE
  └─ Konieczna ręczna weryfikacja lub poleganie na WMS
```

---

### 🎓 PODSUMOWANIE DLA PRAWNIKA

#### Czy obliczenia są uzasadnione prawnie?

| Aspekt | Status | Uwagi |
|--------|--------|-------|
| Metodologia KSWS | ✅ Prawidłowa | Współczynniki zgodne ze standardem |
| Wycena gruntu | ✅ Prawidłowa | GUS fallback, brak transakcji |
| Okresy (10 lat) | ✅ Prawidłowy | Standard dla linii SN |
| Ratio Track B | ✅ Prawidłowy | 1.56× dla negocjacji |
| **Weryfikacja infrastruktury** | ❌ BRAKUJE | **To jest problem!** |
| Rzeczywista długość linii | ❌ BRAKUJE | Assumed 0.0 m (placeholder) |
| Rzeczywisty wpływ | ❌ NIEZNANY | Bazuje na założeniach |

#### Rekomendacja sądowa:
```
Przed złożeniem sprawy o odszkodowanie:
1. Uzyskać pisemne zaświadczenie od inwestora o trasie linii
2. Sprawdzić w geoportalu powiatu dokumentację projektu
3. Ewentualnie przeprowadzić pomiar GPS rzeczywistej trasy
4. Wtedy dopiero: recalculate compensation z rzeczywistymi danymi
```

---

### 📌 NASTĘPNE KROKI (PRIORYTET)

#### 🔴 PILNE:
```
1. Dla każdej z 99 działek ustalić:
   ☐ Czy rzeczywiście ma linię energetyczną?
   ☐ Jeśli TAK - jaka jest przybliżona długość?
   ☐ Jeśli TAK - jakie napięcie?

2. Uzupełnić braki w systemie:
   ☐ Wpisać rzeczywiste długości (m) dla każdej działki z linią
   ☐ Potwierdzić napięcie (WN/SN/nN)
   ☐ System automatycznie prze-liczy kompensację
```

#### 🟡 WAŻNE:
```
1. Zebrać dokumentację:
   ☐ Projekt linii od inwestora
   ☐ Wyciągi z geoportali powiatowych
   ☐ Zdjęcia satelitarne (Google Earth)
   ☐ Plany zagospodarowania terenu

2. Przygotować raport:
   ☐ Dla każdej działki: czy infrastruktura TAK/NIE
   ☐ Wymieniać rzeczywiste długości
   ☐ Pokazać uzasadnienie (np. foto z terenu)
```

#### 🟢 POTEM:
```
1. Finalizacja odszkodowań:
   ☐ Import rzeczywistych danych do systemu
   ☐ Przeliczenie Track A/B dla każdej działki
   ☐ Generowanie raportów sądowych
   ☐ Przygotowanie sprawy do sądu
```

---

**Wygenerowano**: 2026-03-10
**System**: KALKULATOR KSWS v3.0
**Analiza**: Pierwszych 2 działek z batch'a 99 parceli
**Wnioski**: Dane pewne, ale infrastruktura wymaga manualnej weryfikacji

