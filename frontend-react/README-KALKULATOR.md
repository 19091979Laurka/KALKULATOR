# Kalkulator Roszczeń — frontend React (ArchitectUI)

Szablon: [ArchitectUI React Theme Free](https://github.com/DashboardPack/architectui-react-theme-free).

## Uruchomienie

1. **Backend (API)** — w katalogu głównym projektu:
   ```bash
   uvicorn backend.main:app --reload --port 8080
   ```

2. **Frontend React** — w tym katalogu (`frontend-react`):
   ```bash
   npm install --legacy-peer-deps
   npm start
   ```
   Aplikacja otworzy się pod adresem **http://localhost:3001**.

3. **Proxy API** — w `vite.config.js` zapytania do `/api` są przekierowywane na `http://localhost:8080`, więc przy uruchomionym backendzie formularz „Analizuj” i wyniki działają z API KALKULATOR.

## Strona Kalkulatora

- **URL:** http://localhost:3001/#/kalkulator/analiza (strona domowa po wejściu na 3001).
- Formularz: identyfikator działki, powiat/gmina (opcjonalnie), przycisk „Analizuj”.
- Po analizie: karty statystyk, mapa (Leaflet) z działką i linią energetyczną, karty EGiB, media, sieci przesyłowe, prawo/RCN.

## Build pod produkcję

```bash
npm run build
```
Katalog `build/` można serwować np. z backendu (FastAPI `StaticFiles` lub serwowanie `index.html` dla SPA i plików z `build/`).
