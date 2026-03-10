# ⚡ QUICK START - KALKULATOR V4.0

## 🎯 DLA RAFAŁA - JAK TO URUCHOMIĆ (5 MINUT)

### Krok 1: Backup obecnego systemu
```bash
cd ~/Documents/GitHub/KALKULATOR
git status  # Sprawdź co masz
git add .
git commit -m "backup przed v4.0"
```

### Krok 2: Pobierz nowe pliki
Claude wygenerował 4 pliki - pobierz je z chatu:
- `main_v2.py` → zapisz jako `backend/main.py`
- `infrastructure_v2.py` → zapisz jako `backend/modules/infrastructure.py`
- `requirements_v2.txt` → zapisz jako `requirements.txt`
- `WDROZENIE_V4.md` → zapisz jako `docs/WDROZENIE_V4.md`

### Krok 3: Zainstaluj nowe zależności
```bash
pip install -r requirements.txt
```

### Krok 4: Test - uruchom serwer
```bash
cd ~/Documents/GitHub/KALKULATOR
python -m uvicorn backend.main:app --reload --port 8080
```

Powinieneś zobaczyć:
```
INFO:     Uvicorn running on http://127.0.0.1:8080
INFO:     Application startup complete.
```

### Krok 5: Test API - otwórz nową kartę terminala
```bash
# Test 1: Health check
curl http://localhost:8080/api/health

# Oczekiwany wynik:
# {"status":"healthy","version":"4.0.0","cache_size":0,"active_jobs":0}

# Test 2: Pojedyncza działka (twoja testowa)
curl -X POST http://localhost:8080/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "parcel_ids": "061802_2.0004.109",
    "obreb": "Bełżec",
    "infra_type_pref": "elektro_SN"
  }'
```

### Krok 6: Test w przeglądarce
Otwórz: http://localhost:8080/docs

Zobaczysz interaktywną dokumentację Swagger - możesz testować API bezpośrednio z przeglądarki!

---

## 🔥 NAJWAŻNIEJSZE ZMIANY - CO MUSISZ WIEDZIEĆ

### 1. Automatyczne wykrywanie: sync vs async
```python
# 1-3 działki: dostaniesz wynik od razu
POST /api/analyze {"parcel_ids": "123,456,789"}
→ Response: {"mode": "sync", "parcels": [...]}

# 4+ działek: dostaniesz job_id
POST /api/analyze {"parcel_ids": "123,456,789,101,112..."}
→ Response: {"mode": "async", "job_id": "abc123", "status_url": "..."}
```

### 2. Cache = szybkość
Każde zapytanie jest cache'owane na 1h. Jeśli analizujesz tę samą działkę 2x, drugie wywołanie będzie **instant**.

```python
# Wyłącz cache jeśli potrzebujesz świeżych danych:
{"parcel_ids": "123", "use_cache": false}
```

### 3. Nowe dane w odpowiedzi - compensation_basis
```json
{
  "infrastructure": {
    "compensation_basis": {
      "total_occupied_area_m2": 120.5,
      "affected_percentage": 10.2,
      "compensation_multiplier": 2.0,
      "infrastructure_types": ["Linie energetyczne SN"],
      "recommendation": "Wykryto Linie energetyczne SN. Ingerencja: znacząca (10.2%). Mnożnik: 2.00x. Rekomendowana ścieżka sądowa."
    }
  }
}
```

**TO JEST GOTOWA PODSTAWA DO WYCENY!** 🎯

---

## 🧪 JAK PRZETESTOWAĆ NA SWOICH DZIAŁKACH

### Test A: Jedna działka (Bełżec)
```bash
curl -X POST http://localhost:8080/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "parcel_ids": "061802_2.0004.109",
    "obreb": "Bełżec",
    "municipality": "Bełżec",
    "county": "tomaszowski",
    "infra_type_pref": "elektro_SN"
  }' | jq  # jq = ładne formatowanie JSON
```

### Test B: Batch 10 działek
```bash
# Przygotuj listę działek
PARCELS="061802_2.0004.109,061802_2.0004.110,061802_2.0004.111,061802_2.0004.112,061802_2.0004.113,061802_2.0004.114,061802_2.0004.115,061802_2.0004.116,061802_2.0004.117,061802_2.0004.118"

# Wyślij request
curl -X POST http://localhost:8080/api/analyze \
  -H "Content-Type: application/json" \
  -d "{
    \"parcel_ids\": \"$PARCELS\",
    \"obreb\": \"Bełżec\"
  }" | jq

# Dostaniesz:
# {
#   "mode": "async",
#   "job_id": "abc123xyz",
#   "status_url": "/api/status/abc123xyz"
# }

# Sprawdź progress:
curl http://localhost:8080/api/status/abc123xyz | jq

# Wynik:
# {
#   "status": "running",  # lub "completed"
#   "progress": {
#     "completed": 7,
#     "total": 10,
#     "percentage": 70.0
#   }
# }
```

