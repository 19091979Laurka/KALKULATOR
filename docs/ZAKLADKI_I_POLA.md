# Przegląd zakładek i pól — Kalkulator KSWS

**Struktura „co gdzie”** ustalona w **`DECYZJA_CO_GDZIE.md`** — tam jest decyzja; stylistykę dopracowuje się osobno (np. Manus).

**Kontekst:** Dashboard do zarządzania sprawami i klientami (KSWS), używany przez kancelarię, z możliwością sprzedaży dalej — zob. `KONTEKST_PRODUKTU.md`.

Źródło: `KalkulatorLayout`, `KalkulatorPage`, `BatchAnalysisPage`, `BatchHistoryPage`, `ClientsPage`, `WzoryPage`.

---

## 0. Ustalony układ menu (źródło prawdy, UX)

**Jedno menu (sidebar)** na całą aplikację. Nazwy pod użytkownika: **Jedna działka** | **Analiza hurtowa** | **Archiwum zbiorcze** | Klienci | Wzory | Strona główna. Zob. `DECYZJA_CO_GDZIE.md`.

| # | Zakładka w menu | Ścieżka | Co się otwiera |
|---|-----------------|---------|----------------|
| 1 | **Jedna działka** | `/kalkulator/analiza` | Formularz → wyniki + mapa; na dole sekcja **Ostatnie analizy** |
| 2 | **Analiza hurtowa** | `/kalkulator/batch` | Wgraj CSV lub wklej listę → analiza → raport; na dole **Historia raportów** (nazwa/klient, Wczytaj) |
| 3 | **Archiwum zbiorcze** | `/kalkulator/historia` | Lista zapisanych raportów zbiorczych |
| 4 | **Klienci** | `/kalkulator/klienci` | Baza klientów (localStorage) |
| 5 | **Wzory dokumentów** | `/kalkulator/wzory` | Szablony pism (starostwo, operator, KW) |
| 6 | **Strona główna** | `/kalkulator/home` | Landing, przyciski CTA |

**Strona „Jedna działka”** — jedna strona, bez wewnętrznych zakładek. Historia pojedynczych analiz w sekcji „Ostatnie analizy” na dole.

Trasy domyślne: `/kalkulator` i `/kalkulator/*` niepasujące → przekierowanie na `/kalkulator/home`.

---

## 1. Nawigacja główna (sidebar)

| Zakładka | Ścieżka | Opis |
|----------|---------|------|
| **Jedna działka** | `/kalkulator/analiza` | Formularz jednej działki · wyniki i mapa · na dole Ostatnie analizy |
| **Analiza hurtowa** | `/kalkulator/batch` | Wgraj CSV lub wklej listę · raport Oferty hurtowe · na dole Historia raportów (nazwa/klient) |
| **Archiwum zbiorcze** | `/kalkulator/historia` | Zapisane raporty zbiorcze (batch) |
| **Klienci** | `/kalkulator/klienci` | Baza klientów |
| **Wzory dokumentów** | `/kalkulator/wzory` | Szablony pism (starostwo, operator, KW) |
| **Strona główna** | `/kalkulator/home` | Landing |

---

## 2. Analiza działki (`KalkulatorPage.jsx` — `/kalkulator/analiza`)

### 2.1 Sekcje formularza (kolejność od góry)

| Sekcja | Opis |
|--------|------|
| **Karta klienta** | Dane do raportu: Imię/Firma, E-mail, Nr sprawy, Data wysłania maila |
| **Box 1 — Identyfikator działki** | Jedno pole: Identyfikator działki * (pełny TERYT lub wiele po przecinku) |
| **Box 2 — Dane ewidencyjne** | Numer działki, Obręb ewidencyjny, Gmina, Powiat, Województwo (uzupełniane po analizie) |
| **Box 3 — Księga Wieczysta i status prawny** | Nr KW (format AAAA/NNNNNNNN/N), Status sprawy (checkboxy: Pismo starosty, Wnioskowane o WZ, Odmowa WZ, Pismo operatora) |
| **Przycisk** | „⚡ Generuj raport KSWS” |
| **Typ klienta** | Checkbox: Rolnik |
| **Korekta ręczna** (accordion) | Nadpisanie danych API |

### 2.2 Pola — Analiza działki

| Pole | Typ | Uwagi |
|------|-----|--------|
| Imię i nazwisko / Firma | text | placeholder: Jan Kowalski |
| E-mail klienta | email | jan@email.pl |
| Nr sprawy | text | SZU/2026/001 |
| Data wysłania maila | date | — |
| Identyfikator działki * | text | TERYT lub wiele po przecinku |
| Numer działki | text | np. 60 lub 114/2 (wyciągany z identyfikatora) |
| Obręb ewidencyjny | text | np. Szapsk, Cieszkowo Kolonia |
| Gmina | text | np. Baboszewo |
| Powiat | text | np. płoński |
| Województwo | text | np. mazowieckie |
| Nr Księgi Wieczystej | text | WA1M/00012345/6, max 15 znaków |
| Pismo od starosty | checkbox | — |
| Wnioskowane o WZ | checkbox | — |
| Odmowa WZ | checkbox | — |
| Pismo od operatora | checkbox | — |
| Rolnik | checkbox | isFarmer |

