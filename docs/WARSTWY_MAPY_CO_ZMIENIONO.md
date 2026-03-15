# Warstwy na mapie — co jest teraz i co mogło być zmienione

## Obecny stan (po ewentualnych zmianach Copilot / agentów)

### Analiza działki → zakładka „Mapa 2D”

| Kolejność (od dołu) | Warstwa | Źródło |
|---------------------|--------|--------|
| 1. **Podkład** | Geoportal Orto (WMS) | `mapy.geoportal.gov.pl` — ortofotomapa PL |
| 2. | KIEG GUGiK (działki + numery) | `integracja.gugik.gov.pl` — KrajowaIntegracjaEwidencjiGruntow |
| 3. | **InfrastructureLayer** (kontrolka warstw) | OIM (Open Infra Map) + KIUT (elektro, pełne, gaz, woda, kanal, ciepło, telekom) |
| 4. | PreloadedPowerLayer | GeoJSON linii z backendu (Overpass) |
| 5. | GeoJSONLayers | Granica działki |

- **Kontrolka warstw (ikona warstw):** tylko **nakładki** (overlays). **Brak przełącznika podkładu** — zawsze włączony jest Geoportal Orto.
- W `InfrastructureLayer` wywołanie to: `L.control.layers(null, overlays, …)` — pierwszy argument `null` = brak wyboru innego podkładu.

### Analiza działki → zakładka „Outdoor”

- Podkład: **Geoportal Orto (WMS)** (ten sam co w Mapa 2D).
- Brak osobnej kontrolki warstw; tylko granica działki.

### Analiza hurtowa (BatchAnalysisPage) → mapa zbiorcza

- **BatchMapSection.jsx:** podkład **tylko Geoportal Orto (WMS)**. Nakładki: OIM, GUGIK (działki), KIUT elektro. **Brak wyboru Satelita / Topo** w tej komponencie.

### Batch w KalkulatorPage (BatchMapLayerControl)

- **Podkłady:** Satelita (Esri), Topo (Esri) — przełącznik działa.
- Domyślnie: **Satelita**. Nakładki: OIM, GUGIK, KIUT elektro.

### Historia raportów (BatchHistoryPage) — raport HTML

- W inline skrypcie: Orto, EGiB, KIUT (elektro + pełne), OIM, potem `control.layers` z Orto, EGiB, KIUT elektro, KIUT pełne, OIM, gaz, woda, kanal.

---

## Co mogło zostać zmienione (podsumowanie)

1. **Podkład w Analizie działki (Mapa 2D)**  
   W **dokumentacji** (`MAPY_I_INTEGRACJE_API.md`) jest zapis: *„Analiza działki → Mapa 2D: Base = Esri Satellite (TileLayer)”*.  
   W **kodzie** podkładem jest **Geoportal Orto (WMS)**, nie Esri Satellite. Ktoś mógł to zmienić na ortofotomapę PL (celowo lub przy „aktualizacji map”).

2. **Brak przełącznika podkładu w Analizie działki**  
   Na mapie pojedynczej działki użytkownik **nie może** wybrać np. Satelity Esri zamiast Orto — kontrolka pokazuje tylko warstwy typu OIM/KIUT. W batchu (BatchMapLayerControl) przełącznik Satelita/Topo jest.

3. **BatchMapSection**  
   Mapa zbiorcza po analizie CSV ma tylko Orto jako podkład, bez opcji Satelita/Topo (w przeciwieństwie do BatchMapLayerControl w tym samym pliku przy innej mapie).

4. **Spójność z mapSources.js**  
   W `mapSources.js` są zdefiniowane BASE_LAYERS (Esri Satellite, Esri Topo, Carto, OpenTopoMap) i GUGIK_WMS (ORTO, KIUT, KIEG), OIM_TILES. W **Analizie działki** podkład jest ustawiony na sztywno (WMSTileLayer Orto), bez importu z `mapSources.js` i bez użycia BASE_LAYERS.

---

## Jeśli chcesz przywrócić Esri Satellite lub wybór podkładu

