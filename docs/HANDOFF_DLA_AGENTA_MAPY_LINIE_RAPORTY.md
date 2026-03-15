# Handoff dla agenta (Claude Code) — mapy, linie, raporty, pobieranie danych

Wiadomość do Ciebie: poniżej skondensowany kontekst projektu i **konkretne problemy / obszary**, nad którymi warto się pochylić. Możesz to wykorzystać do usprawnień map, wyświetlania linii, wyliczeń i raportów.

---

## Czym jest projekt

**KALKULATOR KSWS** — kalkulator roszczeń przesyłowych (linie energetyczne na działkach).  
- **Frontend:** React (Vite), `frontend-react/src/DemoPages/Kalkulator/` — Analiza działki, Historia analiz, Analiza hurtowa (batch CSV), Historia raportów.  
- **Backend:** FastAPI, `backend/` — ULDK (geometria działki), Overpass (linie + słupy), KIUT WMS (raster uzbrojenia), GUS BDL (ceny), BDOT10k (fallback linie/słupy).  
- **Raporty:** pojedyncza działka → zapis w localStorage → Historia analiz → podgląd HTML z mapą; batch → backend → Historia raportów. PDF z backendu (`/api/report/pdf`).

---

## Z czym mamy problem (nad czym się przyjrzeć)

### 1. Mapy i wyświetlanie

- **Raport pojedynczej działki (Historia analiz):** mapa w HTML (Leaflet w nowej karcie) bywała niewidoczna — poprawiono wysokość kontenera (`#map-wrap` 420px), opóźniony init i `invalidateSize()`. Warto zweryfikować, czy przy różnych przeglądarkach / rozdzielczościach mapa zawsze się rysuje i czy nie ma pustych kafelków przy zbliżeniu.
- **Przy dużym zbliżeniu** mapa czasem „się nie pokazywała” (dopiero po oddaleniu) — możliwe przyczyny: `fitBounds` bez sensownego `maxZoom`, WMS Geoportal/KIUT wymagające skali (np. 1:1000), puste kafelki. Warto ujednolicić zachowanie (Analiza działki vs raport) i ewentualnie dodać limity zoom lub fallback.
- **Legenda i kontrolka warstw:** legendę (kolory linii) zmniejszono, żeby nie zasłaniała mapy; warstwy w „kwadraciku” są domyślnie wszystkie włączone. Można pomyśleć o lepszym UX (np. legenda zwijana, tooltipy, kolejność warstw).

### 2. Linie na mapie

- **Żółta linia vs światłowód:** użytkownik widzi żółtą linię, a to ma być światłowód (telekom). Obecnie Overpass/PreloadedPowerLayer pokazują tylko **power** (line, cable, tower, pole); **telekom** nie jest pobierany ani rysowany. KIUT WMS ma warstwę `przewod_telekomunikacyjny` (włączoną domyślnie). Możliwe kierunki: osobna warstwa/kolory dla telekomu, albo rozróżnienie w backendzie (pobieranie linii telekom z Overpass/BDOT?) i przekazanie do frontu.
- **Spójność:** to samo źródło danych (Overpass) dla długości linii i dla wizualizacji (PreloadedPowerLayer). KIUT/OIM to tylko wizualizacja (raster/kafelki). Warto upewnić się, że opis w UI (np. „Linie energetyczne”) nie myli z telekomem.

### 3. Wyliczenia i dane

- **Brak długości linii / brak powierzchni pasa:** gdy Overpass nie zwróci linii (np. tylko światłowód, brak power), `line_length_m` i `band_area_m2` są 0. Backend ma korektę ręczną (`manual_line_length_m`). Warto: jasno pokazać w UI „Brak długości — uzupełnij w Korekcie ręcznej” gdy 0; ewentualnie rozważyć pobieranie długości dla telekomu (pas 3 m) i osobne wyliczenie.
- **Słupy:** są z Overpass (tower, pole) i BDOT10k (PTWP_A); wyświetlanie `poles_geojson` na mapie i w raporcie — sprawdzić, czy liczba słupów i punkty na mapie są spójne.
- **Ceny 0 w raporcie:** wynikają z backendu — GUS BDL timeout/błąd lub brak RCN. W raporcie jest fallback `average_price_m2 ?? rcn_price_m2 ?? gus_price_m2`. Można dodać wyraźny komunikat „Brak ceny z API — uzupełnij w Korekcie ręcznej i uruchom analizę ponownie”.

### 4. Raporty

