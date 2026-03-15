# Gdy build jest czerwony (Cloud Build / Docker)

## Co zostało już poprawione (żeby build przechodził)

1. **Dockerfile**
   - `COPY frontend-react/patches ./patches` przed `npm install` — `postinstall: patch-package` wymaga istnienia katalogu `patches/`.
   - `npm install --legacy-peer-deps` zamiast `npm ci` — mniej sztywne w Cloud (patch-package, peer deps).
   - `ENV NODE_ENV=production` przed `npm run build`.

2. **Frontend**
   - **BatchAnalysisPage.jsx**: usunięty zduplikowany klucz `padding` w obiekcie `style` (linia ~703). Duplikat mógł powodować błąd w esbuild/Vite w CI.

3. **Backend**
   - Import `backend.main:app` działa (uruchomienie z katalogu głównego repo, `WORKDIR /app` w Dockerze).

## Szybki test lokalny (bez Docker)

```bash
# Frontend
cd frontend-react && npm run build

# Backend
cd .. && python3 -c "from backend.main import app; print('OK')"
```

## Gdy dalej jest czerwono

1. **Otwórz log Cloud Build** (Google Cloud Console → Cloud Build → historia buildów → wybrany build).
2. Sprawdź, **na którym kroku** się wywala:
   - **Krok `docker build`** — szukaj w logu fragmentu z `RUN npm install` lub `RUN npm run build`. Błąd z `patch-package` → brak katalogu `patches` (powinien być już w Dockerfile). Błąd z `vite build` → np. błąd składni w JSX, duplikat klucza, brak modułu.
   - **Krok `docker push`** — problem z uprawnieniami/Registry.
   - **Krok `gcloud run deploy`** — problem z Cloud Run (region, limit, konfiguracja).
3. **Częste przyczyny**:
   - Brak katalogu `frontend-react/patches` w repo (powinien być `patches/.gitkeep`).
   - Nowy błąd w JSX (duplikat klucza w obiekcie, niezamknięty tag).
   - Timeout lub OOM przy `npm run build` — w Dockerfile można dodać `ENV NODE_OPTIONS=--max-old-space-size=4096` przed `RUN npm run build`.
   - Backend: brak modułu w `requirements.txt` lub błąd przy imporcie (np. brak pliku po usunięciu przez agenta).

## Pliki kluczowe dla działania aplikacji

- **Wejście frontu:** `frontend-react/index.html` → `src/index.jsx` → `DemoPages/Main`.
- **Trasy Kalkulatora:** `frontend-react/src/DemoPages/Kalkulator/index.jsx` (analiza, batch, historia, raporty).
- **Backend:** `backend/main.py` (FastAPI), uruchomienie: `uvicorn backend.main:app`.
- **Build:** `Dockerfile` (stage 1: Node build, stage 2: Python + build frontu), `cloudbuild.yaml`.

---
*Ostatnia aktualizacja: po poprawce duplikatu `padding` w BatchAnalysisPage i uzupełnieniu Dockerfile o COPY patches.*
