# Dane w Tabeli działek vs raport PDF (Analiza hurtowa)

## Problem

Po analizie hurtowej (CSV) **te same dane** pojawiały się inaczej w:
- **zakładce „Tabela działek”** (na stronie Analiza hurtowa),
- **raporcie zbiorczym PDF** (otwieranym z Historii raportów → Otwórz raport).

Dodatkowo zgłaszano, że „dane nie pobierają się do tabeli działek” (puste kolumny, „—”, komunikaty „Błąd”).

## Przyczyna

- **Raport PDF** budowany jest z danych **z API** (`master_record` / `data`): `compensation.track_a.total`, `compensation.track_b.total`, `ksws.band_width_m`, `ksws.band_area_m2`, `infrastructure.power.line_length_m`.
- **Tabela działek** wcześniej **nie** korzystała z tych pól – dla każdego wiersza liczyła wartości lokalnie (`recalcKSWS`). Stąd rozbieżności (zaokrąglenia, inne współczynniki) oraz wrażenie, że „dane się nie pobierają” (w tabeli widać było wyniki recalc, a nie to, co w PDF).

## Rozwiązanie (od 2026-03)

W **Tabeli działek** (`BatchAnalysisPage.jsx`):

1. **Domyślnie** wyświetlane są **dane z API** (jak w PDF):
   - Pas [m] ← `ksws.band_width_m`
   - Pas [m²] ← `ksws.band_area_m2`
   - Track A / Track B / Razem ← `compensation.track_a.total`, `compensation.track_b.total`
   - Dł. linii [m] ← `infrastructure.power.line_length_m` lub `ksws.line_length_m`

2. **Po ręcznej edycji** długości linii dla danej działki w tabeli – dla tego wiersza używane są wartości **przeliczone lokalnie** (`recalcKSWS`), żeby od razu widać efekt korekty.

3. Wiersze z **błędem** (status ERROR, np. działka nie znaleziona w ULDK) nadal pokazują jeden wiersz z komunikatem „Błąd: …” i bez danych w kolumnach (zgodnie z brakiem `data` z API).

Dzięki temu:
- **Tabela działek** i **PDF** pokazują te same liczby (Track A/B, pas, powierzchnia, cena), o ile użytkownik nie edytuje długości linii.
- Źródłem prawdy są **dane z backendu**; recalc tylko przy korekcie długości.

## Szablon wizualny (boxy, pola, przyciski, wykresy)

Obecnie **nie** ma jednego wspólnego szablonu wizualnego dla zawartości wszystkich zakładek:

- **Analiza działki** i **Historia analiz** (lista) używają klas `ksws-*` z `KalkulatorPage.css`.
- **Historia raportów** (lista) używa klas `history-*` z `BatchHistoryPage.css`.
- Raporty do druku (HTML w nowej karcie) mają własne style (`.kpi-card`, `.t-card`, `.summary-table` itd.).

Plan na później: rozważyć ujednolicenie (np. wspólne karty/boxy/przyciski w stylu `ksws-*`) – zapis do realizacji w backlogu.

---
*Ostatnia aktualizacja: marzec 2026*
