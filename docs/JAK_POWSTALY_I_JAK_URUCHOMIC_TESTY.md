# Jak powstawały testy i jak je uruchomić

## Skąd się wzięły testy

### 1. **tests/README.md**
Opisuje dwa rodzaje testów:
- **run_api_tests.py** — health, diagnostics, opcjonalnie POST /api/analyze (z serwerem lub `--local`).
- **test_roszczen_sadowych.py** — pytest: valuation, property (Track A/B), struktura odpowiedzi API pod roszczenie sądowe.

### 2. **tests/run_api_tests.py** (skrypt, nie pytest)
- **Z serwerem:** wywołuje GET /api/health, GET /api/diagnostics, opcjonalnie POST /api/analyze.
- Domyślny URL: **http://127.0.0.1:8080** (w projekcie backend stoi na **8000** — trzeba podać `--api-url http://127.0.0.1:8000`).
- **--local:** nie wymaga serwera; importuje `backend.modules.diagnostics.run_all_diagnostics()` — **moduł `diagnostics` w backendzie nie istnieje**, więc `--local` kończy się błędem.

### 3. **tests/test_roszczen_sadowych.py** (pytest)
- Testy **jednostkowe:** `backend.core.valuation` (calculate_compensation, get_protection_zone_width), `backend.modules.property` (Track A/B).
- Testy **API:** przez FastAPI `TestClient` — POST /api/analyze, sprawdzenie pól w `master_record` (metadata, geometry, market_data, infrastructure, ksws, compensation, claims_qualification). Przy timeout/błędzie sieci test jest pomijany (skip).
- Uruchomienie: `pip install pytest pytest-asyncio` (w venv), potem `python -m pytest tests/test_roszczen_sadowych.py -v`.

### 4. **tests/test_99_dzialek.py**
- Skrypt (nie pytest): wczytuje działki z pliku Excel, dla każdej robi POST /api/analyze na **http://127.0.0.1:8080**, zapisuje wyniki. Wymaga `openpyxl`, `httpx`. Port 8080 — przy backendzie na 8000 trzeba zmienić w skrypcie lub zmienną środowiskową.

### 5. **Frontend (frontend-react)**
- W **package.json** nie ma skryptu `"test"` — **brak skonfigurowanych testów** (np. Vitest/Jest) dla Reacta. Testy w projekcie dotyczą tylko backendu / API.

---

## Jak uruchomić testy (obecny stan)

### A. Testy pytest (roszczenia sądowe)
```bash
cd /Users/szwrk/Documents/GitHub/KALKULATOR
source .venv/bin/activate
pip install pytest pytest-asyncio   # jeśli brak
python -m pytest tests/test_roszczen_sadowych.py -v
```
- **Zielone:** wszystkie testy przeszły.
- Część testów wywołuje zewnętrzne API (ULDK itd.) — przy timeout mogą być **pomijane (skipped)**, nie failed.

### B. run_api_tests.py (z uruchomionym backendem)
Backend musi działać na porcie, na który wskazuje skrypt (domyślnie 8080). W projekcie backend startuje na **8000** (start-local.sh, vite proxy).
```bash
# Terminal 1: backend
./start-local.sh   # lub uvicorn na 8000

# Terminal 2: testy API
source .venv/bin/activate
python tests/run_api_tests.py --api-url http://127.0.0.1:8000
python tests/run_api_tests.py --api-url http://127.0.0.1:8000 --analyze 142003_2.0001.74/1
```
- **Zielone:** exit code 0, w logu "OK" dla health/diagnostics (i analizy, jeśli --analyze).
- **run_api_tests.py --local** nie zadziała, dopóki nie będzie modułu `backend.modules.diagnostics` lub zmiany skryptu (np. inna diagnostyka).

### C. test_99_dzialek.py
Wymaga pliku Excel z działkami i działającego API. W kodzie jest `API_URL = "http://127.0.0.1:8080/api/analyze"` — przy backendzie na 8000 trzeba zmienić na 8000.

---

## Podsumowanie

| Co | Jak powstało | Jak uruchomić | Uwagi |
|----|--------------|---------------|--------|
| **test_roszczen_sadowych.py** | pytest, testy jednostkowe + TestClient API | `pytest tests/test_roszczen_sadowych.py -v` | Potrzebne: pytest, pytest-asyncio. Część testów może skip przy błędzie sieci. |
| **run_api_tests.py** | Skrypt Python (health, diagnostics, analyze) | Z backendem: `python tests/run_api_tests.py --api-url http://127.0.0.1:8000` | Domyślnie 8080 — przy backendzie na 8000 podać --api-url. --local wymaga modułu diagnostics (brak). |
| **test_99_dzialek.py** | Skrypt batch z Excel | Python + Excel + backend na 8080 (albo zmiana na 8000) | Użyteczne do testów na wielu działkach. |
| **Frontend** | Brak skryptu test | — | W package.json nie ma "test"; testy w repo = backend/API. |

Żeby mieć „zielone”:
1. Zainstaluj pytest (w venv) i uruchom `pytest tests/test_roszczen_sadowych.py -v`.
2. Przy testach przez HTTP używaj portu, na którym faktycznie stoi backend (8000), np. `--api-url http://127.0.0.1:8000`.

---

## Ostatni przebieg pytest (test_roszczen_sadowych.py)

- **6 passed:** test_calculate_compensation_basic, test_calculate_compensation_zero_occupied, test_protection_zone_width_by_voltage, test_calculate_track_a_sn, test_calculate_track_b_multiplier, test_api_analyze_claim_amount_consistency.
- **1 failed:** test_api_analyze_response_structure — test wywołuje POST /api/analyze dla działki `142003_2.0006.74/4`; ULDK zwraca „Blad zapytania teryt” (brak danych), więc odpowiedź nie zawiera pełnego `master_record` (brak m.in. metadata.teryt_id, geometry.area_m2, compensation, claims_qualification). Test wymaga pełnej struktury; przy błędzie ULDK można by go pomijać (skip), albo użyć innej działki, która w ULDK zwraca dane.
