# Instrukcja Git — bezpieczne łączenie (bez nadpisywania)

**Cel:** Pobrać zmiany z GitHubu (np. panel CRM) i **zachować** swoje (np. mapy). Nic nie nadpisywać, nic nie psuć.

---

## Zasada

- **Nie** używaj przycisku „Sync” ani „Force Push”.
- **Tak:** zrób najpierw kopię zapasową, potem **merge** (łączenie). Merge łączy obie wersje; nic nie ginie.

---

## Krok po kroku (w terminalu)

Otwórz **Terminal** (w Cursorze: Terminal → New Terminal albo skrót). Wklejaj komendy **po jednej**, zatwierdzaj Enterem. Jeśli któraś się wyświetli na czerwono — skopiuj cały komunikat i pokaż komuś technicznemu.

### Krok 1 — Wejdź do folderu projektu

```bash
cd /Users/szwrk/Documents/GitHub/KALKULATOR
```

Enter.

---

### Krok 2 — Zrób kopię zapasową swojej gałęzi (na wszelki wypadek)

To tworzy „zrzut” Twojego obecnego stanu. Jeśli cokolwiek pójdzie nie tak, można wrócić do tego miejsca.

```bash
git branch kopia-przed-mergem
```

Enter. Nic się nie zmieni na ekranie — to normalne. Kopia jest zapisana pod nazwą `kopia-przed-mergem`.

---

### Krok 3 — Pobierz listę zmian z GitHubu (bez niczego nadpisywania)

```bash
git fetch origin
```

Enter. Poczekaj, aż się skończy. To tylko **pobiera informacje**; nie zmienia jeszcze Twoich plików.

---

### Krok 4 — Połącz: Twoje zmiany + zmiany z GitHubu

```bash
git merge origin/main -m "merge: zmiany z GitHubu (CRM, mapy) bez nadpisywania"
```

Enter.

- **Jeśli zobaczysz:** `Already up to date` — znaczy, że nie ma nic nowego z GitHubu do połączenia; możesz przejść do Kroku 6.
- **Jeśli zobaczysz:** `Merge made by...` — merge się udał; przejdź do Kroku 6.
- **Jeśli zobaczysz:** `CONFLICT` i listę plików — są konflikty. **Nie poprawiaj nic na siłę.** Zatrzymaj się i napisz do kogoś technicznego (albo do asystenta): „Mam konflikt po merge w plikach: [wklej listę]”. Możesz wrócić do stanu sprzed merge komendą:  
  `git merge --abort`  
  i wtedy poprosić o pomoc w rozwiązaniu konfliktów.

---

### Krok 5 (tylko przy konfliktach) — Cofnij merge i szukaj pomocy

Tylko jeśli w Kroku 4 pojawiły się konflikty i nie wiesz, co wybrać:

```bash
git merge --abort
```

Enter. Wrócisz do stanu sprzed merge. Potem poproś kogoś o pomoc w rozwiązaniu konfliktów.

---

### Krok 6 — Wyślij połączony stan na GitHub (opcjonalnie)

Tylko jeśli merge w Kroku 4 się udał i chcesz, żeby GitHub miał tę samą wersję co Ty:

```bash
git push origin main
```

Enter. Jeśli poprosi o login/hasło — użyj swojego konta GitHub (albo tokenu, jeśli tak się logujesz).

---

## Podsumowanie

| Krok | Co robisz | Po co |
|------|-----------|--------|
| 1 | `cd ...` | Wejście do projektu |
| 2 | `git branch kopia-przed-mergem` | Kopia zapasowa (można wrócić) |
| 3 | `git fetch origin` | Pobranie listy zmian z GitHubu |
| 4 | `git merge origin/main -m "..."` | Łączenie bez nadpisywania |
| 5 | Tylko przy konflikcie: `git merge --abort` | Cofnięcie merge i szukanie pomocy |
| 6 | `git push origin main` | Wysłanie połączonej wersji na GitHub (opcjonalnie) |

Dzięki temu **nie nadpisujesz** nic na siłę i **nie psujesz** ładowania map — merge bierze i Twoje zmiany (mapy), i te z GitHubu (CRM itd.).  
Jeśli po merge coś by nie działało (np. mapy), można wrócić do kopii:  
`git checkout kopia-przed-mergem`  
(i wtedy poprosić kogoś o dalszą pomoc).
