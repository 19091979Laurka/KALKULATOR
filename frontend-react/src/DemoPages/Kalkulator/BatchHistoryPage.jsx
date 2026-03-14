import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import "./BatchHistoryPage.css";
import { buildSingleHtml } from "./HistoriaAnalizPage";
import { BASE_LAYERS, GUGIK_WMS, OIM_TILES } from "./mapSources";

/* Pasek listy: history-row--replaceable — Manus może podmienić na własny komponent (zachowaj: duża nazwa klienta, PRZYPISZ DO CRM, Otwórz raport). */

export default function BatchHistoryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

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
    const results = Array.isArray(batchData?.results) ? batchData.results : [];
    const dateStr = new Date(batchData?.timestamp || Date.now()).toLocaleDateString("pl-PL");
    const isFarmerReport = batchData?.is_farmer === true;

    const fmtN = (v) => (v || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const safeScriptJson = (obj) => JSON.stringify(obj).replace(/<\/script/gi, "<\\/script");
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
      <div class="parcel-card page-break" style="page-break-inside:avoid;break-inside:avoid;">
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
      const power = d.infrastructure?.power || {};
      const ksws = d.ksws || {};
      const geom = d.geometry || {};
      const md = d.market_data || {};
      const meta = d.parcel_metadata || {};
      const collision = !!(pl.detected || power.exists);
      const volt = VOLT_LABEL[pl.voltage] || pl.voltage || "—";
      const accentColor = collision ? "#e74c3c" : "#27ae60";
      
      const area = geom.area_m2 || 0;
      const price = md.average_price_m2 || 0;
      const trackA = ta.total || 0;
      const trackB = tb.total || 0;
      const priceErr = (price == null || price === 0) && (md.status || "") !== "Korekta ręczna";

      return `
      <div class="parcel-card page-break" style="page-break-inside:avoid;break-inside:avoid; background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #eee; margin-bottom: 30px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-bottom: 2px solid #eee; padding-bottom: 12px; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <span style="background: #1a2a3a; color: white; padding: 6px 12px; border-radius: 6px; font-weight: 800; font-size: 14px;">RAPORT DZIAŁKI ${i + 1}</span>
            <span style="font-size: 18px; font-weight: 800; color: #2c3e50;">${p.parcel_id || "—"}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button type="button" class="btn-pdf no-print" data-parcel-index="${i}" style="background: linear-gradient(135deg,#b8963e,#d4af62); color: white; border: none; padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px rgba(184,150,62,0.4);">📄 Otwórz Raport</button>
            <span style="background: ${collision ? '#ffebee' : '#e8f5e9'}; color: ${collision ? '#c0392b' : '#27ae60'}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid ${collision ? '#ffcdd2' : '#c8e6c9'};">
              ${collision ? "⚡ KOLIZJA" : "✓ BEZ KOLIZJI"}
            </span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px;">
          <div style="background: white; border-radius: 8px; padding: 12px; border: 1px solid #eee; border-top: 3px solid #3498db;">
            <div style="font-size: 9px; text-transform: uppercase; color: #7f8c8d; font-weight: 600; margin-bottom: 4px;">Powierzchnia</div>
            <div style="font-size: 18px; font-weight: 800; color: #2c3e50;">${fmtI(area)} m²</div>
          </div>
          <div style="background: white; border-radius: 8px; padding: 12px; border: 1px solid #eee; border-top: 3px solid #2ecc71;">
            <div style="font-size: 9px; text-transform: uppercase; color: #7f8c8d; font-weight: 600; margin-bottom: 4px;">Klasa Gruntu</div>
            <div style="font-size: 18px; font-weight: 800; color: #2c3e50;">${meta.land_use || "R"}</div>
          </div>
          <div style="background: white; border-radius: 8px; padding: 12px; border: 1px solid #eee; border-top: 3px solid #e74c3c;">
            <div style="font-size: 9px; text-transform: uppercase; color: #7f8c8d; font-weight: 600; margin-bottom: 4px;">Sieci Przesyłowe</div>
            <div style="font-size: 18px; font-weight: 800; color: #2c3e50;">${pl.voltage || "Brak"}</div>
          </div>
          <div style="background: white; border-radius: 8px; padding: 12px; border: 1px solid #eee; border-top: 3px solid #f1c40f;">
            <div style="font-size: 9px; text-transform: uppercase; color: #7f8c8d; font-weight: 600; margin-bottom: 4px;">Cena Rynkowa</div>
            <div style="font-size: 18px; font-weight: 800; color: #2c3e50;">${priceErr ? "Błąd integracji (GUS)" : fmtN(price) + " zł/m²"}</div>
            ${priceErr ? '<div style="font-size:10px;color:#c62828;margin-top:4px;">Dane nie pobrane z GUS BDL</div>' : ""}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 300px; gap: 20px; margin-bottom: 20px;">
          <div style="background: #f9f9f9; border-radius: 8px; border: 1px solid #eee; display: flex; flex-direction: column;">
            <div style="padding: 10px 14px; font-weight: 700; font-size: 12px; border-bottom: 1px solid #eee;">🗺️ Mapa działki</div>
            <div id="parcel-map-${i}" style="width: 100%; flex: 1; min-height: 250px; border-radius: 0 0 8px 8px;"></div>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="background: white; border: 1px solid #eee; border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; gap: 10px;">
              <div style="width: 28px; height: 28px; background: #3498db; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px;">🗺️</div>
              <div style="flex: 1;">
                <div style="font-size: 9px; color: #7f8c8d; text-transform: uppercase; font-weight: 600;">Geometria</div>
                <div style="font-size: 12px; font-weight: 700;">${fmtI(area)} m²</div>
              </div>
            </div>
            <div style="background: white; border: 1px solid #eee; border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; gap: 10px;">
              <div style="width: 28px; height: 28px; background: #e74c3c; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px;">⚡</div>
              <div style="flex: 1;">
                <div style="font-size: 9px; color: #7f8c8d; text-transform: uppercase; font-weight: 600;">Infrastruktura</div>
                <div style="font-size: 12px; font-weight: 700;">${collision ? 'Wykryto' : 'Brak'} — ${pl.voltage || ""}</div>
              </div>
            </div>
            <div style="background: white; border: 1px solid #eee; border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; gap: 10px;">
              <div style="width: 28px; height: 28px; background: #9b59b6; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px;">📏</div>
              <div style="flex: 1;">
                <div style="font-size: 9px; color: #7f8c8d; text-transform: uppercase; font-weight: 600;">Długość linii na działce</div>
                <div style="font-size: 12px; font-weight: 700;">${fmtI(ksws.line_length_m || pl.length_m || 0)} m</div>
              </div>
            </div>
            <div style="background: white; border: 1px solid #eee; border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; gap: 10px;">
              <div style="width: 28px; height: 28px; background: #e67e22; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px;">🔲</div>
              <div style="flex: 1;">
                <div style="font-size: 9px; color: #7f8c8d; text-transform: uppercase; font-weight: 600;">Powierzchnia pasa</div>
                <div style="font-size: 12px; font-weight: 700;">${fmtI(ksws.band_area_m2 || 0)} m²</div>
              </div>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div style="border: 1px solid #eee; border-radius: 8px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="font-size: 13px; font-weight: 700; color: #2c3e50;">Track A — Ścieżka sądowa</div>
              <div style="background: #eef4ff; color: #3498db; padding: 3px 8px; border-radius: 12px; font-size: 9px; font-weight: 700;">SĄD</div>
            </div>
            <div style="font-size: 22px; font-weight: 800; color: #2c3e50; margin-bottom: 12px;">${fmtN(trackA)} PLN</div>
            <div style="border-top: 1px solid #eee; padding-top: 8px; font-size: 11px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #7f8c8d;">WSP</span><span style="font-weight: 600;">${fmtN(ta.wsp || 0)} PLN</span></div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #7f8c8d;">WBK</span><span style="font-weight: 600;">${fmtN(ta.wbk || 0)} PLN</span></div>
              <div style="display: flex; justify-content: space-between;"><span style="color: #7f8c8d;">OBN</span><span style="font-weight: 600;">${fmtN(ta.obn || 0)} PLN</span></div>
            </div>
          </div>
          
          <div style="border: 1px solid #fde4c3; border-radius: 8px; padding: 16px; background: #fffaf0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="font-size: 13px; font-weight: 700; color: #8d6e3f;">Track B — Ścieżka negocjacyjna</div>
              <div style="background: #fde4c3; color: #d35400; padding: 3px 8px; border-radius: 12px; font-size: 9px; font-weight: 700;">NEGOCJACJE</div>
            </div>
            <div style="font-size: 22px; font-weight: 800; color: #d35400; margin-bottom: 12px;">${fmtN(trackB)} PLN</div>
            <div style="font-size: 11px; color: #7f8c8d;">
              Mnożnik Track B: <strong>${tb.multiplier || 1.56}</strong>
            </div>
          </div>
        </div>

      </div>`;
    }).join("\n");

    // Dane do wykresów kwotowych (działki z kwotą Track B > 0, posortowane malejąco)
    const parcelsForChart = results
      .filter((p) => {
        const d = p.master_record || p.data || {};
        return d.status !== "ERROR" && p.status !== "ERROR" && (d.compensation?.track_b?.total || 0) > 0;
      })
      .map((p) => {
        const d = p.master_record || p.data || {};
        const tb = d.compensation?.track_b?.total || 0;
        const shortId = (p.parcel_id || "").split(/[._]/).slice(-2).join(".") || p.parcel_id || "—";
        return { shortId: shortId.length > 14 ? shortId.slice(0, 12) + "…" : shortId, trackB: tb };
      })
      .sort((a, b) => b.trackB - a.trackB)
      .slice(0, 12);

    // Zestawienie zbiorcze — kolumny jak w „Tabela działek”: Kolizja, Napięcie, Pow., Cena, Dł. linii, Pas [m], Pas [m²], Track A, Track B, Razem, Status
    const summaryRows = results.map((p, i) => {
      const d = p.master_record || p.data || {};
      const isError = d.status === "ERROR" || p.status === "ERROR";
      const pl = d.infrastructure?.power_lines || {};
      const power = d.infrastructure?.power || {};
      const ksws = d.ksws || {};
      const geom = d.geometry || {};
      const md = d.market_data || {};
      const collision = !!(pl.detected || power.exists);
      const volt = VOLT_LABEL[pl.voltage] || pl.voltage || "—";
      const area = geom?.area_m2 ?? 0;
      const price = md?.average_price_m2;
      const priceStr = (price != null && price !== 0) ? fmtN(price) : "—";
      const lineLen = ksws?.line_length_m ?? pl?.length_m ?? 0;
      const bandM = ksws?.band_width_m ?? "—";
      const bandM2 = ksws?.band_area_m2 ?? 0;
      const ta = d.compensation?.track_a?.total ?? 0;
      const tb = d.compensation?.track_b?.total ?? 0;
      const razem = ta + tb;

      if (isError) {
        return `<tr style="border-bottom:1px solid #f0f0f0;background:#fff8f8;">
        <td style="padding:8px 10px;font-weight:600;">${i + 1}</td>
        <td style="padding:8px 10px;font-weight:600;">${(p.parcel_id || "—").replace(/</g, "&lt;")}</td>
        <td style="padding:8px 10px;text-align:center;">—</td>
        <td style="padding:8px 10px;text-align:center;">—</td>
        <td style="padding:8px 10px;text-align:right;">—</td>
        <td style="padding:8px 10px;text-align:right;">—</td>
        <td style="padding:8px 10px;text-align:right;">—</td>
        <td style="padding:8px 10px;text-align:right;">—</td>
        <td style="padding:8px 10px;text-align:right;">—</td>
        <td style="padding:8px 10px;text-align:right;">—</td>
        <td style="padding:8px 10px;text-align:right;">—</td>
        <td style="padding:8px 10px;text-align:right;">—</td>
        <td style="padding:8px 10px;text-align:center;"><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#c62828;color:white;">BŁĄD</span></td>
      </tr>`;
      }
      return `<tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:8px 10px;font-weight:600;">${i + 1}</td>
        <td style="padding:8px 10px;font-weight:600;">${(p.parcel_id || "—").replace(/</g, "&lt;")}</td>
        <td style="padding:8px 10px;text-align:center;">${collision ? "TAK" : "NIE"}</td>
        <td style="padding:8px 10px;text-align:center;">${volt}</td>
        <td style="padding:8px 10px;text-align:right;">${fmtI(area)}</td>
        <td style="padding:8px 10px;text-align:right;">${priceStr}</td>
        <td style="padding:8px 10px;text-align:right;">${typeof lineLen === "number" ? (lineLen % 1 ? lineLen.toFixed(1) : lineLen) : lineLen}</td>
        <td style="padding:8px 10px;text-align:right;">${bandM}</td>
        <td style="padding:8px 10px;text-align:right;">${fmtI(bandM2)}</td>
        <td style="padding:8px 10px;text-align:right;color:#27ae60;font-weight:600;">${fmtN(ta)}</td>
        <td style="padding:8px 10px;text-align:right;color:#e67e22;font-weight:600;">${fmtN(tb)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;">${fmtN(razem)}</td>
        <td style="padding:8px 10px;text-align:center;"><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:#27ae60;color:white;">OK</span></td>
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
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter','Segoe UI',Arial,sans-serif;background:#fff;color:#3d2319;font-size:14px;line-height:1.5}
@media print{
  body{background:#fff}
  .no-print{display:none!important}
  .parcel-card{page-break-inside:avoid;break-inside:avoid}
  .page-break{page-break-before:always;break-before:always}
  .report-header,.kpi-card,.razem-box,.track-a,.track-b,.collision-badge{
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
}
.wrap{max-width:1100px;margin:0 auto;padding:28px 20px 60px;background:#fff}
.leaflet-container{background:#fff !important}
#collective-map,.parcel-card [id^="parcel-map-"]{background:#fff;min-height:200px}
.summary-table tfoot tr{background:#fff;border-top:2px solid #3d2319}
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
.summary-table tfoot tr{background:#fff;border-top:2px solid #3d2319}
.summary-table tfoot td{padding:12px;font-weight:800;font-size:14px}
.summary-table-full-wrap{overflow-x:auto;margin-bottom:24px}
.summary-table-full{min-width:900px}
.report-footer{text-align:center;margin-top:40px;font-size:11px;color:#95a5a6;padding:20px;border-top:1px solid #e8ecf0}
@media (max-width:640px){.track-explanation-grid{grid-template-columns:1fr!important}}
.no-bg-tooltip { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; overflow: visible !important; }
.no-bg-tooltip::before { display: none !important; }
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
        ${isFarmerReport ? `
        <div class="meta-item">
          <div class="meta-label">🌾 Kontekst</div>
          <div class="meta-value">Gospodarstwo rolne</div>
        </div>
        ` : ''}
      </div>
    </div>
    <div class="header-badge-col">
      ${isFarmerReport ? '<span class="badge" style="background:rgba(46,125,50,0.4);">🌾 GOSP. ROLNE</span>' : ''}
      <div style="text-align:right;margin-bottom:12px;">
        <div style="font-size:13px;color:#b8963e;font-weight:700;">www.kancelaria-szuwara.pl</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:2px;">tel. 500 013 269</div>
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
  <div class="track-explanation" style="background:#f8f9fc;border:1px solid #e0e0e0;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
    <div style="font-size:14px;font-weight:800;color:#3d2319;margin-bottom:12px;">⚖️ Track A i Track B — nie sumuje się</div>
    <div class="track-explanation-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:13px;line-height:1.5;">
      <div style="padding:14px;background:#e8f5e9;border-radius:10px;border-left:4px solid #27ae60;">
        <strong style="color:#1b5e20;">Track A — ścieżka sądowa</strong><br>
        Szacunek przy dochodzeniu roszczeń na drodze sądowej. Stosuje się <strong>albo</strong> Track A <strong>albo</strong> Track B — <strong>nie sumuje się A+B</strong>.
        <div style="margin-top:10px;font-weight:800;color:#27ae60;">Suma Track A: ${fmtN(totalA)} PLN</div>
      </div>
      <div style="padding:14px;background:#fff3e0;border-radius:10px;border-left:4px solid #e67e22;">
        <strong style="color:#e65100;">Track B — negocjacje</strong><br>
        Szacunek do negocjacji z operatorem (ugoda, wykup). Stosuje się <strong>albo</strong> Track A <strong>albo</strong> Track B — <strong>nie sumuje się A+B</strong>.
        <div style="margin-top:10px;font-weight:800;color:#e67e22;">Suma Track B: ${fmtN(totalB)} PLN</div>
      </div>
    </div>
    <p style="font-size:12px;color:#7f8c8d;margin:12px 0 0 0;">W zestawieniu na dole raportu podane są obie kwoty per działka; wybiera się jedną ścieżkę (A lub B), nie sumę.</p>
    ${isFarmerReport ? '<p style="font-size:12px;color:#2e7d32;margin:10px 0 0 0;font-weight:600;">🌾 <strong>Gospodarstwo rolne</strong> — w analizie włączone jest roszczenie R5 (szkoda rolna) dla działek z kolizją; kwoty w zestawieniu mogą zawierać R5.</p>' : ''}
  </div>

  <div style="background:#e8f4fd;border:1px solid #90caf9;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
    <div style="font-size:14px;font-weight:800;color:#1565c0;margin-bottom:10px;">📐 Metodologia wyliczania roszczeń</div>
    <p style="font-size:12px;line-height:1.55;color:#2c3e50;margin:0;">
      Wszystkie dane w raporcie są <strong>pobierane z integracji</strong> (API): geometria i powierzchnia — ULDK/EGiB, cena gruntu — GUS BDL, długość linii i kolizja — KIUT/Overpass, współczynniki KSWS według typu infrastruktury. Gdy dane nie zostały pobrane, raport wskazuje <strong>„Błąd integracji”</strong> zamiast wartości domyślnych; brak wartości oznacza problem z danym źródłem (np. GUS, ULDK).<br/>
      <strong>Track A (TK P 10/16):</strong> WSP + WBK + OBN (WSP = wartość × S × k × % pasa; WBK = wartość × R × k × % pasa × lata; OBN = wartość × impact). <strong>Track B:</strong> Track A × mnożnik. <strong>R1–R5:</strong> R1=WSP, R2=WBK, R3=OBN, R4=blokada WZ, R5=szkoda rolna (przy opcji „Gospodarstwo rolne”).
    </p>
  </div>

  <div class="charts-row section-title">📈 Podsumowanie — wykresy kwotowe</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:28px;">
    <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #e8eaf0;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="font-size:12px;font-weight:700;color:#3d2319;margin-bottom:12px;">Suma Track A vs Track B (PLN)</div>
      <canvas id="chart-tracks-sum" width="280" height="200" style="max-width:100%;height:auto;"></canvas>
    </div>
    <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #e8eaf0;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="font-size:12px;font-weight:700;color:#3d2319;margin-bottom:12px;">Kwoty Track B wg działek (PLN)</div>
      <canvas id="chart-parcels-amounts" width="280" height="200" style="max-width:100%;height:auto;"></canvas>
    </div>
    <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #e8eaf0;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <div style="font-size:12px;font-weight:700;color:#3d2319;margin-bottom:12px;">Kolizja: z / bez</div>
      <canvas id="chart-collision" width="280" height="200" style="max-width:100%;height:auto;"></canvas>
    </div>
  </div>

  <!-- COLLECTIVE MAP VISUALIZATION -->
  <div class="section-title">🗺️ Napowietrzne linie energetyczne — mapa zbiorcza</div>
  <p style="font-size:12px;color:#7f8c8d;margin:-8px 0 12px 0;">Infrastruktura · granice działek i linie WN/SN/nN z legendą G1/G3/G4</p>
  <div id="collective-map" style="height:500px;width:100%;margin:0 0 30px 0;border-radius:10px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.1);background:#fff;"></div>

  <!-- PER-PARCEL CARDS -->
  <div class="section-title">📋 Analiza poszczególnych działek</div>
  ${parcelCards}

  <!-- SUMMARY TABLE (jedyna tabela działek w raporcie — pełne zestawienie) -->
  <div class="section-title page-break">📊 Zestawienie zbiorcze działek</div>
  <p style="font-size:12px;color:#7f8c8d;margin-bottom:12px;">Kolumny: kolizja, napięcie, powierzchnia, cena, długość linii, pas, Track A, Track B. Kolumna „Razem” to A+B (przedział) — w praktyce wybiera się <strong>albo</strong> Track A <strong>albo</strong> Track B, nie sumę.</p>
  <div class="summary-table-full-wrap">
  <table class="summary-table summary-table-full">
    <thead>
      <tr>
        <th>Lp.</th>
        <th>Działka</th>
        <th style="text-align:center;">Kolizja</th>
        <th style="text-align:center;">Napięcie</th>
        <th style="text-align:right;">Pow. [m²]</th>
        <th style="text-align:right;">Cena [PLN/m²]</th>
        <th style="text-align:right;">Dł. linii [m]</th>
        <th style="text-align:right;">Pas [m]</th>
        <th style="text-align:right;">Pas [m²]</th>
        <th style="text-align:right;">Track A</th>
        <th style="text-align:right;">Track B</th>
        <th style="text-align:right;">Razem</th>
        <th style="text-align:center;">Status</th>
      </tr>
    </thead>
    <tbody>${summaryRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="font-weight:700;">Suma (${results.length} działek)</td>
        <td colspan="7" style="text-align:right;font-weight:700;">—</td>
        <td style="text-align:right;color:#27ae60;font-weight:700;">${fmtN(totalA)}</td>
        <td style="text-align:right;color:#e67e22;font-weight:700;">${fmtN(totalB)}</td>
        <td style="text-align:right;font-weight:700;color:#7f8c8d;">— (wybór A lub B)</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  </div>
  <p style="font-size:11px;color:#7f8c8d;margin-top:8px;">Suma Track A i suma Track B to łączne kwoty przy wyborze danej ścieżki; nie należy sumować A+B jako jednej kwoty roszczenia.</p>

  <div class="report-footer">
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">
      <span style="width:28px;height:28px;border-radius:50%;border:1.5px solid #b8963e;display:inline-flex;align-items:center;justify-content:center;font-size:1rem;color:#b8963e;font-weight:800;">§</span>
      <strong style="font-size:13px;letter-spacing:1.5px;color:#3d2319;">SZUWARA</strong>
      <span style="color:#b8963e;font-size:11px;">Kancelaria Prawno-Podatkowa</span>
    </div>
    <a href="https://www.kancelaria-szuwara.pl" style="color:#b8963e;font-weight:700;">www.kancelaria-szuwara.pl</a>
    &nbsp;·&nbsp; tel. 500 013 269<br>
    Kancelaria Prawno Podatkowa Rafał Szuwara · Created by Rafał Szuwara<br>
    Raport wygenerowany: <strong>${dateStr}</strong> · KALKULATOR KSWS v3.0 ·
    Dane: ULDK GUGiK, OSM Overpass, GUS BDL · Metodyka: KSWS-V.5 · TK P 10/16<br>
    <em>Dokument ma charakter informacyjno-analityczny i nie zastępuje operatu szacunkowego.</em>
  </div>
</div>

<script>
(function() {
  var PARCEL_MAPS = ${safeScriptJson(results.map(p => {
    const d = p.master_record || p.data || {};
    const pl = d.infrastructure?.power_lines || {};
    const power = d.infrastructure?.power || {};
    const energie = d.infrastructure?.energie || {};
    const geojson = pl.geojson || energie.geojson;
    const features = (geojson && geojson.features && Array.isArray(geojson.features)) ? geojson.features : (pl.features && Array.isArray(pl.features)) ? pl.features : (energie.features && Array.isArray(energie.features)) ? energie.features : [];
    var powerLinesGeojson = null;
    if (geojson && (geojson.features?.length || geojson.type === 'LineString')) powerLinesGeojson = geojson;
    else if (features.length) powerLinesGeojson = { type: 'FeatureCollection', features: features };
    return {
      centroid: d.geometry?.centroid_ll,
      geojson: d.geometry?.geojson_ll || d.geometry?.geojson,
      collision: !!(pl.detected || power.exists),
      voltage: pl.voltage || energie.voltage || null,
      powerLinesGeojson: powerLinesGeojson,
    };
  }))};
  var RESULTS_FOR_PDF = ${safeScriptJson(results.map(p => ({
    parcel_id: p.parcel_id,
    master_record: p.master_record || p.data || {},
  })))};

  function styleByVoltage(voltage) {
    var v = (voltage || '').toUpperCase();
    var base = { opacity: 0.9, lineCap: 'round', lineJoin: 'round', pane: 'powerLinesPane' };
    if (v === 'WN') return Object.assign({ color: '#E91E63', weight: 4 }, base);
    if (v === 'NN' || v === 'N') return Object.assign({ color: '#6A1B9A', weight: 2 }, base);
    return Object.assign({ color: '#9C27B0', weight: 3 }, base);
  }
  function ensurePowerLinesPane(map) {
    if (!map.getPane('powerLinesPane')) {
      map.createPane('powerLinesPane');
      map.getPane('powerLinesPane').style.zIndex = 650;
    }
  }
  function addPowerLinesToMap(map, powerLinesGeojson, defaultVoltage) {
    if (!powerLinesGeojson) return;
    ensurePowerLinesPane(map);
    try {
      L.geoJSON(powerLinesGeojson, {
        style: function(f) {
          var vol = (f && f.properties && f.properties.voltage) || defaultVoltage;
          return styleByVoltage(vol);
        },
        onEachFeature: function(f, layer) {
          var vol = (f && f.properties && f.properties.voltage) || defaultVoltage || '';
          var v = vol.toUpperCase();
          var label = (v === 'WN') ? 'G1' : (v === 'SN') ? 'G3' : (v === 'NN' || v === 'N') ? 'G4' : '';
          if (label) {
             var c = styleByVoltage(v).color;
             layer.bindTooltip('<span style="color:'+c+';font-weight:bold;font-size:10px;background:rgba(255,255,255,0.85);padding:1px 3px;border-radius:3px;">'+label+'</span>', { permanent: true, direction: 'center', className: 'no-bg-tooltip' });
          }
        }
      }).addTo(map);
    } catch (e) {}
  }
  function addMapLegend(map, isCollective) {
    var leg = L.control({ position: 'bottomleft' });
    leg.onAdd = function() {
        var div = L.DomUtil.create('div', 'info');
        div.style.cssText = 'background:white;padding:12px 14px;border-radius:8px;font-size:11px;line-height:1.6;box-shadow:0 2px 10px rgba(0,0,0,0.15);min-width:200px;';
        div.innerHTML = '<strong style="display:block;margin-bottom:8px;font-size:12px;">Legenda — Linie energetyczne</strong>' +
          '<div style="margin:4px 0;"><span style="display:inline-block;width:24px;height:4px;background:#E91E63;vertical-align:middle;margin-right:6px;"></span> G1 WN (wysokie/najwyższe napięcie)</div>' +
          '<div style="margin:4px 0;"><span style="display:inline-block;width:24px;height:3px;background:#9C27B0;vertical-align:middle;margin-right:6px;"></span> G3 SN (średnie napięcie)</div>' +
          '<div style="margin:4px 0;"><span style="display:inline-block;width:24px;height:2px;background:#6A1B9A;vertical-align:middle;margin-right:6px;"></span> G4 nN (niskie napięcie)</div>' +
          '<div style="margin:8px 0 4px 0;border-top:1px solid #eee;padding-top:6px;"></div>' +
          '<div style="margin:4px 0;"><span style="display:inline-block;width:20px;height:20px;border:2px solid #2196F3;background:rgba(33,150,243,0.1);vertical-align:middle;margin-right:6px;border-radius:2px;"></span> Wybrany obszar (działka)</div>' +
          (isCollective ? '<div style="margin:4px 0;"><span style="color:#e53935;font-weight:bold;">———</span> Działka z kolizją</div><div style="margin:4px 0;"><span style="color:#2196F3;font-weight:bold;">———</span> Działka bez kolizji</div>' : '');
        return div;
    };
    leg.addTo(map);
  }

  function initMaps() {
    if (typeof L === 'undefined') return;
    PARCEL_MAPS.forEach(function(parcel, i) {
      var el = document.getElementById('parcel-map-' + i);
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
      var map = L.map(el, { zoomControl: true, attributionControl: false, scrollWheelZoom: true, dragging: true, doubleClickZoom: true });
      var satLayer = L.tileLayer('${BASE_LAYERS.esriSatellite.url}', { maxZoom: ${BASE_LAYERS.esriSatellite.maxZoom}, attribution: '${BASE_LAYERS.esriSatellite.attribution}' }).addTo(map);
      var kiutLayer = L.tileLayer.wms('${GUGIK_WMS.KIUT.baseUrl}', { layers:'${GUGIK_WMS.KIUT.layers.uzbrojenie}', format:'image/png', transparent:true, opacity:1.0 }).addTo(map);
      var egibLayer = L.tileLayer.wms('${GUGIK_WMS.KIEG.baseUrl}', { layers:'${GUGIK_WMS.KIEG.layers}', format:'image/png', transparent:true, opacity:0.8 }).addTo(map);
      var powerLayer = L.tileLayer('${OIM_TILES.power}', { maxZoom:19, opacity:1.0, attribution:'© OpenInfra' }).addTo(map);
      
      L.control.layers(
        { 'Satelita (Esri)': satLayer },
        {
          '⚡ Raster z KIUT (GUGiK)': kiutLayer,
          '⚡ Vektory OSM (Power)': powerLayer,
          '🗺️ Granice EGiB': egibLayer
        },
        { position: 'topright', collapsed: true }
      ).addTo(map);

      // Dodanie promienia 200m wzorem OnGeo
      L.circle(center, {
        radius: 200,
        color: '#ffffff',
        fillColor: 'transparent',
        weight: 1.5,
        dashArray: '5, 5'
      }).addTo(map).bindTooltip("Zasięg analizy promieniowej (200m)", { sticky: true, className: 'no-bg-tooltip', direction: 'top' });

      var boundsToFit = null;
      if (parcel.geojson && parcel.geojson.coordinates) {
        var color = parcel.collision ? '#ff0055' : '#00ffff';
        var layer = L.geoJSON(parcel.geojson, {
          style: { color: color, weight: 4, dashArray: 'none', fillOpacity: 0.15 }
        }).addTo(map);
        try { boundsToFit = layer.getBounds(); } catch(e) {}
      }
      addPowerLinesToMap(map, parcel.powerLinesGeojson, parcel.voltage);
      addMapLegend(map, false);
      if (boundsToFit) try { map.fitBounds(boundsToFit, { padding: [12, 12] }); } catch(e) { map.setView(center, 14); }
      else map.setView(center, 14);
    });
  }

  function initCollectiveMap() {
    if (typeof L === 'undefined') return;
    var el = document.getElementById('collective-map');
    if (!el || el._leaflet_id) return;
    var map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      dragging: true,
      doubleClickZoom: true
    });

    var osmLayer = L.tileLayer('${BASE_LAYERS.cartoLight.url}', { subdomains:'abcd', maxZoom:${BASE_LAYERS.cartoLight.options.maxZoom}, attribution:'${BASE_LAYERS.cartoLight.options.attribution}' }).addTo(map);
    
    L.tileLayer.wms('${GUGIK_WMS.KIEG.baseUrl}',
      { layers:'${GUGIK_WMS.KIEG.layers}', format:'image/png', transparent:true, opacity:0.8 }).addTo(map);

    var kiutLayer = L.tileLayer.wms('${GUGIK_WMS.KIUT.baseUrl}',
      { layers:'${GUGIK_WMS.KIUT.layers.uzbrojenie}', format:'image/png', transparent:true, opacity:1.0 }).addTo(map);

    var powerLayer = L.tileLayer('${OIM_TILES.power}',
      { maxZoom:19, opacity:1, attribution:'© OpenInfra' });
    var gasLayer = L.tileLayer('${OIM_TILES.gas}',
      { maxZoom:19, opacity:0.7, attribution:'© OpenInfra' });
    var waterLayer = L.tileLayer('${OIM_TILES.water}',
      { maxZoom:19, opacity:0.7, attribution:'© OpenInfra' });
    var sewerLayer = L.tileLayer('${OIM_TILES.sewer}',
      { maxZoom:19, opacity:0.7, attribution:'© OpenInfra' });

    var parcelGroup = L.featureGroup();
    var allBounds = [];

    PARCEL_MAPS.forEach(function(parcel, i) {
      if (parcel.geojson && parcel.geojson.coordinates) {
        var color = parcel.collision ? '#e53935' : '#2196F3';
        var layer = L.geoJSON(parcel.geojson, {
          style: {
            color: color,
            weight: 4,
            fillColor: color,
            fillOpacity: 0.15,
            dashArray: 'none'
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

    PARCEL_MAPS.forEach(function(parcel) {
      addPowerLinesToMap(map, parcel.powerLinesGeojson, parcel.voltage);
    });

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

    L.control.layers(
      { 'Mapa': L.tileLayer('${BASE_LAYERS.cartoLight.url}', { subdomains:'abcd', maxZoom:${BASE_LAYERS.cartoLight.options.maxZoom}, attribution:'${BASE_LAYERS.cartoLight.options.attribution}' }) },
      {
        '⚡ Raster z KIUT (GUGiK)': L.tileLayer.wms('${GUGIK_WMS.KIUT.baseUrl}', { layers:'${GUGIK_WMS.KIUT.layers.uzbrojenie}', format:'image/png', transparent:true, opacity:1.0 }),
        '⚡ Vektory OSM (Power)': powerLayer,
        '🔥 Gaz (Gas)': gasLayer,
        '💧 Woda (Water)': waterLayer,
        '🚰 Kanalizacja (Sewer)': sewerLayer
      },
      { position: 'topright', collapsed: false }
    ).addTo(map);

    addMapLegend(map, true);
  }

  function wirePdfButtons() {
    if (typeof RESULTS_FOR_PDF === 'undefined') return;
    setTimeout(function() {
      var btns = document.querySelectorAll('.btn-pdf');
      btns.forEach(function(btn) {
        if (btn._pdfWired) return;
        btn._pdfWired = true;
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          var i = parseInt(this.getAttribute('data-parcel-index'), 10);
          if (isNaN(i) || !RESULTS_FOR_PDF[i]) return;
          var pData = RESULTS_FOR_PDF[i];
          var structuredItem = {
            parcel_id: pData.parcel_id,
            full_master_record: pData.master_record || pData.data || {},
            date: new Date().toLocaleString("pl-PL")
          };
          var singleHtml = buildSingleHtml(structuredItem);
          var blob = new Blob([singleHtml], { type: 'text/html;charset=utf-8' });
          var blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, '_blank');
        });
      });
    }, 300);
  }

  var buildSingleHtml = ${buildSingleHtml.toString()};

  var CHART_DATA = {
    collision: ${collisionCount},
    noCollision: ${results.length - collisionCount},
    totalA: ${totalA},
    totalB: ${totalB},
    total: ${results.length},
    parcelsForChart: ${JSON.stringify(parcelsForChart)}
  };

  function initCharts() {
    if (typeof Chart === 'undefined') return;
    var fmt = function(n) { return (n || 0).toLocaleString('pl-PL', { maximumFractionDigits: 0 }); };
    var cSum = document.getElementById('chart-tracks-sum');
    if (cSum) {
      new Chart(cSum, {
        type: 'bar',
        data: {
          labels: ['Track A (sąd)', 'Track B (negocjacje)'],
          datasets: [{ label: 'PLN', data: [CHART_DATA.totalA, CHART_DATA.totalB], backgroundColor: ['#27ae60', '#e67e22'] }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: function(v) { return fmt(v); } } } } }
      });
    }
    var cParcels = document.getElementById('chart-parcels-amounts');
    if (cParcels && CHART_DATA.parcelsForChart && CHART_DATA.parcelsForChart.length > 0) {
      var labels = CHART_DATA.parcelsForChart.map(function(p) { return p.shortId; });
      var values = CHART_DATA.parcelsForChart.map(function(p) { return p.trackB; });
      new Chart(cParcels, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{ label: 'Track B (PLN)', data: values, backgroundColor: 'rgba(230, 126, 34, 0.8)' }]
        },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { callback: function(v) { return fmt(v); } } } } }
      });
    } else if (cParcels) {
      var ctx = cParcels.getContext('2d');
      if (ctx) { ctx.font = '14px sans-serif'; ctx.fillStyle = '#888'; ctx.fillText('Brak działek z kwotą', 20, 100); }
    }
    var cColl = document.getElementById('chart-collision');
    if (cColl) {
      new Chart(cColl, {
        type: 'doughnut',
        data: {
          labels: ['Z kolizją', 'Bez kolizji'],
          datasets: [{ data: [CHART_DATA.collision, CHART_DATA.noCollision], backgroundColor: ['#e53935', '#43a047'], borderWidth: 2 }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
      });
    }
  }

  function runInits() {
    initMaps();
    initCollectiveMap();
    wirePdfButtons();
    initCharts();
  }

  function loadLeafletThenRun() {
    if (typeof L !== 'undefined') { runInits(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = function() { runInits(); };
    s.onerror = function() { runInits(); };
    document.head.appendChild(s);
  }
  if (document.readyState === 'complete') loadLeafletThenRun();
  else window.addEventListener('load', loadLeafletThenRun);
})();
</script>
</body>
</html>`;

    localStorage.setItem("ksws_print_html", html);
    const newWindow = window.open('#/kalkulator/raport-druk', '_blank');
    if (!newWindow) {
      toast.error("Zablokowano popup — zezwól na okienka dla tej strony");
      return;
    }
    toast.success(`Raport otwarty — ${results.length} działek · użyj Ctrl+P by zapisać PDF`);
  };

  return (
    <div className="batch-history-container">
      <header className="history-header">
        <h1 className="history-header__title">Historia analiz zbiorczych</h1>
        <p className="history-header__sub">Wcześniej wykonane analizy CSV — kliknij, by załadować raport z mapami.</p>
      </header>

      {!loading && history.length > 0 && (
        <div className="history-search-wrap" style={{ padding: "0 16px 12px", maxWidth: 480 }}>
          <label htmlFor="history-search" className="visually-hidden">Szukaj po nazwie klienta lub pliku</label>
          <input
            id="history-search"
            type="search"
            className="history-search-input"
            placeholder="Szukaj po nazwie klienta lub pliku…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Szukaj po nazwie klienta lub pliku"
          />
        </div>
      )}
      <div className="history-content">
        {loading ? (
          <div className="history-loading" role="status" aria-label="Ładowanie">
            {[1, 2, 3].map((i) => (
              <div key={i} className="history-skeleton">
                <div className="history-skeleton__icon" />
                <div className="history-skeleton__body">
                  <div className="history-skeleton__line history-skeleton__line--title" />
                  <div className="history-skeleton__line history-skeleton__line--meta" />
                  <div className="history-skeleton__chips">
                    <div className="history-skeleton__chip" />
                    <div className="history-skeleton__chip" />
                  </div>
                </div>
                <div className="history-skeleton__action" />
              </div>
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="history-empty">
            <div className="history-empty__icon">📋</div>
            <h2 className="history-empty__title">Brak raportów</h2>
            <p className="history-empty__hint">Wykonaj analizę w zakładce <strong>Analiza hurtowa</strong> — wyniki zapiszą się tutaj.</p>
          </div>
        ) : (() => {
          const q = (searchQuery || "").trim().toLowerCase();
          const filtered = q
            ? history.filter(
                (item) =>
                  (item.client_name || "").toLowerCase().includes(q) ||
                  (item.file_name || "").toLowerCase().includes(q)
              )
            : history;
          return (
          <ul className="history-list" role="list">
            {filtered.length === 0 ? (
              <li className="history-empty" style={{ listStyle: "none", padding: 24, textAlign: "center" }}>
                <p style={{ margin: 0 }}>Brak raportów pasujących do „{searchQuery}"</p>
                <button type="button" className="batch-link" style={{ marginTop: 8 }} onClick={() => setSearchQuery("")}>Wyczyść wyszukiwanie</button>
              </li>
            ) : (
            filtered.map((item, idx) => (
              <li key={item.batch_id} className="history-card history-row--replaceable" role="listitem" data-batch-id={item.batch_id}>
                <article
                  className="history-card__inner"
                  onClick={() => loadBatchDetails(item.batch_id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); loadBatchDetails(item.batch_id); } }}
                  aria-label={`Otwórz raport: ${item.client_name || item.file_name}, ${item.total} działek`}
                >
                  <div className="history-card__accent" aria-hidden><span>{idx + 1}</span></div>
                  <div className="history-card__main">
                    <div className="history-card__row">
                      <h3 className={`history-card__title ${item.client_name ? "" : "history-card__title--missing"}`}>
                        {item.client_name || "Brak nazwy klienta"}
                      </h3>
                      <button
                        type="button"
                        className={`history-card__crm ${!item.client_name ? "history-card__crm--assign" : ""}`}
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate("/kalkulator/klienci", { state: { highlightClientId: item.client_id || null, assignBatchId: item.batch_id, assignBatchFileName: item.file_name } }); }}
                      >
                        {item.client_id ? "CRM" : "Przypisz do CRM"}
                      </button>
                    </div>
                    <div className="history-card__meta">
                      <span className="history-card__date">
                        {new Date(item.timestamp).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="history-card__file" title={item.file_name}>{item.file_name}</span>
                    </div>
                    <div className="history-card__stats">
                      <span className="history-card__stat history-card__stat--count">{item.total} DZIAŁEK</span>
                      <span className="history-card__stat history-card__stat--ok">✓ {item.successful} ANALIZOWANYCH</span>
                    </div>
                  </div>
                  <div className="history-card__cta-wrap">
                    <span className="history-card__cta">Otwórz raport</span>
                  </div>
                </article>
              </li>
            ))
            )}
          </ul>
          );
        })()}
      </div>
    </div>
  );
}
