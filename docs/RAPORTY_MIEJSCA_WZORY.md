# Miejsca generowania raportów dla działek

Przegląd wszystkich miejsc, gdzie powstają raporty z danymi działek, oraz wzorów użytych do wyliczeń.

---

## 1. Raport pojedynczej działki — główny widok i PDF

**Decyzja:** Głównym raportem do eksportu PDF jest **ten sam widok**, co w zakładce **Analiza działki**: karty (boxy), mapa, Track A/B, R1–R5, metryki. Użytkownik widzi na ekranie dokładnie to, co może zapisać do PDF (np. przez „Drukuj” → „Zapisz jako PDF” z przeglądarki, po ustawieniu druku tylko na sekcję `#raport-do-pdf`).

- **Sekcja raportu na stronie:** `KalkulatorPage.jsx` — blok `{result && (...)}` opakowany w `<div id="raport-do-pdf" ref={reportSectionRef}>`. Po zakończeniu analizy i po kliknięciu wpisu w „Ostatnie analizy” strona przewija się do tej sekcji.
- **R5 (roszczenia rolne):** Liczone **tylko**, gdy użytkownik zaznaczy „Rolnik” w formularzu. Backend: `property.py` → `_qualify_claims(..., is_farmer=...)`; R5 jest aktywne tylko przy `is_farmer=True`.

---

## 2. Backend PDF — pełny raport (R1–R5) — opcjonalny

| | |
|---|---|
| **Plik** | `backend/modules/pdf_report.py` → `generate_pdf()` |
| **Endpoint** | `POST /api/report/pdf` |
| **Wywołanie z frontu** | KalkulatorPage: przycisk PDF w panelu raportu (analiza pojedyncza) |

**Format:** PDF z okładką, identyfikacją, tabelą R1–R5, wykresem 3D, Track A/B — **bez** boxów i **bez** mapy (HTML do druku). Głównym raportem użytkownika pozostaje widok z zakładki Analiza działki (z boxami i mapą).

**Wzór:** Dane z `master_record.compensation` (Track A/B z backendu) — **bez ponownego liczenia** w raporcie.

**Źródło kwot:** `property.py` → `calculate_track_a()` (WSP + WBK + OBN), `calculate_track_b()` (Track A × mnożnik KSWS).

---

## 3. Backend PDF — karty działek (oferty hurtowe)

| | |
|---|---|
| **Plik** | `backend/modules/pdf_report.py` → `generate_pdf_cards()` |
| **Endpoint** | `POST /api/report/pdf-cards` |
| **Wywołanie z frontu** | Oferty hurtowe: „PDF (analiza/działka)”, „PDF” przy pojedynczej działce |

**Format:** Okładka + jedna strona na działkę (metryki, Track A/B/Razem, mini-mapa).

**Wzór:** Dane z `master_record.compensation` — **bez ponownego liczenia**.

---

## 4. ReportGenerator (frontend)

| | |
|---|---|
| **Plik** | `frontend-react/src/components/ReportGenerator.jsx` |
| **Formaty** | HTML (do druku/PDF), JSON |
| **Miejsce użycia** | KalkulatorPage — panel „Generuj Raport” |

**Wzór:** Tylko odczyt z API — `master_record.compensation.track_a`, `track_b`. Brak własnych obliczeń.

---

## 5. Szablon raportu zbiorczego (Oferty hurtowe — docelowy wzór)

**Decyzja:** Układ raportu po analizie wielu działek (CSV) ma być taki jak w **Oferty hurtowe** (obecnie w `KalkulatorPage.jsx` → `BatchCSVSection` po wygenerowaniu analizy):

1. **Mapa zbiorcza** — wszystkie działki + linie WN/SN, warstwy (OIM, KIUT).
2. **Karty KPI** — Działek, Kolizji, Bez kol., Track A, Track B (z kolorami, ikonami).
3. **Odszkodowanie wg działki** — paski (Track A/B) per działka + legenda.
4. **Łączne roszczenie** — box „Razem (A+B)”, Track A, Track B, przycisk **Raport zbiorczy**.
5. **Karty działek** — dla każdej działki: metryki (pow., cena, wartość, napięcie, dł. linii, pas), Track A/B/Razem, przycisk PDF, mini-mapa.

Ten układ jest **wzorem** do użycia na stronie „Wiele działek (CSV)” i w Archiwum zbiorczym (zamiast samej tabeli). Implementacja: współdzielony komponent raportu lub ten sam układ na BatchAnalysisPage (zakładka „Raport”).

---

## 6. Raport Zbiorczy HTML (okno / PDF z KalkulatorPage)

| | |
|---|---|
| **Plik** | `frontend-react/src/DemoPages/Kalkulator/KalkulatorPage.jsx` |
| **Miejsce** | Funkcja otwierająca okno z HTML (np. ok. linii 900–1100) |
| **Przycisk** | „Raport Zbiorczy” (w widoku Oferty hurtowe) |

