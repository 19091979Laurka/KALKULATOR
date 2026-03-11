import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, WMSTileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "react-toastify";
import CountUp from "react-countup";
import { Spinner, Badge, Table, Progress } from "reactstrap";
import Map3D from "../../components/Map3D";
import "./KalkulatorPage.css";

// ── Leaflet default icon fix ──────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── GeoJSON działki + GESUT WMS overlay ──────────────────────────────────────
function GeoJSONLayers({ parcelGeojson }) {
  const map = useMap();

  useEffect(() => {
    if (!parcelGeojson) return;

    // Granica działki
    const parcelLayer = L.geoJSON(parcelGeojson, {
      style: {
        color: "#a91079",
        weight: 3,
        fillColor: "#a91079",
        fillOpacity: 0.18,
      },
    });
    parcelLayer.addTo(map);

    // GESUT WMS — uzbrojenie terenu (niewidoczne na geoportal orto, ale dane są)
    const gesutLayer = L.tileLayer.wms(
      "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu",
      {
        layers: "przewod_elektroenergetyczny,przewod_gazowy,przewod_wodociagowy",
        format: "image/png",
        transparent: true,
        opacity: 0.7,
        attribution: "GESUT GUGiK",
      }
    );
    gesutLayer.addTo(map);

    try {
      const bounds = parcelLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
    } catch (_) {}

    return () => {
      map.removeLayer(parcelLayer);
      map.removeLayer(gesutLayer);
    };
  }, [map, parcelGeojson]);

  return null;
}

// ── Legenda OpenInfraMap ────────────────────────────────────────────────────
const INFRA_LEGEND = [
  { color: "#e60000", label: "380 kV" },
  { color: "#ff6600", label: "220 kV" },
  { color: "#ffcc00", label: "110 kV" },
  { color: "#00bb00", label: "15–30 kV" },
  { color: "#0066ff", label: "nN" },
  { color: "#a91079", label: "Działka" },
];

// ── Overpass API — linie i słupy energetyczne z OSM ──────────────────────────
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const VOLTAGE_COLOR = (v) => {
  const n = parseInt(v) || 0;
  if (n >= 300) return "#e60000";  // 380kV
  if (n >= 180) return "#ff6600";  // 220kV
  if (n >= 100) return "#ffcc00";  // 110kV
  if (n >= 10)  return "#00bb00";  // 15-30kV
  return "#0066ff";                // nN / nieznane
};

const VOLTAGE_WEIGHT = (v) => {
  const n = parseInt(v) || 0;
  if (n >= 300) return 4;
  if (n >= 100) return 3;
  return 2;
};

function OverpassPowerLayer({ center, bboxPadding = 0.025 }) {
  const map = useMap();
  const layerRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!center) return;
    const [lat, lon] = center;
    if (!lat || !lon) return;

    const s = lat - bboxPadding;
    const w = lon - bboxPadding;
    const n = lat + bboxPadding;
    const e = lon + bboxPadding;

    const query = `[out:json][timeout:30];
(
  way["power"="line"](${s},${w},${n},${e});
  way["power"="cable"](${s},${w},${n},${e});
  node["power"="tower"](${s},${w},${n},${e});
  node["power"="pole"](${s},${w},${n},${e});
  node["power"="transformer"](${s},${w},${n},${e});
  way["power"="substation"](${s},${w},${n},${e});
);
out body;>;out skel qt;`;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    fetch(OVERPASS_URL, {
      method: "POST",
      body: query,
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (ctrl.signal.aborted) return;

        // Build node coordinate map
        const nodeMap = {};
        data.elements.forEach((e) => {
          if (e.type === "node") nodeMap[e.id] = [e.lon, e.lat];
        });

        const features = [];

        data.elements.forEach((el) => {
          if (el.type === "way" && el.nodes) {
            const coords = el.nodes.map((id) => nodeMap[id]).filter(Boolean);
            if (coords.length > 1) {
              features.push({
                type: "Feature",
                geometry: { type: "LineString", coordinates: coords },
                properties: el.tags || {},
              });
            }
          } else if (el.type === "node" && el.tags?.power) {
            features.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: [el.lon, el.lat] },
              properties: el.tags,
            });
          }
        });

        if (features.length === 0) return;

        // Remove previous layer
        if (layerRef.current) {
          map.removeLayer(layerRef.current);
          layerRef.current = null;
        }

        const geoLayer = L.geoJSON(
          { type: "FeatureCollection", features },
          {
            style: (feature) => ({
              color: VOLTAGE_COLOR(feature.properties.voltage),
              weight: VOLTAGE_WEIGHT(feature.properties.voltage),
              opacity: 0.92,
            }),
            pointToLayer: (feature, latlng) => {
              const pwr = feature.properties.power;
              const color =
                pwr === "transformer" || pwr === "substation"
                  ? "#9b59b6"
                  : "#8B4513";
              return L.circleMarker(latlng, {
                radius: pwr === "tower" ? 3 : 5,
                fillColor: color,
                color: "#fff",
                weight: 1,
                fillOpacity: 0.9,
              });
            },
            onEachFeature: (feature, layer) => {
              const p = feature.properties;
              if (p.voltage || p.power) {
                layer.bindPopup(
                  `<b>${p.power || "Linia"}</b><br>` +
                    (p.voltage ? `Napięcie: ${p.voltage} V<br>` : "") +
                    (p.cables ? `Przewody: ${p.cables}<br>` : "") +
                    (p.name ? `Nazwa: ${p.name}` : "")
                );
              }
            },
          }
        );

        geoLayer.addTo(map);
        layerRef.current = geoLayer;
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("Overpass power query failed:", err.message);
        }
      });

    return () => {
      ctrl.abort();
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, center, bboxPadding]);

  return null;
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = (v, dec = 0) =>
  v != null && !isNaN(v)
    ? Number(v).toLocaleString("pl-PL", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      })
    : "—";