- **Ujednolicenie:** ten sam raport (pojedyncza działka) jest generowany jako HTML w `HistoriaAnalizPage.jsx` (buildSingleHtml) i wyświetlany w nowej karcie (PrintPreviewPage). Mapy, tabelki R1–R5, Track A/B — wszystko z `full_master_record`. Upewnij się, że przy zmianach w strukturze odpowiedzi API (np. nowe pola w `market_data` / `ksws`) raport je wykorzystuje i nie łamie się.
- **PDF z backendu:** `/api/report/pdf` — osobna ścieżka; jeśli zmieniasz wyliczenia lub strukturę master_record, warto przetestować i PDF.

### 5. Skrypty pobierania danych

- **Backend:** `backend/modules/infrastructure.py` — Overpass (linie + słupy), fallback BDOT10k (linie + słupy), opcjonalnie KIUT WMS (detekcja pikseli). `backend/integrations/` — overpass.py, bdot10k.py, gesut_client.py, uldk.  
- **Pomysły:** retry/backoff przy timeout Overpass; cache wyników dla tego samego bbox; ewentualnie pobieranie linii telekom z Overpass (np. `telecom=line`) i osobna ścieżka wyliczeń dla „tylko światłowód”; sprawdzenie, czy BDOT10k WFS zawsze zwraca poprawne typy (power_towers vs power_lines).

---

## Gdzie szukać w kodzie

| Temat | Gdzie |
|-------|--------|
| Mapa w raporcie pojedynczej działki | `frontend-react/.../HistoriaAnalizPage.jsx` — buildSingleHtml, sekcja `<div id="map-wrap">`, skrypt init mapy (Leaflet). |
| Mapa Analiza działki (Infrastruktura) | `KalkulatorPage.jsx` — InfrastructureLayer, PreloadedPowerLayer, GeoJSONLayers, legenda (ksws-map-legend), fitBounds. |
| Warstwy WMS / źródła | `mapSources.js` — GUGIK_WMS (ORTO, KIUT, KIEG), OIM_TILES. |
| Zapis do historii (full_master_record) | `KalkulatorPage.jsx` — po runAnalysis, saveToHistory(newEntry) z full_master_record: mr2. |
| Wyliczenia (cena, Track A/B, pas) | `backend/modules/property.py` — market_data, compensation, ksws (line_length_m, band_area_m2). |
| Pobieranie linii/słupów | `backend/modules/infrastructure.py`, `backend/integrations/overpass.py`, `backend/integrations/bdot10k.py`. |
| Dokumentacja map/danych | `docs/MAPY_I_INTEGRACJE_API.md`, `docs/RESEARCH_WIZUALIZACJA_LINII_SLUPOW_KSWS.md`, `docs/DLACZEGO_CENY_0_W_RAPORCIE.md`. |
| **Dowód twardy (BDOT, KIUT, QGIS)** | `docs/DOWOD_TWARDY_BDOT_KIUT_GEOPORTAL_QGIS.md` — Geoportal Analizy BDOT10k, KIUT jako pierwszy dowód, workflow QGIS (SULN01–04, selekcja, eksport CSV/SHP, kompozycja pod opinie/pozew). |

---

## Pomysły do rozważenia (możesz wpaść na lepsze)

- **Mapy:** jeden wspólny komponent/konfiguracja dla „mapy z działką + linie” (Analiza działki i raport HTML), żeby zachowanie zoomu, warstw i legendy było identyczne.  
- **Linie:** rozróżnienie power vs telekom (kolory/opis), ewentualnie osobna warstwa wektorowa dla telekomu z Overpass.  
- **Wyliczenia:** gdy `line_length_m === 0` ale użytkownik ma „światłowód” — sugerować korektę ręczną (długość + ewentualnie pas 3 m).  
- **Raporty:** jeden „źródło prawdy” dla pól (np. lista pól wymaganych do raportu) i walidacja przed generowaniem HTML/PDF.  
- **Pobieranie:** retry dla Overpass/GUS; opcjonalny cache per bbox; logowanie błędów GUS/ULDK w odpowiedzi (np. `market_data.status`), żeby w UI pokazać „Brak ceny z GUS — timeout”.
- **Dowód twardy:** dla użytkowników potrzebujących materiału pod opinie/pozew — patrz `docs/DOWOD_TWARDY_BDOT_KIUT_GEOPORTAL_QGIS.md` (Geoportal Analizy BDOT10k, KIUT, QGIS + BDOT SULN01–04, eksport CSV/SHP, kompozycja z legendą i podpisem).

---

Dzięki za pomoc; jeśli coś będzie niejasne, w tych plikach i w `docs/` jest więcej kontekstu.
