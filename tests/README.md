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
   ```

## Endpointy diagnostyczne

- **GET /api/health** — liveness (status, wersja).
- **GET /api/diagnostics** — status każdego modułu (uldk, kieg, gesut, gunb, rcn, planning).

Wymagana zależność do testów przez HTTP: `pip install requests`.