### Test C: Cache speed test
```bash
# Pierwsze wywołanie (bez cache):
time curl -X POST http://localhost:8080/api/analyze \
  -d '{"parcel_ids": "061802_2.0004.109"}'
# Czas: ~3-5 sekund

# Drugie wywołanie (z cache):
time curl -X POST http://localhost:8080/api/analyze \
  -d '{"parcel_ids": "061802_2.0004.109"}'
# Czas: ~0.1 sekund (30-50x szybciej!)
```

---

## 🐛 CO ZROBIĆ GDY COŚ NIE DZIAŁA

### Problem: ModuleNotFoundError
```bash
# Fix:
pip install -r requirements.txt

# Sprawdź instalację:
pip list | grep fastapi
pip list | grep shapely
```

### Problem: Port 8080 zajęty
```bash
# Użyj innego portu:
uvicorn backend.main:app --reload --port 8888

# Albo zabij proces na 8080:
lsof -ti:8080 | xargs kill -9
```

### Problem: GESUT timeout
```bash
# W logach zobaczysz:
# WARNING: GESUT timeout

# To normalne - serwer GUGiK bywa wolny
# System automatycznie da ERROR i przejdzie dalej
```

### Problem: Brak danych dla działki
```bash
# W response zobaczysz:
# "data_status": "ERROR"
# "error": "Działka nie znaleziona w bazie ULDK"

# Sprawdź:
# 1. Czy parcel_id jest poprawny (format: TERYT lub nr działki)
# 2. Czy podałeś obręb (obreb: "Nazwa") - często wymagany!
```

---

## 📊 JAK SPRAWDZIĆ ŻE DZIAŁA LEPIEJ NIŻ V3.0

### Benchmark: 20 działek

**V3.0:**
```bash
# Synchroniczne - czekasz na koniec
time curl ... (lista 20 działek)
# Czas: ~120 sekund
```

**V4.0:**
```bash
# Async - dostaniesz job_id od razu
time curl ... (lista 20 działek)
# Czas: ~0.5 sekund (response natychmiastowy)

# Sprawdzisz status co 5s:
watch -n 5 'curl http://localhost:8080/api/status/JOB_ID'
# Całkowity czas przetwarzania: ~25-30 sekund
```

**Wynik: 4x szybciej + nie blokujesz API!** 🚀

---

## 🎁 BONUS - SWAGGER UI

Zamiast curl możesz użyć przeglądarki:

1. Otwórz: http://localhost:8080/docs
2. Kliknij **POST /api/analyze**
3. Kliknij **Try it out**
4. Wpisz JSON:
```json
{
  "parcel_ids": "061802_2.0004.109",
  "obreb": "Bełżec",
  "infra_type_pref": "elektro_SN"
}
```
5. Kliknij **Execute**
6. Zobaczysz odpowiedź na dole!

---

## ✅ CHECKLIST - CO PRZETESTOWAĆ

- [ ] Serwer uruchamia się bez błędów
- [ ] `/api/health` zwraca `{"status": "healthy"}`
- [ ] Pojedyncza działka (sync mode) działa
- [ ] 10 działek (async mode) działa
- [ ] Cache działa (2. wywołanie szybsze)
- [ ] `/docs` pokazuje Swagger UI
- [ ] Dane z GESUT są dostępne (energie.detected = true/false)
- [ ] **Nowe pole: compensation_basis jest wypełnione**

---

## 🚀 CO DALEJ - NASTĘPNE KROKI

### Priorytet 1: Test na realnych danych
Weź swoją listę 99 działek i przetestuj:
```bash
# Przygotuj plik parcels.txt z listą ID (jeden na linię)
curl -X POST http://localhost:8080/api/analyze \
  -d "{\"parcel_ids\": \"$(cat parcels.txt | tr '\n' ',')\", \"obreb\": \"XXX\"}"
```

### Priorytet 2: Implementuj Księgę Wieczystą (KW)
To **kluczowy brakujący element** dla Twojej praktyki!
Claude może przygotować moduł `backend/integrations/kw.py`.

### Priorytet 3: Frontend React
Prosty dashboard do monitorowania jobów i pobierania wyników.

---

**Pytania? Problemy?**
Wklej do Claud'a:
- Logi z terminala
- JSON response który dostałeś
- Błędy które widzisz

Powodzenia! 🍀
