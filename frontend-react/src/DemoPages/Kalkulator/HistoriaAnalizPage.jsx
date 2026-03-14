import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./KalkulatorPage.css";
import { BASE_LAYERS, GUGIK_WMS, OIM_TILES } from "./mapSources";

const HISTORY_KEY = "ksws_history";

export function buildSingleHtml(item) {
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
  const cq = mr.claims_qualification || {};
  const totalActive = cq.total_active_claims ?? total;
  const priceStatus = market.status || "";
  const integrationErrorPrice = (price == null || price === 0) && priceStatus !== "Korekta ręczna";

  const fmtI = (v) => Math.round(v || 0).toLocaleString("pl-PL");
  const fmtN = (v) => (v || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const priceSub = integrationErrorPrice ? "Cena nie została pobrana z GUS BDL — sprawdź połączenie z API." : ("GUS BDL · " + (market.price_source || "GUS"));

  const parcelGeo = geom.geojson_ll || geom.geojson || null;
  const centroid = geom.centroid_ll || null;
  const plGeojson = pl.geojson || null;
  const plFeatures = (plGeojson && plGeojson.features && Array.isArray(plGeojson.features)) ? plGeojson.features : (pl.features && Array.isArray(pl.features)) ? pl.features : [];
  const powerLinesGeojson = (plGeojson && (plGeojson.features?.length || plGeojson.type === "LineString" || plGeojson.type === "MultiLineString" || plGeojson.coordinates)) ? plGeojson : (plFeatures.length > 0) ? { type: "FeatureCollection", features: plFeatures } : null;
  const powerLinesVoltage = pl.voltage || null;

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
    
    .no-bg-tooltip { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; overflow: visible !important; }
    .no-bg-tooltip::before { display: none !important; }
    
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
        <div class="t-card-val">${integrationErrorPrice ? "—" : fmtN(price) + " zł/m²"}</div>
        <div class="t-card-sub">${priceSub}</div>
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
            <div class="i-val">${integrationErrorPrice ? "Błąd integracji (GUS)" : fmtN(price) + " zł/m²"}</div>
            <div class="i-sub">${priceSub}</div>
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
      <table style="table-layout:fixed;width:100%;">
        <thead>
          <tr>
            <th style="width:22%;">Parametr</th>
            <th style="width:18%;">Wartość</th>
            <th class="td-center" style="width:10%;">Wsp.</th>
            <th class="td-center" style="width:12%;">Wartość</th>
            <th style="width:38%;">Opis</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Typ infrastruktury</td>
            <td class="td-val">Linie ${pl.voltage || "—"}</td>
            <td class="td-center" style="color:#e74c3c;">S</td>
            <td class="td-center">${(comp.basis && comp.basis.S != null) ? comp.basis.S : "0,2"}</td>
            <td>obniżenie wartości pasa</td>
          </tr>
          <tr>
            <td>Szerokość pasa ochronnego</td>
            <td class="td-val">${mr.ksws?.band_width_m || "—"} m</td>
            <td class="td-center" style="color:#e74c3c;">k</td>
            <td class="td-center">${(comp.basis && comp.basis.k != null) ? comp.basis.k : "0,5"}</td>
            <td>współczynnik korzystania</td>
          </tr>
          <tr>
            <td>Powierzchnia pasa</td>
            <td class="td-val">${fmtI(mr.ksws?.band_area_m2 || 0)} m²</td>
            <td class="td-center" style="color:#e74c3c;">R</td>
            <td class="td-center">${(comp.basis && comp.basis.R != null) ? comp.basis.R : "0,06"}</td>
            <td>stopa kapitalizacji</td>
          </tr>
          <tr>
            <td>Wartość nieruchomości</td>
            <td class="td-val">${fmtN(area * price)} PLN</td>
            <td class="td-center" style="color:#e74c3c;">impact</td>
            <td class="td-center">${(comp.basis && comp.basis.impact_judicial != null) ? comp.basis.impact_judicial : "0,05"}</td>
            <td>wpływ sądowy (OBN)</td>
          </tr>
          <tr>
            <td>Cena bazowa</td>
            <td class="td-val">${integrationErrorPrice ? "Błąd integracji (GUS)" : fmtN(price) + " zł/m²"}</td>
            <td class="td-center" style="color:#e74c3c;">×&nbsp;B</td>
            <td class="td-center">${(function(){ const m = comp.basis?.track_b_multiplier ?? comp.track_b?.multiplier ?? 1.56; return typeof m === "number" ? m.toString().replace(".", ",") : m; })()}</td>
            <td>mnożnik Track B</td>
          </tr>
        </tbody>
      </table>
      <div style="margin-top:14px;padding:12px;background:#f8f9fc;border-radius:8px;border-left:4px solid #3498db;font-size:12px;color:#2c3e50;line-height:1.5;">
        <strong>Metodologia wyliczania roszczeń</strong><br/>
        Wszystkie wartości w niniejszym raporcie pochodzą z API (backend) — z integracji: ULDK/EGiB (geometria, powierzchnia), GUS BDL (cena gruntu), KIUT/Overpass (długość linii, kolizja), współczynniki KSWS według typu infrastruktury. Gdy dane nie zostały pobrane, raport wskazuje „Błąd integracji” zamiast wartości domyślnych.<br/>
        <strong>Track A (ścieżka sądowa, TK P 10/16):</strong> WSP (służebność przesyłu) + WBK (bezumowne korzystanie, 6 lat) + OBN (obniżenie wartości nieruchomości). Wzory: WSP = wartość nier. × S × k × (pow. pasa / pow. działki); WBK = wartość × R × k × % pasa × lata; OBN = wartość × impact_judicial.<br/>
        <strong>Track B (ścieżka negocjacyjna):</strong> Track A × mnożnik (benchmark rynkowy dla danego typu linii).<br/>
        <strong>R1–R5:</strong> R1 = WSP; R2 = WBK; R3 = OBN; R4 = blokada zabudowy (WZ/MPZP); R5 = szkoda rolna (tylko przy opcji „Rolnik”).
      </div>
    </div>
    
    <div class="table-card">
      <div class="table-header">
        ⚖️ Kwalifikacja roszczeń R1–R5
        <div class="table-header-right">Łącznie: ${fmtN(totalActive)} PLN</div>
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
          <tr style="opacity: ${(cq.R1 && cq.R1.active) ? 1 : 0.5};">
            <td>
              <strong>R1 — Służebność przesyłu (WSP)</strong>
              ${(cq.R1 && cq.R1.note) ? `<div class="t-row-sub">${cq.R1.note}</div>` : ""}
            </td>
            <td>art. 305¹–305⁴ KC</td>
            <td class="td-right td-val">${(cq.R1 && cq.R1.active) ? fmtN(cq.R1.value) + " PLN" : "n.d."}</td>
          </tr>
          <tr style="opacity: ${(cq.R2 && cq.R2.active) ? 1 : 0.5};">
            <td>
              <strong>R2 — Bezumowne korzystanie (WBK ${(cq.R2 && cq.R2.years) || 6} lat)</strong>
              ${(cq.R2 && cq.R2.note) ? `<div class="t-row-sub">${cq.R2.note}</div>` : ""}
            </td>
            <td>art. 224–225 KC</td>
            <td class="td-right td-val">${(cq.R2 && cq.R2.active) ? fmtN(cq.R2.value) + " PLN" : "n.d."}</td>
          </tr>
          <tr style="opacity: ${(cq.R3 && cq.R3.active) ? 1 : 0.5};">
            <td>
              <strong>R3 — Obniżenie wartości (OBN)</strong>
              ${(cq.R3 && cq.R3.note) ? `<div class="t-row-sub">${cq.R3.note}</div>` : ""}
            </td>
            <td>art. 305² KC</td>
            <td class="td-right td-val">${(cq.R3 && cq.R3.active) ? fmtN(cq.R3.value) + " PLN" : "n.d."}</td>
          </tr>
          <tr style="opacity: ${(cq.R4 && cq.R4.active) ? 1 : 0.5};">
            <td>
              <strong>R4 — Blokada zabudowy</strong>
              ${(cq.R4 && cq.R4.note) ? `<div class="t-row-sub">${cq.R4.note}</div>` : ""}
            </td>
            <td>art. 140 KC + WZ/MPZP</td>
            <td class="td-right td-val">${(cq.R4 && cq.R4.active) ? fmtN(cq.R4.value) + " PLN" : "n.d."}</td>
          </tr>
          ${(cq.R5 && cq.R5.active) ? `
          <tr class="t-row-green">
            <td>
              <strong>🌾 R5 — Szkoda rolna</strong>
              <div class="t-row-sub" style="color:#1a7a2e; margin-top:4px;">Szkoda rolna (R5) — wyliczona wyłącznie przy zaznaczeniu opcji «Rolnik» w formularzu analizy.</div>
              ${(cq.R5.detail && (cq.R5.detail.pole_count > 0)) ? `
              <div style="margin-left: 10px; margin-top: 4px;">
                ${(cq.R5.detail.r51 && cq.R5.detail.r51.formula) ? `<div>└ R5.1 Fundamenty (${cq.R5.detail.r51.formula})</div>` : ""}
                ${(cq.R5.detail.r52 && cq.R5.detail.r52.formula) ? `<div>└ R5.2 Wyspy/kliny (${cq.R5.detail.r52.formula})</div>` : ""}
              </div>
              ${(cq.R5.detail.r52 && cq.R5.detail.r52.note) ? `<div class="t-row-sub" style="margin-top: 4px;">${cq.R5.detail.r52.note}</div>` : ""}
              ` : ""}
            </td>
            <td>
              ${(cq.R5.detail && (cq.R5.detail.r51 || cq.R5.detail.r52)) ? `
              <div>art. 361 §1–2 KC</div>
              ${cq.R5.detail.r51 ? "<div>damnum emergens</div>" : ""}
              ${cq.R5.detail.r52 ? "<div>lucrum cessans - GUS zł/ha/rok</div>" : ""}
              ` : "art. 361 §1–2 KC"}
            </td>
            <td class="td-right td-val">
              ${(cq.R5.detail && (cq.R5.detail.r51 || cq.R5.detail.r52)) ? `
              ${cq.R5.detail.r51 ? `<div>${fmtN(cq.R5.detail.r51.value)} PLN</div>` : ""}
              ${cq.R5.detail.r52 ? `<div>${fmtN(cq.R5.detail.r52.value)} PLN</div>` : ""}
              ` : ""}
              <div style="font-weight:700;">${fmtN(cq.R5.value)} PLN</div>
            </td>
          </tr>
          ` : `
          <tr style="opacity: 0.6;">
            <td>
              <strong>R5 — Szkoda rolna</strong>
              <div class="t-row-sub" style="color:#e74c3c;">Nie dotyczy — nie zaznaczono opcji «Rolnik» w formularzu analizy.</div>
            </td>
            <td>art. 361 §1–2 KC</td>
            <td class="td-right td-val">n.d.</td>
          </tr>
          `}
          <tr style="background: #f8f9fc;">
            <td colspan="2" style="font-weight: 700; color: #2c3e50; padding: 16px 12px;">ŁĄCZNIE AKTYWNE ROSZCZENIA</td>
            <td class="td-right td-val" style="font-size: 16px; padding: 16px 12px;">${fmtN(totalActive)} PLN</td>
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
      var powerLinesGeojson = ${JSON.stringify(powerLinesGeojson || null)};
      var defaultVoltage = ${JSON.stringify(powerLinesVoltage || null)};
      function styleByVoltage(voltage) {
        var v = (voltage || '').toUpperCase();
        var base = { opacity: 0.9, lineCap: 'round', lineJoin: 'round' };
        if (v === 'WN') return Object.assign({ color: '#E91E63', weight: 4 }, base);
        if (v === 'NN' || v === 'N' || v === 'NN') return Object.assign({ color: '#6A1B9A', weight: 2 }, base);
        return Object.assign({ color: '#9C27B0', weight: 3 }, base);
      }
      function addPowerLinesToMap(map, g, defVolt) {
        if (!g) return;
        try {
          L.geoJSON(g, {
            style: function(f) {
              var vol = (f && f.properties && f.properties.voltage) || defVolt;
              return styleByVoltage(vol);
            },
            onEachFeature: function(f, layer) {
              var vol = (f && f.properties && f.properties.voltage) || defVolt || '';
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
      function init() {
        if (typeof L === 'undefined') { setTimeout(init, 300); return; }
        var el = document.getElementById('map');
        if (!el) return;
        var center = [52.069, 19.48];
        if (Array.isArray(centroid) && centroid.length >= 2 && centroid[0] != null) {
          center = [Number(centroid[1]), Number(centroid[0])];
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

        L.circle(center, {
          radius: 200, color: '#ffffff', fillColor: 'transparent', weight: 1.5, dashArray: '5, 5'
        }).addTo(map).bindTooltip("Zasięg analizy promieniowej (200m)", { sticky: true, className: 'no-bg-tooltip', direction: 'top' });

        if (geojson && geojson.coordinates) {
          var layer = L.geoJSON(geojson, {
            style: { color: collision ? '#ff0055' : '#00ffff', weight: 4, fillOpacity: 0.15 }
          }).addTo(map);
          addPowerLinesToMap(map, powerLinesGeojson, defaultVoltage);
          try { map.fitBounds(layer.getBounds(), { padding: [16, 16] }); } catch(e) { map.setView(center, 15); }
        } else {
          addPowerLinesToMap(map, powerLinesGeojson, defaultVoltage);
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
    <>
      <header className="ksws-page-header">
        <h1 className="ksws-page-header-title">📋 Historia analiz</h1>
        <p className="ksws-page-header-sub">Pojedyncze analizy z zakładki Analiza działki (zapis w przeglądarce). Kliknij wiersz → podgląd raportu z mapą i liniami energetycznymi.</p>
      </header>
      <div className="ksws-card" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="ksws-card-header">
        <span className="ksws-card-header-icon">📋</span>
        <div>
          <div className="ksws-card-header-title">Lista analiz</div>
          <div className="ksws-card-header-sub">Kliknij wiersz, aby otworzyć raport z mapą i wyliczeniami w nowej karcie.</div>
        </div>
      </div>
      <div className="ksws-card-body">
        {history.length === 0 ? (
          <div className="ksws-empty" style={{ padding: "32px 0" }}>
            <div className="ksws-empty-sub">Brak zapisanych analiz. Wejdź w <strong>Analiza działki</strong>, wpisz działkę i wygeneruj raport — wtedy wpis pojawi się tutaj.</div>
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
    </>
  );
}
