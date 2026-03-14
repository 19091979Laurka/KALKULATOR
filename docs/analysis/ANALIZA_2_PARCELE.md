# SZCZEGÓŁOWA ANALIZA PIERWSZYCH 2 DZIAŁEK Z BATCH'A
## Batch ID: 20260310_173603 (99 działek)
Data analizy: 2026-03-10

---

## 📍 DZIAŁKA 1: 142003_2.0002.81/5

### LOKALIZACJA & PODSTAWOWE DANE
- **ID działki**: 142003_2.0002.81/5
- **Gmina**: Baboszewo
- **Powiat**: Płoński
- **Województwo**: Mazowieckie
- **Źródło**: ULDK GUGiK
- **Status**: REAL (dane rzeczywiste)

### GEOMETRIA
- **Powierzchnia**: 9,915.41 m²
- **Obwód**: 534.3 m
- **Klasa kształtu**: Niekorzystny
- **Współrzędne centroidu**: [20.156684, 52.685934] (WGS-84)
- **Liczba wierzchołków**: 5 (czworokąt)

### UŻYTKOWANIE GRUNTU
- **Klasa EGIB**: R (rola)
- **Typ**: Gruntach rolny (bieżąca klasyfikacja)
- **Procentowo**: 100% działki stanowi pole role

### INFRASTRUKTURA - ⚠️ PROBLEM
```
WFS Service Status: ERROR - "WFS service https://integracja.gugik.gov.pl/... unavailable"
Detected: FALSE
```
**Wyjaśnienie**: System próbował automatycznie pobrać dane linii przesyłowych z GUGiK KIUT WFS, ale serwis jest niedostępny (faktycznie endpoint to WMS, nie WFS).

- **Linie energetyczne**: Nie wykryte
- **Napięcie**: —
- **Długość linii w działce**: 0.0 m
- **Gaz**: Nie wykryte
- **Woda**: Nie wykryte
- **Kanalizacja**: Nie wykryte

### WYCENA NIERUCHOMOŚCI
- **Cena jednostkowa**: 8.5 zł/m² (GUS tabela regionalna - fallback dla gruntów rolnych)
- **Źródło ceny**: GUS BDL (brak transakcji lokalnych)
- **Liczba transakcji lokalnych**: 0
- **Wartość całkowita nieruchomości**: **84,280.99 zł**

### ODSZKODOWANIE KSWS (Track A/B)
```
Założenie: Linie 15-30 kV (Elektro SN) przechodzą przez działkę
Współczynniki KSWS:
  - S (wpływ społeczny): 0.2
  - k (strata pożyteczności): 0.5
  - R (strata wartości): 0.06
  - u (faktor użytkowania): 0.065
  - Szerokość strefy: 10 m (SN)
  - Str. ochronna: 15 m

Obliczenie bazowe (OBN):
  OBN = 5% × Wartość nieruchomości = 0.05 × 84,280.99 = 4,214.05 zł
  (Niezależnie od rzeczywistej długości linii, bo wskaźnik S=0.2 → 5%)

TRACK A (Sądowe):
  - WSP (wpływ środowiska): 0.0 zł
  - WBK (wzniesienia budynków): 0.0 zł
  - OBN (odszkodowanie bazowe): 4,214.05 zł
  - RAZEM: 4,214.05 zł
  - Okres: 10 lat

TRACK B (Negocjacyjny) = Track A × 1.56:
  - RAZEM: 4,214.05 × 1.56 = 6,573.92 zł
```

### PODSUMOWANIE DZIAŁKI 1
| Parametr | Wartość |
|----------|---------|
| Powierzchnia | 9,915 m² |
| Wartość gruntu | 84,281 zł |
| Odszkodowanie Track A | 4,214 zł |
| Odszkodowanie Track B | 6,574 zł |
| Infrastruktura WFS | ❌ ERROR |

---

## 📍 DZIAŁKA 2: 142003_2.0002.81/8

### LOKALIZACJA & PODSTAWOWE DANE
- **ID działki**: 142003_2.0002.81/8
- **Gmina**: Baboszewo
- **Powiat**: Płoński
- **Województwo**: Mazowieckie
- **Źródło**: ULDK GUGiK
- **Status**: REAL (dane rzeczywiste)

### GEOMETRIA
- **Powierzchnia**: 39,215.45 m² (3.95× większa niż działka 1)
- **Obwód**: 1,012.1 m
- **Klasa kształtu**: Niekorzystny
- **Współrzędne centroidu**: [20.158445, 52.685764] (WGS-84)
- **Liczba wierzchołków**: 13 (wielokąt nieregularny)

### UŻYTKOWANIE GRUNTU
- **Klasa EGIB**: R (rola)
- **Typ**: Gruntach rolny
- **Procentowo**: 100% działki stanowi pole rolle

### INFRASTRUKTURA - ⚠️ PROBLEM
```
WFS Service Status: ERROR - "WFS service https://integracja.gugik.gov.pl/... unavailable"
Detected: FALSE
```

- **Linie energetyczne**: Nie wykryte
- **Napięcie**: —
- **Długość linii w działce**: 0.0 m
- **Gaz**: Nie wykryte
- **Woda**: Nie wykryte
- **Kanalizacja**: Nie wykryte

### WYCENA NIERUCHOMOŚCI
- **Cena jednostkowa**: 8.5 zł/m² (GUS tabela regionalna - fallback)
- **Źródło ceny**: GUS BDL
- **Liczba transakcji lokalnych**: 0
- **Wartość całkowita nieruchomości**: **333,331.32 zł**

