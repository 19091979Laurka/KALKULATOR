# Specyfikacja NotebookLM w CRM — do wdrożenia przez Manusa

**Data:** 14 marca 2026

---

## W SKRÓCIE DLA MANUSA

**Masz już:** OAuth, logi, API działające. Tworzenie notebooków, dodawanie źródeł, Audio-Brief — wszystko działa. Link „Otwórz NotebookLM ↗” otwiera w nowej karcie.

**Brakuje:** Widoku notatnika **osadzonego w CRM** — tak jak w oryginalnym NotebookLM (Źródła | Czat | Studio), żeby użytkownik miał pełny interfejs bez wychodzenia z aplikacji.

**Twoje zadanie:** Dodać **iframe** z `selectedClient.notebookLmUrl` w zakładce AI Asystent (ok. linia 622 w ClientsPage.jsx), na początku bloku `.cp-nb-linked`. Pełna instrukcja poniżej.

---

**Kontekst:** CRM (ClientsPage) ma już podstawową integrację z NotebookLM Enterprise API. Wykonano minimum: tworzenie notebooków, dodawanie źródeł tekstowych, generowanie audio-brief. Brakuje widoku notatnika wbudowanego w CRM oraz dopracowania UX.

---

## 1. CO JEST ZROBIONE (obecny stan)

- OAuth2 / autoryzacja — **działa** (logi, tokeny)
- Endpointy backendu `/api/notebooklm/*` — tworzenie notebooków, dodawanie źródeł tekstowych, generowanie audio overview
- W ClientsPage: link do NotebookLM (`Otwórz NotebookLM ↗`), przycisk „Utwórz notebook automatycznie”, „Aktualizuj streszczenie sprawy w NotebookLM”, „Generuj Audio-Brief”
- Per sprawa zapisane: `notebookLmId`, `notebookLmUrl`
- Wbudowany chat AI (`/api/ai-chat`) — wymaga `OPENAI_API_KEY`, często nie działa w produkcji

---

## 2. CZEGO OCZEKUJEMY (docelowy stan)

### 2.1 Widok notatnika osadzonego w CRM (priorytet 1)

Zamiast wyłącznie linku „Otwórz w nowej karcie” — **osadzony widok NotebookLM** bezpośrednio w CRM, tak jak w oryginalnej aplikacji:

- **Źródła** — widoczne po lewej (dokumenty, streszczenie sprawy)
- **Czat** — widoczny na środku
- **Studio** — po prawej (Audio Overview, Mind Map, Reports)

Użytkownik ma mieć pełny interfejs NotebookLM w zakładce CRM, bez wychodzenia z aplikacji.

### 2.2 Streszczenia generowane i widoczne w aplikacji (priorytet 2)

- Streszczenie sprawy (tekst) **wyświetlane w CRM**, nie tylko wysyłane do NotebookLM
- Przycisk typu „Generuj streszczenie” → wywołanie AI → wynik w dedykowanym boxie na stronie sprawy (np. na Dashboardzie lub w zakładce „AI Asystent”)

### 2.3 Pole robocze (chat) działające w aplikacji (priorytet 3)

- Chat w zakładce „AI Asystent” ma **faktycznie odpowiadać**
- Jeśli OpenAI nie jest skonfigurowane — fallback na Gemini / LiteLLM
- Lub wyraźna informacja: „Skonfiguruj OPENAI_API_KEY lub GEMINI_API_KEY”

---

## 3. JAK WDROŻYĆ WIDOK NOTATNIKA (krok po kroku)

### 3.1 Format URL NotebookLM Enterprise (Cloud)

Zgodnie z dokumentacją: [Create and manage notebooks (API)](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks):

```
https://notebooklm.cloud.google.com/LOCATION/notebook/NOTEBOOK_ID?project=PROJECT_NUMBER
```

Przykład:  
`https://notebooklm.cloud.google.com/global/notebook/3c009991-3a4e-4581-b683-1fbf6efe3c91?project=384217730250`

W CRM masz już:
- `selectedClient.notebookLmId` — ID notebooka
- `selectedClient.notebookLmUrl` — pełny URL (można z niego wyciągnąć `project`)

Lub backend zwraca `notebook_id` + `url` — z `url` można zbudować `src` iframe.

### 3.2 Osadzenie via iframe

1. **W ClientsPage** — w zakładce „AI Asystent” (lub nowa zakładka „NotebookLM”) dodać sekcję z iframe:

```jsx
{selectedClient.notebookLmId && selectedClient.notebookLmUrl && (
  <div className="cp-nb-embed">
    <iframe
      src={selectedClient.notebookLmUrl}
      title="NotebookLM - sprawa klienta"
      width="100%"
      height="800"
      style={{ border: "1px solid #e0e0e0", borderRadius: 8 }}
      allow="clipboard-read; clipboard-write; microphone"
      loading="lazy"
    />
  </div>
)}
```

2. **Stylowanie** — box `.cp-nb-embed` ma zajmować sensowną przestrzeń (np. `min-height: 700px`, `flex: 1`), tak żeby iframe był czytelny na MacBooku i iPhone.

3. **Fallback** — jeśli iframe zwróci `Refused to display in a frame` (X-Frame-Options), zostawić przycisk „Otwórz NotebookLM ↗” jako alternatywę (otwarcie w nowej karcie).

### 3.3 Konfiguracja domeny w Google Cloud (dla embeddingu)

Żeby Google pozwolił na embedding, trzeba:

1. **Google Cloud Console** → APIs & Services → Credentials
2. Edycja **OAuth 2.0 Client ID**
3. W **Authorized JavaScript origins** dodać:
   - `https://kalkulator-384217730250.europe-west1.run.app` (produkcja)
   - `http://localhost:3001` (dev)
4. W ustawieniach NotebookLM Enterprise włączyć opcję typu **Allow embedding for authorized domains** (jeśli dostępna w konsoli Gemini/NotebookLM).

---

## 4. STRUKTURA UI — PROPOZYCJA

### Opcja A: iframe na górze zakładki AI Asystent

- Nad panelem „NotebookLM Enterprise” dodać sekcję „Notebook osadzony”
- Gdy `notebookLmId` istnieje → pokazać iframe
- Poniżej: obecne przyciski (Audio-Brief, Aktualizuj streszczenie) + chat wbudowany jako uzupełnienie

### Opcja B: osobna zakładka „NotebookLM”

- Nowa zakładka w tabs: `{ key: "notebook", icon: "📓", label: "NotebookLM" }`
- Zawartość: głównie iframe (pełny widok NotebookLM)
- Ewentualnie: link „Otwórz w nowej karcie” gdy embedding nie działa

---

## 5. ODNIESIENIA DOKUMENTACYJNE

| Zasób | URL | Uwagi |
|-------|-----|-------|
| Create and manage notebooks (API) | https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks | Format URL, API REST |
| Set up NotebookLM Enterprise | https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/set-up-notebooklm | Konfiguracja projektu, ról, IdP |
| Add data sources (API) | https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-sources | Źródła tekstowe, URL |
| Create audio overview (API) | https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-audio-overview | Audio-brief |
| Support / Help (NotebookLM Enterprise) | https://support.google.com/notebooklm/enterprise | Limitów, dostępu |
| Workspace Updates (NotebookLM) | https://workspaceupdates.googleblog.com/2025/03/new-features-available-in-notebooklm.html | Mind Map, wybór języka |

---

## 6. PLIKI DO ZMIAN I DOKŁADNA LOKALIZACJA

### 6.1 ClientsPage.jsx

**Miejsce wstawki:** W bloku `{selectedClient.notebookLmUrl && !nbEditMode && (` (ok. linia 621), **na początku** zawartości `.cp-nb-linked` — czyli przed `<div className="cp-nb-linked-info">`.

**Logika:** Gdy jest notebook → najpierw pokaż iframe (główny widok), potem pasek z linkiem i przyciskami.

```jsx
// Wkleić na początku <div className="cp-nb-linked"> (ok. linia 622)
<div className="cp-nb-embed">
  <iframe
    src={selectedClient.notebookLmUrl}
    title="NotebookLM - sprawa klienta"
    width="100%"
    height="800"
    style={{ border: "1px solid #e0e0e0", borderRadius: 8 }}
    allow="clipboard-read; clipboard-write; microphone"
    loading="lazy"
  />
</div>
```

**Alternatywa:** Jeśli embedding blokuje UX, można wydzielić osobną zakładkę `activeTab === "notebook"` z samym iframe.

### 6.2 ClientsPage.css

Dodać w sekcji `/* ─── NOTEBOOKLM PANEL ─── */` (ok. linia 259):

```css
.cp-nb-embed {
  width: 100%;
  min-height: 700px;
  margin-bottom: 16px;
}
.cp-nb-embed iframe {
  width: 100%;
  height: 800px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}
@media (max-width: 768px) {
  .cp-nb-embed iframe { height: 500px; min-height: 400px; }
}
```

### 6.3 Zmienne środowiskowe (już używane)

Backend (`notebooklm.py`) korzysta z:

| Zmienna | Opis |
|---------|------|
| `GOOGLE_OAUTH_REFRESH_TOKEN` | Token OAuth2 (masz już) |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID OAuth |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client Secret OAuth |
| `GOOGLE_PROJECT_NUMBER` | Numer projektu, np. `384217730250` — używany w URL `?project=` |
| `GOOGLE_PROJECT_ID` | ID projektu, np. `kalkulator-488708` |
| `NOTEBOOKLM_LOCATION` | Lokalizacja (domyślnie `global`) |

**Backend już zwraca pełny `url`** w odpowiedziach API — frontend nie musi budować URL. Użyj `selectedClient.notebookLmUrl` wprost.

---

## 7. CHECKLIST DLA MANUSA

- [ ] Dodać widok iframe w ClientsPage (zakładka AI lub nowa „NotebookLM”)
- [ ] Użyć `notebookLmUrl` (lub zbudować URL z `notebookLmId` + `project`) jako `src` iframe
- [ ] Zachować przycisk „Otwórz w nowej karcie” na wypadek blokady X-Frame-Options
- [ ] Dodać domeny do OAuth (Cloud Run + localhost) w Google Cloud Console
- [ ] Przetestować embedding na localhost i na Cloud Run
- [ ] (Opcjonalnie) Dodać box „Streszczenie sprawy” z generowaniem przez AI i wyświetlaniem w CRM
- [ ] (Opcjonalnie) Sprawdzić fallback chat AI (Gemini/LiteLLM) gdy brak OpenAI

---

## 8. UWAGI KOŃCOWE

- OAuth i API działają — logi potwierdzają. Teraz chodzi o **pełny widok notatnika w CRM**, nie tylko link.
- Oryginalny NotebookLM ma 3 kolumny: Źródła | Czat | Studio. Osadzenie przez iframe daje dokładnie ten sam interfejs, jeśli Google pozwoli na embedding.
- Jeśli `X-Frame-Options` blokuje iframe — zostaje link zewnętrzny + komunikat, że embedding nie jest wspierany przez Google dla tej domeny.