### 2.3 Korekta ręczna (accordion „Korekta ręczna — nadpisz dane API”)

| Pole | Typ | Uwagi |
|------|-----|--------|
| Cena rynkowa [zł/m²] | number | np. 200 |
| Typ gruntu | select | — auto — / Budowlany / Rolny |
| Infrastruktura wykryta | select | — auto — / TAK / NIE |
| Napięcie | select | — auto — / WN / SN / nN |
| Długość linii [m] | number | np. 180 (z Geoportalu) |

+ instrukcja Geoportalu (link, warstwy KIUT, pomiar). Przycisk „Wyczyść” gdy któraś korekta jest ustawiona.

### 2.4 Jedna strona, bez zakładek wewnętrznych

Sekcja **Ostatnie analizy**: wszystkie udane analizy (także przy wielu działkach w jednym zapytaniu) trafiają do historii (max 20). Formularz nie czyści się; wynik pozostaje widoczny. Klik w pozycję ładuje analizę i przewija do raportu.

Strona „Jedna działka” to **jedna strona**: formularz u góry → wyniki i mapa po analizie → na dole **Ostatnie analizy**. Brak paska Formularz | Historia | Oferty.

Pod wynikami są zakładki mapy:

| Zakładka | Zawartość |
|----------|-----------|
| **Mapa 2D** | Mapa z działką + GESUT (react-leaflet) |
| **Mapy** | Inna widoczność mapy (np. warstwy) |

(State: `activeTab` = `"map2d"` | `"mapy"`.)

### 2.6 Po analizie — wyniki

- Karty wyników (Track A/B, metryki), ReportGenerator (HTML/PDF/JSON), przycisk „Pobierz PDF” (backend).
- Historia działek (lista ostatnich analiz, klik → załadowanie do formularza).

### 2.7 Na tej samej stronie — Oferty hurtowe (Batch CSV)

- **Oferty hurtowe · Batch CSV**: upload CSV, przyciski „Raport Zbiorczy”, „PDF (analiza/działka)”, mapa zbiorcza, tabela działek z Track A/B, przycisk PDF przy każdej działce.
- **Oferty Hurtowe — Historia CSV**: karty zapisanych batchy (localStorage), klik ładuje batch do widoku powyżej.

---

## 3. Batch CSV (`BatchAnalysisPage.jsx` — `/kalkulator/batch`)

- Upload pliku CSV lub wklejenie listy działek; na dole **Historia raportów** (localStorage `batch_history`). „Wczytaj analizę” ładuje batch do widoku tabeli/raportu na tej samej stronie.
- **Zakładki wewnętrzne**: „📋 Tabela działek”, „ℹ️ Info”, przyciski: Pobierz CSV, Wyczyść, przejście do Historii.

**Pola w tabeli**: parcel_id, kolizja, napięcie, pow_m2, cena_m2, długość_linii_m, pas_m, pas_m2, track_a, track_b, razem, status.  
Wyliczenia: lokalne `recalcKSWS()` + `KSWS_STANDARDS` (duplikat względem backendu).

---

## 4. Historia zbiorcza (`BatchHistoryPage.jsx` — `/kalkulator/historia`)

- Lista batchy z API (`/api/history`).
- Klik w batch → `loadBatchDetails(batch_id)` → `displayBatchReport(data)` — otwiera okno z raportem HTML (podobny układ do Raportu Zbiorczego z KalkulatorPage: KPI, karty działek, mapa zbiorcza, zestawienie).

Brak formularzy edycyjnych — tylko podgląd i raport.

---

## 5. Klienci (`ClientsPage.jsx` — `/kalkulator/klienci`)

- Lista klientów (localStorage `ksws_clients_v1`), wyszukiwarka, dodaj/edytuj/usuń.
- **Sekcje przy wybranym kliencie**: `activeSection` = „dane” | „analizy” | „pliki”.

**Pola klienta (EMPTY_CLIENT / formularz)**  
- firstName, lastName, email, phone, address, caseNumber, notes, status (aktywna).  
- dateWniosekStarostwo, datePismoOperatora, dateWyslanieDoOperatora.  
- compensation, compensationPaid.  
- analyses[], files[].

---

## 6. Wzory dokumentów (`WzoryPage.jsx` — `/kalkulator/wzory`)

- **Szablony**: Starostwo (wniosek o informację o tytule), Operator (wezwanie do zapłaty), Sąd (odpis KW).
- Dla każdego szablonu: formularz (wybór klienta, dane wnioskodawcy, działka, starostwo/operator/KW, daty itd.) i generowanie treści.

