# Deep research: wizualizacja linii, wykrywanie infrastruktury, słupy — co jest najlepsze dla KSWS

Dokument zbiera: **co jest nam potrzebne do KSWS** (wszystkie dane muszą być pobrane), **najlepsze źródła do wizualizacji**, **słupy** (gdzie je brać i jak nie zapomnieć), oraz **kompletną listę usług WMS/WMTS** z Twojej listy + rekomendacje wdrożenia.

---

## 1. Czego KSWS potrzebuje (dane do raportu)

| Dane | Źródło w backendzie | Uwagi |
|------|----------------------|--------|
| **Geometria działki** | ULDK | Podstawa — bez tego brak analizy. |
| **Linie energetyczne (wektor)** | Overpass (OSM) | Długość przecięcia [m], napięcie (WN/SN/nN), kolizja. **Jedyne źródło wektorowe** do pomiaru długości. |
| **Długość linii [m]** | Overpass → Shapely intersection | Obliczana z przecięcia linii z działką. |
| **Szerokość pasa [m]** | Stałe KSWS / korekta ręczna | Z napięcia (strefa ochronna) lub ręcznie. |
| **Napięcie (WN/SN/nN)** | Overpass (tag `voltage`) | Do stref ochronnych i R1–R5. |
| **Słupy (liczba)** | **OSM** (node power=tower, power=pole) + **BDOT10k** (PTWP_A, PTTR_A) | Używane w R5.1 (fundamenty), R5 (wyspy niedostępne). Wcześniej BDOT10k nie był poprawnie wywoływany — **naprawione** (get_infrastructure_by_type("power_towers", bbox)). |
| **Kolizja (tak/nie)** | Overpass + Shapely | Czy linia przecina działkę. |
| **Granice / numery działek** | KIEG (WMS raster), ULDK (wektor) | Wizualizacja + ewentualnie WFS KIEG. |
| **Uzbrojenie (obecność)** | KIUT WMS (raster) | Detekcja „czy jest linia” (analiza pikseli) — **nie** do długości. |

**Podsumowanie:** Do wyliczeń KSWS **muszą** być pobrane: działka (ULDK), linie wektorowe (Overpass), słupy (OSM + BDOT10k). Reszta to wizualizacja lub uzupełnienie (KIUT, KIEG, GESUT).

---

## 2. Źródła danych vs wizualizacja

| Źródło | Typ | Pobieranie danych (backend) | Wizualizacja (frontend) |
|--------|-----|-----------------------------|--------------------------|
| **Overpass (OSM)** | Wektor (API) | ✅ Główne — linie + słupy (tower, pole) | ✅ PreloadedPowerLayer (GeoJSON z API) |
| **KIUT WMS** | Raster (WMS) | Opcjonalnie: GetMap + analiza pikseli (czy linia w działce) | ✅ Warstwa WMS — przewody + **przewod_urzadzenia** (słupy/studzienki jako obraz) |
| **KIEG** | WMS / WFS | WFS w backendzie (property.py) | ✅ WMS — działki, numery |
| **BDOT10k** | WFS (GUGiK) | ✅ Linie (PTWP_L), **słupy/wieże (PTWP_A, PTTR_A)** — fallback gdy OSM brak | ❌ Na froncie nie mamy jeszcze WMS BDOT10k — można dodać |
| **GESUT** | WFS / WMS | WFS w gesut_client (linie przesyłowe) — alternatywa | WMS z listy: Geoportal G2_GESUT_WMS |
| **Open Infra Map (OIM)** | Kafelki raster/wektor | ❌ Nie pobieramy stąd danych (to OSM) | ✅ Kafelki power/gas/water — do wizualizacji |
| **Open Infra Map – vector tiles** | Wektor (pbf) | ❌ Nie do backendu (te same dane co Overpass) | ✅ Można dodać: `https://openinframap.org/tiles/{z}/{x}/{y}.pbf` + TileJSON `map.json` — lepsza jakość niż raster |

**Wniosek:**  
- **Pobieranie danych:** Overpass (linie + słupy) + BDOT10k (fallback linie + **słupy**). KIUT tylko do detekcji obecności (raster).  
- **Wizualizacja:** KIUT WMS (w tym **przewod_urzadzenia** dla słupów/studzienek), OIM (raster lub vector tiles), KIEG, ewentualnie GESUT WMS, BDOT10k WMS.

---

## 3. Słupy — gdzie i jak

### 3.1 Backend (dane do raportu)

- **OSM (Overpass):** `node["power"="tower"]`, `node["power"="pole"]` — już w zapytaniu, zwracane jako `poles_count`, `poles_geojson`.  
- **BDOT10k WFS:** warstwa **power_towers** (PTWP_A, PTTR_A) — słupy i wieże.  
  - W kodzie było **błędne wywołanie:** `get_infrastructure_in_bbox("power_towers", poles_bbox)` — metoda przyjmuje tylko `bbox`.  
  - **Poprawka:** używamy `get_infrastructure_by_type("power_towers", bbox_dict)` i `count_poles_in_parcel()`.  
  - Dodatkowo: jeśli OSM nic nie zwróci, a BDOT10k ma słupy w działce — ustawiany jest wynik „poles_only” (słupy z BDOT10k).