- W **KalkulatorPage** (Mapa 2D): dodać np. `TileLayer` z Esri World Imagery (z `mapSources.js`) jako drugi wariant podkładu i przekazać do `L.control.layers(baseLayers, overlays, …)` obiekt `baseLayers` z Orto i Satelitą, zamiast `null`.
- Dla **BatchMapSection**: dodać drugi podkład (np. Esri Satellite) i rozszerzyć kontrolkę warstw o przełącznik podkładu (np. Orto / Satelita).

---

## Co jest na GitHubie (origin/main) vs lokalnie — mapy i warstwy z liniami

Sprawdzone przez `git show origin/main` i `git diff origin/main`.

### Analiza działki → Mapa 2D (zakładka Infrastruktura)

| | **Na GitHubie (origin/main)** | **U Ciebie lokalnie** |
|--|-------------------------------|------------------------|
| **Podkład** | **Esri World Imagery** (TileLayer, satelita) | **Geoportal Orto (WMS)** |
| Warstwy nakładkowe | InfrastructureLayer, PreloadedPowerLayer, GeoJSONLayers (granica) | To samo + dodatkowo KIEG GUGiK (WMSTileLayer) przed InfrastructureLayer |
| Linie | OIM + KIUT (w InfrastructureLayer), PreloadedPowerLayer (Overpass GeoJSON) | To samo + lokalnie: w InfrastructureLayer jest też warstwa „KIUT pełne” (wszystkie przewody), wyższe zIndex (700/900), bringToFront |

Na GitHubie główna mapa Analizy działki ma **podkład satelitarny Esri**; lokalnie został zastąpiony **Geoportalem Orto (WMS)**. Warstwy pokazujące linie (OIM, KIUT, PreloadedPowerLayer) są w obu wersjach; lokalnie są dopracowania (pełne KIUT, zIndex, Orto).

### Mapy w raportach (inline HTML w KalkulatorPage)

| | **Na GitHubie** | **Lokalnie** |
|--|-----------------|--------------|
| Mini-mapa w karcie wyniku | CartoDB light, EGiB, OIM power | **Geoportal Orto** (WMS), EGiB, KIUT elektro, OIM power (z zIndex 400/600) |
| BatchHistoryPage / inne inline | Carto light, EGiB, OIM | **Geoportal Orto**, EGiB, KIUT elektro w kontrolce, OIM (opacity 0.95) |

Na GitHubie w raportach jest **Carto light**; lokalnie — **Geoportal Orto** i jawnie dodana warstwa KIUT (linie elektroenergetyczne).

### BatchMapLayerControl (mapa batch w KalkulatorPage)

- **Na GitHubie:** Satelita (Esri), Topo; nakładki OIM (0.9), GUGIK (0.65), KIUT elektro (0.85).
- **Lokalnie:** To samo + version/srs dla WMS, zIndex (400, 950, 1000), OIM opacity 1.0, KIUT 0.98, bringToFront.

### Commit w historii (b060ddd1) — „feat(maps): Esri Satellite, KIUT 100%, cyan/magenta działki”

W tym commicie było m.in.:
- Esri Satellite jako podkład w mini-mapach w raporcie + `L.control.layers` z wyborem „Satelita (Esri)” i nakładkami KIUT, OIM, EGiB.
- KIUT z opacity 1.0 i warstwami: elektro + gaz + woda + kanalizacja.
- Kółko 200 m (zasięg analizy) w kolorze białym; działka: cyan (#00ffff) / magenta (#ff0055).

Obecny **origin/main** w głównej mapie Analizy działki nadal ma **Esri** (TileLayer), ale w raportach inline mógł wrócić Carto (bez Esri w kontrolce). Lokalnie masz **Orto wszędzie** tam, gdzie na GitHubie jest Esri/Carto.

---

*Ostatnia aktualizacja: po przeglądzie KalkulatorPage, BatchMapSection, BatchHistoryPage, mapSources.js, MAPY_I_INTEGRACJE_API.md oraz git show/diff origin/main.*
