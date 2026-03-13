# Kontekst produktu — dashboard KSWS

**Do zapamiętania przy rozwoju i dopracowaniach (w tym UX/UI, stylistyka, nazewnictwo):**

---

## Czym jest produkt

- **Dashboard do zarządzania sprawami i klientami** w obszarze roszczeń przesyłowych (KSWS, Track A/B).
- **Używany przez kancelarię** (obecnie Szuwara KPP) na co dzień: analizy działek, raporty, baza klientów, wzory pism, archiwum.
- **Może być sprzedawany dalej** — innym kancelariom, podmiotom zajmującym się roszczeniami lub wyceną. Produkt ma być użyteczny jako narzędzie wewnętrzne i jako produkt do odsprzedaży / licencjonowania.

---

## Skutki dla decyzji

1. **Nazewnictwo i treści**  
   Unikać nadmiernego „usztywniania” na jedną kancelarię w treściach widocznych dla użytkownika (np. etykiety, stopki), jeśli da się to zrobić bez utraty jasności. Tam, gdzie to sensowne, przewidywać możliwość konfiguracji (np. nazwa firmy, logo) na przyszłość.

2. **Struktura**  
   Zachować spójność: **sprawy** (analizy, raporty, archiwum) + **klienci** (baza, przypisanie analiz, pliki) + **wzory** (pisma). To jest dashboard do zarządzania, nie tylko „kalkulator jednej liczby”.

3. **UX/UI**  
   Interfejs ma być intuicyjny dla prawnika / asystenta kancelarii (pierwsi użytkownicy), ale też na tyle uniwersalny i uporządkowany, żeby nadawał się do wdrożenia u innego odbiorcy (np. inna kancelaria przy ewentualnej sprzedaży).

4. **Dane i integracje**  
   Przy dalszym rozwoju pamiętać o tym, że dane (klienci, sprawy, raporty) mogą kiedyś być wielodostępowe lub eksportowane — nie blokować tego z góry w architekturze (np. twarde wpisy „jedna firma” w kluczowych miejscach).

---

## Odniesienia

- Zakładki, menu, pola: `DECYZJA_CO_GDZIE.md`, `ZAKLADKI_I_POLA.md`.
- Raporty i szablony: `RAPORTY_MIEJSCA_WZORY.md`.
