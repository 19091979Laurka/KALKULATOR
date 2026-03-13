import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./BatchAnalysisPage.css";

// ─── KSWS coefficients (muszą być zsynchronizowane z backend/modules/property.py) ───
const KSWS_STANDARDS = {
  elektro_WN: { S: 0.250, k: 0.650, R: 0.060, impact: 0.073, band_width: 30, track_b_mult: 1.80, label: "Linie 110-400 kV" },
  elektro_SN: { S: 0.200, k: 0.500, R: 0.060, impact: 0.050, band_width: 10, track_b_mult: 1.56, label: "Linie 15-30 kV" },
  elektro_nN: { S: 0.100, k: 0.400, R: 0.060, impact: 0.025, band_width: 5,  track_b_mult: 1.30, label: "Linie <1 kV" },
  gaz_wysokie: { S: 0.350, k: 0.600, R: 0.050, impact: 0.120, band_width: 15, track_b_mult: 2.00, label: "Gazociągi >1.6 MPa" },
  default:     { S: 0.250, k: 0.500, R: 0.060, impact: 0.073, band_width: 10, track_b_mult: 1.56, label: "Typ nieznany" },
};

function recalcKSWS(area_m2, price_m2, lineLength, infra_type) {
  const c = KSWS_STANDARDS[infra_type] || KSWS_STANDARDS.default;
  const propVal = (price_m2 || 0) * (area_m2 || 0);
  const bandArea = (lineLength || 0) * c.band_width;
  if (!lineLength || lineLength <= 0 || !area_m2) {
    return { track_a: 0, track_b: 0, band_area: 0, band_width: c.band_width };
  }
  const ratio = bandArea / area_m2;
  const wsp = propVal * c.S * c.k * ratio;
  const wbk = propVal * c.R * c.k * ratio * 10;
  const obn = propVal * c.impact * 1;
  const track_a = wsp + wbk + obn;
  const track_b = track_a * c.track_b_mult;
  return { track_a: Math.round(track_a), track_b: Math.round(track_b), band_area: Math.round(bandArea), band_width: c.band_width };
}

function fmtPLN(v) {
  if (!v && v !== 0) return "—";
  return Math.round(v).toLocaleString("pl-PL") + " zł";
}

function fmtM2(v) {
  if (!v && v !== 0) return "—";
  return Math.round(v).toLocaleString("pl-PL") + " m²";
}