const fmtPLN = (v) =>
  v != null && !isNaN(v) ? `${fmt(v, 2)} PLN` : "—";

const fmtM2 = (v) =>
  v != null && !isNaN(v) ? `${fmt(v, 2)} zł/m²` : "—";

const nowPL = () =>
  new Date().toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// ── localStorage history helpers ──────────────────────────────────────────────
const HISTORY_KEY = "ksws_history";

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveToHistory(entry) {
  try {
    const prev = loadHistory();
    const next = [entry, ...prev.filter((h) => h.parcel_id !== entry.parcel_id)].slice(0, 5);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_CENTER = [52.1, 19.5];
const DEFAULT_ZOOM = 6;

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function KalkulatorPage() {
  // ── Form state ──────────────────────────────────────────────────────────────
  const [parcelIds, setParcelIds] = useState("141906_5.0029.60, 141906_5.0029.129");
  const [obreb, setObreb] = useState("");
  const [county, setCounty] = useState("");
  const [municipality, setMunicipality] = useState("");
  const infraType = "elektro_SN";

  // ── UI state ────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("map2d");
  const [activeNav, setActiveNav] = useState("analiza");
  const [showManual, setShowManual] = useState(false);

  // ── Manual correction ───────────────────────────────────────────────────────
  const [manualPrice, setManualPrice] = useState("");
  const [manualLandType, setManualLandType] = useState("");
  const [manualInfraDetect, setManualInfraDetect] = useState("");
  const [manualVoltage, setManualVoltage] = useState("");

  // ── Results state ────────────────────────────────────────────────────────────
  const [result, setResult] = useState(null);
  const [allResults, setAllResults] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);

  // ── History ──────────────────────────────────────────────────────────────────
  const [history, setHistory] = useState(loadHistory);

  // ── runAnalysis ──────────────────────────────────────────────────────────────
  const runAnalysis = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const pid = parcelIds.trim();
    if (!pid) {
      toast.error("Wprowadź numer działki.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parcel_ids: pid,
          obreb: obreb || undefined,
          county: county || undefined,
          municipality: municipality || undefined,
          infra_type_pref: infraType,
          manual_price_m2: manualPrice ? parseFloat(manualPrice) : undefined,
          manual_land_type: manualLandType || undefined,
          manual_infra_detected:
            manualInfraDetect !== "" ? manualInfraDetect === "true" : undefined,
          manual_voltage: manualVoltage || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.detail)
          ? data.detail[0]?.msg
          : data.detail;
        throw new Error(msg || data.message || "Błąd serwera");
      }
      const first = data.parcels?.[0];
      if (!first) throw new Error("Brak wyników");
      if (
        first.data_status === "ERROR" ||
        first.master_record?.status === "ERROR"
      )
        throw new Error(
          first.master_record?.message || first.error || "Działka nie znaleziona"
        );

      setAllResults(data.parcels);
      setResult(first);

      const centroid = first.master_record?.geometry?.centroid_ll;
      if (Array.isArray(centroid) && centroid[0] != null) {
        setMapCenter([Number(centroid[1]), Number(centroid[0])]);
        setMapZoom(16);
      }

      // Save to history
      const mr = first.master_record || {};
      const comp = mr.compensation || {};
      const trackA = comp.track_a || {};
      const newEntry = {
        parcel_id: first.parcel_id,
        date: nowPL(),
        track_a: trackA.total || 0,
      };
      setHistory(saveToHistory(newEntry));

      toast.success("Analiza zakończona ✓");
    } catch (err) {
      toast.error(err.message || "Wystąpił błąd.");
    } finally {
      setLoading(false);
    }
  };

  // ── openHtmlReport — otwiera template HTML z wstrzykniętymi danymi ───────────
  const openHtmlReport = () => {
    if (!result) return;
    const mr = result.master_record;
    const win = window.open("/raport-template-3d.html", "_blank");
    // Poczekaj na załadowanie strony i wywołaj fillReport()
    win.addEventListener("load", () => {
      try { win.fillReport(mr); } catch (e) { console.error("fillReport error:", e); }
    });
    // Fallback — timeout jeśli load nie wystrzelił
    setTimeout(() => {
      try { if (win.fillReport) win.fillReport(mr); } catch (_) {}
    }, 1500);
  };

  // ── downloadPdf — backend PDF (fallback) ─────────────────────────────────────
  const downloadPdf = async () => {
    if (!allResults) return;
    // Najpierw spróbuj HTML report (lepsza jakość wizualna)
    openHtmlReport();
  };

  // ── Destructure result ───────────────────────────────────────────────────────
  const mr = result?.master_record || {};
  const geom = mr.geometry || {};
  const meta = mr.parcel_metadata || {};
  const egib = mr.egib || {};
  const plan = mr.planning || {};
  const infra = mr.infrastructure || {};
  const power = infra.power || {};
  const powerL = infra.power_lines || {};
  const utils = infra.utilities || {};
  const market = mr.market_data || {};
  const ksws = mr.ksws || {};
  const comp = mr.compensation || {};
  const trackA = comp.track_a || {};
  const trackB = comp.track_b || {};
  const invest = mr.investments || {};
  const landUse = Array.isArray(egib.land_use) ? egib.land_use : [];

  const areaM2 = geom.area_m2 || 0;
  const primaryClass = egib.primary_class || landUse[0]?.class || "R";
  const hasLine = !!(powerL.detected || power.exists);
  const hasMpzp = !!plan.mpzp_active;
  const locationStr =
    [meta.commune, meta.county, meta.region].filter(Boolean).join(", ") || "—";
  const trackATotal = hasLine ? trackA.total || 0 : 0;
  const trackBTotal = hasLine ? trackB.total || 0 : 0;
  const priceM2 = market.average_price_m2;
  const priceSource =
    market.price_source ||
    (market.rcn_price_m2 ? "RCN" : market.gus_price_m2 ? "GUS BDL" : null);

  const hasManualActive =
    manualPrice || manualLandType || manualInfraDetect || manualVoltage;

  // ── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="ksws-layout">

      {/* ════════════ SIDEBAR ════════════ */}
      <aside className="ksws-sidebar">
        <div className="ksws-sidebar-logo">
          <div className="ksws-sidebar-logo-title">⚡ KSWS</div>
          <div className="ksws-sidebar-logo-sub">Kalkulator Roszczeń</div>
        </div>

        <nav className="ksws-sidebar-nav">
          <div
            className={`ksws-sidebar-nav-item${activeNav === "analiza" ? " active" : ""}`}
            onClick={() => setActiveNav("analiza")}
          >
            <span className="ksws-sidebar-nav-icon">🏠</span>
            Analiza działki
          </div>
          <div
            className={`ksws-sidebar-nav-item${activeNav === "historia" ? " active" : ""}`}
            onClick={() => setActiveNav("historia")}
          >
            <span className="ksws-sidebar-nav-icon">📋</span>
            Historia analiz
          </div>
          <div
            className={`ksws-sidebar-nav-item${activeNav === "batch" ? " active" : ""}`}
            onClick={() => setActiveNav("batch")}
          >
            <span className="ksws-sidebar-nav-icon">📄</span>
            Batch CSV
          </div>
        </nav>

        <div className="ksws-sidebar-footer">
          KSWS v2.0 · GUGiK / ULDK<br />
          Dane rzeczywiste · Track A/B
        </div>
      </aside>

      {/* ════════════ RIGHT SIDE ════════════ */}
      <div className="ksws-content">

        {/* ── TOP BAR ── */}
        <header className="ksws-topbar">
          <div>
            <div className="ksws-topbar-title">Kalkulator Roszczeń Przesyłowych</div>
            <div className="ksws-topbar-sub">
              KSWS Track A/B · ULDK · GESUT · RCN · GUS BDL — wyłącznie dane rzeczywiste
            </div>
          </div>
          <div className="ksws-topbar-right">
            <div className="ksws-status-badge">
              <div className="ksws-status-dot" />
              System aktywny
            </div>
          </div>
        </header>

        {/* ── MAIN SCROLL ── */}
        <main className="ksws-main">

          {/* ════ HISTORIA PAGE ════ */}
          {activeNav === "historia" && (
            <div className="ksws-card">
              <div className="ksws-card-header">
                <span className="ksws-card-header-icon">📋</span>
                <div>
                  <div className="ksws-card-header-title">Historia analiz</div>
                  <div className="ksws-card-header-sub">Ostatnie 5 analiz · kliknij aby załadować</div>
                </div>
              </div>
              <div className="ksws-card-body">
                {history.length === 0 ? (
                  <div className="ksws-empty" style={{ padding: "40px 0" }}>
                    <div className="ksws-empty-icon">📋</div>
                    <div className="ksws-empty-title">Brak historii</div>
                    <div className="ksws-empty-sub">
                      Przeprowadź analizę działki, aby wyniki pojawiły się tutaj.
                    </div>
                    <button
                      className="ksws-btn ksws-btn-primary"
                      style={{ marginTop: 16 }}
                      onClick={() => setActiveNav("analiza")}
                    >
                      ⚡ Przejdź do analizy
                    </button>
                  </div>
                ) : (
                  <div className="ksws-history-full">
                    {history.map((item, idx) => (
                      <div
                        key={idx}
                        className="ksws-history-full-item"
                        onClick={() => {
                          setParcelIds(item.parcel_id);
                          setActiveNav("analiza");
                        }}
                      >
                        <div className="ksws-history-full-num">{idx + 1}</div>
                        <div className="ksws-history-full-body">
                          <div className="ksws-history-full-id">{item.parcel_id}</div>
                          <div className="ksws-history-full-date">{item.date}</div>
                        </div>
                        {item.track_a > 0 && (
                          <div className="ksws-history-full-track">
                            <div style={{ fontSize: "0.7rem", color: "#999", marginBottom: 2 }}>Track A</div>
                            <div style={{ fontWeight: 700, color: "#1a2035" }}>{fmtPLN(item.track_a)}</div>
                          </div>
                        )}
                        <div className="ksws-history-full-arrow">→</div>
                      </div>
                    ))}
                    <div style={{ textAlign: "right", marginTop: 14 }}>
                      <button
                        className="ksws-btn-link"
                        onClick={() => {
                          localStorage.removeItem("ksws_history");
                          setHistory([]);
                        }}
                      >
                        🗑 Wyczyść historię
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════ ANALIZA PAGE ════ */}
          {activeNav === "analiza" && (<>

          {/* ════ FORMULARZ ════ */}
          <div className="ksws-card">
            <div className="ksws-card-header">
              <span className="ksws-card-header-icon">📍</span>
              <div>
                <div className="ksws-card-header-title">Identyfikacja działki</div>
                <div className="ksws-card-header-sub">
                  Wprowadź identyfikator ULDK lub numer ewidencyjny
                </div>
              </div>
            </div>
            <div className="ksws-card-body">
              <form onSubmit={runAnalysis}>
                <div className="ksws-form-grid">
                  {/* ID działki */}
                  <div className="ksws-form-group">
                    <label className="ksws-form-label">Identyfikator działki *</label>
                    <input
                      className="ksws-form-input"
                      value={parcelIds}
                      onChange={(e) => setParcelIds(e.target.value)}
                      placeholder="np. 141906_5.0029.60 lub Szapsk 302/6"
                    />
                  </div>

                  {/* Obręb */}
                  <div className="ksws-form-group">
                    <label className="ksws-form-label">Obręb</label>
                    <input
                      className="ksws-form-input"
                      value={obreb}
                      onChange={(e) => setObreb(e.target.value)}
                      placeholder="np. Szapsk"
                    />
                  </div>

                  {/* Powiat */}
                  <div className="ksws-form-group">
                    <label className="ksws-form-label">Powiat</label>
                    <input
                      className="ksws-form-input"
                      value={county}
                      onChange={(e) => setCounty(e.target.value)}
                      placeholder="np. płoński"
                    />
                  </div>

                  {/* Gmina */}
                  <div className="ksws-form-group">
                    <label className="ksws-form-label">Gmina</label>
                    <input
                      className="ksws-form-input"
                      value={municipality}
                      onChange={(e) => setMunicipality(e.target.value)}
                      placeholder="np. Baboszewo"
                    />
                  </div>

                  {/* Przycisk */}
                  <div className="ksws-form-group ksws-form-btn-col">
                    <label className="ksws-form-label" style={{ opacity: 0 }}>.</label>
                    <button
                      type="submit"
                      className="ksws-btn ksws-btn-primary"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <span className="ksws-spinner-inline" />
                          Analizuję…
                        </>
                      ) : (
                        <>⚡ Generuj raport</>
                      )}
                    </button>
                  </div>
                </div>

                {/* ── Korekta ręczna accordion ── */}
                <button
                  type="button"
                  className="ksws-accordion-toggle"
                  onClick={() => setShowManual((v) => !v)}
                >
                  <span>{showManual ? "▲" : "▼"}</span>
                  {showManual ? "Ukryj korektę ręczną" : "Korekta ręczna — nadpisz dane API"}
                </button>

                {showManual && (
                  <div className="ksws-accordion-body">
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "#7d6608",
                        marginBottom: "14px",
                        fontWeight: 500,
                      }}
                    >
                      ⚠ Użyj gdy API zwraca błędne dane (np. rolna zamiast
                      budowlanej, brak wykrytej linii)
                    </div>
                    <div className="ksws-manual-grid">
                      <div className="ksws-form-group">
                        <label className="ksws-form-label">Cena rynkowa [zł/m²]</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="ksws-form-input"
                          placeholder="np. 200"
                          value={manualPrice}
                          onChange={(e) => setManualPrice(e.target.value)}
                        />
                      </div>
                      <div className="ksws-form-group">
                        <label className="ksws-form-label">Typ gruntu</label>
                        <select
                          className="ksws-form-input"
                          value={manualLandType}
                          onChange={(e) => setManualLandType(e.target.value)}
                        >
                          <option value="">— auto —</option>
                          <option value="building">Budowlany</option>
                          <option value="agricultural">Rolny</option>
                        </select>
                      </div>
                      <div className="ksws-form-group">
                        <label className="ksws-form-label">Infrastruktura wykryta</label>
                        <select
                          className="ksws-form-input"
                          value={manualInfraDetect}
                          onChange={(e) => setManualInfraDetect(e.target.value)}
                        >
                          <option value="">— auto —</option>
                          <option value="true">TAK — potwierdzona</option>
                          <option value="false">NIE — brak</option>
                        </select>
                      </div>
                      <div className="ksws-form-group">
                        <label className="ksws-form-label">Napięcie</label>
                        <select
                          className="ksws-form-input"
                          value={manualVoltage}
                          onChange={(e) => setManualVoltage(e.target.value)}
                        >
                          <option value="">— auto —</option>
                          <option value="WN">WN (110–400 kV)</option>
                          <option value="SN">SN (15–30 kV)</option>
                          <option value="nN">nN (&lt;1 kV)</option>
                        </select>
                      </div>
                    </div>

                    {hasManualActive && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginTop: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          className="ksws-badge ksws-badge-gold"
                          style={{ fontSize: "0.72rem" }}
                        >
                          Aktywna korekta:
                        </span>
                        {manualPrice && (
                          <span className="ksws-badge ksws-badge-blue">
                            cena {manualPrice} zł/m²
                          </span>
                        )}
                        {manualLandType && (
                          <span className="ksws-badge ksws-badge-blue">
                            {manualLandType === "building" ? "budowlany" : "rolny"}
                          </span>
                        )}
                        {manualInfraDetect && (
                          <span className="ksws-badge ksws-badge-blue">
                            infra: {manualInfraDetect === "true" ? "TAK" : "NIE"}
                          </span>
                        )}
                        {manualVoltage && (
                          <span className="ksws-badge ksws-badge-blue">{manualVoltage}</span>
                        )}
                        <button
                          type="button"
                          className="ksws-btn-link"
                          onClick={() => {
                            setManualPrice("");
                            setManualLandType("");
                            setManualInfraDetect("");
                            setManualVoltage("");
                          }}
                        >
                          Wyczyść
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* ════ MAPA POGLĄDOWA (przed analizą) ════ */}
          {!result && !loading && (
            <div className="ksws-card">
              <div className="ksws-card-header">
                <span className="ksws-card-header-icon">📡</span>
                <div>
                  <div className="ksws-card-header-title">Mapa infrastruktury energetycznej</div>
                  <div className="ksws-card-header-sub">
                    OSM Power Grid · linie WN/SN/nN · słupy · stacje (powiększ, aby zobaczyć)
                  </div>
                </div>
              </div>
              <div className="ksws-card-body" style={{ padding: 0, overflow: "hidden", borderRadius: "0 0 10px 10px" }}>
                <div className="ksws-map-container" style={{ height: 460, position: "relative" }}>
                  <MapContainer
                    center={DEFAULT_CENTER}
                    zoom={DEFAULT_ZOOM}
                    style={{ height: "100%", width: "100%" }}
                    scrollWheelZoom
                  >
                    {/* OpenStreetMap base — widoczne linie na zoom 13+ */}
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='© <a href="https://openstreetmap.org">OpenStreetMap</a>'
                    />
                    {/* Dane Overpass ładowane gdy użytkownik kliknie na mapie */}
                  </MapContainer>
                  {/* Legenda */}
                  <div className="ksws-map-legend">
                    <div className="ksws-map-legend-title">Linie energetyczne</div>
                    {INFRA_LEGEND.filter(i => i.label !== "Działka").map((item) => (
                      <div key={item.label} className="ksws-map-legend-item">
                        <div className="ksws-map-legend-swatch" style={{ background: item.color }} />
                        <span>{item.label}</span>
                      </div>
                    ))}
                    <div className="ksws-map-legend-source">OSM (widoczne od zoom 13+)</div>
                  </div>
                </div>
                <div style={{ padding: "12px 20px", fontSize: "0.82rem", color: "#7f8c8d", background: "#f9f9f9", borderTop: "1px solid #eee" }}>
                  ℹ Znajdź działkę na mapie, następnie wpisz jej numer ewidencyjny powyżej i kliknij <strong>Generuj raport</strong>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════ WYNIKI ════════════════════ */}
          {result && (
            <>
              {/* ── NAGŁÓWEK WYNIKOWY (ciemna karta) ── */}
              <div className="ksws-result-header">
                <div className="ksws-result-header-left">
                  <div className="ksws-result-header-id">{result.parcel_id}</div>
                  <div className="ksws-result-header-meta">
                    {locationStr} · {nowPL()}
                  </div>
                </div>
                <div className="ksws-result-header-right">
                  <span className="ksws-badge ksws-badge-green">✓ REAL DATA</span>
                  {hasLine && (
                    <span className="ksws-badge ksws-badge-danger">⚡ Kolizja z linią</span>
                  )}
                  <span className="ksws-badge ksws-badge-outline">
                    {ksws.label || infraType || "ELEKTRO_SN"}
                  </span>
                  <button
                    className="ksws-btn ksws-btn-pdf"
                    onClick={downloadPdf}
                    disabled={pdfLoading}
                    title="Pobierz raport PDF"
                  >
                    {pdfLoading ? (
                      <>
                        <span className="ksws-spinner-inline" />
                        PDF…
                      </>
                    ) : (
                      <>⬇ PDF</>
                    )}
                  </button>
                </div>
              </div>

              {/* ── ALERT — brak infrastruktury ── */}
              {!power.exists && manualInfraDetect !== "true" && (
                <div className="ksws-alert ksws-alert-warning">
                  <div className="ksws-alert-icon">⚠</div>
                  <div>
                    <div className="ksws-alert-title">
                      System: Brak wykrytej infrastruktury
                    </div>
                    <div className="ksws-alert-text">
                      Automatyczna detekcja nie znalazła linii (WFS niedostępny
                      lub działka poza zasięgiem). Jeśli wiesz, że działka ma
                      linię — potwierdź poniżej.
                    </div>
                    <div className="ksws-alert-actions">
                      <button
                        className="ksws-btn ksws-btn-success"
                        onClick={() => {
                          setManualInfraDetect("true");
                          runAnalysis({ preventDefault: () => {} });
                        }}
                      >
                        ✓ TAK — ma linię
                      </button>
                      <button
                        className="ksws-btn ksws-btn-neutral"
                        onClick={() => setManualInfraDetect("false")}
                      >
                        ✗ NIE — na pewno brak
                      </button>
                      <button
                        className="ksws-btn-link"
                        onClick={() => setShowManual(true)}
                      >
                        Szczegóły…
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 4 KPI KARTY ── */}
              <div className="ksws-kpi-row">

                {/* 1 — Powierzchnia */}
                <div className="ksws-kpi-card ksws-kpi-card-blue">
                  <div className="ksws-kpi-header">
                    <span className="ksws-kpi-label">Powierzchnia</span>
                    <span className="ksws-kpi-icon">🗺</span>
                  </div>
                  <div className="ksws-kpi-value">
                    {areaM2 > 0 ? (
                      <>
                        <CountUp end={areaM2} duration={1.2} separator=" " /> m²
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="ksws-kpi-source">EGiB / ULDK</div>
                  {areaM2 > 0 && (
                    <div className="ksws-kpi-sub">
                      {fmt(areaM2 / 10000, 4)} ha
                      {geom.perimeter_m
                        ? ` · obwód ${Math.round(geom.perimeter_m)} m`
                        : ""}
                    </div>
                  )}
                </div>

                {/* 2 — Klasa gruntu */}
                <div className="ksws-kpi-card ksws-kpi-card-green">
                  <div className="ksws-kpi-header">
                    <span className="ksws-kpi-label">Klasa gruntu</span>
                    <span className="ksws-kpi-icon">🌿</span>
                  </div>
                  <div className="ksws-kpi-value">{primaryClass || "—"}</div>
                  <div className="ksws-kpi-source">
                    {egib.land_type === "agricultural" ? "Rolny" : "Budowlany"}
                  </div>
                  {landUse.length > 1 && (
                    <div className="ksws-kpi-sub">
                      {landUse
                        .slice(0, 3)
                        .map((u) => u.class)
                        .join(" / ")}
                    </div>
                  )}
                </div>

                {/* 3 — Sieci przesyłowe */}
                <div
                  className={`ksws-kpi-card ${hasLine ? "ksws-kpi-card-red" : "ksws-kpi-card-green"}`}
                >
                  <div className="ksws-kpi-header">
                    <span className="ksws-kpi-label">Sieci przesyłowe</span>
                    <span className="ksws-kpi-icon">⚡</span>
                  </div>
                  <div className="ksws-kpi-value" style={{ fontSize: "1.1rem" }}>
                    {hasLine
                      ? power.voltage || powerL.voltage || "Wykryto"
                      : "Brak / 15kV"}
                  </div>
                  <div className="ksws-kpi-source">
                    {hasLine ? "GESUT GUGiK" : "Brak kolizji"}
                  </div>
                  {hasLine && (ksws.band_width_m || power.buffer_zone_m) && (
                    <div className="ksws-kpi-sub">
                      Strefa {power.buffer_zone_m || ksws.band_width_m} m
                      {ksws.band_area_m2 > 0
                        ? ` · pas ${fmt(ksws.band_area_m2)} m²`
                        : ""}
                    </div>
                  )}
                </div>

                {/* 4 — Cena rynkowa */}
                <div className="ksws-kpi-card ksws-kpi-card-gold">
                  <div className="ksws-kpi-header">
                    <span className="ksws-kpi-label">Cena rynkowa</span>
                    <span className="ksws-kpi-icon">💰</span>
                  </div>
                  <div className="ksws-kpi-value" style={{ fontSize: "1.1rem" }}>
                    {fmtM2(priceM2)}
                  </div>
                  <div className="ksws-kpi-source">{priceSource || "—"}</div>
                  <div className="ksws-kpi-sub">
                    {[
                      market.rcn_price_m2 && `RCN: ${fmtM2(market.rcn_price_m2)}`,
                      market.gus_price_m2 && `GUS: ${fmtM2(market.gus_price_m2)}`,
                      market.transactions_count > 0 &&
                        `${market.transactions_count} trans.`,
                    ]
                      .filter(Boolean)
                      .join(" · ") || ""}
                  </div>
                </div>
              </div>

              {/* ── MAPA + INFO ── */}
              <div className="ksws-map-detail-row">

                {/* Mapa */}
                <div className="ksws-card" style={{ marginBottom: 0 }}>
                  <div className="ksws-card-header">
                    <span className="ksws-card-header-icon">🗺</span>
                    <div className="ksws-card-header-title">Wizualizacja działki</div>
                  </div>

                  {/* Tabs */}
                  <div className="ksws-tabs">
                    <button
                      className={`ksws-tab-btn${activeTab === "map2d" ? " active" : ""}`}
                      onClick={() => setActiveTab("map2d")}
                    >
                      📡 Infrastruktura
                    </button>
                    <button
                      className={`ksws-tab-btn${activeTab === "mapy" ? " active" : ""}`}
                      onClick={() => setActiveTab("mapy")}
                    >
                      🏔 Outdoor
                    </button>
                    <button
                      className={`ksws-tab-btn${activeTab === "map3d" ? " active" : ""}`}
                      onClick={() => setActiveTab("map3d")}
                    >
                      🧊 3D
                    </button>
                  </div>

                  <div className="ksws-tab-content">
                    {activeTab === "map2d" && (
                      <div className="ksws-map-container" style={{ position: "relative" }}>
                        <MapContainer
                          key={result?.parcel_id || "empty"}
                          center={mapCenter}
                          zoom={mapZoom}
                          style={{ height: "100%", width: "100%" }}
                          scrollWheelZoom
                        >
                          {/* Geoportal WMS ortofoto */}
                          <WMSTileLayer
                            url="https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardOGC"
                            layers="Raster"
                            format="image/jpeg"
                            transparent={false}
                            attribution="Geoportal GUGiK"
                          />

                          {/* Overpass OSM — linie i słupy energetyczne wokół działki */}
                          <OverpassPowerLayer
                            center={mapCenter}
                            bboxPadding={0.025}
                          />

                          {/* Granica działki (GeoJSON) */}
                          <GeoJSONLayers
                            parcelGeojson={geom.geojson_ll || geom.geojson}
                          />
                        </MapContainer>

                        {/* Legenda */}
                        <div className="ksws-map-legend">
                          <div className="ksws-map-legend-title">Linie energetyczne</div>
                          {INFRA_LEGEND.map((item) => (
                            <div key={item.label} className="ksws-map-legend-item">
                              <div
                                className="ksws-map-legend-swatch"
                                style={{ background: item.color }}
                              />
                              <span>{item.label}</span>
                            </div>
                          ))}
                          <div className="ksws-map-legend-source">
                            OSM / Overpass · GESUT GUGiK
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === "mapy" && (
                      <div className="ksws-map-container" style={{ position: "relative" }}>
                        <MapContainer
                          key={`outdoor-${mapCenter[0]}-${mapCenter[1]}`}
                          center={mapCenter}
                          zoom={mapZoom}
                          style={{ height: "100%", width: "100%" }}
                          scrollWheelZoom
                        >
                          {/* OpenTopoMap — widoczne linie HV, drogi, rzeki */}
                          <TileLayer
                            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                            attribution='© <a href="https://opentopomap.org">OpenTopoMap</a> · <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>'
                            maxZoom={17}
                          />
                          {/* Granica działki */}
                          <GeoJSONLayers
                            parcelGeojson={geom.geojson_ll || geom.geojson}
                          />
                        </MapContainer>
                        {/* Przycisk Mapy.cz */}
                        <div className="ksws-map-outdoor-links">
                          <a
                            href={`https://en.mapy.cz/?source=coor&id=${mapCenter[1]},${mapCenter[0]}&x=${mapCenter[1]}&y=${mapCenter[0]}&z=16&mp=mapset-outdoor&marker=1`}
                            target="_blank"
                            rel="noreferrer"
                            className="ksws-map-outdoor-btn"
                          >
                            🗺 Mapy.cz Outdoor
                          </a>
                          <a
                            href={`https://www.google.com/maps/@${mapCenter[0]},${mapCenter[1]},16z/data=!3m1!1e3`}
                            target="_blank"
                            rel="noreferrer"
                            className="ksws-map-outdoor-btn"
                          >
                            🛰 Google Earth
                          </a>
                          <a
                            href={`https://geoportal.gov.pl/web/guest/map?lat=${mapCenter[0]}&lon=${mapCenter[1]}&zoom=17`}
                            target="_blank"
                            rel="noreferrer"
                            className="ksws-map-outdoor-btn"
                          >
                            🇵🇱 Geoportal
                          </a>
                        </div>
                      </div>
                    )}

                    {activeTab === "map3d" && (
                      <div className="ksws-map-container-3d">
                        <Map3D
                          parcels={(allResults || (result ? [result] : [])).map(p => {
                            const mr = p.master_record || {};
                            const g = mr.geometry || {};
                            // Map3D expects parcel.geometry as GeoJSON Feature geometry + centroid_ll
                            const geojson = g.geojson_ll || g.geojson || null;
                            return {
                              parcel_id: p.parcel_id,
                              geometry: geojson
                                ? { ...geojson, area_m2: g.area_m2, centroid_ll: g.centroid_ll }
                                : null,
                              infrastructure: mr.infrastructure || {},
                            };
                          }).filter(p => p.geometry)}
                          infrastructureTypes={["elektro","gaz","woda","teleko"]}
                          center={mapCenter[1] != null ? [mapCenter[1], mapCenter[0]] : [20.156, 52.685]}
                          zoom={mapZoom}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Info panel boczny */}
                <div className="ksws-info-list">

                  {/* Geometria */}
                  <div className="ksws-info-item">
                    <div className="ksws-info-item-icon ksws-info-icon-blue">🗺</div>
                    <div className="ksws-info-item-body">
                      <div className="ksws-info-item-label">Geometria EGiB</div>
                      <div className="ksws-info-item-value">
                        {areaM2 > 0
                          ? `${fmt(areaM2)} m² (${fmt(areaM2 / 10000, 4)} ha)`
                          : "—"}
                      </div>
                      <div className="ksws-info-item-sub">{locationStr}</div>
                    </div>
                  </div>

                  {/* Użytek gruntowy */}
                  <div className="ksws-info-item">
                    <div className="ksws-info-item-icon ksws-info-icon-green">🌿</div>
                    <div className="ksws-info-item-body">
                      <div className="ksws-info-item-label">Użytek gruntowy</div>
                      <div className="ksws-info-item-value">
                        {landUse.length > 0
                          ? landUse
                              .slice(0, 3)
                              .map((u) => `${u.class}${u.area_m2 ? ` (${fmt(u.area_m2)} m²)` : ""}`)
                              .join(", ")
                          : primaryClass}
                      </div>
                      <div className="ksws-info-item-sub">
                        Typ: {egib.land_type === "agricultural" ? "rolny" : "budowlany"}
                      </div>
                    </div>
                  </div>

                  {/* Sieci */}
                  <div className="ksws-info-item">
                    <div
                      className={`ksws-info-item-icon ${hasLine ? "ksws-info-icon-red" : "ksws-info-icon-green"}`}
                    >
                      ⚡
                    </div>
                    <div className="ksws-info-item-body">
                      <div className="ksws-info-item-label">Sieci przesyłowe (GESUT)</div>
                      <div className="ksws-info-item-value">
                        {hasLine ? (
                          <>
                            Wykryto
                            {power.voltage || powerL.voltage
                              ? ` — ${power.voltage || powerL.voltage}`
                              : ""}
                            {power.buffer_zone_m
                              ? ` · strefa ${power.buffer_zone_m} m`
                              : ""}
                            {power.line_length_m > 0
                              ? ` · dł. ${fmt(power.line_length_m)} m`
                              : ""}
                          </>
                        ) : (
                          "Brak kolizji"
                        )}
                      </div>
                      <div className="ksws-info-item-sub">
                        Gaz: {utils.gaz ? "✓" : "—"} · Woda:{" "}
                        {utils.woda ? "✓" : "—"} · Kanal.:{" "}
                        {utils.kanal ? "✓" : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Planowanie */}
                  <div className="ksws-info-item">
                    <div className="ksws-info-item-icon ksws-info-icon-orange">📄</div>
                    <div className="ksws-info-item-body">
                      <div className="ksws-info-item-label">Planowanie przestrzenne</div>
                      <div className="ksws-info-item-value">
                        {hasMpzp ? "MPZP aktywny" : "Brak MPZP"}
                        {plan.usage ? ` — ${plan.usage}` : ""}
                      </div>
                      <div className="ksws-info-item-sub">
                        Pozwolenia: {invest.active_permits || 0} · Budynki:{" "}
                        {mr.buildings?.count ?? 0}
                      </div>
                    </div>
                  </div>

                  {/* Cena rynkowa */}
                  <div className="ksws-info-item">
                    <div className="ksws-info-item-icon ksws-info-icon-blue">💰</div>
                    <div className="ksws-info-item-body">
                      <div className="ksws-info-item-label">Cena rynkowa</div>
                      <div className="ksws-info-item-value">{fmtM2(priceM2)}</div>
                      <div className="ksws-info-item-sub">
                        {[
                          priceSource && `Źródło: ${priceSource}`,
                          market.rcn_price_m2 &&
                            `RCN: ${fmtM2(market.rcn_price_m2)}`,
                          market.gus_price_m2 &&
                            `GUS: ${fmtM2(market.gus_price_m2)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── TRACK A / B ── */}
              <div className="ksws-track-row">

                {/* Track A */}
                <div className="ksws-track-card ksws-track-a">
                  <div className="ksws-track-header">
                    <div>
                      <div className="ksws-track-title">Track A — Ścieżka sądowa</div>
                      <div className="ksws-track-desc">
                        TK P 10/16 · WSP + WBK + OBN
                      </div>
                    </div>
                    <span className="ksws-badge ksws-badge-blue">Sąd</span>
                  </div>

                  <div className="ksws-track-total">
                    {trackATotal > 0 ? (
                      <>
                        <CountUp
                          end={trackATotal}
                          duration={1.5}
                          separator=" "
                          decimals={2}
                          decimal=","
                        />{" "}
                        PLN
                      </>
                    ) : (
                      <span
                        style={{
                          fontSize: "0.9rem",
                          color: "#95a5a6",
                          fontWeight: 400,
                        }}
                      >
                        Brak wykrytej linii
                      </span>
                    )}
                  </div>

                  {trackA.total > 0 && (
                    <table className="ksws-track-table">
                      <tbody>
                        <tr>
                          <td>WSP <small style={{ color: "#95a5a6" }}>(służebność przesyłu)</small></td>
                          <td>{fmtPLN(trackA.wsp)}</td>
                        </tr>
                        <tr>
                          <td>WBK <small style={{ color: "#95a5a6" }}>(bezumowne korzystanie)</small></td>
                          <td>{fmtPLN(trackA.wbk)}</td>
                        </tr>
                        <tr>
                          <td>OBN <small style={{ color: "#95a5a6" }}>(obniżenie wartości)</small></td>
                          <td>{fmtPLN(trackA.obn)}</td>
                        </tr>
                        <tr className="track-total-row">
                          <td>Razem ({trackA.years || 10} lat)</td>
                          <td>{fmtPLN(trackA.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Track B */}
                <div className="ksws-track-card ksws-track-b">
                  <div className="ksws-track-header">
                    <div>
                      <div className="ksws-track-title">Track B — Ścieżka negocjacyjna</div>
                      <div className="ksws-track-desc">
                        Track A × {trackB.multiplier || "—"} (benchmark rynkowy)
                      </div>
                    </div>
                    <span className="ksws-badge ksws-badge-gold">NEGOCJACJE</span>
                  </div>

                  <div className="ksws-track-total">
                    {trackBTotal > 0 ? (
                      <>
                        <CountUp
                          end={trackBTotal}
                          duration={1.5}
                          separator=" "
                          decimals={2}
                          decimal=","
                        />{" "}
                        PLN
                      </>
                    ) : (
                      <span
                        style={{
                          fontSize: "0.9rem",
                          color: "#95a5a6",
                          fontWeight: 400,
                        }}
                      >
                        Brak wykrytej linii
                      </span>
                    )}
                  </div>

                  {trackATotal > 0 && trackBTotal > 0 && (
                    <div className="ksws-progress-wrap">
                      <div className="ksws-progress-labels">
                        <span>{fmtPLN(trackATotal)}</span>
                        <span>{fmtPLN(trackBTotal)}</span>
                      </div>
                      <div className="ksws-progress-bar-bg">
                        <div className="ksws-progress-seg-a" style={{ width: "55%" }} />
                        <div className="ksws-progress-seg-b" style={{ width: "45%" }} />
                      </div>
                      <div className="ksws-progress-labels" style={{ marginTop: "4px" }}>
                        <span>Min (ścieżka sądowa)</span>
                        <span>Max (negocjacje)</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── KSWS szczegóły ── */}
              {ksws.infra_type && (
                <div className="ksws-card">
                  <div className="ksws-card-header">
                    <span className="ksws-card-header-icon">🔢</span>
                    <div className="ksws-card-header-title">Podstawa wyceny KSWS</div>
                  </div>
                  <div className="ksws-card-body">
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "20px",
                      }}
                    >
                      <table className="ksws-detail-table">
                        <tbody>
                          <tr>
                            <td>Typ infrastruktury</td>
                            <td>{ksws.label || ksws.infra_type}</td>
                          </tr>
                          <tr>
                            <td>Szerokość pasa ochronnego</td>
                            <td>{ksws.band_width_m} m</td>
                          </tr>
                          <tr>
                            <td>Powierzchnia pasa</td>
                            <td>{fmt(ksws.band_area_m2)} m²</td>
                          </tr>
                          <tr>
                            <td>Wartość nieruchomości</td>
                            <td>{fmtPLN(ksws.property_value_total)}</td>
                          </tr>
                          <tr>
                            <td>Cena bazowa</td>
                            <td>{fmtM2(ksws.price_per_m2)}</td>
                          </tr>
                        </tbody>
                      </table>

                      {comp.basis && (
                        <table className="ksws-detail-table">
                          <thead>
                            <tr>
                              <th>Wsp.</th>
                              <th>Wartość</th>
                              <th>Opis</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>
                                <code>S</code>
                              </td>
                              <td>{comp.basis.S}</td>
                              <td style={{ color: "#95a5a6", fontSize: "0.78rem" }}>
                                obniżenie wartości pasa
                              </td>
                            </tr>
                            <tr>
                              <td>
                                <code>k</code>
                              </td>
                              <td>{comp.basis.k}</td>
                              <td style={{ color: "#95a5a6", fontSize: "0.78rem" }}>
                                współczynnik korzystania
                              </td>
                            </tr>
                            <tr>
                              <td>
                                <code>R</code>
                              </td>
                              <td>{comp.basis.R}</td>
                              <td style={{ color: "#95a5a6", fontSize: "0.78rem" }}>
                                stopa kapitalizacji
                              </td>
                            </tr>
                            <tr>
                              <td>
                                <code>impact</code>
                              </td>
                              <td>{comp.basis.impact_judicial}</td>
                              <td style={{ color: "#95a5a6", fontSize: "0.78rem" }}>
                                wpływ sądowy (OBN)
                              </td>
                            </tr>
                            <tr>
                              <td>
                                <code>×B</code>
                              </td>
                              <td>{comp.basis.track_b_multiplier}</td>
                              <td style={{ color: "#95a5a6", fontSize: "0.78rem" }}>
                                mnożnik Track B
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          </>)}
          {/* END ANALIZA PAGE */}

        </main>
      </div>
    </div>
  );
}
