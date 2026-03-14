# Zapis zmian — Git lokalnie i commity na GitHub

Praca z repozytorium w codziennym flow: zapis zmian lokalnie, commity i wypychanie na GitHub.

---

## Lokalne zapisy (commity)

1. **Sprawdź status** — co się zmieniło:
   ```bash
   git status
   ```

2. **Dodaj pliki do stagingu** (wybrane lub wszystko):
   ```bash
   git add ścieżka/do/pliku
   # albo wszystkie zmiany:
   git add -A
   ```

3. **Zrób commit** z opisową wiadomością:
   ```bash
   git commit -m "Krótki opis: np. Raport jednej działki — linie na mapie, mniej warstw kafelków"
   ```

4. **Wielokrotne commity** — możesz robić wiele commitów lokalnie (np. po każdej logicznej zmianie), zanim cokolwiek wyślesz na GitHub.

---

## Wysyłanie na GitHub

1. **Upewnij się, że jesteś na branchu** (np. `main` lub `develop`):
   ```bash
   git branch
   ```

2. **Wypchnij commity na zdalne repozytorium**:
   ```bash
   git push origin main
   ```
   (Zamień `main` na nazwę swojego brancha, jeśli inna.)

3. **Jeśli zdalnie pojawiły się nowe commity** (np. od kogoś z zespołu), najpierw pobierz zmiany i ewentualnie zmerguj:
   ```bash
   git pull origin main
   # potem ewentualnie napraw konflikty i znowu:
   git push origin main
   ```

---

## Przydatne komendy

| Komenda | Opis |
|--------|------|
| `git status` | Co jest zmienione / w stagingu |
| `git add -A` | Dodaj wszystkie zmiany |
| `git commit -m "opis"` | Zapis lokalny (commit) |
| `git push origin main` | Wyślij commity na GitHub |
| `git pull origin main` | Pobierz zmiany z GitHub i zmerguj |
| `git log --oneline -5` | Ostatnie 5 commitów |

---

## Dobre praktyki

- **Commituj często** — małe, logiczne zmiany z jasnym opisem w `-m`.
- **Przed push** — zrób `git pull`, jeśli inni mogą coś dodać do tego samego brancha.
- **Nie commituj** plików wrażliwych (hasła, klucze API) ani dużych binarek — sprawdź `.gitignore`.

Repozytorium zdalne (GitHub) zwykle ma ustawiony `origin`; jeśli nie, dodaj go:  
`git remote add origin https://github.com/użytkownik/KALKULATOR.git`
