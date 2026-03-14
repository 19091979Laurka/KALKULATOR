# Zadanie dla Anti: mapSources.js — podmiana hardcodowanych URL-i

**Cel:** Stopniowo podmieniać w plikach Kalkulatora hardcodowane adresy warstw map na import z wspólnego modułu `mapSources.js`, żeby zmiana API (np. GUGiK, Esri) była w jednym miejscu.

---

## Co zrobić

1. **Wspólna definicja** jest już w:
   - `frontend-react/src/DemoPages/Kalkulator/mapSources.js`
   - Eksport: `BASE_LAYERS`, `GUGIK_WMS`, `OIM_TILES`, `OVERPASS_INFO`.

2. **Pliki do przerobienia** (kolejność dowolna, można wybrać jeden na start):
   - `frontend-react/src/DemoPages/Kalkulator/KalkulatorPage.jsx`
   - `frontend-react/src/DemoPages/Kalkulator/BatchHistoryPage.jsx`
   - `frontend-react/src/DemoPages/Kalkulator/HistoriaAnalizPage.jsx`

3. **Sposób:** W danym pliku dodać na górze:
   ```js
   import { BASE_LAYERS, GUGIK_WMS, OIM_TILES } from './mapSources';
   ```
   Następnie zamiast wpisywać na sztywno np.:
   - `"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"`  
     → użyć `BASE_LAYERS.esriSatellite.url` (i ewentualnie `.attribution`, `.maxZoom`).
   - `"https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu"`  
     → `GUGIK_WMS.KIUT.baseUrl`, warstwy z `GUGIK_WMS.KIUT.layers` (np. `.uzbrojenie`, `.elektro`).
   - `"https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow"`  
     → `GUGIK_WMS.KIEG.baseUrl`, `GUGIK_WMS.KIEG.layers`.
   - `"https://tiles.openinframap.org/power/{z}/{x}/{y}.png"`  
     → `OIM_TILES.power` (analogicznie gas, water, sewer gdzie używane).

4. **Propozycja na start:** Zacząć od **jednego** widoku, np.:
   - tylko **Analiza działki** (mapa 2D + Outdoor) w `KalkulatorPage.jsx`,  
   **albo**
   - tylko **Historia raportów** (mapy w raporcie) w `BatchHistoryPage.jsx`.

   Po sprawdzeniu, że wszystko działa (mapy ładują się, warstwy się przełączają), zrobić to samo w pozostałych plikach.

5. **Dokumentacja kontekstu:** Pełny opis logiki map i API jest w `docs/MAPY_I_INTEGRACJE_API.md` — który serwis do czego służy (ULDK, Overpass, KIUT, KIEG, Esri, OIM).

---

Dzięki,  
[Cursor / zleceniodawca]
