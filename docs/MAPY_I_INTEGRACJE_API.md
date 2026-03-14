# Mapy i integracje API — logika i zastosowanie

Dokument opisuje **skąd biorą się dane** (backend) i **jak są pokazywane na mapach** (frontend): które API, które warstwy, na jakim ekranie.

---

## 1. Backend — źródła danych (analiza działki / batch)

| Źródło | API / serwis | Co pobiera | Użycie w analizie |
|--------|--------------|------------|--------------------|
| **ULDK** | `https://uldk.gugik.gov.pl/` | Geometria działki (GeoJSON), powierzchnia, TERYT, gmina/powiat | `backend/integrations/uldk.py`, `terrain.py` — **podstawa**: bez ULDK nie ma działki |
| **Overpass (OSM)** | `https://overpass-api.de/api/interpreter` | Linie energetyczne (wektor), napięcie, atrybuty | `backend/integrations/overpass.py`, `infrastructure.py` — **długość linii**, kolizja, obliczenia KSWS |
| **KIUT WMS** | `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu` | **Raster** (obraz) — **nie** wektory | W backendzie: GetMap + analiza czerwonych pikseli → detekcja „czy linia w działce” (`_check_kiut_wms_pixel_analysis`). **Nie** służy do pomiaru długości. |
| **KIEG** | `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow` | Ewidencja gruntów (WFS) | `backend/integrations/kieg.py`, `property.py` — dane uzupełniające o działce |
| **RCN GUGiK** | (w backendzie) | Ceny transakcji gruntów | Wycena wartości działki |
| **GUS BDL** | (w backendzie) | Ceny gruntów rolnych | `gus_fixed.py` — wycena dla rolnictwa |
| **GESUT** | `integracja.gugik.gov.pl` (KrajowaIntegracjaGEBUL) | Uzbrojenie (WFS) | `gesut_client.py` — opcjonalnie |

**Przepływ analizy:**  
`POST /api/analyze` → `PropertyAggregator.generate_master_record()` → `fetch_terrain()` (ULDK) → `fetch_infrastructure()` (Overpass + opcjonalnie KIUT WMS pixel check) → wycena KSWS.  
Batch: `POST /api/analyze/batch` → prefetch Overpass dla regionu → ta sama logika per działka.

---

## 2. Frontend — warstwy map (wyświetlanie)

### 2.1 Podkłady (base layers)

| Warstwa | URL / serwis | Gdzie używana |
|---------|----------------|----------------|
| **Esri World Imagery** | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | Analiza działki (Mapa 2D), mapa w PDF/raport, Historia analiz, Historia raportów (batch) |
| **Esri World Topo** | `.../World_Topo_Map/MapServer/tile/...` | Analiza hurtowa (mapa zbiorcza) — przełącznik z Satelitą |
| **Carto light** | `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png` | Mapa zbiorcza wielu działek (KalkulatorPage `initCollectiveMap`), BatchHistory collective map |
| **OpenTopoMap** | `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` | Analiza działki — zakładka „Outdoor” |

### 2.2 Nakładki (overlays) — infrastruktura i działki

| Warstwa | Źródło | Opis | Gdzie |
|---------|--------|------|--------|
| **KIUT WMS** | `integracja.gugik.gov.pl/.../KrajowaIntegracjaUzbrojeniaTerenu` | Raster: przewod_elektroenergetyczny, przewod_gazowy, wodociagowy, kanalizacyjny (opcjonalnie cieplowniczy, telekom) | Analiza działki (InfrastructureLayer), Batch mapa, Historia raportów, PDF/raport |
| **KIEG WMS** | `integracja.gugik.gov.pl/.../KrajowaIntegracjaEwidencjiGruntow` | Raster: dzialki, numery_dzialek | Jak wyżej + mapa zbiorcza |
| **Open Infra Map (OIM)** | `https://tiles.openinframap.org/power/{z}/{x}/{y}.png` | Kafelki linii energetycznych (OSM) | Analiza działki, Batch, Historia, PDF |
| **OIM gas/water/sewer** | `.../gas/`, `.../water/`, `.../sewer/` | Inne sieci | Tylko mapa zbiorcza (wielodziałkowa) |
| **Overpass (wektor)** | Dane z backendu (GeoJSON w `master_record`) | Linie i słupy z OSM — **pre-loaded** po analizie | Analiza działki: `PreloadedPowerLayer` (react-leaflet), nie osobne zapytanie z frontu |

### 2.3 Który ekran — która mapa

| Ekran | Base | Nakładki (domyślnie) | Uwagi |
|-------|------|----------------------|--------|
| **Analiza działki → Mapa 2D** | Esri Satellite (TileLayer) | InfrastructureLayer (OIM + KIUT + KIEG), PreloadedPowerLayer (Overpass z API), GeoJSONLayers (granica działki + KIUT WMS + okrąg 200 m) | Jedna działka; dane linii z wyniku analizy |
| **Analiza działki → Outdoor** | OpenTopoMap | GeoJSONLayers (ta sama działka + KIUT) | Inny podkład, ta sama działka |
| **Analiza hurtowa → mapa** | Esri Satelita (BatchMapLayerControl) | OIM, KIEG, KIUT (przełącznik warstw) | Lista działek batch |
| **Historia raportów — mapa pojedyncza** | Esri Satellite | KIUT, KIEG, OIM, granica działki (cyan/magenta) | Jak w PDF: satelita + uzbrojenie |
| **Historia raportów — mapa zbiorcza** | Carto light | KIEG, KIUT (elektro), OIM power | Wiele działek na jednej mapie |
| **Raport PDF / podgląd druku** | Esri (w HTML) | KIUT, KIEG, OIM, działka (cyan/magenta), okrąg 200 m biały | Generowany HTML z inline JS |

---

## 3. Zasady spójności

- **Pobieranie danych (długość linii, kolizja):** tylko **Overpass** (wektor) w backendzie. KIUT na froncie to **wyłącznie wizualizacja** (WMS raster).
- **Detekcja „czy jest linia”:** backend może użyć **KIUT WMS** (analiza pikseli) jako uzupełnienie; front tylko rysuje warstwę KIUT.
- **Jedna działka:** geometria z **ULDK** (backend) → front dostaje `geojson` w wyniku analizy i rysuje ją (GeoJSONLayers).
- **URL-e:** w backendzie: `infrastructure.KIUT_WMS_URL`, `overpass.OVERPASS_URL`, `uldk` base. Na froncie **wspólna definicja**: `frontend-react/src/DemoPages/Kalkulator/mapSources.js` — BASE_LAYERS, GUGIK_WMS (KIUT, KIEG), OIM_TILES. Import z `mapSources.js` można stopniowo wstawiać w KalkulatorPage, BatchHistoryPage, HistoriaAnalizPage, żeby zmiana API była w jednym miejscu.

---

## 4. Szybka ściąga

- **Geometria działki** → ULDK (backend).  
- **Linie energetyczne (długość, kolizja)** → Overpass (backend).  
- **Pokazanie linii na mapie** → front: KIUT WMS (raster PL) + OIM (kafelki) + ewentualnie wektor z Overpass (PreloadedPowerLayer).  
- **Podkład mapy** → Esri Satellite domyślnie (analiza, raport, historia); Carto/OpenTopo dla innych widoków.
