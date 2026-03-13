# Potwierdzenie ostateczne — zakładki i zawartość

**Źródło prawdy:** `ZAKLADKI_I_POLA.md`, `KalkulatorLayout.jsx`, `index.jsx`.  
**Sidebar:** jeden wspólny na wszystkich stronach, kolejność 1–7.

---

## Kolejność menu (sidebar)

| # | Zakładka | Ścieżka |
|---|----------|---------|
| 1 | **Strona główna** | `/kalkulator/home` |
| 2 | **CRM** (Client Case Dashboard) | `/kalkulator/crm` |
| 3 | **Wzory dokumentów** | `/kalkulator/wzory` |
| 4 | **Analiza działki** | `/kalkulator/analiza` |
| 5 | **Historia analiz** | `/kalkulator/historia-analiz` |
| 6 | **Analiza hurtowa** | `/kalkulator/batch` |
| 7 | **Historia raportów** (Oferty Hurtowe — Historia CSV) | `/kalkulator/historia` |

Trasy niepasujące → przekierowanie na `/kalkulator/home`.

---

## 1. Strona główna  
**Ścieżka:** `/kalkulator/home`

| Element | Zawartość |
|--------|-----------|
| **Strona** | Landing: przyciski CTA (np. Jedna działka, Analiza hurtowa). |

---

## 2. CRM — Client Case Dashboard  
**Ścieżka:** `/kalkulator/crm`

| Element | Zawartość |
|--------|-----------|
| **Strona** | Baza klientów / spraw (Client Case Dashboard). Lista, wyszukiwarka, dodaj/edytuj/usuń. Przy wybranym kliencie: sekcje Dane \| Analizy \| Pliki. |

**Backend:** brak (localStorage) lub według implementacji.

---

## 3. Wzory dokumentów  
**Ścieżka:** `/kalkulator/wzory`

| Element | Zawartość |
|--------|-----------|
| **Strona** | Szablony pism: Starostwo, Operator, Sąd (KW). Formularze pól szablonów. |

**Backend:** brak (lub według implementacji).

---

## 4. Analiza działki  
**Ścieżka:** `/kalkulator/analiza`

| Element | Zawartość |
|--------|-----------|
| **Strona** | Jedna strona, bez wewnętrznych zakładek. |
| **U góry** | Formularz: Karta klienta (Imię/Firma, E-mail, Nr sprawy, Data maila), Identyfikator działki *, Dane ewidencyjne, KW i status (Nr KW, Pismo starosty, WZ, Odmowa WZ, Pismo operatora), Rolnik, Korekta ręczna (accordion). Przycisk **„Generuj raport KSWS”**. |
| **Po analizie** | Wynik **do podglądu**: raport + mapa. W nagłówku wyniku przyciski **„PDF”** (pobierz PDF) i **„Archiwum”** (przejście do Historii analiz). Strona przewija do raportu (`#raport-do-pdf`). |
| **Zerowanie** | **Po wyjściu z zakładki** widok się zeruje — wynik i formularz nie są utrwalane na tej stronie. Lista analiz jest w **Historia analiz** (zakładka 5). |

**Backend:** `POST /api/analyze`, `POST /api/report/pdf`.

---

## 5. Historia analiz  
**Ścieżka:** `/kalkulator/historia-analiz`

| Element | Zawartość |
|--------|-----------|
| **Strona** | Lista analiz pojedynczych (z localStorage `ksws_history`). Tabela: #, Działka, Data, Pow. [m²], Razem [PLN], Kolizja, przycisk „Otwórz”. |
| **Akcja** | Klik w wiersz lub „Otwórz” → załadowanie analizy na stronie **Analiza działki** (formularz + raport + mapa) i przewinięcie do raportu. Po załadowaniu wpis pozostaje w historii. Przycisk „Wyczyść historię” czyści localStorage. |

**Backend:** brak (localStorage).

---

## 6. Analiza hurtowa  
**Ścieżka:** `/kalkulator/batch`

| Element | Zawartość |
|--------|-----------|
| **Strona** | Nagłówek: „Analiza hurtowa” + opis (CSV lub wklej listy → raport Oferty hurtowe). |
| **Wejście** | Upload pliku CSV **lub** wklejenie listy działek. Przycisk „Analizuj działki” / „Analizuj z listy”. |
| **Po analizie** | Raporty zbiorcze **tylko na czas podglądu** na tej stronie. Później trafiają do **Historia raportów** (zakładka 7). Zakładki wewnętrzne: Raport, Tabela działek, Info. Przyciski: Pobierz CSV, Nowa analiza, link do Historii raportów. |

**Backend:** `POST /api/analyze/batch`, `POST /api/report/pdf`, `POST /api/report/pdf-cards`, `POST /api/report/map`.

---

## 7. Historia raportów (Oferty Hurtowe — Historia CSV)  
**Ścieżka:** `/kalkulator/historia`

| Element | Zawartość |
|--------|-----------|
| **Strona** | Lista zapisanych analiz zbiorczych (batchy z CSV). Klik w batch → podgląd raportu. |
| **Uwaga** | Forma wizualna do dopracowania — obecna uznana za mało profesjonalną. Logika i backend bez zmian. |

**Backend:** `GET /api/history`, `GET /api/history/{batch_id}` lub localStorage `batch_history` (zgodnie z implementacją).

---

## Różnice: Historia analiz vs Historia raportów

| | Historia analiz (5) | Historia raportów (7) |
|---|---------------------|------------------------|
| **Dane** | Pojedyncze analizy KSWS (jedna lub wiele działek w jednym zapytaniu) | Batchy z CSV / wklejonej listy (Oferty hurtowe) |
| **Storage** | `ksws_history` (localStorage) | `batch_history` (localStorage) lub backend |
| **Akcja** | Klik → załadowanie na **Analiza działki** | Klik → podgląd raportu batcha (wizualna forma do dopracowania) |

---

*Ostatnia aktualizacja: zgodna z implementacją w `KalkulatorLayout.jsx`, `KalkulatorPage.jsx`, `HistoriaAnalizPage.jsx`, `index.jsx`, oraz z decyzją użytkownika 1–7 (Strona główna, CRM, Wzory, Analiza działki, Historia analiz, Analiza hurtowa, Historia raportów).*
