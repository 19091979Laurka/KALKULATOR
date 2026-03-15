# Dowód twardy — BDOT10k, KIUT, Geoportal, QGIS

Dokument opisuje, jak uzyskać **materiał dowodowy na poziomie opinii prywatnej lub załącznika do pozwu/wezwania**, wykraczając poza sam podgląd KIUT + orto w aplikacji.

---

## Co robi Kalkulator dziś

- **KIUT (WMS)** — podkład rastrowy uzbrojenia na mapach (w tym raporcie). Działa przy zbliżeniu, zależny od jakości danych powiatowych. Traktuj jako **pierwszy, nie ostateczny** dowód.
- **BDOT10k (WFS)** — w backendzie używany jako fallback do linii i słupów (`backend/integrations/bdot10k.py`). Nie jest tu używany jako „warstwa analityczna” z filtrami klas.
- **Orto + OSM/Overpass** — ortofotomapa, linie i słupy z OpenStreetMap.

To wystarcza do szacunków i raportów roboczych; do **twardego dowodu** warto dołożyć poniższe kroki.

---

## Geoportal — co zrobić lepiej

### BDOT10k jako warstwa analityczna (nie tylko podgląd)

- Zamiast samego WMS użyj **kompozycji BDOT10k z narzędziem „Analizy BDOT10k”** na [geoportal.gov.pl](https://geoportal.gov.pl).
- Pozwala **filtrować po klasach**: linia elektroenergetyczna SN/WN, słup, urządzenie itp.
- Daje **listę obiektów z atrybutami** (rodzaj, symbol, często napięcie) możliwą do **wydruku / zrzutu do akt**.

### KIUT

- Usługa KIUT jest ogólnokrajową integracją i **włącza się przy dużym zbliżeniu** (ok. 1:500).
- Jakość zależy od danych z powiatów — traktuj jako **pierwszy, nie ostateczny** dowód.

---

## Rozwiązanie „na prawnika + GIS”

Jeśli potrzebna jest **maksymalnie odporna dokumentacja**:

### 1. Pobierz dane BDOT10k dla powiatu

- Użyj warstw BDOT10k dla linii energetycznych, np.:
  - **SULN01–04** — linie najwyższego, wysokiego, średniego i niskiego napięcia (nazewnictwo może się różnić w zależności od wersji BDOT; chodzi o klasy obiektów „linia elektroenergetyczna” z podziałem na napięcia).
- Pobierz dane dla powiatu (np. z Geoportalu, WFS lub paczki powiatowej), tak aby mieć wektory linii i słupów.

### 2. QGIS (lub inny GIS)

- Otwórz w **QGIS** pobrane warstwy BDOT10k (linie + słupy).
- Dodaj:
  - **Granice EGiB** (WMS z Geoportalu),
  - **Ortofotomapę**,
  - **BDOT10k** (linie, słupy),
  - opcjonalnie **KIUT** (WMS) jako dodatkowy kontekst.
- Wykonaj **selekcję przestrzenną**: linie i słupy **przecinające** lub **zawierające się** w działkach (np. 746/11 itd.).
- **Wyeksportuj** wynik do **CSV / SHP** (atrybuty + geometria lub same atrybuty z identyfikatorami obiektów).
- Przygotuj **zrzuty mapowe** z:
  - siatką,
  - skalą,
  - legendą,
  - opisem klas obiektów (np. SN, WN, słup).

### 3. Kompozycja mapowa

- W QGIS zrób **kompozycję mapową** (np. Print Layout):
  - wszystkie warstwy (orto, EGiB, BDOT10k, ewentualnie KIUT),
  - siatka, skala, legenda, opis,
  - **podpis rzeczoznawcy / prawnika** (np. w stopce).

To jest poziom materiału dowodowego do **opinii prywatnej** lub **załącznika do pozwu / wezwania do usunięcia kolizji**.

---

## Podsumowanie

| Źródło / narzędzie | Rola w dowodzie |
|--------------------|------------------|
| **Kalkulator (KIUT + orto + OSM/BDOT)** | Szybki szacunek, raport roboczy, wstępna weryfikacja. |
| **Geoportal — Analizy BDOT10k** | Lista obiektów z atrybutami do wydruku/zrzutu do akt. |
| **KIUT (Geoportal / WMS)** | Pierwszy dowód wizualny; nie ostateczny bez potwierdzenia wektorami. |
| **QGIS + BDOT10k (SULN01–04) + EGiB + orto** | Twardy dowód: selekcja przestrzenna, eksport CSV/SHP, kompozycja z legendą i podpisem. |

---

*Dokument dodany na podstawie wymagań „dowód twardy” i workflow prawnik + GIS.*
