# Kalkulator Roszczeń — Frontend i mapowanie UI ↔ Backend

Frontend: **ArchitectUI React Free** — czysty szablon z [GitHub](https://github.com/DashboardPack/architectui-react-theme-free), jak w [demo](https://demo.dashboardpack.com/architectui-react-free/#/dashboards/basic).

## Struktura frontendu

| Ścieżka | Opis |
|---------|------|
| `frontend-react/` | Aplikacja React (ArchitectUI) — główna |
| `frontend/` | Prosty HTML/JS — fallback bez bundlera |

Backend serwuje frontend w kolejności: `frontend-react/build` → `frontend/build` → `frontend`.

## Mapowanie pól API → UI (podgląd wejścia/wyjścia)

### Wejście — `POST /api/analyze` (Analiza)

| Pole API (backend) | UI (KalkulatorPage) | Zgodność |
|-------------------|---------------------|----------|
| `parcel_ids`      | Identyfikator działki *     | OK |
| `obreb`           | Obręb (opc.)               | OK |
| `county`          | Powiat (opc.)              | OK |
| `municipality`    | Gmina (opc.)               | OK |
| `infra_type_pref` | (stałe: elektro_SN)        | ukryte |
| `use_cache`       | (stałe: true)              | ukryte |

### Wejście — `GET /api/parcel/{parcel_id}` (Szybki podgląd)

| Endpoint   | UI (PodgladPage)           | Zgodność |
|------------|----------------------------|----------|
| `parcel_id` w URL | Identyfikator działki | OK |

### Wyjście — `parcels[0].master_record` → UI (Analiza)

| Backend (ścieżka)               | Pole / źródło           | UI (widget)        | Zgodność |
|---------------------------------|-------------------------|--------------------|----------|
| `metadata`                      | `teryt_id`              | Raport (TERYT)     | OK — narzędzie wewnętrzne |
| `geometry`                      | `area_m2`               | Wielkość [m²]      | OK |
| `geometry`                      | `perimeter_m`           | EGiB · obwód       | OK |
| `geometry`                      | `shape_class`           | EGiB · kształt     | OK |
| `geometry`                      | `geojson_ll`            | Mapa (działka)     | OK |
| `geometry`                      | `centroid_ll`           | Centrum mapy       | OK |
| `parcel_metadata`               | `commune`, `county`, `region` | Lokalizacja    | OK |
| `egib.land_use[0]`              | `class`                 | Główny użytek (OZK)| OK |
| `planning`                      | `mpzp_active`           | Potencjał (Budowlana/Rolna) | OK |
| `planning`                      | `usage`, `studium_usage`| Prawo / Cena       | OK |
| `infrastructure.power`          | `exists`                | Słup / linia       | OK |
| `infrastructure.power`         | `voltage`, `voltage_category` | Słup napięcie  | OK |
| `infrastructure.power`         | `buffer_zone_m`         | Pas ochronny [m]   | OK |
| `infrastructure.power`         | `length_m`              | Długość linii [m]  | OK |
| `infrastructure.power`         | `line_geojson`          | Mapa (linia)       | — GESUT zwraca WMS, nie wektor |
| `infrastructure.utilities`     | `gaz`, `woda`, `kanal`  | Media              | OK |
| `buildings`                     | `count`                 | Zabudowania        | OK |
| `market_data`                   | `average_price_m2`      | Cena rynkowa       | OK |
| `market_data`                   | `rcn_price_m2`, `gus_price_m2` | Źródło ceny   | OK |
| `investments`                   | `active_permits`        | Pozwolenia GUNB    | OK |

### Wyjście — `GET /api/parcel/{parcel_id}` → UI (Szybki podgląd)

| Backend (terrain) | Pole       | UI (PodgladPage) | Zgodność |
|-------------------|------------|------------------|----------|
| —                 | `area_m2`  | Powierzchnia     | OK |
| —                 | `commune`  | Gmina            | OK |
| —                 | `county`   | Powiat           | OK |
| —                 | `voivodeship` | Województwo   | OK |
| —                 | `geometry` | Mapa (GeoJSON)   | OK |
| —                 | `centroid` | { lon, lat } → centrum mapy | OK |
| —                 | `ok`, `status`, `error` | Status / błąd | OK |

## Uruchomienie

### Tryb deweloperski

```bash
# Terminal 1 — backend
uvicorn backend.main:app --reload --port 8080

# Terminal 2 — frontend React (proxy /api → 8080)
cd frontend-react && npm install --legacy-peer-deps && npm start
```

- Backend: http://localhost:8080
- Frontend: http://localhost:3001/#/kalkulator/analiza

### Build produkcyjny

```bash
cd frontend-react && npm run build
```

Build trafia do `frontend-react/build/`. Backend sprawdza ten katalog jako pierwszy i serwuje SPA.

## Pozycje menu (powiązane z backendem)

| Pozycja | Endpoint / funkcja |
|---------|--------------------|
| **Analiza** | `POST /api/analyze` (1–3 działki synchronicznie) |
| **Batch / Kolejka** | `POST /api/analyze` (4+ działki) → `GET /api/status/{job_id}`, `WS /ws/{job_id}` |
| **Szybki podgląd** | `GET /api/parcel/{parcel_id}` (ULDK) |
| **Admin** | `GET /api/health`, `POST /api/cache/clear` |

## Deploy na Firebase Hosting

1. Zainstaluj Firebase CLI: `npm install -g firebase-tools` (lub użyj rozszerzenia Firebase w Cursor/VS Code)
2. Zaloguj: `firebase login`
3. W `.firebaserc` ustaw `YOUR_PROJECT_ID` na ID projektu z [Firebase Console](https://console.firebase.google.com/)
4. (Opcja) Dla produkcji z własnym backendem utwórz `frontend-react/.env.production`:
   ```
   VITE_API_URL=https://twoj-backend.run.app
   ```
5. Deploy:
   ```bash
   cd frontend-react && npm run deploy
   ```
   lub: `firebase deploy --only hosting`

Frontend (statyczny) będzie pod `https://YOUR_PROJECT_ID.web.app`. Backend należy zdeployować osobno (np. Cloud Run).

## Usunięte pliki (nieużywane)

- `PageTitle.jsx`, `PageTitleAlt.jsx`, `PageTitleAlt3.jsx` i ich Examples
- `FooterMegaMenu.jsx`, `FooterDots.jsx`
- `TabsContent/ChatExample.jsx`, `TimelineExample.jsx`, `SystemExample.jsx`
