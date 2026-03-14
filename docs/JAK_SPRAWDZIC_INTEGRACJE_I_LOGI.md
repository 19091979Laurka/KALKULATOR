# Jak sprawdzić, dlaczego w analizie hurtowej jest dużo błędów (integracje)

Gdy w **Tabeli działek** (Analiza hurtowa) wiele wierszy ma **„Błąd:”** w kolumnie Kolizja, to backend nie zdołał pobrać danych dla tych działek. Źródłem są zwykle **integracje zewnętrzne** (ULDK, GUS, Overpass).

---

## 1. Pełny komunikat błędu w aplikacji

- W tabeli w kolumnie z błędem jest teraz **pełny komunikat** (np. timeout ULDK, „Nie znaleziono działki”, błąd GUS).
- Najedź kursorem na **„Błąd: …”** — w tooltipie zobaczysz cały tekst.
- Po wdrożeniu na Cloud zobaczysz tam dokładnie to, co backend zwrócił dla danej działki.

---

## 2. Endpoint diagnostyczny (czy integracje działają)

Backend ma endpoint, który **testuje połączenie z ULDK** (GUGiK):

**URL (na Cloud Run):**
```text
https://TWOJA-DOMENA.run.app/api/integrations/status
```

Np. dla `kalkulator-384217730250.europe-west1.run.app`:
```text
https://kalkulator-384217730250.europe-west1.run.app/api/integrations/status
```

**Co zwraca:** JSON z polami typu:
- `checks["ULDK (terenu)"].status` — `"ok"` lub `"error"`
- `checks["ULDK (terenu)"].message` — komunikat błędu (np. timeout, brak odpowiedzi)

W aplikacji: **Analiza hurtowa → zakładka Info** — jest link **„/api/integrations/status”** (otwiera się w nowej karcie).

---

## 3. Logi na Google Cloud Run (gdzie szukać przyczyny)

1. Wejdź na **Google Cloud Console**: https://console.cloud.google.com/
2. Wybierz projekt (np. `kalkulator-384217730250`).
3. **Cloud Run** → wybierz usługę **kalkulator**.
4. Zakładka **„Logi”** (Logs) / **„Logging”**.
5. Filtruj po:
   - **„Błąd analizy”** — każda nieudana działka w batchu jest tam logowana z `parcel_id` i treścią wyjątku,
   - **„ERROR”** — błędy ogólne,
   - **„uldk”**, **„timeout”**, **„GUS”** — jeśli podejrzewasz konkretne źródło.

W logach zobaczysz dokładny komunikat Pythona (np. `requests.exceptions.Timeout`, błąd z GUS BDL).

---

## 4. Typowe przyczyny „dużo błędów”

| Objaw / komunikat | Możliwa przyczyna |
|-------------------|-------------------|
| Timeout, „niedostępny” | ULDK GUGiK przeciążone lub blokada po stronie Cloud Run (limit czasu, sieć). |
| „Nie znaleziono działki” | Zły format TERYT, brak obrębu w CSV, działka nie w bazie ULDK. |
| Błąd GUS / cena | GUS BDL nie zwraca ceny dla tego powiatu/gminy; w raporcie może być „Błąd integracji (GUS)”. |
| 429 Too Many Requests | Zbyt wiele zapytań do Overpass/ULDK — batch robi równoległe zapytania; ewentualnie throttle po stronie backendu. |

---

## 5. Szybki checklist

1. Otwórz **/api/integrations/status** w przeglądarce (domena Cloud Run).
2. Sprawdź **logi** w Cloud Run (filtr: „Błąd analizy” lub „ERROR”).
3. W tabeli działek **najedź na „Błąd:”** i spisz pełny komunikat dla 1–2 działek.
4. Jeśli w statusie ULDK jest **error** lub w logach **timeout** — problem po stronie ULDK/sieci; jeśli „Nie znaleziono” — sprawdź format ID działek i obręb w CSV.

---

*Ostatnia aktualizacja: po dodaniu endpointu `/api/integrations/status` i pełnych komunikatów błędów w tabeli.*
