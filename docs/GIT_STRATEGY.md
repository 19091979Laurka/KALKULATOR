# Strategia Git: Manus + Cursor bez konfliktów

**Cel:** Dwa strumienie pracy (Kalkulator vs CRM/NotebookLM) bez wzajemnych konfliktów merge.

**Zasada:** Każdy odpowiada za swoje Git — własny branch, własne commity, własny push, własny PR. Nikogo nie prosimy o zrobienie Git drugiemu.

**Lokalnie przed push:** Pracujesz na swoim branchu, uruchamiasz frontend + backend → `localhost:3001` pokazuje Twoje zmiany. Dopiero gdy wszystko działa — commit → push → PR.

---

## 1. Podział na branche

| Branch        | Kto     | Zakres pracy                                |
|---------------|---------|---------------------------------------------|
| `main`        | tylko merge | Produkcja → Cloud Run (autodeploy)     |
| `cursor/feature` | Cursor | Backend logika, UI kalkulatora              |
| `manus/crm`   | Manus   | CRM, NotebookLM, integracje                  |

---

## 2. Workflow

1. **Cursor** pracuje na `cursor/feature` → push → **Pull Request** do `main`
2. **Manus** pracuje na `manus/crm` → push → **Pull Request** do `main`
3. Merge do `main` → Cloud Build wdraża na Cloud Run
4. Konflikty rozwiązujemy przez PR review (Ty lub Cursor)

---

## 3. Pliki "własnościowe" (kto nie rusza czego)

| Plik / wzorzec                               | Właściciel |
|---------------------------------------------|------------|
| `backend/modules/infrastructure.py`          | Cursor     |
| `backend/modules/kalkulator*.py`             | Cursor     |
| `frontend-react/src/DemoPages/Kalkulator/KalkulatorPage*` | Cursor |
| `backend/integrations/notebooklm.py`         | Manus      |
| `frontend-react/src/DemoPages/Kalkulator/ClientsPage*` | Manus |

**Wspólne** (komunikuj zmianę przed edycją):
- `Dockerfile`
- `backend/requirements.txt`

---

## 4. Komendy startowe

### Manus — utworzenie `manus/crm` i przeniesienie swoich zmian

```bash
git checkout main
git pull origin main
git checkout -b manus/crm
# (tutaj: przenieś swoje zmiany z innego brancha lub stasha, jeśli były)
git add frontend-react/src/DemoPages/Kalkulator/ClientsPage* backend/integrations/notebooklm.py docs/NOTEBOOKLM_SPEC_DLA_MANUSA.md
git commit -m "feat(crm): widok NotebookLM, spec dla Manusa"
git push -u origin manus/crm
```

### Cursor — utworzenie `cursor/feature` i przeniesienie zmian

```bash
git checkout main
git pull origin main
git checkout -b cursor/feature
# (przenieś zmiany kalkulatora / infrastructure — jeśli były na innym branchu)
git add backend/modules/infrastructure.py backend/modules/kalkulator*.py frontend-react/src/DemoPages/Kalkulator/KalkulatorPage*
git commit -m "fix(kalkulator): ..."
git push -u origin cursor/feature
```

---

## 5. Merge do main

- PR z `manus/crm` → `main`
- PR z `cursor/feature` → `main`
- Można merge’ować niezależnie — konflikty tylko przy wspólnych plikach (Dockerfile, requirements.txt).