### 3.2 Wizualizacja słupów

- **KIUT WMS:** warstwa **przewod_urzadzenia** — na mapach pokazuje urządzenia (słupy, studzienki) jako **raster** (bez liczby w backendzie). W `mapSources.js` jest w `uzbrojenie_full`; w BatchHistoryPage/KalkulatorPage używana jako część „KIUT pełne”.  
- **BDOT10k WMS (Geoportal):** `https://mapy.geoportal.gov.pl/wss/service/pub/guest/G2_BDOT10k_WMS/MapServer/WMSServer` — warstwa „Sieci uzbrojenia terenu” / obiekty punktowe (wieże, maszty). Warto dodać jako opcjonalną nakładkę.  
- **PreloadedPowerLayer:** słupy z Overpass/BDOT10k są w `poles_geojson` — frontend może je rysować jako punkty (obecnie linie z backendu; słupy w tym samym GeoJSON lub osobna warstwa).

**Rekomendacja:**  
- Backend: OSM + BDOT10k (słupy) — **zrobione**.  
- Frontend: (1) zawsze włączyć **przewod_urzadzenia** w KIUT tam, gdzie chcemy „wszystkie uzbrojenie”; (2) opcjonalnie dodać warstwę WMS BDOT10k (słupy); (3) rysować `poles_geojson` z wyniku analizy jako punkty na mapie.

---

## 4. Kompletna lista usług (Twoja lista) — zastosowanie w KSWS

### 4.1 Uzbrojenie terenu (sieci, słupy, kable)

| Usługa | URL | Zastosowanie w KSWS |
|--------|-----|----------------------|
| **KIUT** | `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu` | Już używane. Warstwy: przewod_elektroenergetyczny, gazowy, wodociagowy, kanalizacyjny, cieplowniczy, telekomunikacyjny, specjalny, niezidentyfikowany, **przewod_urzadzenia** (słupy/studzienki). |
| **GESUT** | `https://mapy.geoportal.gov.pl/wss/service/pub/guest/G2_GESUT_WMS/MapServer/WMSServer` | Alternatywne źródło sieci. Można dodać jako drugą nakładkę „Uzbrojenie (GESUT)”. |
| **SIDUSIS** | `https://mapy.geoportal.gov.pl/wss/service/pub/guest/G2_SIDUSIS_WMS/MapServer/WMSServer` | Światłowody, zasięg internetu — dla raportów przy działkach z telekomem. Opcjonalnie. |

### 4.2 Ewidencja gruntów (granice, numery)

| Usługa | URL | Zastosowanie |
|--------|-----|--------------|
| **KIEG** | `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow` | Już używane — działki, numery_dzialek. |
| **ULDK** | `https://uldk.gugik.gov.pl/cgi-bin/uldk-wms` | ULDK używamy przez API (GetParcelByIdOrNr), nie WMS. WMS można dodać do mapy jako „Działki ULDK”. |

### 4.3 Planowanie przestrzenne

| Usługa | URL | Zastosowanie |
|--------|-----|--------------|
| **KIMP** | `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego` | MPZP — strefy, linie zabudowy przy gazociągach/LWN. Przydatne do raportów „uwarunkowania”. Dodać jako opcjonalną warstwę. |

### 4.4 Analiza terenu (orto, LIDAR, 3D)

| Usługa | URL | Zastosowanie |
|--------|-----|--------------|
| **Ortofotomapa (WMTS)** | `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/Standardowa` | Odpowiednik obecnego WMS Orto — można ewentualnie przejść na WMTS dla wydajności. |
| **Orto WMS** | `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution` | Już używane jako podkład. |
| **Cieniowanie NMT** | `https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WMS/Shading` | Rzeźba terenu — ślady wykopów, fundamentów. Opcjonalna nakładka. |
| **Model 3D budynków** | `https://mapy.geoportal.gov.pl/wss/service/PZGIK/Budynki3D/WMS/Model` | Wysokość infrastruktury vs budynki. Opcjonalnie (np. zakładka „3D”). |

### 4.5 Obiekty topograficzne (słupy jako punkty)

| Usługa | URL | Zastosowanie |
|--------|-----|--------------|
| **BDOT10k WMS** | `https://mapy.geoportal.gov.pl/wss/service/pub/guest/G2_BDOT10k_WMS/MapServer/WMSServer` | Warstwa „Sieci uzbrojenia terenu” / obiekty punktowe (wieże, maszty). **Rekomendowane do dodania** — wizualizacja słupów z oficjalnej bazy. |

---

## 5. Open Infra Map i QGIS

### 5.1 Open Infra Map

