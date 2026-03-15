# Status: Analiza działki (lokalnie)

## Co jest naprawione (po zmianach Copilot / agentów)

1. **Formularz — jeden blok „Dane ewidencyjne”**  
   Usunięty zduplikowany BOX 2. Jest jeden blok z polami: **Numer działki** (edytowalny), **Obręb**, **Gmina**, **Powiat**, **Województwo** i przycisk **Analizuj**.  
   - Wpisywanie: pełny TERYT w polu „Identyfikator działki” **albo** numer + obręb w polu „Numer działki” i „Obręb” — oba sposoby aktualizują ten sam stan i wysyłają poprawne dane do API.

2. **Wysyłka do API**  
   `POST /api/analyze` dostaje: `parcel_ids`, `obreb`, `county`, `municipality`. Backend używa tego w `fetch_terrain` i `generate_master_record`.

## Gdzie jest aplikacja (backend)

- **ULDK (geometria)** — działa: GetParcelById czasem zwraca błąd teryt, wtedy GetParcelByIdOrNr zwraca działkę (test na `141906_5.0029.60`).
- **Linia / pas (infrastruktura)** — zależy od zewnętrznych serwisów:
  - **Overpass (OSM)** — często 504 timeout; wtedy backend próbuje fallbacki (OpenInfraMap, GESUT, PSE, BDOT10k).
  - **GESUT (GUGiK)** — w testach 404 (serwis/URL może być zmieniony lub niedostępny).
  - **KIUT (GUGiK)** — bywa wykrycie linii nN, ale bez długości → użytkownik musi wpisać **długość linii** ręcznie w „Korekta ręczna” i ponowić analizę.
- **GUS / ceny** — zależne od połączenia; RCN czasem „Remote end closed connection”.

Efekt: analiza pojedynczej działki **działa** (geometria, gmina, powiat, area_m2), ale **linia / pas / Track A+B** mogą być puste lub zerowe, dopóki:
- Overpass/GESUT nie odpowiadają poprawnie, albo
- użytkownik nie wpisze ręcznie długości linii (gdy KIUT wykryje linię, ale bez pomiaru).

## Jak przetestować lokalnie

```bash
# Terminal 1 — backend
cd /Users/szwrk/Documents/GitHub/KALKULATOR
python3 -m uvicorn backend.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend-react && npm run dev
```

Wejdź na **Analiza działki**, wpisz np. pełny TERYT `141906_5.0029.60` (albo numer + obręb), kliknij **Analizuj**.  
Jeśli pojawi się „Linia wykryta, brak długości” — uzupełnij **Korekta ręczna → Długość linii (m)** i wyślij ponownie.

---
*Ostatnia aktualizacja: po usunięciu zduplikowanego BOX 2 i ujednoliceniu formularza.*