function nowPL() {
  return new Date().toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

// ─── Generuj standalone HTML raport dla jednej działki ───────────────────────
function buildParcelHtml(parcel, editedLen) {
  const mr = parcel.data || {};
  const ksws = mr.ksws || {};
  const comp = mr.compensation || {};
  const infra = mr.infrastructure || {};
  const pl = infra.power_lines || {};
  const pwr = infra.power || {};
  const geom = mr.geometry || {};
  const mkt = mr.market_data || {};
  const meta = mr.parcel_metadata || {};

  const area = geom.area_m2 || 0;
  const price = mkt.average_price_m2 || 0;
  const infra_type = ksws.infra_type || "elektro_SN";
  const lineLen = editedLen !== undefined && editedLen !== null ? editedLen : (pwr.line_length_m || 0);
  const calc = recalcKSWS(area, price, lineLen, infra_type);
  const ta = calc.track_a;
  const tb = calc.track_b;
  const now = new Date().toLocaleString("pl-PL");

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8"/>
<title>Raport KSWS — ${parcel.parcel_id}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f8f5f0;color:#111;padding:30px}
  .wrap{max-width:900px;margin:0 auto}
  .header{background:linear-gradient(135deg,#5c3d2e,#b8963e);color:#fff;padding:30px 35px;border-radius:12px;margin-bottom:24px}
  .header h1{font-size:1.6em;margin-bottom:6px}
  .header .sub{opacity:.8;font-size:.95em}
  .section{background:#fff;border-radius:10px;padding:24px;margin-bottom:18px;border:1px solid #ede8e3}
  .section h2{font-size:1.05em;color:#5c3d2e;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #b8963e}
  .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f5ebe0;font-size:.9em}
  .row:last-child{border-bottom:none}
  .row .lbl{color:#888}
  .row .val{font-weight:600}
  .track-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:4px}
  .track-a{background:linear-gradient(135deg,#27ae60,#2ecc71);color:#fff;padding:20px;border-radius:8px;text-align:center}
  .track-b{background:linear-gradient(135deg,#e67e22,#f39c12);color:#fff;padding:20px;border-radius:8px;text-align:center}
  .track-label{font-size:.85em;opacity:.85;margin-bottom:6px}
  .track-val{font-size:2em;font-weight:800}
  .total-box{background:linear-gradient(135deg,#2c3e50,#34495e);color:#fff;padding:22px;border-radius:10px;text-align:center;margin-bottom:18px}
  .total-box .tl{font-size:1em;opacity:.8;margin-bottom:6px}
  .total-box .tv{font-size:2.8em;font-weight:800;letter-spacing:-1px}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:.8em;font-weight:700}
  .badge-yes{background:#e8f5e9;color:#27ae60}
  .badge-no{background:#fce4e4;color:#c0392b}
  .badge-warn{background:#fff3e0;color:#e67e22}
  .footer{text-align:center;color:#aaa;font-size:.8em;margin-top:24px}
  table{width:100%;border-collapse:collapse;font-size:.88em}
  th{background:#5c3d2e;color:#fff;padding:8px 10px;text-align:left}
  td{padding:7px 10px;border-bottom:1px solid #ede8e3}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>📋 Raport KSWS — Roszczenie Odszkodowawcze</h1>
    <div class="sub">Działka: <strong>${parcel.parcel_id}</strong> &nbsp;·&nbsp; ${meta.commune || ""}${meta.county ? ", " + meta.county : ""} &nbsp;·&nbsp; Wygenerowano: ${now}</div>
  </div>

  <div class="total-box">
    <div class="tl">💰 ŁĄCZNE ROSZCZENIE (Track A + Track B)</div>
    <div class="tv">${(ta + tb).toLocaleString("pl-PL")} PLN</div>
  </div>

  <div class="track-grid" style="margin-bottom:18px">
    <div class="track-a">
      <div class="track-label">⚖️ Track A — Ścieżka sądowa</div>
      <div class="track-val">${ta.toLocaleString("pl-PL")} PLN</div>
    </div>
    <div class="track-b">
      <div class="track-label">🤝 Track B — Negocjacyjna</div>
      <div class="track-val">${tb.toLocaleString("pl-PL")} PLN</div>
    </div>
  </div>

  <div class="section">
    <h2>📐 Dane działki</h2>
    <div class="row"><span class="lbl">ID (TERYT):</span><span class="val">${parcel.parcel_id}</span></div>
    <div class="row"><span class="lbl">Gmina / Powiat:</span><span class="val">${meta.commune || "—"} / ${meta.county || "—"}</span></div>
    <div class="row"><span class="lbl">Województwo:</span><span class="val">${meta.region || "—"}</span></div>
    <div class="row"><span class="lbl">Powierzchnia:</span><span class="val">${Math.round(area).toLocaleString("pl-PL")} m²</span></div>
    <div class="row"><span class="lbl">Cena rynkowa:</span><span class="val">${price ? price.toFixed(2) + " PLN/m²" : "—"} <small style="color:#888">(${mkt.price_source || ""})</small></span></div>
    <div class="row"><span class="lbl">Wartość nieruchomości:</span><span class="val">${Math.round(price * area).toLocaleString("pl-PL")} PLN</span></div>
  </div>

  <div class="section">
    <h2>⚡ Infrastruktura</h2>
    <div class="row"><span class="lbl">Kolizja z linią:</span><span class="val">
      ${pl.detected ? '<span class="badge badge-yes">✓ TAK</span>' : pl.detected === false && lineLen > 0 ? '<span class="badge badge-warn">⚠ ręcznie</span>' : '<span class="badge badge-no">✗ NIE / brak danych</span>'}
    </span></div>
    <div class="row"><span class="lbl">Napięcie:</span><span class="val">${pl.voltage || "—"}</span></div>
    <div class="row"><span class="lbl">Typ sieci:</span><span class="val">${(KSWS_STANDARDS[infra_type] || KSWS_STANDARDS.default).label}</span></div>
    <div class="row"><span class="lbl">Długość linii w działce:</span><span class="val">${lineLen > 0 ? lineLen.toFixed(1) + " m" : "—"} <small style="color:#e67e22">${lineLen <= 0 ? "(brak danych — wprowadź ręcznie)" : ""}</small></span></div>
    <div class="row"><span class="lbl">Szerokość pasa ochronnego:</span><span class="val">${calc.band_width} m</span></div>
    <div class="row"><span class="lbl">Powierzchnia pasa:</span><span class="val">${calc.band_area > 0 ? calc.band_area.toLocaleString("pl-PL") + " m²" : "—"}</span></div>
    <div class="row"><span class="lbl">Status danych:</span><span class="val"><small>${pl.status || ksws.measurement_source || "—"}</small></span></div>
  </div>

  <div class="section">
    <h2>🧮 Kalkulacja KSWS</h2>
    <table>
      <thead><tr><th>Składnik</th><th>Symbol</th><th>Wartość [PLN]</th><th>Opis</th></tr></thead>
      <tbody>
        <tr><td>Wynagrodzenie służebności przesyłu</td><td>WSP</td><td><strong>${Math.round(recalcKSWSBreakdown(area, price, lineLen, infra_type).wsp).toLocaleString("pl-PL")}</strong></td><td>W × S × k × (pas/dz)</td></tr>
        <tr><td>Wynagrodzenie za bezumowne korzystanie</td><td>WBK</td><td><strong>${Math.round(recalcKSWSBreakdown(area, price, lineLen, infra_type).wbk).toLocaleString("pl-PL")}</strong></td><td>W × R × k × (pas/dz) × 10 lat</td></tr>
        <tr><td>Odszkodowanie za obniżenie wartości</td><td>OBN</td><td><strong>${Math.round(recalcKSWSBreakdown(area, price, lineLen, infra_type).obn).toLocaleString("pl-PL")}</strong></td><td>W × α × (lata/10)</td></tr>
        <tr style="background:#f5f5f5"><td><strong>Track A — Sądowa</strong></td><td></td><td><strong style="color:#27ae60">${ta.toLocaleString("pl-PL")}</strong></td><td>WSP + WBK + OBN</td></tr>
        <tr><td><strong>Track B — Negocjacyjna</strong></td><td></td><td><strong style="color:#e67e22">${tb.toLocaleString("pl-PL")}</strong></td><td>Track A × ${(KSWS_STANDARDS[infra_type] || KSWS_STANDARDS.default).track_b_mult}</td></tr>
      </tbody>
    </table>
    <div style="margin-top:10px;font-size:.82em;color:#888">
      Współczynniki: S=${(KSWS_STANDARDS[infra_type] || KSWS_STANDARDS.default).S}, k=${(KSWS_STANDARDS[infra_type] || KSWS_STANDARDS.default).k}, R=${(KSWS_STANDARDS[infra_type] || KSWS_STANDARDS.default).R} | Standard KSWS-V.5
    </div>
  </div>

  <div class="footer">
    Raport wygenerowany przez <strong>Kalkulator KSWS v3.0</strong> · ${now}<br/>
    SZUWARA Kancelaria Prawno-Podatkowa · Wyłącznie do celów informacyjnych
  </div>
</div>
</body>
</html>`;
}

// Helper for breakdown
function recalcKSWSBreakdown(area_m2, price_m2, lineLength, infra_type) {
  const c = KSWS_STANDARDS[infra_type] || KSWS_STANDARDS.default;
  const propVal = (price_m2 || 0) * (area_m2 || 0);
  const bandArea = (lineLength || 0) * c.band_width;
  if (!lineLength || !area_m2) return { wsp: 0, wbk: 0, obn: 0 };
  const ratio = bandArea / area_m2;
  return {
    wsp: propVal * c.S * c.k * ratio,
    wbk: propVal * c.R * c.k * ratio * 10,
    obn: propVal * c.impact * 1,
  };
}

function downloadParcelHtml(parcel, editedLen) {
  const html = buildParcelHtml(parcel, editedLen);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `KSWS_${parcel.parcel_id.replace(/[/.]/g, "_")}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function downloadParcelPdf(parcel) {
  if (!parcel || !parcel.data) return;
  try {
    const res = await fetch("/api/report/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parcels: [{ parcel_id: parcel.parcel_id, master_record: parcel.data }],
        owner_name: "Właściciel",
        kw_number: "",
        address: "",
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `raport_KSWS_${parcel.parcel_id.replace(/[/.]/g, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    // Prosty komunikat błędu — ten widok jest narzędziowy
    alert("Błąd generowania PDF: " + e.message);
  }
}

// ─── CSV download all results ─────────────────────────────────────────────────
function downloadCSV(parcels, editedLengths) {
  const header = ["parcel_id","kolizja","napiecie","pow_m2","cena_m2","dlugosc_linii_m","pas_m","pas_m2","track_a","track_b","razem","status"].join(";");
  const rows = parcels.map(p => {
    const mr = p.data || {};
    const geom = mr.geometry || {};
    const mkt = mr.market_data || {};
    const infra = mr.infrastructure || {};
    const pl = infra.power_lines || {};
    const pwr = infra.power || {};
    const ksws = mr.ksws || {};
    const infra_type = ksws.infra_type || "elektro_SN";
    const area = geom.area_m2 || 0;
    const price = mkt.average_price_m2 || 0;
    const editedLen = editedLengths[p.parcel_id];
    const lineLen = editedLen !== undefined && editedLen !== null ? editedLen : (pwr.line_length_m || 0);
    const calc = recalcKSWS(area, price, lineLen, infra_type);
    return [
      p.parcel_id,
      pl.detected ? "TAK" : "NIE",
      pl.voltage || "—",
      Math.round(area),
      price ? price.toFixed(2) : "—",
      lineLen > 0 ? lineLen.toFixed(1) : "0",
      calc.band_width,
      calc.band_area,
      calc.track_a,
      calc.track_b,
      calc.track_a + calc.track_b,
      p.status || "REAL",
    ].join(";");
  });
  const csv = "\uFEFF" + header + "\n" + rows.join("\n"); // BOM dla Excel
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `KSWS_batch_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────
const BATCH_HISTORY_KEY = "batch_history";

const BatchAnalysisPage = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [editedLengths, setEditedLengths] = useState({});
  const [activeTab, setActiveTab] = useState("table");
  const [historyVersion, setHistoryVersion] = useState(0);
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [pastedList, setPastedList] = useState("");
  const fileInputRef = useRef(null);

  const saveBatchToHistory = useCallback((json) => {
    try {
      const batchHistory = JSON.parse(localStorage.getItem(BATCH_HISTORY_KEY) || "[]");
      const parcels = json.parcels || [];
      const trackA = parcels.reduce((s, p) => s + (p.data?.compensation?.track_a?.total ?? 0), 0);
      const trackB = parcels.reduce((s, p) => s + (p.data?.compensation?.track_b?.total ?? 0), 0);
      const collision = parcels.filter(p => !!p.data?.infrastructure?.power_lines?.detected).length;
      const newBatch = {
        id: `batch_${Date.now()}`,
        date: nowPL(),
        title: "",
        parcel_count: json.summary?.total ?? parcels.length,
        successful: json.summary?.successful ?? 0,
        full_data: parcels,
        summary: { trackA, trackB, total: trackA + trackB, collision },
      };
      const updated = [newBatch, ...batchHistory].slice(0, 10);
      localStorage.setItem(BATCH_HISTORY_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Batch history save:", e);
    }
  }, []);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const runPasteAnalysis = async () => {
    const lines = pastedList.trim().split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    const csv = "parcel_id,obreb,county,municipality\n" + lines.map((id) => `${id},,,`).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const f = new File([blob], "lista_dzialek.csv", { type: "text/csv" });
    setLoading(true);
    setError(null);
    setResults(null);
    setEditedLengths({});
    try {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch("/api/analyze/batch", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
      if (!json.ok) throw new Error(json.error || "Błąd analizy");
      setResults(json);
      saveBatchToHistory(json);
      setPastedList("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && (f.name.endsWith(".csv") || f.type === "text/csv")) setFile(f);
  }, []);

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setEditedLengths({});
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/analyze/batch", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
      if (!json.ok) throw new Error(json.error || "Błąd analizy");
      setResults(json);
      saveBatchToHistory(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLengthChange = (parcel_id, val) => {
    const n = parseFloat(val);
    setEditedLengths(prev => ({ ...prev, [parcel_id]: isNaN(n) ? null : n }));
  };

  // Totals: bez korekt długości = kwoty z API (jak Oferty hurtowe i PDF). Z korektami = recalc.
  const hasEditedLengths = results?.parcels && Object.keys(editedLengths).some(id => editedLengths[id] != null);
  const totals = results?.parcels
    ? results.parcels.reduce((acc, p) => {
        const mr = p.data || {};
        const geom = mr.geometry || {};
        const mkt = mr.market_data || {};
        const infra = mr.infrastructure || {};
        const pwr = infra.power || {};
        const ksws = mr.ksws || {};
        const comp = mr.compensation || {};
        const area = geom.area_m2 || 0;
        const price = mkt.average_price_m2 || 0;
        const infra_type = ksws.infra_type || "elektro_SN";
        const editedLen = editedLengths[p.parcel_id];
        const lineLen = editedLen !== undefined && editedLen !== null ? editedLen : (pwr.line_length_m || 0);
        const calc = recalcKSWS(area, price, lineLen, infra_type);
        acc.track_a_api += (comp.track_a?.total ?? 0);
        acc.track_b_api += (comp.track_b?.total ?? 0);
        acc.track_a_recalc += calc.track_a;
        acc.track_b_recalc += calc.track_b;
        if (infra.power_lines?.detected || lineLen > 0) acc.collision++;
        acc.total++;
        return acc;
      }, { track_a_api: 0, track_b_api: 0, track_a_recalc: 0, track_b_recalc: 0, collision: 0, total: 0 })
    : null;

  const displayTrackA = totals && (hasEditedLengths ? totals.track_a_recalc : totals.track_a_api);
  const displayTrackB = totals && (hasEditedLengths ? totals.track_b_recalc : totals.track_b_api);

  return (
    <div className="batch-wrapper">
      {/* ── HEADER ── */}
      <div className="batch-header">
        <h1>📊 Analiza hurtowa</h1>
        <p>Wgraj plik CSV lub wklej listę działek — wygeneruje raport Oferty hurtowe · Batch CSV i zapisze w Historii raportów poniżej</p>
      </div>

      {/* ── UPLOAD SECTION ── */}
      {!results && (
        <div className="batch-upload-section">
          <div className="upload-box"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}>
            <label
              className="file-label"
              htmlFor="csv-input"
              onClick={() => fileInputRef.current?.click()}>
              {file
                ? `📎 ${file.name}`
                : "📂 Kliknij lub przeciągnij plik CSV"}
              <div style={{ fontSize: "0.8em", fontWeight: 400, marginTop: 6, color: "#9e8b83" }}>
                Kolumny: <strong>parcel_id</strong> (wymagany), <strong>obręb</strong> (zalecany przy numerze bez TERYT), powiat, gmina · maks. 99 wierszy
              </div>
            </label>
            <input
              id="csv-input"
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>

          {error && <div className="error-box">❌ {error}</div>}

          <button
            className="submit-btn"
            disabled={!file || loading}
            onClick={handleSubmit}>
            {loading ? "⏳ Analizuję działki..." : "🚀 Analizuj działki"}
          </button>

          {loading && (
            <p className="file-info">
              Pobieranie danych z ULDK, OSM Overpass i GUS BDL — może potrwać 1-3 min dla większych zbiorów...
            </p>
          )}

          <p className="file-info" style={{ marginTop: 16 }}>
            <strong>Albo wklej listę działek</strong> (jeden numer w linii lub po przecinku / średniku):
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <textarea
              value={pastedList}
              onChange={(e) => setPastedList(e.target.value)}
              placeholder={"np. 142003_2.0002.81/5\n81/6\n303/4"}
              rows={3}
              style={{ flex: "1 1 280px", minWidth: 200, padding: 12, borderRadius: 8, border: "1px solid #D6CCC2", fontFamily: "inherit", fontSize: "0.9em" }}
            />
            <button
              type="button"
              className="submit-btn"
              disabled={!pastedList.trim() || loading}
              onClick={runPasteAnalysis}
              style={{ alignSelf: "flex-end" }}
            >
              {loading ? "⏳ Analizuję..." : "🚀 Analizuj z listy"}
            </button>
          </div>
          <p className="file-info">
            Przykład: pełny TERYT <code>142003_2.0002.81/5</code> lub numer + obręb <code>81/5,Baboszewo</code>.{" "}
            <button
              type="button"
              className="tab-download"
              style={{ marginLeft: 6, padding: "2px 8px", fontSize: "0.85em" }}
              onClick={() => {
                const header = "parcel_id,obreb,county,municipality";
                const rows = ["142003_2.0002.81/5,Baboszewo,,", "303/4,Niedarzyn,,"];
                const csv = [header, ...rows].join("\n");
                const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "szablon_batch_dzialki.csv";
                a.click();
                URL.revokeObjectURL(a.href);
              }}>
              ⬇ Pobierz szablon CSV
            </button>
          </p>
          <p className="file-info" style={{ marginTop: 12 }}>
            <button type="button" className="tab-download" style={{ fontSize: "0.85em" }} onClick={() => navigate("/kalkulator/historia")}>
              📋 Historia analiz zbiorczych — otwórz raport z mapami
            </button>
          </p>
        </div>
      )}

      {/* ── RESULTS ── */}
      {results && totals && (
        <div className="results-section">
          {/* Stats row */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-value">{totals.total}</div>
              <div className="stat-label">Działek</div>
            </div>
            <div className="stat-card success">
              <div className="stat-value" style={{ color: "#27ae60" }}>{results.summary?.successful || 0}</div>
              <div className="stat-label">Pobrano dane</div>
            </div>
            <div className="stat-card orange">
              <div className="stat-value" style={{ color: "#e67e22" }}>{totals.collision}</div>
              <div className="stat-label">Kolizja z linią</div>
            </div>
            <div className="stat-card money">
              <div className="stat-value" style={{ fontSize: "1.4em" }}>{Math.round(displayTrackA).toLocaleString("pl-PL")}</div>
              <div className="stat-label">Track A [PLN]</div>
            </div>
            <div className="stat-card money2">
              <div className="stat-value" style={{ fontSize: "1.4em" }}>{Math.round(displayTrackB).toLocaleString("pl-PL")}</div>
              <div className="stat-label">Track B [PLN]</div>
            </div>
          </div>

          {/* Total box — ta sama kwota co w Oferty hurtowe i PDF (API), chyba że są korekty długości */}
          <div className="summary-box">
            <div className="summary-title">💰 ŁĄCZNE ROSZCZENIA (Track A + Track B){hasEditedLengths ? " (po korekcie długości)" : ""}</div>
            <div className="summary-value">{Math.round(displayTrackA + displayTrackB).toLocaleString("pl-PL")} PLN</div>
          </div>

          {/* Tabs — Raport = szablon jak Oferty hurtowe (mapa, KPI, Odszkodowanie wg działki, Łączne roszczenie) */}
          <div className="tabs">
            <button className={`tab${activeTab === "raport" ? " active" : ""}`} onClick={() => setActiveTab("raport")}>
              📊 Raport
            </button>
            <button className={`tab${activeTab === "table" ? " active" : ""}`} onClick={() => setActiveTab("table")}>
              📋 Tabela działek
            </button>
            <button className={`tab${activeTab === "info" ? " active" : ""}`} onClick={() => setActiveTab("info")}>
              ℹ️ Info o analizie
            </button>
            <button className="tab-download" onClick={() => downloadCSV(results.parcels, editedLengths)}>
              ⬇️ Pobierz CSV
            </button>
            <button className="tab-download" style={{ marginLeft: 6 }} onClick={() => setResults(null)}>
              🔄 Nowa analiza
            </button>
          </div>

          {/* RAPORT TAB — szablon jak Oferty hurtowe (zob. RAPORTY_MIEJSCA_WZORY.md sekcja 4) */}
          {activeTab === "raport" && (
            <div style={{ background: "#f0f3f8", borderRadius: 16, padding: 20, marginTop: 16 }}>
              {/* KPI cards — jak Oferty hurtowe */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 18 }}>
                {[
                  { label: "Działek", value: totals.total, sub: "załadowanych z CSV", icon: "📦", grad: "linear-gradient(135deg,#f7971e,#ffd200)" },
                  { label: "Kolizji", value: totals.collision, sub: "wykryta infrastr.", icon: "⚡", grad: "linear-gradient(135deg,#e53935,#ef5350)" },
                  { label: "Bez kol.", value: totals.total - totals.collision, sub: "brak infrastruktury", icon: "✅", grad: "linear-gradient(135deg,#43a047,#66bb6a)" },
                  { label: "Track A", value: fmtPLN(displayTrackA), sub: "ścieżka sądowa", icon: "⚖️", grad: "linear-gradient(135deg,#1e88e5,#42a5f5)" },
                  { label: "Track B", value: fmtPLN(displayTrackB), sub: "negocjacje", icon: "🤝", grad: "linear-gradient(135deg,#8e24aa,#ab47bc)" },
                ].map((k, i) => (
                  <div key={i} style={{ background: k.grad, borderRadius: 14, padding: "20px 18px", boxShadow: "0 6px 20px rgba(0,0,0,0.14)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "0.6em", textTransform: "uppercase", letterSpacing: "1.2px", color: "rgba(255,255,255,0.75)", fontWeight: 700, marginBottom: 6 }}>{k.label}</div>
                      <div style={{ fontSize: typeof k.value === "number" ? "2.2em" : "1.15em", fontWeight: 900, color: "white", lineHeight: 1.1 }}>{k.value}</div>
                      <div style={{ fontSize: "0.62em", color: "rgba(255,255,255,0.65)" }}>{k.sub}</div>
                    </div>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3em" }}>{k.icon}</div>
                  </div>
                ))}
              </div>
              {/* Odszkodowanie wg działki + Łączne roszczenie */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14 }}>
                <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize: "0.75em", fontWeight: 700, color: "#3d2319", marginBottom: 14 }}>📊 Odszkodowanie wg działki</div>
                  {results.parcels.filter(p => p.status !== "ERROR").slice(0, 12).map((p, i) => {
                    const mr = p.data || {};
                    const geom = mr.geometry || {};
                    const mkt = mr.market_data || {};
                    const ksws = mr.ksws || {};
                    const pwr = mr.infrastructure?.power || {};
                    const editedLen = editedLengths[p.parcel_id];
                    const lineLen = editedLen !== undefined && editedLen !== null ? editedLen : (pwr.line_length_m || 0);
                    const calc = recalcKSWS(geom.area_m2 || 0, mkt.average_price_m2 || 0, lineLen, ksws.infra_type || "elektro_SN");
                    const razem = calc.track_a + calc.track_b;
                    const collision = !!mr.infrastructure?.power_lines?.detected;
                    const shortId = (p.parcel_id || "").split(".").pop() || p.parcel_id;
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px", gap: 8, alignItems: "center", marginBottom: 7 }}>
                        <div style={{ fontSize: "0.72em", color: "#636e72", fontWeight: 600 }} title={p.parcel_id}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: collision ? "#e74c3c" : "#27ae60", marginRight: 5, verticalAlign: "middle" }} />
                          {shortId}
                        </div>
                        <div style={{ background: "#f4f6f8", borderRadius: 4, height: 20, position: "relative", overflow: "hidden" }}>
                          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${razem > 0 ? (calc.track_a / razem * 100) : 0}%`, background: "#3498db", borderRadius: "4px 0 0 4px" }} />
                          <div style={{ position: "absolute", left: `${calc.track_a / (razem || 1) * 100}%`, top: 0, bottom: 0, width: `${razem > 0 ? (calc.track_b / razem * 100) : 0}%`, background: "#f39c12" }} />
                        </div>
                        <div style={{ fontSize: "0.73em", fontWeight: 700, color: "#3d2319", textAlign: "right" }}>{Math.round(razem / 1000).toLocaleString()}k PLN</div>
                      </div>
                    );
                  })}
                  {results.parcels.filter(p => p.status !== "ERROR").length > 12 && (
                    <div style={{ fontSize: "0.68em", color: "#95a5a6", textAlign: "center", paddingTop: 6 }}>+ {results.parcels.filter(p => p.status !== "ERROR").length - 12} kolejnych działek</div>
                  )}
                  <div style={{ display: "flex", gap: 16, marginTop: 8, paddingTop: 8, borderTop: "1px solid #f0f0f0", fontSize: "0.68em", color: "#636e72" }}>
                    <span><span style={{ display: "inline-block", width: 12, height: 8, background: "#3498db", borderRadius: 2, marginRight: 4 }} />Track A</span>
                    <span><span style={{ display: "inline-block", width: 12, height: 8, background: "#f39c12", borderRadius: 2, marginRight: 4 }} />Track B</span>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#e74c3c", marginRight: 4 }} />Kolizja</span>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#27ae60", marginRight: 4 }} />Bez kol.</span>
                  </div>
                </div>
                <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 1px 6px rgba(0,0,0,0.06)", minWidth: 220 }}>
                  <div style={{ fontSize: "0.75em", fontWeight: 700, color: "#3d2319", marginBottom: 16 }}>💰 Łączne roszczenie</div>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: "0.62em", textTransform: "uppercase", letterSpacing: 1, color: "#95a5a6", fontWeight: 700 }}>Razem (A+B)</div>
                    <div style={{ fontSize: "1.65em", fontWeight: 900, color: "#3d2319" }}>{fmtPLN(displayTrackA + displayTrackB)}</div>
                  </div>
                  <div style={{ borderTop: "1px solid #f0f2f5", paddingTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <div><div style={{ fontSize: "0.62em", color: "#95a5a6", fontWeight: 600 }}>⚖️ Track A</div><div style={{ fontWeight: 800, color: "#2c3e50" }}>{fmtPLN(displayTrackA)}</div></div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div><div style={{ fontSize: "0.62em", color: "#95a5a6", fontWeight: 600 }}>🤝 Track B</div><div style={{ fontWeight: 800, color: "#e67e22" }}>{fmtPLN(displayTrackB)}</div></div>
                    </div>
                  </div>
                  <p style={{ fontSize: "0.8em", color: "#7f8c8d", marginTop: 16 }}>Raport PDF zbiorczy i mapa — z poziomu Oferty hurtowe (szablon w docelowej wersji).</p>
                </div>
              </div>
            </div>
          )}

          {/* TABLE TAB */}
          {activeTab === "table" && (
            <div className="table-box">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Działka</th>
                    <th style={{ textAlign: "center" }}>Kolizja</th>
                    <th style={{ textAlign: "center" }}>Napięcie</th>
                    <th style={{ textAlign: "right" }}>Pow. [m²]</th>
                    <th style={{ textAlign: "right" }}>Cena [PLN/m²]</th>
                    <th style={{ textAlign: "right", minWidth: 110 }}>
                      Dł. linii [m]
                      <div style={{ fontSize: "0.7em", fontWeight: 400, color: "#D5BDAF" }}>edytowalne</div>
                    </th>
                    <th style={{ textAlign: "right" }}>Pas [m]</th>
                    <th style={{ textAlign: "right" }}>Pas [m²]</th>
                    <th style={{ textAlign: "right" }}>Track A</th>
                    <th style={{ textAlign: "right" }}>Track B</th>
                    <th style={{ textAlign: "right" }}>Razem</th>
                    <th style={{ textAlign: "center" }}>Raport</th>
                  </tr>
                </thead>
                <tbody>
                  {results.parcels.map((p, i) => {
                    if (p.status === "ERROR") {
                      return (
                        <tr key={i}>
                          <td><strong>{p.parcel_id}</strong></td>
                          <td colSpan={11} style={{ color: "#c0392b" }}>
                            ❌ Błąd: {p.error}
                          </td>
                        </tr>
                      );
                    }

                    const mr = p.data || {};
                    const geom = mr.geometry || {};
                    const mkt = mr.market_data || {};
                    const infra = mr.infrastructure || {};
                    const pl = infra.power_lines || {};
                    const pwr = infra.power || {};
                    const ksws = mr.ksws || {};
                    const infra_type = ksws.infra_type || "elektro_SN";

                    const area = geom.area_m2 || 0;
                    const price = mkt.average_price_m2 || 0;

                    const editedLen = editedLengths[p.parcel_id];
                    const autoLen = pwr.line_length_m || 0;
                    const lineLen = editedLen !== undefined && editedLen !== null ? editedLen : autoLen;
                    const calc = recalcKSWS(area, price, lineLen, infra_type);
                    const collision = pl.detected || lineLen > 0;
                    const needsInput = pl.detected && autoLen <= 0 && (editedLen === undefined || editedLen === null);

                    return (
                      <tr key={i} className={collision ? "collision" : ""}>
                        <td>
                          <strong>{p.parcel_id}</strong>
                          {needsInput && (
                            <div style={{ fontSize: "0.72em", color: "#e67e22", marginTop: 2 }}>
                              ⚠ Wpisz długość linii
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {collision
                            ? <span style={{ color: "#27ae60", fontWeight: 700 }}>✓</span>
                            : <span style={{ color: "#bbb" }}>—</span>}
                        </td>
                        <td style={{ textAlign: "center" }}>{pl.voltage || "—"}</td>
                        <td style={{ textAlign: "right" }}>{Math.round(area).toLocaleString("pl-PL")}</td>
                        <td style={{ textAlign: "right" }}>{price ? price.toFixed(2) : "—"}</td>
                        <td style={{ textAlign: "right", padding: "8px 10px" }}>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={editedLen !== undefined && editedLen !== null ? editedLen : (autoLen > 0 ? autoLen : "")}
                            placeholder={needsInput ? "⚠ brak" : "0"}
                            onChange={e => handleLengthChange(p.parcel_id, e.target.value)}
                            style={{
                              width: 80,
                              padding: "4px 6px",
                              border: needsInput ? "2px solid #e67e22" : "1px solid #D6CCC2",
                              borderRadius: 5,
                              textAlign: "right",
                              fontSize: "0.9em",
                              background: needsInput ? "#fff8f0" : "#fff",
                            }}
                          />
                        </td>
                        <td style={{ textAlign: "right" }}>{calc.band_width}</td>
                        <td style={{ textAlign: "right" }}>
                          {calc.band_area > 0 ? calc.band_area.toLocaleString("pl-PL") : "—"}
                        </td>
                        <td style={{ textAlign: "right", color: "#27ae60", fontWeight: 700 }}>
                          {calc.track_a > 0 ? calc.track_a.toLocaleString("pl-PL") : "—"}
                        </td>
                        <td style={{ textAlign: "right", color: "#b8963e", fontWeight: 700 }}>
                          {calc.track_b > 0 ? calc.track_b.toLocaleString("pl-PL") : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 800 }}>
                          {(calc.track_a + calc.track_b) > 0
                            ? (calc.track_a + calc.track_b).toLocaleString("pl-PL")
                            : "—"}
                        </td>
                        <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => downloadParcelHtml(p, lineLen > 0 ? lineLen : null)}
                            title="Pobierz raport HTML do podglądu / PDF z przeglądarki"
                            style={{
                              background: "linear-gradient(135deg,#5c3d2e,#b8963e)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              padding: "5px 8px",
                              cursor: "pointer",
                              fontSize: "0.8em",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}>
                            ⬇ HTML
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* INFO TAB */}
          {activeTab === "info" && (
            <div className="content-box">
              <h3>ℹ️ Informacje o analizie</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.9em" }}>
                <div><strong>Batch ID:</strong> {results.batch_id}</div>
                <div><strong>Czas analizy:</strong> {new Date(results.timestamp).toLocaleString("pl-PL")}</div>
                <div><strong>Działek ogółem:</strong> {results.summary?.total}</div>
                <div><strong>Zakończonych sukcesem:</strong> {results.summary?.successful}</div>
                <div><strong>Błędów:</strong> {results.summary?.failed}</div>
              </div>
              <hr style={{ margin: "16px 0", border: "0", borderTop: "1px solid #ede8e3" }} />
              <h3>📡 Źródła danych</h3>
              <ul style={{ fontSize: "0.88em", lineHeight: 1.8, paddingLeft: 20, marginTop: 8 }}>
                <li><strong>Geometria działek:</strong> ULDK GUGiK (uldk.gugik.gov.pl)</li>
                <li><strong>Linie energetyczne:</strong> OpenStreetMap Overpass API (wektory)</li>
                <li><strong>Ceny gruntów:</strong> GUS BDL / RCN GUGiK (transakcje lokalne)</li>
                <li><strong>Planowanie przestrzenne:</strong> planowanie.gov.pl</li>
                <li><strong>Współczynniki KSWS:</strong> Standard KSWS-V.5 (wbudowane)</li>
              </ul>
              <hr style={{ margin: "16px 0", border: "0", borderTop: "1px solid #ede8e3" }} />
              <h3>✏️ Edycja długości linii</h3>
              <p style={{ fontSize: "0.88em", lineHeight: 1.6, marginTop: 8 }}>
                Gdy detekcja automatyczna (OSM) nie wykryje linii lub jej długość wynosi 0,
                należy wpisać długość ręcznie na podstawie geoportalu lub dokumentacji inwestora.
                Po wpisaniu wartości Track A/B przeliczają się automatycznie w tabeli.
                Użyj przycisku <strong>"⬇ HTML"</strong> by pobrać raport z zaktualizowanymi wartościami.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Historia raportów dla hurtowych dostępna jest w osobnej zakładce „Historia raportów” w sidebarze. */}
    </div>
  );
};

export default BatchAnalysisPage;
