/**
 * Mapa zbiorcza dla batcha — współdzielona między KalkulatorPage (sekcja CSV) i BatchAnalysisPage.
 * Warstwy: Satelita/Topo, OIM, GUGIK EGiB, KIUT elektro + poligony działek z popupami.
 */
import React, { useEffect } from "react";
import { MapContainer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MAT_PARCEL_COLORS = [
  "#1e88e5", "#e53935", "#43a047", "#f4511e", "#8e24aa",
  "#fb8c00", "#00897b", "#5e35b1", "#00acc1", "#6d4c41",
  "#d81b60", "#3949ab", "#558b2f", "#ff6f00", "#00838f",
];

function BatchMapLayerControl() {
  const map = useMap();
  useEffect(() => {
    const orto = L.tileLayer.wms(
      "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution",
      { layers: "Raster", format: "image/png", transparent: false, version: "1.1.1", srs: "EPSG:3857", maxZoom: 19, attribution: "Geoportal Orto" }
    );
    orto.addTo(map);

    // Pane nad poligonami — OIM/KIUT (raster) i wektorowe linie/słupy w stylu Geoportal (czarne linie, słupy)
    if (!map.getPane("linesOverlay")) {
      const pane = map.createPane("linesOverlay");
      pane.style.zIndex = 500;
    }
    if (!map.getPane("vectorInfra")) {
      const vp = map.createPane("vectorInfra");
      vp.style.zIndex = 550;
    }

    const oimPower = L.tileLayer(
      "https://tiles.openinframap.org/power/{z}/{x}/{y}.png",
      { opacity: 1.0, maxZoom: 19, pane: "linesOverlay", zIndex: 1000 }
    );
    const gugikEw = L.tileLayer.wms(
      "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow",
      { layers: "dzialki,numery_dzialek", format: "image/png", transparent: true, opacity: 0.65, version: "1.1.1", srs: "EPSG:3857" }
    );
    const kiutElektro = L.tileLayer.wms(
      "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu",
      { layers: "przewod_elektroenergetyczny", format: "image/png", transparent: true, opacity: 0.98, version: "1.3.0", crs: L.CRS.EPSG4326, pane: "linesOverlay", zIndex: 950 }
    );
    oimPower.addTo(map);
    gugikEw.addTo(map);
    kiutElektro.addTo(map);
    try { gugikEw.setZIndex(400); } catch (_) {}
    try { kiutElektro.setZIndex(950); } catch (_) {}
    try { oimPower.setZIndex(1000); } catch (_) {}

    const baseLayers = { "🛰️ Geoportal Orto (WMS)": orto };
    const overlays = {
      "⚡ Linie energetyczne (OIM)": oimPower,
      "📋 Siatka działek (GUGIK)": gugikEw,
      "⚡ Elektroenergetyczny (KIUT)": kiutElektro,
    };
    const ctrl = L.control.layers(baseLayers, overlays, { collapsed: true, position: "topright" }).addTo(map);
    return () => {
      try { map.removeControl(ctrl); } catch (_) {}
      [orto, oimPower, gugikEw, kiutElektro].forEach((l) => {
        try { if (map.hasLayer(l)) map.removeLayer(l); } catch (_) {}
      });
    };
  }, [map]);
  return null;
}

function BatchParcelsLayer({ results }) {
  const map = useMap();
  useEffect(() => {
    if (!results || !map) return;
    const group = L.featureGroup();
    const infraLayers = []; // linie + słupy w stylu Geoportal (pane vectorInfra) — na wierzchu
    const list = Array.isArray(results) ? results : [];

    list.forEach((p, idx) => {
      const d = p.master_record || p.data || {};
      const geojson = d.geometry?.geojson_ll || d.geometry?.geojson;
      const centroid = d.geometry?.centroid_ll;
      const collision = !!d.infrastructure?.power_lines?.detected;
      const ta = d.compensation?.track_a?.total || 0;
      const tb = d.compensation?.track_b?.total || 0;
      const razem = ta + tb;
      const color = MAT_PARCEL_COLORS[idx % MAT_PARCEL_COLORS.length];

      const popup = `<div style="font-family:Inter,'Segoe UI',Arial,sans-serif;min-width:230px;border-radius:10px;overflow:hidden;font-size:12px;">
        <div style="background:${color};color:white;padding:10px 14px;font-weight:900;font-size:13px;">#${idx + 1} · ${p.parcel_id || "—"}</div>
        <div style="padding:10px 14px;">
          <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${collision ? "#e53935" : "#43a047"};color:white;">${collision ? "⚡ KOLIZJA" : "✓ BEZ KOLIZJI"}</span>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
            <div style="background:#f5f5f5;border-radius:6px;padding:6px 8px;"><div style="font-size:9px;color:#9e9e9e;text-transform:uppercase;font-weight:700;">Pow. działki</div><div style="font-weight:800;color:#212121;">${Math.round(d.geometry?.area_m2 || 0).toLocaleString()} m²</div></div>
            <div style="background:#f5f5f5;border-radius:6px;padding:6px 8px;"><div style="font-size:9px;color:#9e9e9e;text-transform:uppercase;font-weight:700;">Napięcie</div><div style="font-weight:800;color:#212121;">${d.infrastructure?.power_lines?.voltage || "—"}</div></div>
          </div>
          <div style="background:linear-gradient(135deg,#1976d2,#1565c0);border-radius:7px;padding:8px 10px;margin-top:6px;"><div style="font-size:9px;color:rgba(255,255,255,0.65);text-transform:uppercase;font-weight:700;">⚖️ Track A</div><div style="font-weight:900;color:white;font-size:13px;">${Math.round(ta).toLocaleString()} PLN</div></div>
          <div style="background:linear-gradient(135deg,#f57c00,#e65100);border-radius:7px;padding:8px 10px;margin-top:4px;"><div style="font-size:9px;color:rgba(255,255,255,0.65);text-transform:uppercase;font-weight:700;">🤝 Track B</div><div style="font-weight:900;color:white;font-size:13px;">${Math.round(tb).toLocaleString()} PLN</div></div>
          <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:7px;padding:8px 10px;margin-top:4px;"><div style="font-size:9px;color:rgba(255,193,7,0.8);text-transform:uppercase;font-weight:700;">💰 RAZEM</div><div style="font-weight:900;color:white;font-size:15px;">${Math.round(razem).toLocaleString()} PLN</div></div>
        </div>
      </div>`;

      // Działki: obrys + etykieta # (delikatniejszy fill, żeby linie były głównym elementem)
      if (geojson?.coordinates) {
        try {
          const poly = L.geoJSON(geojson, { style: { color, weight: 2, fillColor: color, fillOpacity: 0.2 } }).bindPopup(popup, { maxWidth: 260 });
          group.addLayer(poly);
          if (Array.isArray(centroid) && centroid[0] != null) {
            const icon = L.divIcon({ className: "", html: `<div style="background:${color};color:white;font-weight:900;font-size:10px;padding:2px 6px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.3);border:1px solid white;">#${idx + 1}</div>`, iconAnchor: [12, 8] });
            L.marker([Number(centroid[1]), Number(centroid[0])], { icon }).addTo(group);
          }
        } catch (_) {}
      } else if (Array.isArray(centroid) && centroid[0] != null) {
        const icon = L.divIcon({ className: "", html: `<div style="background:${color};color:white;font-weight:900;font-size:10px;padding:2px 6px;border-radius:10px;border:1px solid white;">#${idx + 1}</div>`, iconAnchor: [12, 8] });
        L.marker([Number(centroid[1]), Number(centroid[0])], { icon }).bindPopup(popup).addTo(group);
      }

      // Linie energetyczne — w stylu Geoportal (grube czarne linie przez działki), na osobnym pane nad działkami
      const pl = d.infrastructure?.power_lines || {};
      const plGeo = pl.geojson;
      const plFeatures = (plGeo?.features && Array.isArray(plGeo.features) && plGeo.features.length > 0)
        ? plGeo.features
        : (pl.features && Array.isArray(pl.features)) ? pl.features : [];
      plFeatures.forEach((feat) => {
        try {
          const geom = feat.geometry || feat;
          if (!geom || !geom.coordinates) return;
          const opts = { pane: "vectorInfra", style: { color: "#1a1a1a", weight: 6, opacity: 0.95, lineCap: "round", lineJoin: "round" } };
          const layer = L.geoJSON(geom.type ? geom : { type: "Feature", geometry: geom, properties: {} }, opts);
          layer.eachLayer((l) => { l.addTo(map); infraLayers.push(l); });
        } catch (_) {}
      });

      // Słupy — ciemne symbole na pane vectorInfra (jak na Geoportalu)
      const polesGeo = d.infrastructure?.power?.poles_geojson;
      const polesFeatures = polesGeo?.features && Array.isArray(polesGeo.features) ? polesGeo.features : [];
      polesFeatures.forEach((feat) => {
        try {
          const geom = feat.geometry || feat;
          if (!geom || geom.type !== "Point" || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) return;
          const [lng, lat] = geom.coordinates;
          const m = L.circleMarker([lat, lng], {
            pane: "vectorInfra",
            radius: 7,
            fillColor: "#1a1a1a",
            color: "#fff",
            weight: 2,
            fillOpacity: 0.95,
          });
          m.bindTooltip("Słup energetyczny", { direction: "top", className: "no-bg-tooltip" });
          m.addTo(map);
          infraLayers.push(m);
        } catch (_) {}
      });
    });

    group.addTo(map);
    try { const b = group.getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 16 }); } catch (_) {}
    return () => {
      try { map.removeLayer(group); } catch (_) {}
      infraLayers.forEach((l) => { try { map.removeLayer(l); } catch (_) {} });
    };
  }, [map, results]);
  return null;
}