- **Dane:** oparte na OpenStreetMap (to samo co Overpass).  
- **Kafelki raster:** `https://tiles.openinframap.org/power/{z}/{x}/{y}.png` — już używane.  
- **Kafelki wektorowe (pbf):** `https://openinframap.org/tiles/{z}/{x}/{y}.pbf`, konfiguracja: `https://openinframap.org/map.json` (TileJSON).  
  - W QGIS: Vector Tiles Reader / Add Vector Tile Layer.  
  - W aplikacji webowej: można dodać warstwę vector tiles (np. Mapbox GL lub Leaflet z pluginem) dla lepszej jakości linii.  
- **InfraMap „API”:** nie ma osobnego API do pobierania danych — używa się Overpass/OSM. Dla KSWS **Overpass pozostaje źródłem danych**.

### 5.2 QGIS

- **WMS:** Wszystkie linki z powyższej listy można dodać w QGIS: *Dane z innych serwisów → WMS* (wkleić URL, Połącz, wybrać warstwy).  
- **OIM w QGIS:** Vector Tiles → URL `https://openinframap.org/tiles/{z}/{x}/{y}.pbf` lub TileJSON z map.json.  
- **Skala:** Jak w Twojej notatce — KIUT/uzbrojenie wymaga dużego przybliżenia (np. 1:1000), inaczej warstwy mogą być puste.

---

## 6. Rekomendacje wdrożeniowe

### 6.1 Już zrobione

- **Słupy w backendzie:** Overpass (tower, pole) + BDOT10k (power_towers) z poprawnym wywołaniem `get_infrastructure_by_type("power_towers", bbox_dict)`.  
- **Poles-only:** Gdy OSM nie ma linii, ale BDOT10k ma słupy na działce — wynik „poles_only” z BDOT10k.  
- **KIUT:** Pełna lista warstw w mapSources (w tym przewod_urzadzenia).  

### 6.2 Wizualizacja — co dodać w pierwszej kolejności

1. **Warstwa słupów z wyniku analizy**  
   Rysować `poles_geojson` z `master_record` na mapie (punkty) obok PreloadedPowerLayer (linie).  

2. **BDOT10k WMS (słupy/wieże)**  
   Dodać do `mapSources.js` i do kontrolki warstw (np. „Słupy/wieże BDOT10k”) — URL Geoportal G2_BDOT10k_WMS, warstwa z obiektami punktowymi sieci uzbrojenia.  

3. **GESUT WMS**  
   Jako druga nakładka „Uzbrojenie (GESUT)” obok KIUT — dla porównania/uzupełnienia.  

4. **KIMP (MPZP)**  
   Opcjonalna nakładka „Plan zagospodarowania” dla raportów.  

5. **SIDUSIS**  
   Opcjonalnie, gdy raport dotyczy też telekomu/światłowodów.  

### 6.3 Dane — co mamy pełne

- Działka: ULDK ✅  
- Linie (wektor, długość, napięcie): Overpass ✅  
- Słupy (liczba + GeoJSON): OSM + BDOT10k ✅ (po poprawce)  
- Kolizja, strefy: z Overpass + stałe KSWS ✅  
- Korekta ręczna: długość linii, liczba słupów — w formularzu/CSV ✅  

Wszystko, co potrzebne do KSWS, jest **pobierane**; brakujące było poprawne **pobieranie słupów z BDOT10k** — naprawione.

### 6.4 Legenda KIUT (przypomnienie)

- **Linia ciągła czerwona „e”:** kabel energetyczny podziemny.  
- **Linia przerywana czerwona „e”:** linia napowietrzna (lub projektowana).  
- **Okrąg/kwadrat z kropką:** słup lub studzienka (odpowiada warstwie **przewod_urzadzenia**).  
- **t** — telekomunikacja, **g** — gaz.  

---

## 7. Podsumowanie

- **Najlepsze do wizualizacji linii i infrastruktury:** KIUT (w tym przewod_urzadzenia), OIM (raster lub vector tiles), KIEG, ewentualnie GESUT i BDOT10k WMS.  
- **Do wykrywania i pobierania danych dla KSWS:** Overpass (linie + słupy) + BDOT10k (fallback linie + słupy). KIUT tylko pomocniczo (detekcja obecności).  
- **Słupy:** backend — OSM + BDOT10k (poprawione); wizualizacja — KIUT przewod_urzadzenia, BDOT10k WMS, oraz rysowanie `poles_geojson` z analizy.  
- **Lista usług WMS/WMTS:** powyżej skatalogowana z rekomendacją, co dodać (BDOT10k, GESUT, KIMP, SIDUSIS opcjonalnie).  
- **InfraMap / QGIS:** OIM = wizualizacja OSM (raster/vector tiles); dane i tak z Overpass. W QGIS wszystkie podane WMS można dodać ręcznie.  

Ostatnia aktualizacja: po poprawce BDOT10k (słupy) w `backend/modules/infrastructure.py` i przeglądzie Overpass, KIUT, BDOT10k, GESUT, mapSources, dokumentacji MAPY_I_INTEGRACJE_API.