**Pola formularza (wspólne)**  
clientId, clientName, clientAddress, parcelId, parcelObreb, parcelGmina, parcelPowiat, voivodeship, starostwoNazwa, starostwoAdres, operatorNazwa, operatorAdres, kwNumber, dataWniosku, miejscowosc.

---

## 7. Strona główna (`LandingPage.jsx` — `/kalkulator/home`)

- Przyciski CTA: Analiza działki, Batch CSV. Brak formularzy — tylko nawigacja.

---

## 8. Podsumowanie — co gdzie jest

| Strona | Główne formularze | Zakładki wewnętrzne | Uwagi |
|--------|-------------------|----------------------|--------|
| Analiza działki | Identyfikacja, Dane ewid., KW, Karta klienta, Korekta ręczna | Mapy (map2d / mapy) | + Oferty hurtowe i Historia CSV na dole |
| Batch CSV | Tylko upload CSV | Tabela / Info | Lokalne liczenie Track A/B |
| Historia zbiorcza | — | — | Tylko lista batchy + podgląd raportu |
| Klienci | Dane klienta, analizy, pliki | dane / analizy / pliki | — |
| Wzory | Formularze szablonów | — | — |

---

## 9. Przepływ batch vs historia — gdzie co trafia (ważne)

**Oferty hurtowe** (sekcja na stronie *Analiza działki*):
- Użytkownik wgrywa CSV i uruchamia analizę **na tej samej stronie** (Analiza działki).
- Wyniki: mapa zbiorcza, kolorowe KPI, diagramy, **karty działek z przyciskiem PDF przy każdej**.
- Zapis: **na dole tej samej zakładki** — „Oferty Hurtowe — Historia CSV” — **kolorowe boxy** (localStorage `batch_history`). Klik w box ładuje ten batch z powrotem w widok „Oferty hurtowe”.

**Batch CSV** (osobna zakładka w menu → `/kalkulator/batch`):
- Użytkownik wgrywa CSV na stronie Batch CSV i uruchamia analizę.
- Wyniki trafiają do **Historia zbiorcza** (osobna strona `/kalkulator/historia`) — **inny szablon**: gorsza mapa, **brak PDF do pobrania per działka**, raport jako „pakiet działek”.

**Skutek:** To samo działanie (analiza batch CSV) w zależności od miejsca (Oferty hurtowe vs Batch CSV) daje inny zapis i inny szablon raportu. W Historii zbiorczej brakuje m.in. przycisku PDF na działkę.

**Ujednolicenie kwoty „Razem” (ten sam plik = ta sama kwota):**
- **Oferty hurtowe** i **Batch CSV** wyświetlają teraz **kwotę z API** (backend: `compensation.track_a/track_b.total`). Dla tego samego pliku CSV kwota „Łączne roszczenia” / „Razem (A+B)” jest identyczna w obu miejscach i w PDF.
- W zakładce **Batch CSV**, po wprowadzeniu **korekt długości linii** w tabeli działek, suma przełącza się na przeliczenie po stronie frontu i przy nazwie pojawia się dopisek „(po korekcie długości)”.

**Historia pojedynczych analiz** (pojedyncze działki):
- **Nie widać jej w menu** — dopiero po wejściu w **Analiza działki** pojawia się na stronie sekcja „Historia działek” (ostatnie analizy pojedynczych działek). System zakładek w sidebarze się nie zmienia (menu to wciąż te same pozycje).

---

## 10. Rzeczy do dopasowania przy „dokończeniu za manus”

1. **Raporty**  
   - Jeden wzór raportu pojedynczej działki i jeden zbiorczy (zgodnie z `RAPORTY_MIEJSCA_WZORY.md`) — upewnić się, że używają tych samych pól co formularze (np. Karta klienta, Nr sprawy, KW, korekta ręczna).
2. **Pola „Karta klienta”**  
   - Imię/Firma, E-mail, Nr sprawy, Data wysłania — czy trafiają do PDF/zbiorczego (backend/front)? Sprawdzić payload do `/api/report/pdf` i `/api/report/pdf-cards`.
3. **Status sprawy (checkboxy)**  
   - Pismo starosty, WZ, Odmowa WZ, Pismo operatora — czy są w eksportach/raportach czy tylko do widoku?
4. **BatchAnalysisPage vs Oferty hurtowe na Analizie**  
   - Dwa miejsca batcha (Batch CSV vs Oferty hurtowe) — czy zachować oba i ujednolicić tylko raporty, czy zlecić jeden wejście (wtedy decyzja: który ekran zostaje).
5. **Duplikaty KSWS**  
   - KalkulatorPage (recalcKSWS), BatchAnalysisPage (recalcKSWS) — docelowo tylko dane z API; ewentualnie jeden endpoint „recalc” po stronie backendu przy batchu.

Po przejrzeniu zakładek i pól można doprecyzować, które pola są obowiązkowe do raportu, a które tylko do widoku, i dokończyć jeden wzór raportu na działkę oraz jeden zbiorczy.
