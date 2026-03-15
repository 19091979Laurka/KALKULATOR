# Dlaczego w raporcie ceny są 0?

## Skąd biorą się ceny w raporcie

Raport (Historia analiz → klik w wiersz) czyta dane z **zapisanej w przeglądarce** analizy (`full_master_record` w `ksws_history`). To dokładnie to, co zwrócił backend przy ostatnim uruchomieniu **Analizuj** dla tej działki.

- **Cena rynkowa [zł/m²]** → `market_data.average_price_m2` (z fallbackiem na `rcn_price_m2`, potem `gus_price_m2`).
- **Track A / Track B / Razem** → `compensation.track_a.total`, `compensation.track_b.total` — liczone w backendzie na podstawie ceny, powierzchni pasa i współczynników KSWS.

Jeśli w zapisanym `master_record` **cena jest 0 lub brak** (np. `average_price_m2: null`), raport pokaże **0** i kwoty Track A/B też będą 0.

## Dlaczego backend zwraca 0

Backend ustawia cenę w takiej kolejności:

1. **RCN GUGiK** (ceny transakcji) — jeśli są transakcje dla działki/obszaru.
2. **GUS BDL** (ceny gruntów wg województwa i klasy) — zapytanie do API GUS.
3. **Korekta ręczna** — jeśli użytkownik wpisał cenę w formularzu.

Jeśli **GUS BDL nie odpowie** (timeout, błąd sieci, wyłączenie API) i **nie ma RCN**, backend nie ma skąd wziąć ceny i zwraca `average_price_m2: null` (w raporcie wtedy 0).  
W takiej sytuacji w `market_data.status` backend ustawia np. `"BRAK DANYCH"`.

Dlatego **„w trakcie zmian w kodzie ceny się zmieniały”** — przy jednym uruchomieniu GUS odpowiedział (ceny były), przy innym nie (timeout/błąd) i w zapisanym wyniku trafiło 0.

## Co zrobić, gdy raport ma 0

1. **Uruchomić analizę ponownie** — czasem GUS odpowie za drugim razem.
2. **Korekta ręczna** — w formularzu Analiza działki rozwinąć „Korekta ręczna”, wpisać **Cena rynkowa [zł/m²]** (np. z tabel GUS lub wyceny), potem ponownie **Analizuj**. Zapis do historii będzie już z ceną i Track A/B.
3. **Sprawdzić backend** — logi przy `/api/analyze`: czy jest błąd/timeout GUS, czy `market_data.status` to `"BRAK DANYCH"`.

W raporcie HTML jest teraz fallback: jeśli `average_price_m2` jest puste, używane są `rcn_price_m2` lub `gus_price_m2` (gdy backend je zwróci). To nie pomoże, gdy **wszystkie** te pola są puste — wtedy nadal 0 i trzeba korekty ręcznej lub sprawdzenia API.
