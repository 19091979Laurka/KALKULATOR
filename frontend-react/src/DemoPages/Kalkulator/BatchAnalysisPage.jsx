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
    <div class="tl">💰 Przedział roszczenia (wybór Track A lub B — nie sumować)</div>
    <div class="tv">${ta.toLocaleString("pl-PL")} – ${tb.toLocaleString("pl-PL")} PLN</div>
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
const BatchAnalysisPage = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [editedLengths, setEditedLengths] = useState({});
  const [activeTab, setActiveTab] = useState("table");
  const [pastedList, setPastedList] = useState("");
  const [batchClientName, setBatchClientName] = useState("");
  const [batchClientId, setBatchClientId] = useState("");
  const [batchIsFarmer, setBatchIsFarmer] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && (f.name.endsWith(".csv") || f.type === "text/csv")) setFile(f);
  }, []);

  const runPasteAnalysis = useCallback(async () => {
    const lines = pastedList.trim().split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0 || !batchClientName.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setEditedLengths({});
    try {
      const header = "parcel_id,obreb,county,municipality";
      const rows = lines.slice(0, 99).map(l => (l.includes(",") ? l : `${l},,,`));
      const csv = [header, ...rows].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const formData = new FormData();
      formData.append("file", blob, "batch_dzialki.csv");
      if (batchClientName.trim()) formData.append("client_name", batchClientName.trim());
      if (batchClientId.trim()) formData.append("client_id", batchClientId.trim());
      formData.append("is_farmer", batchIsFarmer ? "1" : "0");
      const res = await fetch("/api/analyze/batch", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
      if (!json.ok) throw new Error(json.error || "Błąd analizy");
      setResults(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pastedList, batchClientName, batchClientId, batchIsFarmer]);

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setEditedLengths({});
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (batchClientName.trim()) formData.append("client_name", batchClientName.trim());
      if (batchClientId.trim()) formData.append("client_id", batchClientId.trim());
      formData.append("is_farmer", batchIsFarmer ? "1" : "0");
      const res = await fetch("/api/analyze/batch", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
      if (!json.ok) throw new Error(json.error || "Błąd analizy");
      setResults(json);
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

  // Compute totals using edited lengths
  const totals = results?.parcels
    ? results.parcels.reduce((acc, p) => {
        const mr = p.data || {};
        const geom = mr.geometry || {};
        const mkt = mr.market_data || {};
        const infra = mr.infrastructure || {};
        const pwr = infra.power || {};
        const ksws = mr.ksws || {};
        const area = geom.area_m2 || 0;
        const price = mkt.average_price_m2 || 0;
        const infra_type = ksws.infra_type || "elektro_SN";
        const editedLen = editedLengths[p.parcel_id];
        const lineLen = editedLen !== undefined && editedLen !== null ? editedLen : (pwr.line_length_m || 0);
        const calc = recalcKSWS(area, price, lineLen, infra_type);
        acc.track_a += calc.track_a;
        acc.track_b += calc.track_b;
        if (infra.power_lines?.detected || lineLen > 0) acc.collision++;
        acc.total++;
        return acc;
      }, { track_a: 0, track_b: 0, collision: 0, total: 0 })
    : null;

  return (
    <div className="batch-page">
      {/* ── HEADER ── */}
      <header className="batch-page__header">
        <h1 className="batch-page__title">📊 Analiza Zbiorcza KSWS</h1>
        <p className="batch-page__sub">
          Wgraj plik CSV lub wklej listę działek. System automatycznie pobierze dane z <strong>ULDK, OSM i GUS</strong>.
        </p>
      </header>

      <div className="batch-page__content">
        {/* ── UPLOAD SECTION ── */}
        {!results && !loading && (
          <div className="batch-results">
            <div className="batch-card batch-card--upload">
              <h3 className="batch-card__heading">1. Wybierz plik lub wklej dane</h3>
              
              <div 
                className={`batch-drop ${file ? "batch-drop--filled" : ""}`}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="batch-drop__label">
                  <span className="batch-drop__placeholder">
                    {file ? `📎 ${file.name}` : "📂 Kliknij lub przeciągnij plik CSV"}
                  </span>
                  <span className="batch-drop__hint">
                    Format: parcel_id (pełny TERYT), obręb, nr działki (maks. 99)
                  </span>
                </div>
                <input
                  id="csv-input"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="batch-drop__input"
                  onChange={handleFileChange}
                />
              </div>

              <details className="batch-paste">
                <summary className="batch-paste__summary">Albo wklej listę identyfikatorów…</summary>
                <div className="batch-paste__inner">
                  <textarea
                    className="batch-paste__textarea"
                    value={pastedList}
                    onChange={e => setPastedList(e.target.value)}
                    placeholder="np. 142003_2.0002.81/5&#10;81/6&#10;303/4"
                    rows={4}
                  />
                </div>
              </details>
            </div>

            <div className="batch-card batch-card--settings">
              <h3 className="batch-card__heading">2. Ustawienia raportu</h3>
              
              <div className="batch-settings">
                <div className="batch-field">
                  <label className="batch-field__label">
                    Nazwa raportu / Klienta <span className="batch-field__required">*</span>
                  </label>
                  <input
                    type="text"
                    className="batch-field__input"
                    value={batchClientName}
                    onChange={e => setBatchClientName(e.target.value)}
                    placeholder="np. Kowalski — Batch 01"
                  />
                </div>
                
                <div className="batch-field">
                  <label className="batch-field__label">ID klienta (CRM)</label>
                  <input
                    type="text"
                    className="batch-field__input"
                    value={batchClientId}
                    onChange={e => setBatchClientId(e.target.value)}
                    placeholder="opcjonalnie"
                  />
                </div>
              </div>

              <label className="batch-checkbox">
                <input 
                  type="checkbox" 
                  className="batch-checkbox__input"
                  checked={batchIsFarmer} 
                  onChange={e => setBatchIsFarmer(e.target.checked)} 
                />
                <span className="batch-checkbox__label">
                  🌾 Gospodarstwo rolne — uwzględnij szkodę rolną (R5)
                </span>
              </label>

              {error && <div className="batch-alert batch-alert--error">❌ {error}</div>}

              <button
                className="batch-btn batch-btn--primary"
                disabled={(!file && !pastedList.trim()) || loading || !batchClientName.trim()}
                onClick={file ? handleSubmit : runPasteAnalysis}
              >
                🚀 Uruchom analizę zbiorczą
              </button>

              <div className="batch-links" style={{ marginTop: "24px" }}>
                <button className="batch-link" onClick={() => navigate("/kalkulator/historia")}>
                  📋 Historia raportów
                </button>
                <button className="batch-link" onClick={() => {
                  const header = "parcel_id,obreb,county,municipality";
                  const rows = ["142003_2.0002.81/5,Baboszewo,,", "303/4,Niedarzyn,,"];
                  const csv = [header, ...rows].join("\n");
                  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "szablon_kalkulator.csv";
                  a.click();
                }}>
                  ⬇ Pobierz szablon CSV
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── LOADING STATE ── */}
        {loading && (
          <div className="batch-results batch-results--skeleton">
            <div className="dash-section">
              <h3 className="dash-section__title">Trwa analiza danych…</h3>
              <p className="dash-section__sub">Pobieranie geometrii z ULDK, linii z OSM oraz transakcji rynkowych.</p>
              
              <div className="dash-progress dash-progress--xl">
                <div className="dash-progress__track dash-progress__track--striped">
                  <div className="dash-progress__bar dash-progress__bar--indeterminate"></div>
                </div>
              </div>
              <p className="batch-loading-hint">Szacowany czas: 30s – 2min (zależnie od liczby działek)</p>
            </div>

            <div className="batch-summary-card batch-summary-card--skeleton">
               <div className="batch-skeleton batch-skeleton--text" style={{ marginBottom: "12px" }}></div>
               <div className="batch-skeleton batch-skeleton--text" style={{ height: "60px", width: "100%", maxWidth: "400px" }}></div>
            </div>

            <div className="batch-kpi-row">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="batch-skeleton batch-skeleton--chip"></div>
              ))}
            </div>
            
            <div className="batch-skeleton batch-skeleton--tabs"></div>
            <div style={{ marginTop: "20px" }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="batch-skeleton batch-skeleton--row"></div>
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS STATE ── */}
        {results && totals && !loading && (
          <div className="batch-results">
            <div className="batch-summary-card">
              <div className="batch-summary-card__total">
                <span className="batch-summary-card__label">💰 Sumaryczny przedział roszczenia (Track A + B)</span>
                <span className="batch-summary-card__value">
                  {Math.round(totals.track_a).toLocaleString("pl-PL")} – {Math.round(totals.track_b).toLocaleString("pl-PL")} PLN
                </span>
              </div>
              
              <div className="batch-summary-card__tracks">
                <div className="batch-summary-card__track batch-summary-card__track--a">
                  <span className="batch-summary-card__track-label">⚖️ Track A (Sąd)</span>
                  <span className="batch-summary-card__track-value">{Math.round(totals.track_a).toLocaleString("pl-PL")} zł</span>
                </div>
                <div className="batch-summary-card__track batch-summary-card__track--b">
                  <span className="batch-summary-card__track-label">🤝 Track B (Neg.)</span>
                  <span className="batch-summary-card__track-value">{Math.round(totals.track_b).toLocaleString("pl-PL")} zł</span>
                </div>
              </div>
            </div>

            <div className="batch-kpi-row">
              <div className="batch-kpi-chip">
                <span className="batch-kpi-chip__value">{totals.total}</span>
                <span className="batch-kpi-chip__label">Razem</span>
              </div>
              <div className="batch-kpi-chip">
                <span className="batch-kpi-chip__value" style={{ color: "var(--dash-success)" }}>
                  {results.summary?.successful || 0}
                </span>
                <span className="batch-kpi-chip__label">OK</span>
              </div>
              <div className="batch-kpi-chip">
                <span className="batch-kpi-chip__value" style={{ color: "var(--dash-error)" }}>
                  {results.summary?.failed || 0}
                </span>
                <span className="batch-kpi-chip__label">Błędów</span>
              </div>
              <div className="batch-kpi-chip">
                <span className="batch-kpi-chip__value" style={{ color: "var(--dash-warning)" }}>
                  {totals.collision}
                </span>
                <span className="batch-kpi-chip__label">Kolizje</span>
              </div>
            </div>

            <div className="batch-tabs-wrap">
              <div className="batch-tabs">
                <button 
                  className={`batch-tab ${activeTab === "table" ? "batch-tab--active" : ""}`} 
                  onClick={() => setActiveTab("table")}
                >
                  📋 Tabela
                </button>
                <button 
                  className={`batch-tab ${activeTab === "info" ? "batch-tab--active" : ""}`} 
                  onClick={() => setActiveTab("info")}
                >
                  ℹ️ Info
                </button>
              </div>

              <div className="batch-tabs-actions">
                <button className="batch-action-link" onClick={() => downloadCSV(results.parcels, editedLengths)}>
                  ⬇ Pobierz CSV
                </button>
                <button className="batch-action-link" onClick={() => setResults(null)}>
                  🔄 Nowa analiza
                </button>
              </div>
            </div>

            {activeTab === "table" && (
              <div className="batch-tab-panel batch-tab-panel--table">
                <h4 className="batch-table-title">Szczegółowe zestawienie działek</h4>
                <div className="batch-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th className="results-table__th">Identyfikator</th>
                        <th className="results-table__th results-table__th--center">Kolizja</th>
                        <th className="results-table__th results-table__th--center">KV</th>
                        <th className="results-table__th results-table__th--right">Pow (m²)</th>
                        <th className="results-table__th results-table__th--right">PLN/m²</th>
                        <th className="results-table__th results-table__th--right results-table__th--input">
                          Długość (m)
                          <span className="results-table__th-hint">edytowalne</span>
                        </th>
                        <th className="results-table__th results-table__th--right">Pas (m²)</th>
                        <th className="results-table__th results-table__th--right">Track A</th>
                        <th className="results-table__th results-table__th--right">Track B</th>
                        <th className="results-table__th results-table__th--center">Akcja</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.parcels.map((p, i) => {
                        const isErr = p.status === "ERROR";
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

                        if (isErr) {
                          return (
                            <tr key={i} className="results-table__row results-table__row--error">
                              <td className="results-table__td"><strong>{p.parcel_id}</strong></td>
                              <td colSpan={9} className="results-table__td" style={{ color: "var(--batch-error)" }}>
                                ❌ {p.error || p.data?.message || "Błąd integracji"}
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={i} className={`results-table__row ${collision ? "results-table__row--collision" : ""}`}>
                            <td className="results-table__td">
                              <strong>{p.parcel_id}</strong>
                              {needsInput && <div style={{ fontSize: "10px", color: "#e67e22", marginTop: 2 }}>⚠ Wpisz dł.</div>}
                            </td>
                            <td className="results-table__td results-table__th--center">
                              {collision ? "⚡" : "—"}
                            </td>
                            <td className="results-table__td results-table__th--center">{pl.voltage || "—"}</td>
                            <td className="results-table__td results-table__th--right">{Math.round(area).toLocaleString("pl-PL")}</td>
                            <td className="results-table__td results-table__th--right">{price ? price.toFixed(2) : "—"}</td>
                            <td className="results-table__td results-table__th--right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={editedLen !== undefined && editedLen !== null ? editedLen : (autoLen > 0 ? autoLen : "")}
                                placeholder={needsInput ? "wpisz m" : "0"}
                                onChange={e => handleLengthChange(p.parcel_id, e.target.value)}
                                style={{
                                  width: 70, border: needsInput ? "2px solid #e67e22" : "1px solid #cbd5e1",
                                  borderRadius: 4, textAlign: "right", fontSize: "12px", padding: "2px 4px"
                                }}
                              />
                            </td>
                            <td className="results-table__td results-table__th--right">
                              {calc.band_area > 0 ? calc.band_area.toLocaleString("pl-PL") : "—"}
                            </td>
                            <td className="results-table__td results-table__th--right" style={{ color: "#166534", fontWeight: 700 }}>
                              {calc.track_a > 0 ? calc.track_a.toLocaleString("pl-PL") : "—"}
                            </td>
                            <td className="results-table__td results-table__th--right" style={{ color: "#9a3412", fontWeight: 700 }}>
                              {calc.track_b > 0 ? calc.track_b.toLocaleString("pl-PL") : "—"}
                            </td>
                            <td className="results-table__td results-table__th--center">
                              <button
                                className="batch-btn batch-btn--secondary"
                                style={{ padding: "4px 8px", fontSize: "11px" }}
                                onClick={() => downloadParcelHtml(p, lineLen > 0 ? lineLen : null)}
                              >
                                ⬇ HTML
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "info" && (
              <div className="batch-tab-panel batch-tab-panel--info">
                <h3>ℹ️ O analizie hurtowej</h3>
                <ul>
                  <li>Maksymalna liczba działek w jednym pliku: <strong>99</strong></li>
                  <li>System pobiera geometrię z ULDK i dopasowuje linie napowietrzne z OSM.</li>
                  <li>Dla każdej działki obliczane są dwa warianty (Track A i B).</li>
                  <li>Odszkodowanie (Track A+B) to przedział roszczenia, nie suma.</li>
                </ul>
                <hr />
                <h3>📡 Integracje zewnętrzne</h3>
                <ul>
                  <li><strong>ULDK GUGiK:</strong> Geometria i pole powierzchni.</li>
                  <li><strong>OSM Overpass:</strong> Wektorowe linie elektroenergetyczne.</li>
                  <li><strong>KIUT WMS:</strong> Dodatkowa weryfikacja istnienia sieci nN.</li>
                  <li><strong>GUS BDL / RCN:</strong> Ceny rynkowe gruntów.</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchAnalysisPage;
