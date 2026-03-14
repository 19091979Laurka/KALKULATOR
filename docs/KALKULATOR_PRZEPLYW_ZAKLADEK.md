# Kalkulator KSWS — przepływ zakładek i połączenia

Dokument opisuje **logikę nawigacji**: co z czego wynika, gdzie zapisują się dane, które endpointy backendu obsługują które widoki. Przydatne przy podziale zadań (frontend vs backend).

---

## 1. Dwie główne ścieżki

| Ścieżka | Start | Gdzie zapis | Gdzie zobaczyć wyniki | Raport do druku |
|--------|--------|-------------|------------------------|------------------|
| **A. Jedna działka** | **Analiza działki** (`/kalkulator/analiza`) | localStorage `ksws_history` | **Historia analiz** (`/kalkulator/historia-analiz`) | `#/kalkulator/raport-druk` (otwiera się z Historii analiz) |
| **B. Wiele działek (CSV)** | **Analiza hurtowa** (`/kalkulator/batch`) | Backend (API) → **Historia raportów** | Na tej samej stronie (Batch) po wykonaniu + lista w **Historia raportów** (`/kalkulator/historia`) | `#/kalkulator/raport-druk` (otwiera się z Historii raportów po „Otwórz raport”) |

- **Raport do druku** (`/kalkulator/raport-druk`) nie ma własnego menu. Zawsze otwierany z innej strony: albo z **Historia analiz** (jedna działka), albo z **Historia raportów** (batch). Zawartość to HTML zapisany w `localStorage` (`ksws_print_html`) przez stronę, która otworzyła podgląd.

---

## 2. Mapowanie stron → backend (dla osoby robiącej backend)

| Strona / akcja | Endpoint(y) | Uwagi |
|----------------|-------------|--------|
| **Analiza działki** — „Generuj raport” | `POST /api/analyze` | Jedna działka; zwraca `master_record`. Frontend zapisuje do `ksws_history` (localStorage) sam. |
| **Historia analiz** | — | Czyta tylko `localStorage` (`ksws_history`). Żadnego API. |
| **Analiza hurtowa** — wgrywanie CSV | `POST /api/analyze/batch` | Body: FormData (file, client_name, client_id, is_farmer). Zapis na backendzie w „historii batch”. |
| **Historia raportów** — lista | `GET /api/history` | Lista batchy (batch_id, file_name, client_name, total, successful, timestamp). |
| **Historia raportów** — otwórz raport | `GET /api/history/:id` | Pełne dane batcha (results, is_farmer, itd.) do wyświetlenia raportu HTML. |
| **Raport PDF (jedna działka)** | `POST /api/report/pdf` (lub inny, w zależności od implementacji) | Generuje PDF z przekazanego kontekstu. |
| **Raport PDF (batch)** | np. `POST /api/report/pdf` z parametrem batch_id | Zależnie od obecnej implementacji. |

---

## 3. Skąd → dokąd (nawigacja)

| Strona | Użytkownik może przejść do |
|--------|----------------------------|
| **Strona główna** | Analiza działki, Analiza hurtowa |
| **Analiza działki** | Strona główna, CRM, Wzory, Historia analiz, Batch, Historia raportów (menu) |
| **Historia analiz** | Analiza działki (przycisk gdy brak analiz); klik w wiersz → nowa karta z `raport-druk` |
| **Analiza hurtowa** | Historia raportów (przycisk po wyniku); Nowa analiza (zeruje wyniki) |
| **Historia raportów** | Analiza hurtowa; CRM (przypisanie batcha do klienta); klik „Otwórz raport” → modal/okno z raportem, zapis do `ksws_print_html` → otwiera `raport-druk` |
| **raport-druk** | Tylko drukowanie / PDF; brak sidebaru, brak nawigacji w aplikacji |

---

## 4. Gdzie co jest zapisane

| Dane | Miejsce |
|------|--------|
| Pojedyncze analizy (jedna działka) | `localStorage.ksws_history` — tablica `{ parcel_id, date, full_master_record, ... }` |
| Lista batchy (CSV) | Backend (GET /api/history) |
| Szczegóły batcha (do raportu HTML) | Backend (GET /api/history/:id) |
| HTML do podglądu druku | `localStorage.ksws_print_html` — ustawiane przez Historia analiz lub Historia raportów przed `window.open('#/kalkulator/raport-druk')` |

---

## 5. Pliki frontendu (krótko)

| Ścieżka | Odpowiedzialność |
|---------|------------------|
| `KalkulatorLayout.jsx` | Sidebar, menu, jedna nawigacja dla całego Kalkulatora |
| `index.jsx` (Kalkulator) | Definicja tras: home, analiza, historia-analiz, batch, historia, raport-druk, klienci, wzory |
| `LandingPage.jsx` | Strona główna; CTA → Analiza działki / Analiza hurtowa |
| `KalkulatorPage.jsx` | Formularz jednej działki, wywołanie /api/analyze, zapis do ksws_history |
| `HistoriaAnalizPage.jsx` | Lista z ksws_history, generacja HTML raportu jednej działki, ustawienie ksws_print_html i otwarcie raport-druk |
| `BatchAnalysisPage.jsx` | Wgrywanie CSV, POST /api/analyze/batch, podgląd wyników; link do Historii raportów |
| `BatchHistoryPage.jsx` | GET /api/history, lista batchy; GET /api/history/:id → generacja HTML raportu zbiorczego, ustawienie ksws_print_html, otwarcie raport-druk |
| `PrintPreviewPage.jsx` | Odczyt ksws_print_html, document.write(html) — brak logiki, tylko wyświetlenie |

Ten plik można aktualizować przy zmianie tras lub dodawaniu endpointów.
