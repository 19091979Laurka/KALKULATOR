# Testy KALKULATOR — API i moduły

## Szybki test (bez serwera)

Sprawdza dostępność wszystkich modułów (ULDK, KIEG, GESUT, GUNB, RCN, Planning) przez bezpośredni import:

```bash
python tests/run_api_tests.py --local
```

## Test z uruchomionym API

1. Uruchom serwer:
   ```bash
   uvicorn backend.main:app --host 127.0.0.1 --port 8080
   ```

2. W drugim terminalu:
   ```bash
   python tests/run_api_tests.py
   python tests/run_api_tests.py --analyze 142003_2.0001.74/1

   # Wiele działek z różnych województw (plik: 1 ID na linię, # = komentarz):
   python tests/run_api_tests.py --analyze-file tests/parcels_multi_wojewodztwa.txt
   ```

## Testy roszczeń sądowych (pytest)

Sprawdzają, że dane wyjściowe zawierają wszystko potrzebne do wyliczenia kwoty roszczenia dla sądu:

- **test_roszczen_sadowych.py** — valuation (art. 124, 305², 225 KC), Track A/B KSWS, struktura odpowiedzi API

```bash
pip install pytest pytest-asyncio   # jeśli brak w projekcie
python -m pytest tests/test_roszczen_sadowych.py -v
```

Testy jednostkowe (valuation, property) nie wymagają sieci. Testy API używają TestClient (bez uruchomionego serwera), ale wywołują zewnętrzne API (ULDK, RCN itd.) — przy timeout/błędzie sieci są pomijane (skip).

## Endpointy diagnostyczne

- **GET /api/health** — liveness (status, wersja).
- **GET /api/diagnostics** — status każdego modułu (uldk, kieg, gesut, gunb, rcn, planning).

Wymagana zależność do testów przez HTTP: `pip install requests`. Testy roszczeń: `pytest`, `pytest-asyncio`.
