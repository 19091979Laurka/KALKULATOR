# Handoff: UI 1:1 ArchitectUI – na czym skończono

## Źródło theme
- Repo: **https://github.com/DashboardPack/architectui-react-theme-free**
- Demo: **https://demo.dashboardpack.com/architectui-react-free/#/dashboards/basic**

## Co jest zrobione

1. **Front w projekcie**  
   Cały front to sklonowany ArchitectUI w katalogu **`frontend-react/`**. Struktura 1:1 z Git (wszystkie strony, komponenty, style, routing).

2. **Branding / nazwy**  
   Tylko nazwy zmienione na polskie / Kalkulator:
   - `index.html`: tytuł „Kalkulator Roszczeń | Dashboard”, `lang="pl"`.
   - `Layout/AppLogo`: tekst „Kalkulator Roszczeń” zamiast logo.
   - `Layout/AppNav/NavItems.jsx`: całe menu po polsku.
   - `Layout/AppNav/VerticalNavWrapper.jsx`: nagłówki sekcji (Menu, Komponenty UI, Widżety pulpitu, Formularze, Wykresy, Wersja PRO).
   - Nagłówki pulpitu (Pulpit CRM, Pulpit analityczny, Pulpit sprzedaży, Pulpit handlowy, Pulpity minimalne, Pulpit kontenerowy).
   - UserBox, loadery w AppMain, breadcrumb, footer, copyright (LoginBoxed) – po polsku.

3. **Strona Kalkulatora (główna funkcja)**  
   Plik: **`frontend-react/src/DemoPages/Kalkulator/KalkulatorPage.jsx`**
   - PageTitleAlt2 + icon-gradient bg-ripe-malin.
   - Karta z zakładkami (Tabs): „Analiza” (formularz działka/powiat/gmina, przycisk Analizuj), „Opcje” (placeholder).
   - Placeholder: `widget-content bg-heavy-rain`, ikona, widget-heading/subheading.
   - Po wyniku: 4 karty statystyk w stylu theme – `card mb-3 widget-content` z gradientami (`bg-night-fade`, `bg-arielle-smile`, `bg-ripe-malin`/`bg-grow-early`, `bg-mean-fruit`/`bg-tempting-azure`), CountUp na powierzchni, widget-heading/subheading/numbers.
   - Mapa Leaflet (MapContainer + GeoJSON działka + linia energetyczna).
   - 4 karty danych (EGiB, Media, Sieci przesyłowe, Prawo/RCN): `widget-content text-start` + `icon-wrapper rounded-circle` (bg-focus, bg-info, bg-danger/bg-success, bg-warning).
   - Opakowanie w TransitionGroup + CSSTransition (jak CRM).

4. **Routing**  
   - `Layout/AppMain/index.jsx`: route `/kalkulator/*` → Kalkulator, domyślny redirect `/` → `/kalkulator/analiza`.

5. **Proxy / backend**  
   - `vite.config.js`: `server.host: 'localhost'`, proxy `/api` → `http://localhost:8080`.

## Główny plik do dalszej pracy (strona Kalkulatora)

- **Ścieżka:** `frontend-react/src/DemoPages/Kalkulator/KalkulatorPage.jsx`
- **Link w repo (względny):** `frontend-react/src/DemoPages/Kalkulator/KalkulatorPage.jsx`

Tu jest cała logika i UI strony „Kalkulator Roszczeń” (formularz, wywołanie API, wyniki, mapa, widget-content, gradienty, CountUp). Reszta UI to niezmieniony theme z Git + polskie etykiety.

## Co ewentualnie dokańczać (dla innego agenta)

- Dopasowanie każdego detalu do demo (np. odstępy, rozmiary fontów, cienie) – porównać z `DemoPages/Dashboards/` i `DemoPages/Widgets/ChartBoxes3/`.
- Strona Kalkulatora: ewentualne kolejne sekcje lub warianty layoutu wzorowane na innych stronach theme (np. więcej kart w stylu Chart Boxes, progress bary).
- Testy w przeglądarce: `npm start` w `frontend-react`, backend na 8080.

## Uruchomienie

```bash
# Backend
uvicorn backend.main:app --reload --port 8080

# Frontend (w frontend-react)
npm install --legacy-peer-deps && npm start
```

Front: **http://localhost:3001** → domyślnie **#/kalkulator/analiza**.
