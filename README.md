# KALKULATOR — System Analizy Roszczeń Odszkodowawczych

System do automatycznej analizy kolizji infrastruktury przesyłowej na działkach ewidencyjnych oraz kalkulacji wynagrodzeń (Spec v3.0).

## 📂 Struktura Projektu

- **`backend/`** — Serwer FastAPI, integracje z GIS (ULDK, OSM, KIUT), logika wyceny KSWS.
- **`frontend-react/`** — Aplikacja webowa (React + Vite), interaktywne mapy Leaflet, raporty "premium".
- **`data/`** — Historia analiz (JSON), dane cache, pliki pomocnicze.
- **`docs/`** — Pełna dokumentacja projektu podzielona na sekcje:
  - `docs/analysis/` — Analizy matematyczne i lesson learned.
  - `docs/design/` — Design UI/UX i palety kolorów.
  - `docs/deployment/` — Instrukcje Google Cloud.
  - `docs/manuals/` — Instrukcje dla użytkowników i deweloperów.
  - `docs/status/` — Podsumowania implementacji.
- **`scripts/`** — Skrypty pomocnicze i legacy (stare demo, testy).
- **`tests/`** — Testy jednostkowe i integracyjne.

## 🚀 Szybki Start

1. **Backend**: 
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```
2. **Frontend**:
   ```bash
   cd frontend-react
   npm install
   npm run dev
   ```

## 📜 Zasady Współpracy (AI)
Wszystkie istotne zasady dotyczące danych GIS i standardów wyceny znajdują się w dokumencie:
`docs/ZASADY_WSPOLPRACY_AI.txt`

---
*Autor: Antigravity / Szuwara KPP*