### ODSZKODOWANIE KSWS (Track A/B)
```
Założenie: Linie 15-30 kV (Elektro SN) przechodzą przez działkę
Współczynniki KSWS: [identyczne jak działka 1]

Obliczenie bazowe (OBN):
  OBN = 5% × Wartość nieruchomości = 0.05 × 333,331.32 = 16,666.57 zł

TRACK A (Sądowe):
  - WSP (wpływ środowiska): 0.0 zł
  - WBK (wzniesienia budynków): 0.0 zł
  - OBN (odszkodowanie bazowe): 16,666.57 zł
  - RAZEM: 16,666.57 zł
  - Okres: 10 lat

TRACK B (Negocjacyjny) = Track A × 1.56:
  - RAZEM: 16,666.57 × 1.56 = 25,999.85 zł
```

### PODSUMOWANIE DZIAŁKI 2
| Parametr | Wartość |
|----------|---------|
| Powierzchnia | 39,215 m² |
| Wartość gruntu | 333,331 zł |
| Odszkodowanie Track A | 16,667 zł |
| Odszkodowanie Track B | 25,999 zł |
| Infrastruktura WFS | ❌ ERROR |

---

## 🔍 ANALIZA KRYTYCZNA

### PROBLEM 1: WFS Service Unavailable
**Status quo**: GUGiK KIUT endpoint zwraca ERROR dla obu działek
- Serwis pod adresem https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu nie udostępnia WFS (Vector Features)
- Endpoint udostępnia jedynie WMS (raster map tiles)
- Nie ma możliwości automatycznego pobrania rzeczywistych danych linii

### PROBLEM 2: Kompensacja oparta na założeniu infrastruktury
**Obserwacja**: System oblicza odszkodowanie MIMO że `detected=false`:
- Działka 1: 4,214.05 zł Track A (5% z 84,281 zł)
- Działka 2: 16,666.57 zł Track A (5% z 333,331 zł)

**Przyczyna**: W strukcie KSWS zapisane jest:
```
"ksws": {
  "label": "Linie 15-30 kV",
  "coeffs": { S: 0.2, ... }
}
```
System zakłada że infrastruktura JEST (inaczej nie byłoby labelu i współczynników).

### PROBLEM 3: Rzeczywista przydatność
| Pytanie | Odpowiedź |
|---------|----------|
| Czy linie rzeczywiście przechodzą? | ❓ Nieznane - WFS ERROR |
| Jaka jest długość linii? | 0.0 m (placeholder) |
| Jakie jest napięcie? | — (null) |
| Czy można obliczyć strefę wpływu? | Nie - brak danych |

---

## 💡 WNIOSKI

1. **Automatyczne wykrywanie niewystarczające**
   - WFS GUGiK niedostępne dla danych linii elektro
   - System wraca do fallback'ów (wycena GUS, brak linii)

2. **Odszkodowanie kalkulowane teoretycznie**
   - Obliczenia matematyczne są poprawne (5% OBN dla S=0.2)
   - Ale bazują na ZAŁOŻENIU że infrastruktura jest
   - Rzeczywisty wpływ pozostaje nieznany

3. **Potrzeba potwierdzenia użytkownika**
   - Dla KAŻDEJ działki trzeba ręcznie potwierdzić: czy linia rzeczywiście przechodzi?
   - Można sprawdzić np. w Portalu Mapowym Powiatu Płońskiego
   - Po potwierdzeniu - system powinien pozwolić na wpisanie rzeczywistej długości linii

4. **Rekomendacja**: Implementacja OPCJI 3 (Manual Override)
   - Użytkownik potwierdza: "TAK - ma linię" lub "NIE - brak"
   - Po TAK: można wpisać długość linii w m
   - System recalculates: OBN = (długość linii / obwód działki) × wartość × wskaźnik S
   - Odszkodowanie będzie wtedy rzeczywiście adekwatne

---

## 📊 PORÓWNANIE DZIAŁEK

```
┌─────────────────────┬──────────────────┬──────────────────┐
│ Parametr            │ Działka 1        │ Działka 2        │
├─────────────────────┼──────────────────┼──────────────────┤
│ Pow. [m²]           │ 9,915            │ 39,215 (3.95×)   │
│ Wartość [zł]        │ 84,281           │ 333,331 (3.95×)  │
│ Track A [zł]        │ 4,214            │ 16,667 (3.95×)   │
│ Track B [zł]        │ 6,574            │ 25,999 (3.95×)   │
│ Infra Status        │ ERROR            │ ERROR            │
└─────────────────────┴──────────────────┴──────────────────┘
```

**Wniosek**: Proporcjonalność jest zachowana (większa działka → większe odszkodowanie w tym samym stosunku 3.95×). Ale obie działki wykazują ten sam problem z brakiem rzeczywistych danych infrastrukturowych.

---

## ✅ NASTĘPNE KROKI

1. **Sprawdzić fizycznie w terenie lub mapach**:
   - Portal Mapowy Powiatu Płońskiego
   - OpenStreetMap
   - Ortofoto z drona/satelity
   - Wizyta na terenie

2. **Potwierdzić w systemie**:
   - Dla każdej z 99 działek: czy rzeczywiście ma linię?
   - Jeśli TAK: wpisać przybliżoną długość w metrach
   - System recalculate compensation

3. **Analiza grupy**:
   - Z 99 działek - które mają rzeczywistą infrastrukturę?
   - Które mogą mieć wpływ (track A/B > 0)?
   - Które są "false positives" (WFS error, ale rzeczywiście nie ma)

---

Generated: 2026-03-10
System: KALKULATOR KSWS v3.0
