# Decyzja: co gdzie ma być

**Cel:** Struktura intuicyjna dla użytkownika (UX/UI). Jedna czynność = jedno miejsce. Jasne nazwy. Stylistykę dopracowuje się osobno (np. Manus).

**Kontekst produktu:** Aplikacja to **dashboard do zarządzania sprawami i klientami** (roszczenia KSWS), używany przez kancelarię, z możliwością sprzedaży dalej. Zob. `KONTEKST_PRODUKTU.md`.

---

## Zasady UX (obowiązują)

- **Jedna czynność = jedno miejsce** — nie duplikujemy wejść (np. wgranie CSV tylko w jednym miejscu).
- **Nazwy z perspektywy użytkownika** — „Jedna działka”, „Wiele działek (CSV)”, nie żargon typu „Batch”.
- **Minimum zagnieżdżeń** — unikamy: wejście → wybór zakładki → dopiero treść. Lepiej: płaskie menu, każda pozycja = jedna jasna strona.
- **Historia tam, gdzie do niej wracasz** — ostatnie pojedyncze analizy przy „Jedna działka”; ostatnie batchy przy „Wiele działek”.

---

## 1. Menu główne (sidebar) — jedna lista, czytelne nazwy

| Kolejność | Pozycja w menu (dla użytkownika) | Trasa | Zawartość strony |
|-----------|----------------------------------|-------|------------------|
| 1 | **Jedna działka** | `/kalkulator/analiza` | Formularz (działka, klient, KW, korekta) → przycisk „Oblicz” → wyniki + mapa. Na dole sekcja **Ostatnie analizy** (lista pojedynczych; klik = załaduj). |
| 2 | **Wiele działek (CSV)** | `/kalkulator/batch` | Wgraj plik CSV → „Oblicz” → tabela, suma, mapa zbiorcza, PDF. Na dole **Ostatnie batchy** (karty; klik = załaduj). |
| 3 | **Archiwum zbiorcze** | `/kalkulator/historia` | Lista zapisanych analiz zbiorczych (backend). Klik = podgląd raportu z mapą. |
| 4 | **Klienci** | `/kalkulator/klienci` | Baza klientów (lista, dane, analizy, pliki). |
| 5 | **Wzory dokumentów** | `/kalkulator/wzory` | Szablony pism: Starostwo, Operator, Sąd (KW). |
| 6 | **Strona główna** | `/kalkulator/home` | Wejście: przyciski „Jedna działka”, „Wiele działek (CSV)”. |

Menu się **nie zmienia** — wszędzie ten sam sidebar.

---

## 2. Strona „Jedna działka” — bez zbędnych zakładek

**Jedna strona, jeden flow:** formularz u góry → przycisk „Oblicz” / „Generuj raport KSWS” → wyniki i mapa. Poniżej **sekcja „Ostatnie analizy”** (lista ostatnich pojedynczych analiz; klik = załadowanie do formularza).

- **Nie ma** wewnętrznego paska: Formularz | Historia działek | Oferty hurtowe.
- **Nie ma** drugiego miejsca na wgrywanie CSV (CSV tylko w „Wiele działek (CSV)”).
- Opcjonalnie: pod wynikami zakładki **Mapa 2D** / **Mapy** (tylko przełączenie widoku mapy).

---

## 3. Pola — gdzie są (bez zmian nazw/logiki)

- **Karta klienta:** Imię/Firma, E-mail, Nr sprawy, Data wysłania maila — na stronie Analiza działki, w widoku Formularz.
- **Działka:** Identyfikator działki (wymagany), Numer, Obręb, Gmina, Powiat, Województwo — tam samo.
- **KW i status:** Nr KW, Pismo starosty, Wnioskowane o WZ, Odmowa WZ, Pismo operatora, Rolnik — tam samo.
- **Korekta ręczna:** Cena [zł/m²], Typ gruntu, Infrastruktura wykryta, Napięcie, Długość linii [m] — accordion w Formularzu.
- **Wiele działek (CSV):** upload CSV, tabela wyników, suma, eksport; na dole sekcja Ostatnie batchy. **Raport zbiorczy** (widok po analizie) ma używać **szablonu z Ofert hurtowych**: mapa zbiorcza → KPI (Działek, Kolizji, Track A/B) → Odszkodowanie wg działki → Łączne roszczenie → karty działek z PDF. Zob. `RAPORTY_MIEJSCA_WZORY.md` sekcja 4.
- **Archiwum zbiorcze:** lista batchy z backendu + podgląd raportu (bez edycji).
- **Klienci:** firstName, lastName, email, phone, address, caseNumber, notes, status, daty (wniosek starostwo, pismo operatora, wysłanie), compensation, analyses, files — jak w `ZAKLADKI_I_POLA.md` sekcja 5.
- **Wzory:** pola formularzy szablonów — jak w `ZAKLADKI_I_POLA.md` sekcja 6.

---

## 4. Co NIE podlega tej decyzji

- Wygląd (kolory, fonty, odstępy, ikony, animacje).
- Teksty przycisków/etykiet (można dopracować, byle nie zmieniać sensu „co gdzie”).
- Kolejność pól wewnątrz sekcji — dopuszczalne drobne przesunięcia dla UX, bez zmiany listy pól.

---

## 5. Odniesienia

- Szczegóły pól i tras: `ZAKLADKI_I_POLA.md`.
- Raporty i miejsca generowania: `RAPORTY_MIEJSCA_WZORY.md`.
- Implementacja: `KalkulatorLayout.jsx` (menu), `KalkulatorPage.jsx` (jedna działka, jedna strona + sekcja Ostatnie analizy), `index.jsx` (trasy).