export default function BatchMapSection({ results, total, collision }) {
  const count = Array.isArray(results) ? results.length : 0;
  const collisionCount = typeof collision === "number" ? collision : (results || []).filter((p) => {
    const d = p.master_record || p.data || {};
    return !!d.infrastructure?.power_lines?.detected;
  }).length;

  return (
    <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e8eaf0", overflow: "hidden", marginBottom: "24px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
      <div style={{ height: "5px", background: "linear-gradient(90deg,#e74c3c,#f39c12,#27ae60,#3498db)" }} />
      <div style={{ padding: "16px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f0f2f5" }}>
        <div style={{ fontWeight: "800", fontSize: "0.95em", color: "#3d2319", display: "flex", alignItems: "center", gap: "10px" }}>
          🗺️ Mapa zbiorcza
          <span style={{ fontWeight: "400", fontSize: "0.85em", color: "#95a5a6" }}>— wszystkie {total ?? count} działek</span>
        </div>
        <div style={{ display: "flex", gap: "16px", fontSize: "0.78em" }}>
          <span><strong style={{ color: "#e74c3c" }}>🔴 {collisionCount}</strong> z kolizją</span>
          <span><strong style={{ color: "#27ae60" }}>🟢 {(total ?? count) - collisionCount}</strong> bez kolizji</span>
        </div>
      </div>
      <MapContainer center={[52.0, 20.0]} zoom={7} style={{ height: "480px", width: "100%" }}>
        <BatchMapLayerControl />
        <BatchParcelsLayer results={results} />
      </MapContainer>
      <div style={{ padding: "10px 20px", background: "#f8f9fc", display: "flex", gap: "20px", fontSize: "0.75em", color: "#636e72", flexWrap: "wrap", alignItems: "center" }}>
        <span>⬛ <strong>Grube czarne linie</strong> — trasa linii energetycznej przez działki (jak na Geoportalu)</span>
        <span>⚡ Warstwy OIM / KIUT — przełączaj w kontrolce (prawy górny róg)</span>
      </div>
    </div>
  );
}
