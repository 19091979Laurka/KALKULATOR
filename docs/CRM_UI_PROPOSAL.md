# Propozycja UI/UX — zakładka CRM (Klienci)

Nowoczesny układ inspirowany szablonami dashboardowymi (np. [DashboardPack — ArchitectUI](https://dashboardpack.com/templates/free-themes/): Bootstrap 5, karty, czytelna hierarchia).

---

## 1. Ogólny układ (Layout)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Nagłówek strony: "Klienci" + krótki opis                                    │
├──────────────────┬──────────────────────────────────────────────────────────┤
│  PANEL BOCZNY    │  OBSZAR GŁÓWNY                                            │
│  (lista klientów)│  ┌────────────────────────────────────────────────────┐  │
│                  │  │  BOX KLIENTA — nazwa + meta (nr sprawy, status)     │  │
│  [ + Nowy ]      │  │  Akcje: Edytuj · Usuń                              │  │
│  [ 🔍 Szukaj ]   │  └────────────────────────────────────────────────────┘  │
│                  │  ┌────────────────────────────────────────────────────┐  │
│  ┌────────────┐  │  │  DASHBOARD (tabs: Dashboard | Dane | Wynagrodzenie  │  │
│  │ Jan K.  #12 │  │  │  | Analizy | Dokumenty | Historia | AI)           │  │
│  └────────────┘  │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  KPI cards    │  │
│  ┌────────────┐  │  │  │ 📊 3 │ │ 📁 5 │ │ 💰   │ │ 📅 8 │               │  │
│  │ Anna M.    │  │  │  └──────┘ └──────┘ └──────┘ └──────┘               │  │
│  └────────────┘  │  │  ┌─────────────────┐ ┌─────────────────┐          │  │
│  ...             │  │  │ Dane kontaktowe  │ │ Przebieg sprawy │  Cards   │  │
│                  │  │  └─────────────────┘ └─────────────────┘          │  │
│                  │  └────────────────────────────────────────────────────┘  │
└──────────────────┴──────────────────────────────────────────────────────────┘
```

- **Lewa kolumna (sidebar):** lista klientów — każdy wiersz to **kompaktowa karta** (avatar inicjały, imię i nazwisko, nr sprawy lub e-mail, badge statusu). Wyszukiwarka u góry, przycisk „+ Nowy klient”.
- **Prawa kolumna:** gdy brak wyboru — **empty state** (ikona, tekst „Wybierz klienta lub dodaj nowego”, CTA).
- Gdy wybrano klienta: **główny box** z:
  1. **Nagłówkiem karty klienta** — duża nazwa (imię i nazwisko), pod spodem: status, nr sprawy, data dodania; po prawej przyciski Edytuj / Usuń.
  2. **Zakładkami** (Dashboard, Dane, Wynagrodzenie, Analizy, Dokumenty, Historia, AI).
  3. **Zawartością w układzie dashboardu:** KPI (analizy, dokumenty, kwota, wpisy), potem karty z danymi (kontakt, przebieg sprawy, najlepsza analiza, ostatnia aktywność).

---

## 2. Wzorce z szablonów (DashboardPack / ArchitectUI)

- **Karty (cards):** zaokrąglone (`border-radius: 12px`), miękkie cienie (`box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)`), bez ciężkich obramowań.
- **Lista klientów:** każdy element jak **mini-karta** — hover z lekkim podniesieniem (`transform`, cień), aktywny z wyraźnym wskaźnikiem (np. pasek lub tło w kolorze akcentu).
- **KPI (stat cards):** ikona + duża liczba + etykieta; opcjonalnie kolorowy pasek u góry karty (purple, blue, green, orange).
- **Tło strony:** jasnoszare (`#f4f6fb`, `#f8f9fa`), karty białe — czytelna warstwowość.
- **Siatka 8px:** paddingi/marginesy 8, 16, 24, 32 px.
- **Mikrointerakcje:** `transition` na hover (ok. 0.2–0.3s), przyciski z lekkim powiększeniem lub zmianą cienia.

---

## 3. Lista klientów (sidebar)

- **Element listy:** avatar (inicjały), imię i nazwisko (pogrubione), druga linia: nr sprawy lub e-mail (mniejsza czcionka, szary). Z prawej: badge statusu (Aktywna / Czeka / Zakończona).
- **Hover:** delikatne tło + cień karty.
- **Aktywny:** tło w odcieniu fioletu (np. `#ede8f9`), lewy border w kolorze akcentu (`#6a4c93` lub `#5c3d8f`).
- **Pusta lista:** komunikat „Brak klientów” + zachęta do dodania.

---

## 4. Box z nazwą klienta i dashboard

- **Nagłówek karty klienta:** jeden wyraźny blok (białe tło, zaokrąglone rogi, cień). W środku: duży avatar, **imię i nazwisko** (h2), w drugiej linii: status, nr sprawy, „Dodano: data”. Po prawej: przyciski „Edytuj”, „Usuń” (secondary/outline).
- **Tabs:** pod nagłówkiem, w jednej linii (overflow-x na mobile). Aktywna zakładka: kolor akcentu + dolna krawędź.
- **Treść dashboardu:** 
  - Pierwszy rząd: **4 KPI** (Analizy, Dokumenty, Wynagrodzenie, Wpisy historii) w gridzie.
  - Drugi rząd: **2–3 karty** (Dane kontaktowe, Przebieg sprawy, Najlepsza analiza).
  - Opcjonalnie: Ostatnia aktywność, Notatki.

Wszystkie dane **pobierane z API / localStorage** — bez wartości na sztywno; brak danych = odpowiedni komunikat lub „—”.

---

## 5. Responsywność

- **Mobile:** sidebar na górze (zwijana lista lub poziomy scroll), pod spodem box klienta na pełną szerokość; KPI w 2 kolumny; tabs z przewijaniem.
- **Tablet/Desktop:** sidebar stała szerokość (ok. 280 px), główna treść flex 1.

---

## 6. Pliki do zmiany

| Element | Plik |
|--------|------|
| Layout + lista + box klienta + tabs | `frontend-react/src/DemoPages/Kalkulator/ClientsPage.jsx` |
| Style (karty, cienie, sidebar, KPI, nagłówek) | `frontend-react/src/DemoPages/Kalkulator/ClientsPage.css` |

Logika (stany, zapis klientów, NotebookLM, AI) pozostaje bez zmian; zmiany wyłącznie w strukturze JSX i stylach, aby uzyskać układ „lista klientów + box z nazwą + dashboard w środku” w stylu nowoczesnego szablonu dashboardu.
