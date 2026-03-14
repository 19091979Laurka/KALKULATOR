# Porównanie branchy: lokalny main, origin/main, manus/crm

**Data:** 2026-03-02 (po `git fetch origin`)

---

## 1. Kto jest w repozytorium (autorzy commitów)

### Antigravity (Google)

**Antigravity** to osoba z **Google**, która kodowała i zmieniała **mapy** oraz robiła **nowy layout w zakładce CRM** (lokalnie). W repozytorium jej/jego commity widnieją pod nazwami:

| W Git jako     | Email                  | Co robił(a) |
|----------------|------------------------|-------------|
| **Manus**      | manus@kalk-crm.dev     | Panel NotebookLM 3-kolumnowy, iframe w CRM |
| **Manus Deploy** | deploy@kalkulator.pl | Layout CRM (fix cp-root), UX (jasny motyw, glassmorphism, full-width), strona główna, karta klienta, NotebookLM API, Dockerfile |

Czyli **Antigravity (Google) = Manus / Manus Deploy** w historii commitów — mapy, nowy layout, zakładka CRM.

### Pozostali

| Autor   | Email                     | Przykładowe commity |
|--------|----------------------------|---------------------|
| **SZWRK** | kancelaria.szuwara@gmail.com | Analiza hurtowa, mapy (Esri, KIUT), raporty, batch |

---

## 2. Stan gałęzi (po `git fetch origin`)

### Lokalny `main` (u Ciebie)

- **Ostatni commit:** `c29ee74b` — *feat(maps): Switch to Esri Satellite base layer, KIUT transmission lines, highlight parcels…*
- **Autor:** SZWRK  
- **Jest 1 commit przed origin/main:** Twoje zmiany map (Esri, KIUT, kolory).

### Zdalny `origin/main` (GitHub)

- **Ostatni commit:** `28445e7c` — *feat(crm): natywny panel NotebookLM 3-kolumnowy (Źródła|Czat|Studio)*
- **Autor:** SZWRK (commit zmergowany / przepisany z brancha Manusa)
- **Zawiera:** Nowe pliki `NotebookPanel.jsx`, `NotebookPanel.css`, rozszerzenia `ClientsPage.*`, zmiany w `BatchHistoryPage.jsx`, `KalkulatorLayout.jsx`, `index.jsx`, usunięcia m.in. `GIT_STRATEGY.md`, `GIT_ZAPISY_LOKALNIE_GITHUB.md`, część docs.

### Zdalny `origin/manus/crm`

- Branch **Manusa** (CRM, NotebookLM).
- Na `origin/main` jest już wersja z panelem NotebookLM (commit `28445e7c`), więc `manus/crm` i `main` na GitHubie są w podobnym kierunku (CRM/NotebookLM).

---

## 3. Różnice: co ma GitHub, czego nie ma u Ciebie (i odwrotnie)

### Na GitHub (origin/main), czego **nie ma** u Ciebie lokalnie

- Panel NotebookLM 3-kolumnowy (Źródła | Czat | Studio) — pliki:
  - `frontend-react/src/DemoPages/Kalkulator/NotebookPanel.jsx`
  - `frontend-react/src/DemoPages/Kalkulator/NotebookPanel.css`
- Rozszerzone `ClientsPage.jsx` / `ClientsPage.css` (integracja z panelem).
- Zmiany w: `BatchHistoryPage.jsx`, `HistoriaAnalizPage.jsx`, `KalkulatorLayout.jsx`, `KalkulatorPage.jsx`, `LandingPage.*`, `WzoryPage.*`, `index.jsx`.
- Usunięte m.in.: `.cursor/rules/modern-ui-ux.mdc`, `docs/GIT_STRATEGY.md`, `docs/GIT_ZAPISY_LOKALNIE_GITHUB.md`, `docs/KALKULATOR_PRZEPLYW_ZAKLADEK.md`, `frontend-react/public/logo_szuwara_baner.png` (binarka), `kiut_test.png`, `test_kiut.py`, zmiany w `QUICKSTART.md`, `START_*.sh`, `backend/main.py`, `backend/modules/pdf_report.py`, `backend/integrations/uldk.py`.

### U Ciebie lokalnie (main), czego **nie ma** na GitHub

- 1 commit: **mapy** — Esri Satellite, KIUT (opacity, kolory działek, promień analizy).

---

## 4. Żeby nic się nie nadpisywało — zalecany sposób

- **Nie rób** `git push --force` na `main` — nadpiszesz to, co jest na GitHubie (w tym panel CRM).
- Żeby **mieć i swoje mapy, i wersję z GitHubu (CRM)**:

  ```bash
  git fetch origin
  git checkout main
  git merge origin/main -m "merge: origin/main (panel CRM/NotebookLM) do lokalnego main"
  ```

- Jeśli pojawią się **konflikty**, Git wskaże pliki; po ręcznym rozwiązananiu:

  ```bash
  git add <pliki>
  git commit -m "resolve: konflikty merge main z origin/main"
  ```

- Potem możesz wypchnąć połączoną historię:

  ```bash
  git push origin main
  ```

W ten sposób:
- Twoje commity (mapy) zostaną zachowane.
- Commity z GitHubu (panel CRM, zmiany w Klientach, BatchHistory itd.) też wejdą do Twojego `main`.
- Nic nie zostanie nadpisane bez Twojej świadomej decyzji (merge łączy obie historie).

---

## 5. Zakładka CRM „nie mogę jej podejrzeć”

To ta zakładka, nad którą pracował **Antigravity (Google)** — nowy layout i panel w CRM (lokalnie). Żeby ją zobaczyć:

- **Trasa:** `/kalkulator/klienci` (menu: **CRM** w sidebarze).
- **Komponent:** `ClientsPage.jsx` w `KalkulatorLayout`.

Możliwe przyczyny, że „nie widać” CRM:

1. **Brakuje commita z GitHubu**  
   U Ciebie może być starsza wersja bez poprawki layoutu (np. bez fixu `cp-root` / `ksws-content`). Po **merge z origin/main** (jak wyżej) dostaniesz wersję z panelem CRM i aktualnym layoutem.

2. **Layout (wysokość)**  
   Już w repozytorium jest fix: *fix: CRM layout — cp-root height 100% dla KalkulatorLayout* (commit `45160849`).  
   Jeśli mimo to strona CRM jest pusta / zwinięta, w dokumencie **Poprawka widoczności zakładki CRM** poniżej jest propozycja dodatkowego CSS (min-height dla `.ksws-content`), żeby obszar treści zawsze miał wysokość.

3. **Routing**  
   Upewnij się, że wchodzisz w **Kalkulator** (np. Strona główna kalkulatora), a potem w menu bocznym wybierasz **CRM** (👥). Adres powinien być np.  
   `http://localhost:3001/#/kalkulator/klienci`.

---

## 6. Szybkie komendy do porównań

```bash
# Co jest na GitHub, czego nie ma u Ciebie
git log main..origin/main --oneline

# Co jest u Ciebie, czego nie ma na GitHub
git log origin/main..main --oneline

# Różnice w plikach (main vs origin/main)
git diff main origin/main --stat
```

---

*Ostatnia aktualizacja: po analizie `git log`, `git branch -a`, `git fetch origin` w repozytorium KALKULATOR.*
