# Stan wersji na GitHub (main) — co jest, czego brakuje

**Data:** sprawdzenie po `git fetch`; main = origin/main (commit 4f02df5b).

---

## ✅ Co JEST na GitHubie (poprawne / pełne)

### Mapy
- **Esri** (World_Imagery, Topo) — w `mapSources.js` i `KalkulatorPage.jsx`.
- **KIUT GUGiK** — warstwy WMS (elektro, gaz, woda, kanal, ciepło, telekom) w KalkulatorPage i w raportach (HistoriaAnalizPage).
- Odnośniki do KIUT, Overpass, OSM w UI.

### Zakładki (logika)
- **KalkulatorLayout** — pełna kolejność: Strona główna, CRM, Wzory, Analiza działki, Historia analiz, Analiza hurtowa, Historia raportów.
- **Routing** — `/kalkulator/home`, `/klienci`, `/wzory`, `/analiza`, `/historia-analiz`, `/batch`, `/historia`. Wszystkie pod jednym layoutem z fioletowym sidebarem.

### Dodatek rolny (R5)
- **Analiza pojedynczej działki** (KalkulatorPage): checkbox „🌾 Rolnik — aktywuje R5 (szkoda rolna)”, pełna sekcja R1–R5 w raporcie (R5.1, R5.2, wartości).
- **BatchPage.jsx** (jeśli używany): checkbox „🌾 Rolnicy (R5)”, kolumna R5 w tabeli.

### Raporty
- **Raport pojedynczej działki** — z mapą, KIUT, metodologią, „Błąd integracji” przy braku ceny GUS.
- **Historia analiz** — lista analiz, buildSingleHtml z mapami.
- **Historia raportów (batch)** — lista batchy z backendu, otwarcie raportu zbiorczego (HTML w nowym oknie).

---

## ❌ Czego NIE MA na GitHubie (wersja „poprawiona” z naszej pracy)

Te elementy były w naszej wersji, ale **w aktualnym main na GitHubie ich nie ma**:

### 1. Raport zbiorczy / lista działek
- **Brak** jednej tabeli **zestawienia** na dole raportu (kolumny: Lp., Działka, Kolizja, Napięcie, Pow., Cena, Dł. linii, Pas m, Pas m², Track A, Track B, Razem, Status) z tekstem „— (wybór A lub B)”.
- Na GitHubie raport batch to karty działek + podsumowanie, bez pełnego zestawienia w jednej tabeli.

### 2. Tekst „Przedział roszczenia (wybór A lub B), nie sumować”
- Na GitHubie w raporcie (buildParcelHtml i podsumowania) jest: **„ŁĄCZNE ROSZCZENIE (Track A + Track B)”** i **suma (A+B)**.
- Brak tekstu: „Przedział roszczenia (wybór Track A lub B — nie sumować)” i przedziału w PLN (X – Y PLN).

### 3. Analiza hurtowa — formularz
- **Brak** pól: **Nazwa raportu / klienta**, **ID klienta (CRM)**, **Wklej listę działek** (textarea).
- **Brak** checkboxa **„Gospodarstwo rolne (R5)”** na stronie Analiza hurtowa.
- Na GitHubie jest tylko: wgranie pliku CSV + przycisk „Analizuj działki” (bez nazwy klienta i R5 w formularzu).

### 4. Historia raportów — wyszukiwanie
- **Brak** pola **„Szukaj po nazwie klienta lub pliku…”** i filtrowania listy batchy.
- Brak przycisku „Przypisz do CRM” / linku do `/kalkulator/klienci` w kartach (w obecnej wersji może być inna struktura kart).

### 5. Zakładka Info w Analizie hurtowej
- **Brak** bloku **„Różne formy raportów”** (Pobierz HTML vs Otwórz Raport w Historii, Track A/B nie sumować) oraz rozbudowanego opisu edycji długości linii.

### 6. Wykresy w raporcie zbiorczym
- **Brak** wykresów: „Suma Track A vs Track B”, „Kwoty Track B wg działek”, „Kolizja z/bez” (doughnut) w otwartym raporcie batch.

---

## Podsumowanie

| Obszar              | Na GitHubie (main)                         | W naszej „poprawionej” wersji (lokalnie / nie na main) |
|---------------------|--------------------------------------------|--------------------------------------------------------|
| Mapy (Esri, KIUT)   | ✅ Jest                                   | —                                                      |
| Logika zakładek     | ✅ Pełna (7 zakładek, routing)             | —                                                      |
| R5 w analizie 1 działki | ✅ Jest                               | —                                                      |
| R5 w formularzu batch | ❌ Brak                                 | Checkbox „Gospodarstwo rolne (R5)”                     |
| Raport: zestawienie (1 tabela) | ❌ Brak                    | Jedna tabela na dole, kolumny + „wybór A lub B”        |
| Raport: „Przedział A/B, nie sumować” | ❌ Jest „ŁĄCZNE (A+B)”        | Tekst przedziału + wyjaśnienie                         |
| Nazwa klienta / wklej listy (batch) | ❌ Brak                  | Pola w formularzu                                      |
| Wyszukiwanie w Historii raportów | ❌ Brak                   | Pole „Szukaj po nazwie…”                               |
| Wykresy w raporcie zbiorczym | ❌ Brak                    | 3 wykresy (A vs B, Track B wg działek, Kolizja)         |

**Wniosek:** Na GitHubie jest **poprawna** wersja **systemu, map i zakładek** oraz **R5 w analizie pojedynczej działki**. **Nie ma** tam „poprawionej” wersji **raportów zbiorczych** (zestawienie, przedział A/B, R5 w formularzu batch, wyszukiwanie w Historii, wykresy) — te zmiany są tylko u Ciebie lokalnie (albo w innych branchach) i nie zostały wypchnięte na main.