**Wzór:** Suma `compensation.track_a.total` i `compensation.track_b.total` z wyników API. Brak własnego liczenia Track A/B.

---

## 7. Raport Zbiorczy HTML (BatchHistoryPage)

| | |
|---|---|
| **Plik** | `frontend-react/src/DemoPages/Kalkulator/BatchHistoryPage.jsx` |
| **Miejsce** | Podobny raport zbiorczy na podstawie historii batcha |

**Wzór:** Jak powyżej — sumowanie `track_a.total`, `track_b.total` z danych z API.

---

## 7. BatchAnalysisPage — CSV i wyliczenia lokalne

| | |
|---|---|
| **Plik** | `frontend-react/src/DemoPages/Kalkulator/BatchAnalysisPage.jsx` |
| **Formuły** | `KSWS_STANDARDS` (duplikat!) + `calcTrackAB()` |

**Wzór:**

```javascript
wsp = property_value * S * k * ratio;
wbk = property_value * R * k * ratio * years;
obn = property_value * impact * (years/10);
track_a = wsp + wbk + obn;
track_b = track_a * track_b_mult;
```

**Uwaga:** Osobna implementacja Track A/B w JS. Wartości mogą się różnić od backendu, jeżeli parametry (S, k, R, impact, years) lub zaokrąglenia nie zgadzają się z `property.py`.

---

## 8. KalkulatorPage — Oferty hurtowe (recalcKSWS)

| | |
|---|---|
| **Plik** | `frontend-react/src/DemoPages/Kalkulator/KalkulatorPage.jsx` |
| **Miejsce** | Funkcja `recalcKSWS` / logika Ofert hurtowych |

**Wzór:** Własna kopia `KSWS_STANDARDS` i `calcTrackAB()` — **trzecia implementacja** tych samych formuł.

**Ryzyko:** Różnice przy zmianach w backendzie, jeśli frontend nie zostanie zsynchronizowany.

---

## 9. scripts/generate_raport_dzialki.py

| | |
|---|---|
| **Plik** | `scripts/generate_raport_dzialki.py` |
| **Format** | Markdown |
| **Uruchomienie** | `python scripts/generate_raport_dzialki.py [identyfikator] [gmina] [powiat]` |

**Zakres:** Geometria, EGiB, infrastruktura, dane rynkowe. Brak rozpiski Track A/B w stylu R1–R5.

---

## 10. backend/core/reports.py — Excel

| | |
|---|---|
| **Plik** | `backend/core/reports.py` → `create_excel_report()` |
| **Kolumny** | `easement_pln`, `depreciation_pln`, `unjust_enrichment_pln`, `total_claim_pln` |

**Uwaga:** Te nazwy pochodzą z `valuation.py` (art. 124, 305², 225 KC), a nie z KSWS Track A/B. `master_record` ma `compensation.track_a` (wsp, wbk, obn), więc struktura danych jest inna.

**Status:** `create_excel_report` nie jest wywoływane z `main.py` — prawdopodobnie martwy kod lub używane przez inny skrypt.

---

## 11. create_summary_dict

| | |
|---|---|
| **Plik** | `backend/core/reports.py` → `create_summary_dict()` |
| **Endpoint** | `POST /api/summary` |
| **Oczekiwane pola** | `total_claim_pln`, `easement_pln`, `depreciation_pln`, `unjust_enrichment_pln` |

**Uwaga:** Te pola nie występują w strukturze `master_record` z `property.py` (tam są `compensation.track_a/track_b`). Potencjalna rozbieżność przy wywołaniach z frontu.

---

## 12. valuation.py — stary model wyceny

| | |
|---|---|
| **Plik** | `backend/core/valuation.py` → `calculate_compensation()` |
| **Model** | Art. 124, 305² KC, art. 225 KC (służebność, deprecjacja, bezumowne korzystanie, odsetki) |

**Uwaga:** Inny model niż KSWS (Track A/B z WSP, WBK, OBN). Używane m.in. przez `app.py` (Streamlit) i ewentualnie przez `create_excel_report`/`create_summary_dict`.

---

## Podsumowanie — rozbieżności

| Źródło | Model wyceny |
|--------|--------------|
| `property.py` | KSWS Track A/B (WSP, WBK, OBN, mnożnik Track B) |
| `valuation.py` | Art. 124 + 305² + 225 (służebność, deprecjacja, WBK, odsetki) |
| `KalkulatorPage` | KSWS — **duplikat** w JS |
| `BatchAnalysisPage` | KSWS — **duplikat** w JS |
| `reports.py` (Excel) | Oczekuje pól z modelu `valuation.py` |

**Rekomendacja:** Ujednolicić źródło wyliczeń na backend (`property.py`) i eliminować duplikaty formuł w JS. Raporty powinny korzystać wyłącznie z danych API, bez powielania logiki w frontendzie.
