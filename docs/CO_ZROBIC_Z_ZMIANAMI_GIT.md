# Co zrobić z lokalnymi zmianami i main 1↑ 1↓

Gdy widzisz **main* 1↑ 1↓** — masz 1 commit lokalnie (do wypchnięcia) i 1 commit na GitHubie (do pobrania). Poniżej bezpieczny sposób, żeby nic nie nadpisać.

---

## Krok 1: Zapisz swoje zmiany w commit (jeśli jeszcze nie)

1. W **Source Control** zaznacz pliki, które chcesz w tym commicie (albo „+” przy **Changes**, żeby dodać wszystkie).
2. W polu **Message** wpisz np.:
   ```text
   docs + frontend: GIT_POROWNANIE, CRM layout min-height, Batch/Historia, mapSources
   ```
3. Kliknij **✓ Commit** (albo Ctrl+Enter).

Jeśli nie chcesz jeszcze commita — zostaw zmiany i zrób **Stash** (ikona „...” w Source Control → Stash → Stash).

---

## Krok 2: Pobierz to, co jest na GitHubie (merge)

**Nie** używaj „Sync” ani „Pull” z rebase, jeśli nie wiesz, co robią. Zrób to w terminalu:

```bash
cd /Users/szwrk/Documents/GitHub/KALKULATOR
git fetch origin
git merge origin/main -m "merge: origin/main (panel CRM / zmiany z GitHub)"
```

- Jeśli **nie ma konfliktów** — Git zrobi merge i będziesz miał lokalnie i swoje commity, i ten z GitHubu.
- Jeśli **są konflikty** — Git wypisze listę plików. Otwórz je, usuń znaczniki `<<<<<<<`, `=======`, `>>>>>>>`, zostaw właściwy kod, zapisz, potem:

  ```bash
  git add <scieżki do plików z konfliktami>
  git commit -m "merge: rozwiązanie konfliktów z origin/main"
  ```

---

## Krok 3: Wypchnij połączoną historię na GitHub

```bash
git push origin main
```

Po tym **1↑ 1↓** zniknie; lokalny i zdalny `main` będą w tym samym miejscu, bez nadpisywania.

---

## Krótko

| Co widzisz              | Co zrobić                                      |
|--------------------------|-------------------------------------------------|
| Niezacommitowane zmiany  | Commit albo Stash (Krok 1)                      |
| main 1↑ 1↓               | `git fetch` → `git merge origin/main` (Krok 2) |
| Po merge bez konfliktów  | `git push origin main` (Krok 3)                 |

Jeśli wolisz **najpierw** tylko zobaczyć, co jest na GitHubie, a nie od razu mergować:

```bash
git fetch origin
git log main..origin/main --oneline    # co jest na GitHub, czego nie masz
git log origin/main..main --oneline    # co masz ty, czego nie ma na GitHub
```
