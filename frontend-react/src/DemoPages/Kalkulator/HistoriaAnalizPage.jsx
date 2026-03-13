import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./KalkulatorPage.css";

const HISTORY_KEY = "ksws_history";

function buildSingleHtml(item) {
  const mr = item.full_master_record || {};
  const geom = mr.geometry || {};
  const comp = mr.compensation || {};
  const infra = mr.infrastructure || {};
  const pl = infra.power_lines || {};
  const market = mr.market_data || {};
  const meta = mr.parcel_metadata || {};

  const area = geom.area_m2 || 0;
  const price = market.average_price_m2 || 0;
  const trackA = comp.track_a?.total || 0;
  const trackB = comp.track_b?.total || 0;
  const total = trackA + trackB;
  const collision = !!pl.detected;
  const dateStr = item.date || new Date().toLocaleString("pl-PL");

  const fmtI = (v) => Math.round(v || 0).toLocaleString("pl-PL");
  const fmtN = (v) => (v || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const parcelGeo = geom.geojson_ll || geom.geojson || null;
  const centroid = geom.centroid_ll || null;

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Raport KSWS — ${item.parcel_id}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f4f6f8; color: #2c3e50; font-size: 13px; line-height: 1.4; }
    .wrap { max-width: 1000px; margin: 0 auto; padding: 20px; }
    
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: center; background: #1a2a3a; color: white; padding: 20px 30px; border-radius: 12px; margin-bottom: 20px; }
    .header-main h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .header-main .sub { font-size: 13px; opacity: 0.8; }
    .header-logo { text-align: right; }
    .header-logo .ksws { font-size: 24px; font-weight: 800; color: #d4af37; letter-spacing: 1px; }
    .header-logo .sub { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8; }
    
    /* Top 4 Cards */
    .top-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
    .t-card { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-top: 4px solid #ccc; position: relative; }
    .t-card.blue { border-top-color: #3498db; }
    .t-card.green { border-top-color: #2ecc71; }
    .t-card.red { border-top-color: #e74c3c; }
    .t-card.gold { border-top-color: #f1c40f; }
    .t-card-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #7f8c8d; margin-bottom: 8px; font-weight: 600; }
    .t-card-val { font-size: 22px; font-weight: 800; color: #2c3e50; margin-bottom: 4px; }
    .t-card-sub { font-size: 11px; color: #95a5a6; }
    
    /* Middle Section: Map + Info Cards */
    .mid-section { display: grid; grid-template-columns: 1fr 300px; gap: 20px; margin-bottom: 20px; }
    .map-container { background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); display: flex; flex-direction: column; }
    .map-header { font-size: 14px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    #map { width: 100%; flex: 1; min-height: 400px; border-radius: 8px; background: #eee; }
    
    .info-cards { display: flex; flex-direction: column; gap: 12px; }
    .i-card { background: white; border-radius: 12px; padding: 14px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); display: flex; align-items: flex-start; gap: 12px; }
    .i-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; color: white; }
    .i-icon.blue { background: #3498db; }
    .i-icon.green { background: #2ecc71; }
    .i-icon.red { background: #e74c3c; }
    .i-icon.orange { background: #e67e22; }
    .i-icon.gold { background: #f1c40f; }
    .i-content { flex: 1; }
    .i-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #7f8c8d; margin-bottom: 2px; font-weight: 600; }
    .i-val { font-size: 13px; font-weight: 700; color: #2c3e50; margin-bottom: 2px; }
    .i-sub { font-size: 11px; color: #95a5a6; }
    
    /* Track Section */
    .track-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .track-card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #eee; }
    .track-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .track-title { font-size: 14px; font-weight: 700; }
    .track-badge { padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .track-val { font-size: 28px; font-weight: 800; margin-bottom: 16px; }
    .track-list { border-top: 1px solid #eee; padding-top: 12px; }
    .track-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; }
    .track-row .label { color: #7f8c8d; }
    .track-row .val { font-weight: 600; color: #2c3e50; }
    .track-total-row { display: flex; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee; font-weight: 700; font-size: 14px; }
    
    .track-a .track-title { color: #2c3e50; }
    .track-a .track-badge { background: #eef4ff; color: #3498db; }
    .track-a .track-val { color: #2c3e50; }
    
    .track-b { background: #fffaf0; border-color: #fde4c3; }
    .track-b .track-title { color: #8d6e3f; }
    .track-b .track-badge { background: #fde4c3; color: #d35400; }
    .track-b .track-val { color: #d35400; }
    
    /* Tables */
    .table-card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 20px; }
    .table-header { font-size: 14px; font-weight: 700; color: #2c3e50; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .table-header-right { margin-left: auto; background: #eef4ff; color: #3498db; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; }
    th { padding: 10px 12px; border-bottom: 2px solid #eee; color: #7f8c8d; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; }
    td { padding: 12px; border-bottom: 1px solid #eee; color: #2c3e50; }
    tr:last-child td { border-bottom: none; }
    .td-val { font-weight: 600; text-align: right; }
    .td-center { text-align: center; }
    .td-right { text-align: right; }
    
    .t-row-sub { font-size: 11px; color: #7f8c8d; margin-top: 4px; }
    .t-row-green { color: #27ae60; background: #f5fff8; }
    .t-row-green td { color: #27ae60; }
    
    .print-btn { display: block; width: 100%; padding: 12px; background: #d4af37; color: white; text-align: center; border-radius: 8px; text-decoration: none; font-weight: 700; margin-top: 20px; cursor: pointer; border: none; font-size: 14px; }
    .print-btn:hover { background: #c5a028; }
    
    @media print {
      body { background: white; }
      .wrap { padding: 0; max-width: 100%; }
      .no-print { display: none !important; }
      .t-card, .map-container, .i-card, .track-card, .table-card { box-shadow: none; border: 1px solid #ddd; }
      .header { background: white; color: black; border: 1px solid #ddd; padding: 10px 20px; }
      .header-main h1 { color: black; }
      .header-main .sub { color: #555; }
      .header-logo .ksws { color: black; }
      .header-logo .sub { color: #555; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="header-main">
        <h1>Raport KSWS — Analiza Działki</h1>
        <div class="sub">Identyfikator: ${item.parcel_id || "—"} • Data: ${dateStr}</div>
      </div>
      <div class="header-logo">
        <div class="ksws">KSWS</div>
        <div class="sub">Kalkulator Roszczeń</div>
      </div>
    </div>
    
    <div class="top-cards">
      <div class="t-card blue">
        <div class="t-card-title">Powierzchnia</div>
        <div class="t-card-val">${fmtI(area)} m²</div>
        <div class="t-card-sub">EGIB / ULDK<br>${(area/10000).toFixed(4)} ha</div>
      </div>
      <div class="t-card green">
        <div class="t-card-title">Klasa Gruntu</div>
        <div class="t-card-val">${meta.land_use || "R"}</div>
        <div class="t-card-sub">${meta.land_use_desc || "Rolny"}</div>
      </div>
      <div class="t-card red">
        <div class="t-card-title">Sieci Przesyłowe</div>
        <div class="t-card-val">${pl.voltage || "Brak"}</div>
        <div class="t-card-sub">GESUT GUGiK<br>Strefa ${mr.ksws?.band_width_m || 0} m - pas ${fmtI(mr.ksws?.band_area_m2 || 0)} m²</div>
      </div>
      <div class="t-card gold">
        <div class="t-card-title">Cena Rynkowa</div>
        <div class="t-card-val">${fmtN(price)} zł/m²</div>
        <div class="t-card-sub">GUS BDL<br>GUS: ${fmtN(price)} zł/m²</div>
      </div>
    </div>
    
    <div class="mid-section">
      <div class="map-container">
        <div class="map-header">🗺️ Wizualizacja działki</div>
        <div id="map"></div>
      </div>
      
      <div class="info-cards">
        <div class="i-card">
          <div class="i-icon blue">🗺️</div>
          <div class="i-content">
            <div class="i-title">Geometria EGIB</div>
            <div class="i-val">${fmtI(area)} m² (${(area/10000).toFixed(4)} ha)</div>
            <div class="i-sub">${meta.commune || ""}, ${meta.county || ""}, ${meta.region || ""}</div>
          </div>
        </div>
        <div class="i-card">
          <div class="i-icon green">🌱</div>
          <div class="i-content">
            <div class="i-title">Użytek Gruntowy</div>
            <div class="i-val">${meta.land_use || "R"} (${fmtI(area)} m²)</div>
            <div class="i-sub">Typ: ${meta.land_use_desc || "rolny"}</div>
          </div>
        </div>
        <div class="i-card">
          <div class="i-icon red">⚡</div>
          <div class="i-content">
            <div class="i-title">Sieci Przesyłowe (KIUT GUGiK)</div>
            <div class="i-val">${collision ? 'Wykryto' : 'Brak'} — ${pl.voltage || ""} — strefa ${mr.ksws?.band_width_m || 0} m · dł. ${fmtI(mr.ksws?.line_length_m || 0)} m</div>
            <div class="i-sub">Gaz: — Woda: — Kanal: —</div>
          </div>
        </div>
        <div class="i-card">
          <div class="i-icon orange">🏢</div>
          <div class="i-content">
            <div class="i-title">Planowanie Przestrzenne</div>
            <div class="i-val">Brak MPZP</div>
            <div class="i-sub">Pozwolenia: 0 · Budynki: 0</div>
          </div>
        </div>
        <div class="i-card">
          <div class="i-icon gold">💰</div>
          <div class="i-content">
            <div class="i-title">Cena Rynkowa</div>
            <div class="i-val">${fmtN(price)} zł/m²</div>
            <div class="i-sub">Źródło: GUS BDL - GUS: ${fmtN(price)} zł/m²</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="track-section">
      <div class="track-card track-a">
        <div class="track-header">
          <div class="track-title">Track A — Ścieżka sądowa</div>
          <div class="track-badge">SĄD</div>
        </div>
        <div style="font-size: 11px; color: #7f8c8d; margin-bottom: 8px;">TK P 10/16 · WSP + WBK + OBN</div>
        <div class="track-val">${fmtN(trackA)} PLN</div>
        <div class="track-list">
          <div class="track-row"><span class="label">WSP (służebność przesyłu)</span><span class="val">${fmtN(comp.track_a?.wsp || 0)} PLN</span></div>
          <div class="track-row"><span class="label">WBK (bezumowne korzystanie)</span><span class="val">${fmtN(comp.track_a?.wbk || 0)} PLN</span></div>
          <div class="track-row"><span class="label">OBN (obniżenie wartości)</span><span class="val">${fmtN(comp.track_a?.obn || 0)} PLN</span></div>
        </div>
        <div class="track-total-row">
          <span>Razem (10 lat)</span>
          <span>${fmtN(trackA)} PLN</span>
        </div>
      </div>
      
      <div class="track-card track-b">
        <div class="track-header">
          <div class="track-title">Track B — Ścieżka negocjacyjna</div>
          <div class="track-badge">NEGOCJACJE</div>
        </div>
        <div style="font-size: 11px; color: #7f8c8d; margin-bottom: 8px;">Track A × ${comp.track_b?.multiplier || 1.56} (benchmark rynkowy)</div>
        <div class="track-val">${fmtN(trackB)} PLN</div>
        <div style="margin-top: 30px;">
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #7f8c8d; margin-bottom: 4px;">
            <span>${fmtN(trackA)} PLN</span>
            <span>${fmtN(trackB)} PLN</span>
          </div>
          <div style="height: 4px; background: #eee; border-radius: 2px; display: flex;">
            <div style="width: 50%; background: #3498db; border-radius: 2px 0 0 2px;"></div>
            <div style="width: 50%; background: #d35400; border-radius: 0 2px 2px 0;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #7f8c8d; margin-top: 4px;">
            <span>Min (ścieżka sądowa)</span>
            <span>Max (negocjacje)</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="table-card">
      <div class="table-header">📊 Podstawa wyceny KSWS</div>
      <table>
        <thead>
          <tr>
            <th>Parametr</th>
            <th>Wartość</th>
            <th class="td-center">Wsp.</th>
            <th class="td-center">Wartość</th>
            <th>Opis</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Typ infrastruktury</td>
            <td class="td-val">Linie ${pl.voltage || "—"}</td>
            <td class="td-center" style="color:#e74c3c;">S</td>
            <td class="td-center">0.2</td>
            <td>obniżenie wartości pasa</td>
          </tr>
          <tr>
            <td>Szerokość pasa ochronnego</td>
            <td class="td-val">${mr.ksws?.band_width_m || "—"} m</td>
            <td class="td-center" style="color:#e74c3c;">k</td>
            <td class="td-center">0.5</td>
            <td>współczynnik korzystania</td>
          </tr>
          <tr>
            <td>Powierzchnia pasa</td>
            <td class="td-val">${fmtI(mr.ksws?.band_area_m2 || 0)} m²</td>
            <td class="td-center" style="color:#e74c3c;">R</td>
            <td class="td-center">0.06</td>
            <td>stopa kapitalizacji</td>
          </tr>
          <tr>
            <td>Wartość nieruchomości</td>
            <td class="td-val">${fmtN(area * price)} PLN</td>
            <td class="td-center" style="color:#e74c3c;">impact</td>
            <td class="td-center">0.05</td>
            <td>wpływ sądowy (OBN)</td>
          </tr>
          <tr>
            <td>Cena bazowa</td>
            <td class="td-val">${fmtN(price)} zł/m²</td>
            <td class="td-center" style="color:#e74c3c;">x B</td>
            <td class="td-center">${comp.track_b?.multiplier || 1.56}</td>
            <td>mnożnik Track B</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <div class="table-card">
      <div class="table-header">
        ⚖️ Kwalifikacja roszczeń R1–R5
        <div class="table-header-right">Łącznie: ${fmtN(trackB)} PLN</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Roszczenie</th>
            <th>Podstawa</th>
            <th class="td-right">Kwota</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>R1 — Służebność przesyłu (WSP)</strong>
              <div class="t-row-sub">Aktywne</div>
            </td>
            <td>art. 305¹–305⁴ KC</td>
            <td class="td-right td-val">${fmtN(comp.track_a?.wsp || 0)} PLN</td>
          </tr>
          <tr>
            <td>
              <strong>R2 — Bezumowne korzystanie (WBK 10 lat)</strong>
              <div class="t-row-sub">10 lat wstecz (art. 118 KC — przedawnienie od 2018)</div>
            </td>
            <td>art. 224–225 KC</td>
            <td class="td-right td-val">${fmtN(comp.track_a?.wbk || 0)} PLN</td>
          </tr>
          <tr>
            <td>
              <strong>R3 — Obniżenie wartości (OBN)</strong>
              <div class="t-row-sub">Linia przez centrum działki</div>
            </td>
            <td>art. 305¹ KC</td>
            <td class="td-right td-val">${fmtN(comp.track_a?.obn || 0)} PLN</td>
          </tr>
          <tr style="opacity: 0.5;">
            <td>
              <strong>R4 — Blokada zabudowy</strong>
              <div class="t-row-sub">Grunt rolny bez planów zabudowy</div>
            </td>
            <td>art. 140 KC + WZ/MPZP</td>
            <td class="td-right td-val">n.d.</td>
          </tr>
          <tr class="t-row-green">
            <td>
              <strong>R5 — Szkoda rolna</strong>
              <div class="t-row-sub">1 słupów - fundamenty + wyspy niedostępne sprzętowi</div>
              <div style="margin-left: 10px; margin-top: 4px;">
                <div>└ R5.1 Fundamenty (1 st. × 2.0 m²/st)</div>
                <div>└ R5.2 Wyspy/kliny (100 m² × 2.1419 zł/m²/rok × 10 lat)</div>
              </div>
              <div class="t-row-sub" style="margin-top: 4px;">Prod. globalna GUS 2023: 21.419 zł/ha/rok (mazowieckie). Belka 24-35m -> 100 m²/słup niedostępnych.</div>
            </td>
            <td>
              <br><br>
              <div>art. 361 §1–2 KC</div>
              <br>
              <div>damnum emergens</div>
              <div>lucrum cessans - GUS 21.419 zł/ha/rok</div>
            </td>
            <td class="td-right td-val">
              <br><br>
              <div>1299,94 PLN</div>
              <br>
              <div>14,80 PLN</div>
              <div>1285,14 PLN</div>
            </td>
          </tr>
          <tr style="background: #f8f9fc;">
            <td colspan="2" style="font-weight: 700; color: #2c3e50; padding: 16px 12px;">ŁĄCZNIE AKTYWNE ROSZCZENIA</td>
            <td class="td-right td-val" style="font-size: 16px; padding: 16px 12px;">${fmtN(trackB)} PLN</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <button class="print-btn no-print" onclick="window.print()">🖨️ Drukuj Raport PDF</button>
  </div>

  <script>
    (function() {
      var centroid = ${JSON.stringify(centroid || null)};
      var geojson = ${JSON.stringify(parcelGeo || null)};
      function init() {
        if (typeof L === 'undefined') { setTimeout(init, 300); return; }
        var el = document.getElementById('map');
        if (!el) return;
        var center = [52.069, 19.48];
        if (Array.isArray(centroid) && centroid.length >= 2 && centroid[0] != null) {
          center = [Number(centroid[1]), Number(centroid[0])];
        }
        var map = L.map(el, { zoomControl: true, attributionControl: false });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          subdomains: 'abcd',
          maxZoom: 19
        }).addTo(map);
        L.tileLayer.wms('https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow', {
          layers: 'dzialki,numery_dzialek',
          format: 'image/png',
          transparent: true,
          opacity: 0.75
        }).addTo(map);
        L.tileLayer('https://tiles.openinframap.org/power/{z}/{x}/{y}.png', {
          maxZoom: 19,
          opacity: 0.85
        }).addTo(map);
        if (geojson && geojson.coordinates) {
          var layer = L.geoJSON(geojson, {
            style: { color: '#b8963e', weight: 3, fillColor: '#b8963e', fillOpacity: 0.15 }
          }).addTo(map);
          try { map.fitBounds(layer.getBounds(), { padding: [16, 16] }); } catch(e) { map.setView(center, 15); }
        } else {
          map.setView(center, 15);
        }
      }
      if (document.readyState === 'complete') init();
      else window.addEventListener('load', init);
    })();
  </script>
</body>
</html>`;
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

/**
 * Historia analiz — lista analiz pojedynczych (ksws_history).
 * Klik w pozycję → otwarcie ładnego podglądu raportu z mapą w nowej karcie (bez przechodzenia do formularza Analizy).
 */
export default function HistoriaAnalizPage() {
  const [refresh, setRefresh] = useState(0);
  const history = loadHistory();
  const navigate = useNavigate();

  const openPreview = useCallback((item) => {
    if (!item || !item.parcel_id) return;
    if (!item.full_master_record) {
      alert("Brak pełnych danych raportu w historii dla tej działki.");
      return;
    }
    const html = buildSingleHtml(item);
    
    localStorage.setItem("ksws_print_html", html);
    const newWindow = window.open('#/kalkulator/raport-druk', '_blank');
    if (!newWindow) {
      alert("Przeglądarka zablokowała okno podglądu — zezwól na otwieranie nowych kart dla tej strony.");
    }
  }, []);

  return (
    <div className="ksws-card" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="ksws-card-header">
        <span className="ksws-card-header-icon">📋</span>
        <div>
          <div className="ksws-card-header-title">Historia analiz</div>
          <div className="ksws-card-header-sub">Lista analiz pojedynczych · kliknij, aby otworzyć podgląd raportu z mapą</div>
        </div>
      </div>
      <div className="ksws-card-body">
        {history.length === 0 ? (
          <div className="ksws-empty" style={{ padding: "32px 0" }}>
            <div className="ksws-empty-sub">Brak zapisanych analiz. Przejdź do Analiza działki i wygeneruj raport KSWS.</div>
            <button type="button" className="ksws-btn ksws-btn-primary" style={{ marginTop: 16 }} onClick={() => navigate("/kalkulator/analiza")}>
              Analiza działki
            </button>
          </div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e0e0e0", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", fontWeight: 700, color: "#3d2319" }}>#</th>
                  <th style={{ padding: "10px 12px", fontWeight: 700, color: "#3d2319" }}>Działka</th>
                  <th style={{ padding: "10px 12px", fontWeight: 700, color: "#3d2319" }}>Data</th>
                  <th style={{ padding: "10px 12px", fontWeight: 700, color: "#3d2319", textAlign: "right" }}>Pow. [m²]</th>
                  <th style={{ padding: "10px 12px", fontWeight: 700, color: "#3d2319", textAlign: "right" }}>Razem [PLN]</th>
                  <th style={{ padding: "10px 12px", fontWeight: 700, color: "#3d2319", textAlign: "center" }}>Kolizja</th>
                  <th style={{ padding: "10px 12px", fontWeight: 700, color: "#3d2319" }}></th>
                </tr>
              </thead>
              <tbody>
                {history.map((item, idx) => (
                  <tr
                    key={idx}
                    onClick={() => openPreview(item)}
                    style={{
                      borderBottom: "1px solid #eee",
                      cursor: "pointer",
                      background: idx % 2 === 0 ? "#fff" : "#fafafa",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f0f4ff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#fafafa"; }}
                  >
                    <td style={{ padding: "12px", color: "#666", fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ padding: "12px" }}>
                      <strong style={{ color: "#2c3e7a" }}>{item.parcel_id}</strong>
                      {item.location && <div style={{ fontSize: "0.75rem", color: "#888", marginTop: 2 }}>{item.location}</div>}
                    </td>
                    <td style={{ padding: "12px", color: "#555" }}>{item.date}</td>
                    <td style={{ padding: "12px", textAlign: "right" }}>{Math.round(item.area_m2 || 0).toLocaleString("pl-PL")}</td>
                    <td style={{ padding: "12px", textAlign: "right", fontWeight: 700, color: "#3d2319" }}>{Math.round(item.razem || item.track_a || 0).toLocaleString("pl-PL")}</td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <span style={{ color: item.collision ? "#e74c3c" : "#27ae60", fontWeight: 600 }}>{item.collision ? "TAK" : "NIE"}</span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <button type="button" className="ksws-btn" style={{ fontSize: "0.8rem" }} onClick={(e) => { e.stopPropagation(); openPreview(item); }}>
                        Podgląd
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 16, borderTop: "1px solid #eee" }}>
              <span style={{ fontSize: "0.85rem", color: "#666" }}>{history.length} analiz</span>
              <button type="button" className="ksws-btn-link" onClick={() => { localStorage.removeItem(HISTORY_KEY); setRefresh((r) => r + 1); }}>
                Wyczyść historię
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
