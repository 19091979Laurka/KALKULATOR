# Gdzie powstają raporty: Analiza hurtowa vs Historia raportów vs Analiza 1 działki

Krótkie wyjaśnienie, **po co są różne formy** i gdzie co się „dubluje”.

---

## 1. Analiza hurtowa (zakładka „Analiza hurtowa”)

Po wgraniu CSV i zakończeniu analizy **na tej samej stronie** widzisz:

- **Zakładka „Raport”** — podgląd zbiorczy (KPI, wykresy, odszkodowanie wg działki) **w aplikacji**.
- **Zakładka „Tabela działek”** — tabela z działkami, **edytowalna długość linii** i przycisk **„Pobierz HTML”** przy każdej działce.

**„Pobierz HTML”** (z Tabeli działek) generuje **standalone plik HTML** dla **jednej** działki (np. `KSWS_061802_2_0004_115.html`).  
Ten raport powstaje w **`BatchAnalysisPage.jsx`** → funkcja **`buildParcelHtml(parcel, editedLen)`**:

- **Prosty szablon**: nagłówek, Track A/B, suma (A+B w jednym boksie), tabela parametrów, stopka.
- **Uwzględnia edycję**: jeśli w tabeli wpiszesz „Dł. linii [m]”, do wyliczeń trafia **`editedLen`** (recalc po stronie JS, te same wzory KSWS co w tabeli).
- **Bez mapy**, bez R1–R5, bez bloku metodologii.
- **Cel**: szybki wydruk / zapis jednej działki do pliku, z aktualną długością linii po korekcie.

---

## 2. Historia raportów (zakładka „Historia raportów”)

Po zapisaniu batcha ten sam zestaw analiz **trafia do historii**. Po kliknięciu wpisu otwiera się **raport zbiorczy** (nowe okno):

- **Jeden duży raport HTML** z: nagłówkiem zbiorczym, KPI, metodologią, **wykresami kwotowymi**, mapą zbiorczą, **kartami per działka** i **jedną tabelą** „Zestawienie zbiorcze działek” na dole.
- Przy **każdej karcie działki** jest przycisk **„Otwórz Raport”**.

**„Otwórz Raport”** (z raportu zbiorczego w Historii) otwiera raport **jednej** działki w nowej karcie.  
Ten raport powstaje w **`HistoriaAnalizPage.jsx`** → funkcja **`buildSingleHtml(item)`**:

- **Bogatszy szablon**: mapa (Leaflet), karty Track A/B, **R1–R5**, podstawa wyceny KSWS, **blok metodologii**, dane z API (bez lokalnego recalc z tabeli).
- **Dane**: `item.full_master_record` — to, co zwrócił backend przy analizie batcha; **nie** uwzględnia ręcznej edycji „Dł. linii” z Tabeli działek (bo ta edycja jest tylko w widoku Analizy hurtowej).
- **Cel**: spójny, „oficjalny” raport pojedynczej działki z mapą i pełnym opisem, taki sam jak w „Ostatnie analizy” po analizie 1 działki.

Czyli:

- **Ten sam batch** jest raz pokazany **w aplikacji** (Analiza hurtowa → Raport + Tabela), a drugi raz **w Historii** jako jeden duży raport HTML z kartami i przyciskiem „Otwórz Raport” przy każdej działce.
- **Raport pojedynczej działki** masz w **dwóch wersjach**:
  - z **Tabeli działek** (Analiza hurtowa) → **`buildParcelHtml`** — prosty, z Twoją edycją długości linii;
  - z **Historii raportów** (Otwórz Raport przy karcie) → **`buildSingleHtml`** — z mapą i R1–R5, na danych z API (bez tej edycji).

---

## 3. Analiza 1 działki (zakładka „Analiza działki”)

Po wpisaniu **jednego** numeru działki i uruchomieniu analizy wynik widać **w aplikacji** (KalkulatorPage):

- Karty (powierzchnia, cena, Track A/B), mapa, R1–R5, podstawa wyceny — **w tym samym oknie**, bez generowania HTML.
- Można użyć **„Drukuj”** (przeglądarka) lub **„PDF”** (backend) — wtedy powstaje eksport w innym formacie niż powyższe HTML.

To **nie jest** ten sam widok co „Pobierz HTML” z Tabeli działek ani „Otwórz Raport” z Historii: to **widok na żywo w aplikacji**; raporty HTML to osobne szablony.

---

## Po co to „dublowanie”?

| Miejsce | Co się dzieje | Po co |
|--------|----------------|------|
| **Tabela działek (Pobierz HTML)** | Pobierasz **prosty** HTML jednej działki, z **Twoją edycją** długości linii. | Szybki wydruk / plik po korekcie w tabeli, bez mapy i R1–R5. |
| **Historia raportów → Otwórz Raport** | Otwierasz **pełny** raport jednej działki (mapa, R1–R5, metodologia), na **danych z API** z momentu analizy. | Jednolity, „oficjalny” raport do archiwum / dla klienta, ten sam szablon co w Ostatnich analizach. |
| **Analiza 1 działki** | Wynik **w aplikacji** (karty + mapa), bez pobierania HTML. | Praca na jednej działce w jednym miejscu; eksport przez Drukuj/PDF. |

**Dublowanie** wynika z tego, że:

1. **Batch** jest pokazywany od razu po analizie (Raport + Tabela) **i** zapisywany do Historii — żeby mieć od razu podgląd i potem ten sam zestaw w Historii w formie jednego dużego raportu.
2. **Raport pojedynczej działki** ma **dwa szablony**:
   - **buildParcelHtml** — lekki, z korektą długości z tabeli (tylko w Analizie hurtowej),
   - **buildSingleHtml** — pełny (mapa, R1–R5), używany w Historii i w Ostatnich analizach.

Możliwa **uproszczenie na przyszłość**:  
„Pobierz HTML” w Tabeli działek mógłby wywoływać **ten sam** szablon co „Otwórz Raport” (`buildSingleHtml`), wtedy byłby **jeden** wzór raportu pojedynczej działki. Trzeba wtedy rozstrzygnąć, czy i jak w tym szablonie uwzględniać **edycję długości linii** z tabeli (np. przekazać poprawioną długość i przeliczyć kwoty w tym samym szablonie).

---

## Podsumowanie

- **Analiza hurtowa** → wyniki na stronie (Raport + Tabela) + „Pobierz HTML” = **prosty** HTML jednej działki **z edycją długości**.
- **Historia raportów** → ten sam batch w formie **zbiorczego** raportu HTML; „Otwórz Raport” przy działce = **pełny** HTML jednej działki (mapa, R1–R5), **bez** edycji z tabeli.
- **Analiza 1 działki** → wynik **w aplikacji**; eksport przez Drukuj/PDF, osobny od powyższych HTML-i.

Różne formy służą różnym celom (szybki plik z korektą vs pełny raport z mapą); można je z czasem zunifikować do jednego szablonu raportu pojedynczej działki, z opcjonalną korektą długości.
