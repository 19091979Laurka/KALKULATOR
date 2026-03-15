/**
 * Źródła map i warstw — jedna definicja dla całego Kalkulatora.
 * Logika: które API / które warstwy są używane gdzie — patrz docs/MAPY_I_INTEGRACJE_API.md
 *
 * Backend pobiera dane z: ULDK (geometria), Overpass (linie wektor), KIUT WMS (opcjonalnie detekcja).
 * Frontend tylko wyświetla: podkłady + WMS/tile (KIUT, KIEG, OIM).
 */

// ─── Podkłady (base layers) ───────────────────────────────────────────────
export const BASE_LAYERS = {
  esriSatellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri",
    maxZoom: 19,
  },
  esriTopo: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri",
    maxZoom: 18,
  },
  cartoLight: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    options: { subdomains: "abcd", maxZoom: 19, attribution: "© Carto" },
  },
  openTopoMap: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> · OpenStreetMap',
    maxZoom: 17,
  },
};

// ─── WMS GUGiK (integracja.gugik.gov.pl) ──────────────────────────────────
export const GUGIK_WMS = {
  ORTO: {
    baseUrl: "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution",
    layers: "Raster",
    version: "1.1.1",
    attribution: "Geoportal Orto",
  },
  KIUT: {
    baseUrl: "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu",
    layers: {
      elektro: "przewod_elektroenergetyczny",
      gaz: "przewod_gazowy",
      woda: "przewod_wodociagowy",
      kanal: "przewod_kanalizacyjny",
      cieplo: "przewod_cieplowniczy",
      telekom: "przewod_telekomunikacyjny",
      /** Wszystkie główne (elektro+gaz+woda+kanal) w jednej warstwie */
      uzbrojenie: "przewod_elektroenergetyczny,przewod_gazowy,przewod_wodociagowy,przewod_kanalizacyjny",
      /** Pełne uzbrojenie (dodaje telekom, cieplo, specjalny, niezidentyfikowany, urządzenia) */
      uzbrojenie_full: "przewod_elektroenergetyczny,przewod_gazowy,przewod_wodociagowy,przewod_kanalizacyjny,przewod_cieplowniczy,przewod_telekomunikacyjny,przewod_specjalny,przewod_niezidentyfikowany,przewod_urzadzenia",
    },
    defaultOpacity: 1.0,
    attribution: "KIUT GUGiK",
  },
  KIEG: {
    baseUrl: "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow",
    layers: "dzialki,numery_dzialek",
    defaultOpacity: 0.8,
    attribution: "KIEG GUGiK",
  },
};

// ─── Open Infra Map (kafelki) ──────────────────────────────────────────────
export const OIM_TILES = {
  power: "https://tiles.openinframap.org/power/{z}/{x}/{y}.png",
  gas: "https://tiles.openinframap.org/gas/{z}/{x}/{y}.png",
  water: "https://tiles.openinframap.org/water/{z}/{x}/{y}.png",
  sewer: "https://tiles.openinframap.org/sewer/{z}/{x}/{y}.png",
};

// ─── Overpass (dane wektorowe) ─────────────────────────────────────────────
// Backend pobiera z: https://overpass-api.de/api/interpreter
// Frontend NIE woła Overpass — dostaje GeoJSON w master_record (PreloadedPowerLayer).

export const OVERPASS_INFO = {
  url: "https://overpass-api.de/api/interpreter",
  role: "Backend pobiera linie energetyczne (wektor). Frontend tylko wyświetla pre-loaded GeoJSON.",
};

// ─── Dodatkowe WMS (Geoportal / GUGiK) — do wdrożenia w kontrolce warstw ───
// Pełna lista i rekomendacje: docs/RESEARCH_WIZUALIZACJA_LINII_SLUPOW_KSWS.md
export const EXTRA_WMS = {
  GESUT: {
    baseUrl: "https://mapy.geoportal.gov.pl/wss/service/pub/guest/G2_GESUT_WMS/MapServer/WMSServer",
    layers: "Sieci uzbrojenia / linie przesyłowe", // sprawdź GetCapabilities dla dokładnej nazwy
    attribution: "GESUT GUGiK",
  },
  BDOT10k: {
    baseUrl: "https://mapy.geoportal.gov.pl/wss/service/pub/guest/G2_BDOT10k_WMS/MapServer/WMSServer",
    layers: "Sieci uzbrojenia terenu", // wieże, maszty, słupy (obiekty punktowe)
    attribution: "BDOT10k GUGiK",
  },
  SIDUSIS: {
    baseUrl: "https://mapy.geoportal.gov.pl/wss/service/pub/guest/G2_SIDUSIS_WMS/MapServer/WMSServer",
    attribution: "SIDUSIS – infrastruktura szerokopasmowa",
  },
  KIMP: {
    baseUrl: "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego",
    attribution: "KIMP – MPZP",
  },
  NMT_Shading: {
    baseUrl: "https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WMS/Shading",
    attribution: "NMT – cieniowanie",
  },
  ULDK_WMS: {
    baseUrl: "https://uldk.gugik.gov.pl/cgi-bin/uldk-wms",
    attribution: "ULDK",
  },
};
