import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { Spinner, Badge, Button } from "reactstrap";
import "./BatchHistoryPage.css";

export default function BatchHistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState(null);

  // Load batch history from backend
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/history");
      const data = await res.json();
      if (data.ok) {
        setHistory(data.history || []);
        if (data.history.length === 0) {
          toast.info("Brak historii analiz — wykonaj nową analizę CSV");
        }
      } else {
        toast.error("Błąd pobierania historii: " + (data.error || "unknown"));
        setHistory([]);
      }
    } catch (err) {
      console.error("Error loading history:", err);
      toast.error("Błąd połączenia z serwerem");
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const loadBatchDetails = async (batch_id) => {
    try {
      const res = await fetch(`/api/history/${batch_id}`);
      const data = await res.json();
      if (data.ok && data.data) {
        // Open batch report with maps
        displayBatchReport(data.data);
      } else {
        toast.error("Nie udało się załadować szczegółów: " + (data.error || "unknown"));
      }
    } catch (err) {
      console.error("Error loading batch:", err);
      toast.error("Błąd pobierania szczegółów");
    }
  };

  const displayBatchReport = (batchData) => {
    // Reuse the same report generation logic from KalkulatorPage
    const results = batchData.results || [];
    const dateStr = new Date(batchData.timestamp).toLocaleDateString("pl-PL");

    const fmtN = (v) => (v || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtI = (v) => Math.round(v || 0).toLocaleString("pl-PL");
    const VOLT_LABEL = { WN: "WN >110 kV", SN: "SN 1–110 kV", nN: "nN <1 kV" };

    const totalA = results.reduce((s, p) => {
      const d = p.master_record || p.data || {};
      return s + (d.compensation?.track_a?.total || 0);
    }, 0);
    const totalB = results.reduce((s, p) => {
      const d = p.master_record || p.data || {};
      return s + (d.compensation?.track_b?.total || 0);
    }, 0);
    const collisionCount = results.filter(p => {
      const d = p.master_record || p.data || {};
      return !!d.infrastructure?.power_lines?.detected;
    }).length;

    const parcelCards = results.map((p, i) => {
      const d = p.master_record || p.data || {};
      const isError = d.status === "ERROR" || p.status === "ERROR";
      const errorMsg = d.message || p.error || "Brak danych";

      if (isError) {
        return `
      <div class="parcel-card" style="page-break-inside:avoid;break-inside:avoid;">
        <div class="parcel-header" style="background:#fff5f5;border-top:4px solid #c62828;border-bottom:1px solid #ffcdd2;">
          <div class="parcel-header-left">
            <div class="parcel-num-badge" style="background:#ffebee;border:2px solid #c62828;color:#c62828;font-size:12px;">#${i + 1}</div>
            <div>
              <div class="parcel-id" style="color:#3d2319;">${p.parcel_id || "—"}</div>
              <a href="https://mapy.geoportal.gov.pl/imap/Imgp_2.html?identifyParcel=${encodeURIComponent(p.parcel_id || "")}"
                 target="_blank" class="geo-link" style="color:#3498db;">🔗 geoportal</a>
            </div>
            <span class="collision-badge" style="background:#ffebee;color:#c62828;border:1px solid #ef9a9a;">❌ BŁĄD POBRANIA</span>
          </div>
        </div>
        <div style="padding:20px 22px;background:#fff8f8;border:1px solid #ffcdd2;border-radius:0 0 16px 16px;">
          <div style="font-size:12px;color:#c62828;font-weight:700;margin-bottom:6px;">Dane nie zostały pobrane</div>
          <div style="font-size:13px;color:#555;line-height:1.5;">${errorMsg.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          <div style="font-size:11px;color:#888;margin-top:10px;">Sprawdź format identyfikatora (pełny TERYT lub obręb + nr działki w CSV).</div>
        </div>
      </div>`;
      }

      const ta = (d.compensation?.track_a) || {};
      const tb = (d.compensation?.track_b) || {};
      const pl = d.infrastructure?.power_lines || {};
      const ksws = d.ksws || {};
      const geom = d.geometry || {};
      const md = d.market_data || {};
      const collision = !!pl.detected;
      const volt = VOLT_LABEL[pl.voltage] || pl.voltage || "—";
      const accentColor = collision ? "#e74c3c" : "#27ae60";
      const bgLight = collision ? "#fff5f5" : "#f5fff8";

      return `
      <div class="parcel-card" style="page-break-inside:avoid;break-inside:avoid;">
        <!-- LIGHT HEADER — colored top border + white bg -->
        <div class="parcel-header" style="background:#f8f9fc;border-top:4px solid ${collision ? '#e53935' : '#43a047'};border-bottom:1px solid #eef0f7;">
          <div class="parcel-header-left">
            <div class="parcel-num-badge" style="background:${collision ? '#fde8e8' : '#e8f5e9'};border:2px solid ${collision ? '#e53935' : '#43a047'};color:${collision ? '#c62828' : '#2e7d32'};font-size:12px;">#${i + 1}</div>
            <div>
              <div class="parcel-id" style="color:#3d2319;">${p.parcel_id || "—"}</div>
              <a href="https://mapy.geoportal.gov.pl/imap/Imgp_2.html?identifyParcel=${encodeURIComponent(p.parcel_id || "")}"
                 target="_blank" class="geo-link" style="color:#3498db;">🔗 geoportal</a>
            </div>
            <span class="collision-badge" style="background:${collision ? '#fde8e8' : '#e8f5e9'};color:${collision ? '#c62828' : '#2e7d32'};border:1px solid ${collision ? '#ef9a9a' : '#a5d6a7'};">
              ${collision ? "⚡ KOLIZJA" : "✓ BEZ KOLIZJI"}
            </span>
          </div>
          <div style="font-size:2em;color:${collision ? '#e53935' : '#43a047'};font-weight:900;line-height:1;opacity:0.18;user-select:none;">§</div>
        </div>

        <!-- BODY: 2-column grid (data left | map right) -->
        <div class="parcel-body-grid">

          <!-- LEFT: data grid + Track A/B/RAZEM -->
          <div style="display:flex;flex-direction:column;">
            <!-- Data grid 8 boxes -->
            <div style="padding:16px 20px 12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;flex:1;">
              <div class="data-box-v2" style="border-left:3px solid #3498db;">
                <div class="db-label">📐 Pow. działki</div>
                <div class="db-value">${fmtI(geom.area_m2)} m²</div>
              </div>
              <div class="data-box-v2" style="border-left:3px solid #8e44ad;">
                <div class="db-label">💰 Cena gruntu</div>
                <div class="db-value">${fmtN(md.average_price_m2)} zł/m²</div>
              </div>
              <div class="data-box-v2" style="border-left:3px solid #2c3e50;">
                <div class="db-label">🏠 Wartość nier.</div>
                <div class="db-value">${fmtI(ksws.property_value_total)} PLN</div>
              </div>
              <div class="data-box-v2" style="border-left:3px solid ${accentColor};background:${collision?'#fff5f5':'#f5fff8'};">
                <div class="db-label">⚡ Napięcie</div>
                <div class="db-value">${volt}</div>
              </div>
              <div class="data-box-v2" style="border-left:3px solid #16a085;">
                <div class="db-label">📏 Dł. linii</div>
                <div class="db-value">${(ksws.line_length_m || pl.length_m || 0) > 0 ? fmtI(ksws.line_length_m || pl.length_m) + " m" : "—"}</div>
                ${ksws.measurement_source && ksws.measurement_source !== "geodezyjne" ? `<span class="db-hint">⚠ ${ksws.measurement_source}</span>` : ""}
              </div>
              <div class="data-box-v2" style="border-left:3px solid #27ae60;">
                <div class="db-label">↔️ Szer. pasa</div>
                <div class="db-value">${ksws.band_width_m || "—"} m</div>
              </div>
              <div class="data-box-v2" style="border-left:3px solid #f39c12;">
                <div class="db-label">🔲 Pow. pasa</div>
                <div class="db-value">${(ksws.band_area_m2 || 0) > 0 ? fmtI(ksws.band_area_m2) + " m²" : "—"}</div>
              </div>
              <div class="data-box-v2" style="border-left:3px solid #e67e22;">
                <div class="db-label">📊 % w pasie</div>
                <div class="db-value">${geom.area_m2 > 0 && ksws.band_area_m2 > 0 ? Math.min(100, Math.round(ksws.band_area_m2 / geom.area_m2 * 100)) + "%" : "—"}</div>
              </div>
            </div>

            <!-- Track A / B / RAZEM -->
            <div style="padding:4px 20px 18px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
              <!-- Track A -->
              <div class="track-box-a">
                <div class="track-label" style="color:#5c7aaa;">⚖️ TRACK A · SĄD</div>
                <div class="track-amount-lg" style="color:#1565c0;font-size:20px;">${fmtN(ta.total)}</div>
                <div class="track-sub" style="color:#7f9bbf;font-weight:700;">PLN · ścieżka sądowa</div>
                <div style="margin-top:10px;padding-top:10px;border-top:1px solid #dce8ff;">
                  <div class="track-detail-row"><span class="tl">WSP służebność</span><span class="tv">${fmtN(ta.wsp)}</span></div>
                  <div class="track-detail-row"><span class="tl">WBK bezumowne</span><span class="tv">${fmtN(ta.wbk)}</span></div>
                  <div class="track-detail-row"><span class="tl">OBN obniżenie</span><span class="tv">${fmtN(ta.obn)}</span></div>
                </div>
              </div>
              <!-- Track B -->
              <div class="track-box-b">
                <div class="track-label" style="color:#b08050;">🤝 TRACK B · NEG.</div>
                <div class="track-amount-lg" style="color:#e65100;font-size:20px;">${fmtN(tb.total)}</div>
                <div class="track-sub" style="color:#c19060;font-weight:700;">PLN · negocjacje</div>
                <div style="margin-top:10px;padding-top:10px;border-top:1px solid #fde8c0;">
                  <div class="track-detail-row"><span class="tl">Podstawa (A)</span><span class="tv">${fmtN(ta.total)}</span></div>
                  <div class="track-detail-row"><span class="tl">Mnożnik</span><span class="tv">×${tb.multiplier || 1.80}</span></div>
                  <div class="track-detail-row"><span class="tl">Próg neg.</span><span class="tv" style="color:#e65100;">${fmtN(tb.total)}</span></div>
                </div>
              </div>
              <!-- RAZEM -->
              <div style="background:#3d2319;border-radius:10px;padding:14px;">
                <div class="track-label" style="color:rgba(255,193,7,0.85);">💰 RAZEM A+B</div>
                <div style="font-size:22px;font-weight:900;color:white;margin-top:4px;">${fmtN((ta.total || 0) + (tb.total || 0))}</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:2px;font-weight:700;">PLN · Track A + B łącznie</div>
              </div>
            </div>
          </div>

          <!-- RIGHT: mini Leaflet map (Topo + OIM power lines) -->
          <div class="map-col">
            <div id="parcel-map-${i}" style="height:100%;min-height:290px;"></div>
          </div>
        </div>
      </div>`;
    }).join("\n");

    const summaryRows = results.map((p, i) => {
      const d = p.master_record || p.data || {};
      const isError = d.status === "ERROR" || p.status === "ERROR";
      if (isError) {
        const errShort = (d.message || p.error || "Błąd").replace(/<[^>]+>/g, "").slice(0, 40);
        return `<tr style="border-bottom:1px solid #f0f0f0;background:#fff8f8;">
        <td style="padding:8px 12px;font-weight:600;">#${i+1} ${p.parcel_id || ""}</td>
        <td style="padding:8px 12px;text-align:center;">
          <span style="padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;background:#c62828;color:white;">BŁĄD</span>
        </td>
        <td colspan="3" style="padding:8px 12px;font-size:12px;color:#c62828;" title="${(d.message || p.error || "").replace(/"/g, "&quot;")}">— ${errShort}${(d.message || p.error || "").length > 40 ? "…" : ""}</td>
      </tr>`;
      }
      const ta = d.compensation?.track_a?.total || 0;
      const tb = d.compensation?.track_b?.total || 0;
      const collision = !!d.infrastructure?.power_lines?.detected;
      return `<tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:8px 12px;font-weight:600;">#${i+1} ${p.parcel_id || ""}</td>
        <td style="padding:8px 12px;text-align:center;">
          <span style="padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${collision?"#e74c3c":"#27ae60"};color:white;">
            ${collision ? "KOLIZJA" : "OK"}
          </span>
        </td>
        <td style="padding:8px 12px;text-align:right;color:#27ae60;font-weight:700;">${fmtN(ta)} PLN</td>
        <td style="padding:8px 12px;text-align:right;color:#e67e22;font-weight:700;">${fmtN(tb)} PLN</td>
        <td style="padding:8px 12px;text-align:right;font-weight:800;font-size:14px;">${fmtN(ta + tb)} PLN</td>
      </tr>`;
    }).join("\n");

    const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Szuwara KPP · Raport Zbiorczy KSWS — ${dateStr}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter','Segoe UI',Arial,sans-serif;background:#EDEDE9;color:#3d2319;font-size:14px;line-height:1.5}
@media print{
  body{background:white}
  .no-print{display:none!important}
  .parcel-card{page-break-inside:avoid;break-inside:avoid}
  .page-break{page-break-before:always;break-before:always}
  .report-header,.kpi-card,.razem-box,.track-a,.track-b,.collision-badge{
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
}
.wrap{max-width:1100px;margin:0 auto;padding:28px 20px 60px}
.print-bar{text-align:right;margin-bottom:20px}
.btn-print{background:linear-gradient(135deg,#b8963e,#d4af62);color:white;border:none;padding:10px 28px;border-radius:50px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(184,150,62,.4)}
.report-header{background:linear-gradient(135deg,#1a1a2e 0%,#2c3e50 60%,#1a2a5c 100%);color:white;padding:36px 44px;border-radius:16px;margin-bottom:28px;box-shadow:0 8px 30px rgba(0,0,0,.25);display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap}
.report-header h1{font-size:24px;font-weight:800;margin-bottom:6px;letter-spacing:-.5px}
.report-header .subtitle{font-size:13px;opacity:.8;margin-bottom:18px}
.meta-grid{display:grid;grid-template-columns:repeat(3,auto);gap:20px}
.meta-item{display:flex;flex-direction:column;gap:2px}
.meta-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;opacity:.65;font-weight:600}
.meta-value{font-size:13px;font-weight:600}
.header-badge-col{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0}
.badge{padding:5px 16px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:.8px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.15);color:white}
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:24px}
.kpi-card{border-radius:14px;padding:20px 18px;box-shadow:0 6px 20px rgba(0,0,0,.14);display:flex;justify-content:space-between;align-items:flex-start;position:relative;overflow:hidden}
.kpi-card.gold{background:linear-gradient(135deg,#f7971e,#ffd200)}
.kpi-card.red{background:linear-gradient(135deg,#e53935,#ef5350)}
.kpi-card.green{background:linear-gradient(135deg,#43a047,#66bb6a)}
.kpi-card.blue{background:linear-gradient(135deg,#1e88e5,#42a5f5)}
.kpi-card.purple{background:linear-gradient(135deg,#8e24aa,#ab47bc)}
.kpi-icon{width:42px;height:42px;border-radius:12px;background:rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.75);font-weight:700;margin-bottom:6px}
.kpi-value{font-size:26px;font-weight:900;color:white;line-height:1.1;margin-bottom:3px}
.kpi-value.sm{font-size:16px;font-weight:900;color:white}
.kpi-sub{font-size:10px;color:rgba(255,255,255,0.65);font-weight:500}
.section-title{font-size:15px;font-weight:700;color:#3d2319;margin:28px 0 14px;padding-bottom:10px;border-bottom:2px solid #a91079;display:flex;align-items:center;gap:8px}
.razem-banner{background:linear-gradient(135deg,#1a1a2e,#2c3e50);color:white;padding:22px 32px;border-radius:12px;text-align:center;margin-bottom:24px;box-shadow:0 4px 15px rgba(0,0,0,.15)}
.razem-banner-label{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;opacity:.65;margin-bottom:6px}
.razem-banner-amount{font-size:34px;font-weight:900;color:#f39c12}
.parcel-card{background:white;border-radius:16px;box-shadow:0 6px 28px rgba(0,0,0,.09);border:1px solid #e8eaf0;margin-bottom:24px;overflow:hidden}
.parcel-header{padding:14px 22px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.parcel-header-left{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.parcel-num-badge{width:36px;height:36px;border-radius:50%;color:white;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.parcel-id{font-size:15px;font-weight:800;color:#3d2319}
.parcel-sub{font-size:11px;color:#95a5a6;margin-top:2px}
.geo-link{font-size:11px;color:#3498db;text-decoration:none;font-weight:600}
.collision-badge{padding:4px 14px;border-radius:50px;font-size:12px;font-weight:700;letter-spacing:.5px;color:white}
.parcel-body-grid{display:grid;grid-template-columns:1fr 290px}
.data-box-v2{background:#f8f9fc;border-radius:10px;padding:10px 12px;border:1px solid #D6CCC2}
.db-label{font-size:10px;color:#95a5a6;margin-bottom:4px;text-transform:uppercase;letter-spacing:.7px;font-weight:700}
.db-value{font-size:13px;font-weight:800;color:#3d2319}
.db-hint{display:block;font-size:10px;color:#e67e22;font-weight:500;margin-top:2px}
.track-box-a{background:#eef4ff;border-radius:10px;padding:14px;border:1px solid #dce8ff}
.track-box-b{background:#fff8ee;border-radius:10px;padding:14px;border:1px solid #fde8c0}
.track-label{font-size:9px;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;margin-bottom:4px}
.track-amount-lg{font-size:16px;font-weight:900}
.track-sub{font-size:10px;color:#95a5a6;margin-top:2px}
.track-detail-row{display:flex;justify-content:space-between;font-size:11px;padding:2px 0}
.track-detail-row .tl{color:#7f8c8d}.track-detail-row .tv{font-weight:700}
.map-col{border-left:1px solid #eef0f3;min-height:280px;position:relative}
.map-badge{position:absolute;bottom:8px;left:8px;z-index:999;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;pointer-events:none;color:white}
.leaflet-container{height:100%;min-height:280px}
.summary-table{width:100%;border-collapse:collapse;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.07)}
.summary-table thead tr{background:#3d2319;color:white}
.summary-table thead th{padding:11px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px}
.summary-table tfoot tr{background:#EDEDE9;border-top:2px solid #3d2319}
.summary-table tfoot td{padding:12px;font-weight:800;font-size:14px}
.report-footer{text-align:center;margin-top:40px;font-size:11px;color:#95a5a6;padding:20px;border-top:1px solid #e8ecf0}
</style>
</head>
<body>
<div class="wrap">
  <div class="print-bar no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Drukuj / Zapisz PDF</button>
  </div>

  <div class="report-header">
    <div>
      <h1>📊 Raport Zbiorczy KSWS</h1>
      <div class="subtitle">Analiza ${results.length} działek z roszczeń przesyłowych</div>
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">📅 Data raportu</div>
          <div class="meta-value">${dateStr}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">📦 Działek</div>
          <div class="meta-value">${results.length}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">⚡ Kolizje</div>
          <div class="meta-value">${collisionCount}</div>
        </div>
      </div>
    </div>
    <div class="header-badge-col">
      <div style="text-align:right;margin-bottom:12px;">
        <div style="font-size:13px;color:#b8963e;font-weight:700;">www.kancelaria-szuwara.pl</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:2px;">tel. 790 411 412</div>
      </div>
      <span class="badge">✓ REAL DATA POLICY</span>
      <span class="badge">KSWS-V.5 · TK P 10/16</span>
    </div>
  </div>

  <!-- KPI -->
  <div class="kpi-row">
    <div class="kpi-card gold"><div><div class="kpi-label">Działek razem</div><div class="kpi-value">${results.length}</div><div class="kpi-sub">załadowanych z CSV</div></div><div class="kpi-icon">📦</div></div>
    <div class="kpi-card red"><div><div class="kpi-label">Z kolizją</div><div class="kpi-value">${collisionCount}</div><div class="kpi-sub">wykryta infrastr.</div></div><div class="kpi-icon">⚡</div></div>
    <div class="kpi-card green"><div><div class="kpi-label">Bez kolizji</div><div class="kpi-value">${results.length - collisionCount}</div><div class="kpi-sub">brak infrastruktury</div></div><div class="kpi-icon">✅</div></div>
    <div class="kpi-card blue"><div><div class="kpi-label">Track A · Sąd</div><div class="kpi-value sm">${fmtN(totalA)} PLN</div><div class="kpi-sub">ścieżka sądowa</div></div><div class="kpi-icon">⚖️</div></div>
    <div class="kpi-card purple"><div><div class="kpi-label">Track B · Neg.</div><div class="kpi-value sm">${fmtN(totalB)} PLN</div><div class="kpi-sub">negocjacje</div></div><div class="kpi-icon">🤝</div></div>
  </div>
  <div class="razem-banner">
    <div class="razem-banner-label">💰 Razem odszkodowanie (Track A + B)</div>
    <div class="razem-banner-amount">${fmtN(totalA + totalB)} PLN</div>
  </div>

  <!-- COLLECTIVE MAP VISUALIZATION -->
  <div class="section-title">🗺️ Mapa zbiorcza wszystkich działek</div>
  <div id="collective-map" style="height:500px;width:100%;margin:0 0 30px 0;border-radius:10px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.1);"></div>

  <!-- PER-PARCEL CARDS -->
  <div class="section-title">📋 Analiza poszczególnych działek</div>
  ${parcelCards}

  <!-- SUMMARY TABLE -->
  <div class="section-title page-break">📊 Zestawienie zbiorcze</div>
  <table class="summary-table">
    <thead>
      <tr>
        <th>Działka</th>
        <th>Status</th>
        <th>Track A — Sąd</th>
        <th>Track B — Negocjacje</th>
        <th>RAZEM</th>
      </tr>
    </thead>
    <tbody>${summaryRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">SUMA (${results.length} działek)</td>
        <td style="text-align:right;color:#27ae60;">${fmtN(totalA)} PLN</td>
        <td style="text-align:right;color:#e67e22;">${fmtN(totalB)} PLN</td>
        <td style="text-align:right;color:#3d2319;">${fmtN(totalA + totalB)} PLN</td>
      </tr>
    </tfoot>
  </table>

  <div class="report-footer">
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">
      <span style="width:28px;height:28px;border-radius:50%;border:1.5px solid #b8963e;display:inline-flex;align-items:center;justify-content:center;font-size:1rem;color:#b8963e;font-weight:800;">§</span>
      <strong style="font-size:13px;letter-spacing:1.5px;color:#3d2319;">SZUWARA</strong>
      <span style="color:#b8963e;font-size:11px;">Kancelaria Prawno-Podatkowa</span>
    </div>
    <a href="https://www.kancelaria-szuwara.pl" style="color:#b8963e;font-weight:700;">www.kancelaria-szuwara.pl</a>
    &nbsp;·&nbsp; tel. 790 411 412<br>
    Raport wygenerowany: <strong>${dateStr}</strong> · KALKULATOR KSWS v3.0 ·
    Dane: ULDK GUGiK, OSM Overpass, GUS BDL · Metodyka: KSWS-V.5 · TK P 10/16<br>
    <em>Dokument ma charakter informacyjno-analityczny i nie zastępuje operatu szacunkowego.</em>
  </div>
</div>

<script>
(function() {
  var PARCEL_MAPS = ${JSON.stringify(results.map(p => {
    const d = p.master_record || p.data || {};
    return {
      centroid: d.geometry?.centroid_ll,
      geojson: d.geometry?.geojson_ll || d.geometry?.geojson,
      collision: !!d.infrastructure?.power_lines?.detected,
    };
  }))};

  function initMaps() {
    if (typeof L === 'undefined') { setTimeout(initMaps, 300); return; }
    console.log('initMaps called, Leaflet version:', L.version, 'Maps to render:', PARCEL_MAPS.length);
    PARCEL_MAPS.forEach(function(parcel, i) {
      var el = document.getElementById('parcel-map-' + i);
      console.log('Parcel', i, '- Element found:', !!el, 'Data:', { centroid: parcel.centroid, hasGeoJSON: !!parcel.geojson, collision: parcel.collision });
      if (!el || el._leaflet_id) return;
      var center = [52.069, 19.480];
      if (Array.isArray(parcel.centroid) && parcel.centroid.length >= 2 && parcel.centroid[0] != null) {
        center = [Number(parcel.centroid[1]), Number(parcel.centroid[0])];
      } else if (parcel.geojson && parcel.geojson.coordinates) {
        try {
          var ring = parcel.geojson.type === 'Polygon' ? parcel.geojson.coordinates[0]
                   : parcel.geojson.type === 'MultiPolygon' ? parcel.geojson.coordinates[0][0] : null;
          if (ring && ring.length) {
            center = [ring.reduce(function(s,c){return s+c[1]},0)/ring.length,
                      ring.reduce(function(s,c){return s+c[0]},0)/ring.length];
          }
        } catch(e) {}
      }
      var map = L.map(el, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, dragging: false, doubleClickZoom: false });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { subdomains:'abcd', maxZoom:19 }).addTo(map);
      L.tileLayer.wms('https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow', { layers:'dzialki,numery_dzialek', format:'image/png', transparent:true, opacity:0.75 }).addTo(map);
      // Warstwa uzbrojenia terenu - Open Infrastructure Map (stabilne, zawsze dostępne)
      L.tileLayer('https://tiles.openinframap.org/power/{z}/{x}/{y}.png', { maxZoom:19, opacity:0.8, attribution:'© OpenStreetMap contributors' }).addTo(map);
      if (parcel.geojson && parcel.geojson.coordinates) {
        var color = parcel.collision ? '#e53935' : '#1e88e5';
        var layer = L.geoJSON(parcel.geojson, { style: { color: color, weight: 3, fillColor: color, fillOpacity: 0.12 } }).addTo(map);
        try { map.fitBounds(layer.getBounds(), { padding: [8, 8] }); } catch(e) { map.setView(center, 14); }
      } else {
        map.setView(center, 14);
      }
    });
  }

  function initCollectiveMap() {
    if (typeof L === 'undefined') { setTimeout(initCollectiveMap, 300); return; }
    var el = document.getElementById('collective-map');
    if (!el || el._leaflet_id) return;

    console.log('initCollectiveMap called');
    var map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      dragging: true,
      doubleClickZoom: true
    });

    // Base layers
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { subdomains:'abcd', maxZoom:19, attribution:'© Carto' }).addTo(map);
    L.tileLayer.wms('https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow',
      { layers:'dzialki,numery_dzialek', format:'image/png', transparent:true, opacity:0.75 }).addTo(map);

    // Infrastructure layers
    var powerLayer = L.tileLayer('https://tiles.openinframap.org/power/{z}/{x}/{y}.png',
      { maxZoom:19, opacity:0.8, attribution:'© OpenInfra' });
    var gasLayer = L.tileLayer('https://tiles.openinframap.org/gas/{z}/{x}/{y}.png',
      { maxZoom:19, opacity:0.7, attribution:'© OpenInfra' });
    var waterLayer = L.tileLayer('https://tiles.openinframap.org/water/{z}/{x}/{y}.png',
      { maxZoom:19, opacity:0.7, attribution:'© OpenInfra' });
    var sewerLayer = L.tileLayer('https://tiles.openinframap.org/sewer/{z}/{x}/{y}.png',
      { maxZoom:19, opacity:0.7, attribution:'© OpenInfra' });

    powerLayer.addTo(map);

    // Add all parcel boundaries to a FeatureGroup
    var parcelGroup = L.featureGroup();
    var allBounds = [];

    PARCEL_MAPS.forEach(function(parcel, i) {
      if (parcel.geojson && parcel.geojson.coordinates) {
        var color = parcel.collision ? '#e53935' : '#1e88e5';
        var layer = L.geoJSON(parcel.geojson, {
          style: {
            color: color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.15,
            dashArray: parcel.collision ? '5,5' : 'none'
          }
        });
        parcelGroup.addLayer(layer);
        try {
          var bounds = layer.getBounds();
          allBounds.push([bounds.getNorthWest(), bounds.getSouthEast()]);
        } catch(e) {}
      }
    });

    parcelGroup.addTo(map);

    // Fit all parcels in view
    if (allBounds.length > 0) {
      var group = L.featureGroup(PARCEL_MAPS.filter(p => p.geojson).map(p =>
        L.geoJSON(p.geojson)
      ));
      try { map.fitBounds(group.getBounds(), { padding: [50, 50] }); }
      catch(e) { map.setView([52.069, 19.480], 8); }
    } else {
      map.setView([52.069, 19.480], 8);
    }

    // Layer controls
    L.control.layers(
      { 'Mapa': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        { subdomains:'abcd', maxZoom:19 }) },
      {
        '⚡ Linie energetyczne (Power)': powerLayer,
        '🔥 Gaz (Gas)': gasLayer,
        '💧 Woda (Water)': waterLayer,
        '🚰 Kanalizacja (Sewer)': sewerLayer
      },
      { position: 'topright', collapsed: false }
    ).addTo(map);

    // Legend
    var legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function(map) {
      var div = L.DomUtil.create('div', 'info');
      div.style.backgroundColor = 'white';
      div.style.padding = '10px';
      div.style.borderRadius = '5px';
      div.style.fontSize = '12px';
      div.style.boxShadow = '0 0 15px rgba(0,0,0,0.2)';
      div.innerHTML = '<strong>Legenda</strong><br>' +
        '<span style="color:#e53935;font-weight:bold;">— — —</span> Z kolizją (collision)<br>' +
        '<span style="color:#1e88e5;font-weight:bold;">———</span> Bez kolizji (no collision)';
      return div;
    };
    legend.addTo(map);

    console.log('Collective map initialized with', PARCEL_MAPS.length, 'parcels');
  }

  if (document.readyState === 'complete') { initMaps(); initCollectiveMap(); }
  else { window.addEventListener('load', function() { initMaps(); initCollectiveMap(); }); }
})();
</script>
</body>
</html>`;

    // Use Blob URL for reliable external script loading
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, '_blank');
    if (!win) {
      toast.error("Zablokowano popup — zezwól na okienka dla tej strony");
      return;
    }
    toast.success(`Raport otwarty — ${results.length} działek · użyj Ctrl+P by zapisać PDF`);
  };

  return (
    <div className="batch-history-container">
      <div className="history-header">
        <h2>📁 Historia analiz zbiorczych</h2>
        <p>Wcześniej wykonane analizy CSV — kliknij by załadować raport z mapami</p>
      </div>

      {loading ? (
        <div className="loading-container">
          <Spinner color="light" />
          <p>Ładowanie historii...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="empty-state">
          <p>📭 Brak historii analiz</p>
          <p>Wykonaj nową analizę CSV w sekcji „Batch CSV”</p>
          <p className="hint">Wyniki analiz zbiorczych będą zapisywane automatycznie</p>
        </div>
      ) : (
        <div className="history-content">
          <div className="history-table">
            {history.map((item, idx) => (
              <div key={item.batch_id} className="history-row">
                <div className="row-number">{idx + 1}</div>
                <div className="row-content">
                  <div className="row-header">
                    <div className="timestamp">
                      📅 {new Date(item.timestamp).toLocaleDateString("pl-PL", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="file-name">📄 {item.file_name}</div>
                  </div>
                  <div className="row-stats">
                    <Badge color="info" pill>
                      📦 {item.total} działek
                    </Badge>
                    <Badge color="success" pill>
                      ✓ {item.successful} analizowanych
                    </Badge>
                  </div>
                </div>
                <Button
                  color="primary"
                  size="sm"
                  onClick={() => loadBatchDetails(item.batch_id)}
                  className="view-button"
                  aria-label={`Otwórz raport: ${item.total} działek, ${item.file_name || item.batch_id}, ${new Date(item.timestamp).toLocaleDateString("pl-PL")}`}
                  title={`Otwórz raport z mapami (${item.total} działek)`}
                >
                  📊 Otwórz raport
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
