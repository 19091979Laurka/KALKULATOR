import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, WMSTileLayer, useMap, GeoJSON } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "react-toastify";
import CountUp from "react-countup";
import { Spinner, Badge, Table, Progress } from "reactstrap";
import "./KalkulatorPage.css";

// ── Leaflet default icon fix ──────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Mini map layers (parcel polygon + OIM power lines) ───────────────────────
function MiniMapLayers({ geojson, collision }) {
  const map = useMap();
  useEffect(() => {
    if (!geojson || !geojson.coordinates) return;
    const color = collision ? "#e74c3c" : "#27ae60";
    const layer = L.geoJSON(geojson, {
      style: { color, weight: 2.5, fillColor: color, fillOpacity: 0.25, dashArray: null },
    }).addTo(map);
    try { map.fitBounds(layer.getBounds(), { padding: [8, 8] }); } catch (_) {}
    return () => { try { map.removeLayer(layer); } catch (_) {} };
  }, [map, geojson, collision]);
  return null;
}

// ── ParcelMiniMap — satelita + obrys działki jak geoportal ───────────────────
// plain L.map() na DOM div → zero react-leaflet z-index leaks
function ParcelMiniMap({ geojson, centroid, collision, height = 260 }) {
  const [ready, setReady] = useState(false);
  const wrapRef   = useRef(null);
  const mapDivRef = useRef(null);
  const leafMap   = useRef(null);

  // lazy: init only when card scrolls into view
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setReady(true); obs.disconnect(); } },
      { threshold: 0.05 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!ready || !mapDivRef.current || leafMap.current) return;

    // centroid [lon, lat] → Leaflet [lat, lon]
    let center = [52.069, 19.480];
    if (Array.isArray(centroid) && centroid.length >= 2 && centroid[0] != null) {
      center = [Number(centroid[1]), Number(centroid[0])];
    } else if (geojson?.coordinates) {
      try {
        const ring = geojson.type === "Polygon" ? geojson.coordinates[0]
                   : geojson.type === "MultiPolygon" ? geojson.coordinates[0][0] : null;
        if (ring?.length) center = [
          ring.reduce((s,c)=>s+c[1],0)/ring.length,
          ring.reduce((s,c)=>s+c[0],0)/ring.length,
        ];
      } catch(_) {}
    }

    const map = L.map(mapDivRef.current, {
      center, zoom: 15,
      zoomControl: false, attributionControl: false,
      scrollWheelZoom: false, dragging: true, doubleClickZoom: false,
    });

    // ── satelita jak geoportal (Esri WorldImagery) ──
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19 }
    ).addTo(map);

    // ── GESUT — uzbrojenie terenu (linie energetyczne, rury, kable) ──
    L.tileLayer.wms(
      "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu",
      {
        layers: "przewod_elektroenergetyczny,przewod_gazowy,przewod_wodociagowy,przewod_kanalizacyjny,przewod_cieplowniczy",
        format: "image/png", transparent: true, opacity: 0.85,
      }
    ).addTo(map);

    // ── siatka katastralna GUGIK (działki + numery — lżejsza) ──
    L.tileLayer.wms(
      "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow",
      { layers: "dzialki,numery_dzialek", format: "image/png", transparent: true, opacity: 0.5 }
    ).addTo(map);

    // ── obrys działki: zielony fill + ciemna granica — jak geoportal ──
    if (geojson?.coordinates) {
      const layer = L.geoJSON(geojson, {
        style: {
          color: "#1a2035",     // ciemna granica (jak czarny obrys w geoportalu)
          weight: 2.5,
          fillColor: "#27ae60", // zielony fill
          fillOpacity: 0.28,
          dashArray: null,
        }
      }).addTo(map);
      try { map.fitBounds(layer.getBounds(), { padding: [10, 10], maxZoom: 18 }); }
      catch(_) { map.setView(center, 15); }
    } else {
      map.setView(center, 15);
    }

    leafMap.current = map;
    return () => { if (leafMap.current) { leafMap.current.remove(); leafMap.current = null; } };
  }, [ready]); // eslint-disable-line

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", height: `${height}px`, overflow: "hidden", background: "#c8d0d8", borderRadius: "0 0 14px 14px" }}
    >
      {/* placeholder */}
      {!ready && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", color: "#7f8c8d" }}>
          <div style={{ fontSize: "1.6em" }}>🛰️</div>
          <div style={{ fontSize: "0.7em", fontWeight: "600" }}>Ortofoto · ładowanie…</div>
        </div>
      )}
      {/* Leaflet target */}
      <div ref={mapDivRef} style={{ height: "100%", width: "100%", visibility: ready ? "visible" : "hidden" }} />
      {/* collision badge */}
      {ready && (
        <div style={{
          position: "absolute", bottom: "7px", left: "8px", zIndex: 999,
          background: collision ? "rgba(220,53,69,0.85)" : "rgba(25,135,84,0.85)",
          color: "white", padding: "2px 9px", borderRadius: "8px",
          fontSize: "0.66em", fontWeight: "700", pointerEvents: "none",
          backdropFilter: "blur(3px)",
        }}>
          {collision ? "⚡ kolizja" : "✓ ok"}
        </div>
      )}
    </div>
  );
}

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

// ── PreloadedPowerLayer — renderuje dane Overpass pobrane podczas analizy ──────
function PreloadedPowerLayer({ geoJSON }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!geoJSON || !geoJSON.features?.length) return;

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    const geoLayer = L.geoJSON(geoJSON, {
      style: (feature) => ({
        color: VOLTAGE_COLOR(feature.properties.voltage),
        weight: VOLTAGE_WEIGHT(feature.properties.voltage),
        opacity: 0.92,
      }),
      pointToLayer: (feature, latlng) => {
        const pwr = feature.properties.power;
        const color = pwr === "transformer" || pwr === "substation" ? "#9b59b6" : "#8B4513";
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
    });

    geoLayer.addTo(map);
    layerRef.current = geoLayer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, geoJSON]);

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

// ── Batch Parcels Layer - poligony działek + linie energetyczne + auto-fit ──
// Material Design palette — distinct color per parcel on collective map
const MAT_PARCEL_COLORS = [
  "#1e88e5","#e53935","#43a047","#f4511e","#8e24aa",
  "#fb8c00","#00897b","#5e35b1","#00acc1","#6d4c41",
  "#d81b60","#3949ab","#558b2f","#ff6f00","#00838f",
];

function BatchParcelsLayer({ results }) {
  const map = useMap();

  useEffect(() => {
    if (!results || !map) return;
    const group = L.featureGroup();

    results.forEach((p, idx) => {
      const geojson = p.data?.geometry?.geojson_ll || p.data?.geometry?.geojson;
      const centroid = p.data?.geometry?.centroid_ll;
      const collision = p.data?.infrastructure?.power_lines?.detected;
      const ta = p.data?.compensation?.track_a?.total || 0;
      const tb = p.data?.compensation?.track_b?.total || 0;
      const razem = ta + tb;
      const color = MAT_PARCEL_COLORS[idx % MAT_PARCEL_COLORS.length];

      const popup = `<div style="font-family:Inter,'Segoe UI',Arial,sans-serif;min-width:230px;border-radius:10px;overflow:hidden;font-size:12px;">
        <div style="background:${color};color:white;padding:10px 14px;font-weight:900;font-size:13px;">
          #${idx+1} · ${p.parcel_id||"—"}
        </div>
        <div style="padding:10px 14px;">
          <div style="margin-bottom:8px;">
            <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${collision?"#e53935":"#43a047"};color:white;">
              ${collision?"⚡ KOLIZJA":"✓ BEZ KOLIZJI"}
            </span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
            <div style="background:#f5f5f5;border-radius:6px;padding:6px 8px;">
              <div style="font-size:9px;color:#9e9e9e;text-transform:uppercase;font-weight:700;">Pow. działki</div>
              <div style="font-weight:800;color:#212121;">${Math.round(p.data?.geometry?.area_m2||0).toLocaleString()} m²</div>
            </div>
            <div style="background:#f5f5f5;border-radius:6px;padding:6px 8px;">
              <div style="font-size:9px;color:#9e9e9e;text-transform:uppercase;font-weight:700;">Napięcie</div>
              <div style="font-weight:800;color:#212121;">${p.data?.infrastructure?.power_lines?.voltage||"—"}</div>
            </div>
          </div>
          <div style="background:linear-gradient(135deg,#1976d2,#1565c0);border-radius:7px;padding:8px 10px;margin-bottom:5px;">
            <div style="font-size:9px;color:rgba(255,255,255,0.65);text-transform:uppercase;font-weight:700;letter-spacing:0.5px;">⚖️ Track A · Sąd</div>
            <div style="font-weight:900;color:white;font-size:13px;">${Math.round(ta).toLocaleString()} PLN</div>
          </div>
          <div style="background:linear-gradient(135deg,#f57c00,#e65100);border-radius:7px;padding:8px 10px;margin-bottom:5px;">
            <div style="font-size:9px;color:rgba(255,255,255,0.65);text-transform:uppercase;font-weight:700;letter-spacing:0.5px;">🤝 Track B · Neg.</div>
            <div style="font-weight:900;color:white;font-size:13px;">${Math.round(tb).toLocaleString()} PLN</div>
          </div>
          <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:7px;padding:8px 10px;">
            <div style="font-size:9px;color:rgba(255,193,7,0.8);text-transform:uppercase;font-weight:700;letter-spacing:0.5px;">💰 RAZEM A+B</div>
            <div style="font-weight:900;color:white;font-size:15px;">${Math.round(razem).toLocaleString()} PLN</div>
          </div>
        </div>
      </div>`;

      if (geojson?.coordinates) {
        try {
          const poly = L.geoJSON(geojson, {
            style: { color, weight: 3, fillColor: color, fillOpacity: 0.3 },
          }).bindPopup(popup, { maxWidth: 260 });
          group.addLayer(poly);
          // Numbered label
          if (Array.isArray(centroid) && centroid[0] != null) {
            const icon = L.divIcon({
              className: "",
              html: `<div style="background:${color};color:white;font-weight:900;font-size:11px;padding:2px 7px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.35);white-space:nowrap;border:2px solid white;line-height:1.4;">#${idx+1}</div>`,
              iconAnchor: [14, 10],
            });
            L.marker([Number(centroid[1]), Number(centroid[0])], { icon }).addTo(group);
          }
        } catch(_) {}
      } else if (Array.isArray(centroid) && centroid[0] != null) {
        const icon = L.divIcon({
          className: "",
          html: `<div style="background:${color};color:white;font-weight:900;font-size:11px;padding:4px 8px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.35);border:2px solid white;">#${idx+1}</div>`,
          iconAnchor: [16, 12],
        });
        L.marker([Number(centroid[1]), Number(centroid[0])], { icon }).bindPopup(popup).addTo(group);
      }

      // Power lines
      const plGeo = p.data?.infrastructure?.power_lines?.geojson;
      if (plGeo?.features) {
        plGeo.features.forEach((feat) => {
          try {
            const v = feat.properties?.voltage || "SN";
            const lc = v === "WN" ? "#e53935" : v === "nN" ? "#1e88e5" : "#fb8c00";
            L.geoJSON(feat.geometry, { style: { color: lc, weight: v === "WN" ? 5 : 3, opacity: 0.9 } }).addTo(group);
          } catch(_) {}
        });
      }
    });

    group.addTo(map);
    try {
      const b = group.getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
    } catch(_) {}

    return () => { try { map.removeLayer(group); } catch(_) {} };
  }, [map, results]);

  return null;
}

// ── Infrastruktura terenu - warstwy KIUT GUGiK z kontrolką włącz/wyłącz ────
function InfrastructureLayer() {
  const map = useMap();

  useEffect(() => {
    // ── Open Infrastructure Map — kafelki linii energetycznych (ZAWSZE WIDOCZNE) ──
    // Darmowe, publiczne, bazują na OSM. Pokrycie: globalne, w tym PL.
    const oimPower = L.tileLayer(
      "https://tiles.openinframap.org/power/{z}/{x}/{y}.png",
      {
        attribution: '⚡ <a href="https://openinframap.org" target="_blank">Open Infrastructure Map</a>',
        opacity: 0.9,
        maxZoom: 19,
        zIndex: 6,
      }
    );

    // ── KIUT GUGiK WMS — linie energetyczne PL (oficjalne dane PL) ──
    const KIUT_URL = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu";
    const wmsBase = { format: "image/png", transparent: true, opacity: 0.8, zIndex: 5 };
    const kiutElektro = L.tileLayer.wms(KIUT_URL, { ...wmsBase, layers: "przewod_elektroenergetyczny", attribution: "KIUT GUGiK" });
    const kiutGaz     = L.tileLayer.wms(KIUT_URL, { ...wmsBase, layers: "przewod_gazowy" });
    const kiutWoda    = L.tileLayer.wms(KIUT_URL, { ...wmsBase, layers: "przewod_wodociagowy" });
    const kiutKanal   = L.tileLayer.wms(KIUT_URL, { ...wmsBase, layers: "przewod_kanalizacyjny" });
    const kiutCieplo  = L.tileLayer.wms(KIUT_URL, { ...wmsBase, layers: "przewod_cieplowniczy" });
    const kiutTelekom = L.tileLayer.wms(KIUT_URL, { ...wmsBase, layers: "przewod_telekomunikacyjny" });

    // Domyślnie włączone: OIM (zawsze widoczna) + KIUT elektro
    oimPower.addTo(map);
    kiutElektro.addTo(map);

    const overlays = {
      "⚡ Linie energetyczne (Open Infra Map)": oimPower,
      "⚡ Linie elektroenergetyczne (KIUT GUGiK)": kiutElektro,
      "🔥 Gazowy (KIUT)": kiutGaz,
      "💧 Wodociągowy (KIUT)": kiutWoda,
      "🚿 Kanalizacyjny (KIUT)": kiutKanal,
      "🌡 Ciepłowniczy (KIUT)": kiutCieplo,
      "📡 Telekomunikacyjny (KIUT)": kiutTelekom,
    };
    const ctrl = L.control.layers(null, overlays, { collapsed: false, position: "topright" }).addTo(map);

    return () => {
      map.removeControl(ctrl);
      [oimPower, kiutElektro, kiutGaz, kiutWoda, kiutKanal, kiutCieplo, kiutTelekom].forEach((l) => {
        if (map.hasLayer(l)) map.removeLayer(l);
      });
    };
  }, [map]);

  return null;
}

// ── Batch CSV Collective Map — layer control (base + overlays) ──────────────
function BatchMapLayerControl() {
  const map = useMap();
  useEffect(() => {
    // Base layers
    const topo = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 18, attribution: "© Esri" }
    );
    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19 }
    );
    topo.addTo(map); // default base layer

    // Overlays
    const oimPower = L.tileLayer(
      "https://tiles.openinframap.org/power/{z}/{x}/{y}.png",
      { opacity: 0.85, maxZoom: 19 }
    );
    const gugikEw = L.tileLayer.wms(
      "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow",
      { layers: "dzialki,numery_dzialek", format: "image/png", transparent: true, opacity: 0.6 }
    );
    const kiutElektro = L.tileLayer.wms(
      "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu",
      { layers: "przewod_elektroenergetyczny", format: "image/png", transparent: true, opacity: 0.8 }
    );
    oimPower.addTo(map); // default overlay on

    const baseLayers = {
      "🗺️ Topo (Esri)": topo,
      "🛰️ Satelita": satellite,
    };
    const overlays = {
      "⚡ Linie energetyczne (OIM)": oimPower,
      "📋 Siatka działek (GUGIK)": gugikEw,
      "⚡ Elektroenergetyczny (KIUT)": kiutElektro,
    };
    const ctrl = L.control.layers(baseLayers, overlays, { collapsed: false, position: "topright" }).addTo(map);

    return () => {
      try { map.removeControl(ctrl); } catch(_) {}
      [topo, satellite, oimPower, gugikEw, kiutElektro].forEach(l => {
        try { if (map.hasLayer(l)) map.removeLayer(l); } catch(_) {}
      });
    };
  }, [map]);
  return null;
}

// ── PDF Report Generator — otwiera raport-template-3d.html z danymi działki ─
function generateParcelPDF(parcel) {
  const mr = parcel.data || {};
  // Przekaż dane przez sessionStorage — odczyt w szablonie lub przez polling
  const key = `ksws_rpt_${Date.now()}`;
  try { sessionStorage.setItem(key, JSON.stringify(mr)); } catch (_) {}
  const win = window.open(`/raport-template-3d.html?key=${key}`, "_blank");
  if (!win) {
    toast.error("Przeglądarka zablokowała popup — zezwól na wyskakujące okna");
    return;
  }
  // Polling co 200ms aż fillReport będzie gotowe (max 5s)
  let n = 0;
  const iv = setInterval(() => {
    n++;
    try {
      if (typeof win.fillReport === "function") {
        clearInterval(iv);
        win.fillReport(mr);
        toast.success(`Raport dla ${parcel.parcel_id} — użyj Ctrl+P by zapisać jako PDF`);
      } else if (win.closed || n > 25) {
        clearInterval(iv);
        if (n > 25) toast.error("Timeout ładowania szablonu");
      }
    } catch (_) { clearInterval(iv); }
  }, 200);
}

// ── Batch CSV Component ─────────────────────────────────────────────────────
function BatchCSVSection() {
  const [batchResults, setBatchResults] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [batchError, setBatchError] = useState(null);

  // CSV tab ZAWSZE startuje czysto — poprzednie wyniki są w "Historia Batch CSV" poniżej
  // Nie ładujemy automatycznie ostatniego batcha

  const saveBatchToHistory = (batchData) => {
    try {
      const batchHistory = JSON.parse(localStorage.getItem("batch_history") || "[]");
      const trackA = batchData.results.reduce((s, p) => s + (p.data?.compensation?.track_a?.total || 0), 0);
      const trackB = batchData.results.reduce((s, p) => s + (p.data?.compensation?.track_b?.total || 0), 0);
      const newBatch = {
        id: `batch_${new Date().getTime()}`,
        date: nowPL(),
        parcel_count: batchData.parcel_count,
        successful: batchData.successful,
        full_data: batchData.results, // PEŁNE DANE
        summary: {
          trackA: trackA,
          trackB: trackB,
          total: trackA + trackB,
          collision: batchData.results.filter(p => p.data?.infrastructure?.power_lines?.detected).length,
        }
      };
      const updated = [newBatch, ...batchHistory].slice(0, 10);
      localStorage.setItem("batch_history", JSON.stringify(updated));
      console.log("✅ Batch saved to history:", newBatch.id);
    } catch (e) {
      console.error("Error saving batch history:", e);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!csvFile) {
      toast.error("Wybierz plik CSV");
      return;
    }
    // ZERUJ poprzednie wyniki
    setBatchResults(null);
    setBatchLoading(true);
    setBatchError(null);
    const form = new FormData();
    form.append("file", csvFile);
    try {
      const res = await fetch("/api/analyze/batch", { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Błąd");
      // Ustaw nowe wyniki
      const batchData = {
        results: data.parcels,
        parcel_count: data.summary?.total || data.parcels?.length || 0,
        successful: data.summary?.successful || 0,
      };
      setBatchResults(batchData);
      // Zapisz do historii
      if (batchData.results) {
        saveBatchToHistory(batchData);
      }
      setCsvFile(null);
      toast.success(`Batch ${batchData.parcel_count} działek załadowany i zapisany!`);
    } catch (err) {
      setBatchError(err.message);
      toast.error("Błąd: " + err.message);
    } finally {
      setBatchLoading(false);
    }
  };

  const downloadCSV = () => {
    if (!batchResults?.results) return;
    const rows = batchResults.results.map(p => [
      p.parcel_id,
      p.data?.infrastructure?.power_lines?.detected ? "TAK" : "NIE",
      p.data?.infrastructure?.power_lines?.voltage || "—",
      Math.round(p.data?.geometry?.area_m2 || 0),
      Math.round(p.data?.market_data?.average_price_m2 || 0),
      Math.round(p.data?.ksws?.property_value_total || 0),
      Math.round(p.data?.ksws?.line_length_m || p.data?.infrastructure?.power_lines?.length_m || 0),  // Dł_Linii_m
      Math.round(p.data?.ksws?.band_width_m || 0),
      Math.round(p.data?.ksws?.band_area_m2 || 0),
      Math.round(p.data?.compensation?.track_a?.total || 0),
      Math.round(p.data?.compensation?.track_b?.total || 0),
      Math.round((p.data?.compensation?.track_a?.total || 0) + (p.data?.compensation?.track_b?.total || 0)),
    ]);
    const headers = ["Parcel_ID", "Kolizja", "Napięcie", "Pow_m2", "Cena_PLN_m2", "Wartość_PLN", "Dł_Linii_m", "Szer_Pasa_m", "Pow_Pasa_m2", "Track_A", "Track_B", "Razem"];
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv]));
    a.download = `batch_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    toast.success("CSV pobrany!");
  };

  const downloadBatchPDF = () => {
    if (!batchResults?.results) return;
    const results = batchResults.results;
    const dateStr = new Date().toLocaleDateString("pl-PL");
    const fmtN = (v) => (v || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtI = (v) => Math.round(v || 0).toLocaleString("pl-PL");
    const VOLT_LABEL = { WN: "WN >110 kV", SN: "SN 1–110 kV", nN: "nN <1 kV" };

    const totalA = results.reduce((s, p) => s + (p.data?.compensation?.track_a?.total || 0), 0);
    const totalB = results.reduce((s, p) => s + (p.data?.compensation?.track_b?.total || 0), 0);
    const collisionCount = results.filter(p => p.data?.infrastructure?.power_lines?.detected).length;

    const parcelCards = results.map((p, i) => {
      const d = p.data || {};
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
              <div class="parcel-id" style="color:#1a2035;">${p.parcel_id || "—"}</div>
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
              <div style="background:#1a2035;border-radius:10px;padding:14px;">
                <div class="track-label" style="color:rgba(255,193,7,0.85);">💰 RAZEM A+B</div>
                <div style="font-size:22px;font-weight:900;color:white;margin-top:4px;">${fmtN((ta.total || 0) + (tb.total || 0))}</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:2px;font-weight:700;">PLN · Track A + B łącznie</div>
              </div>
            </div>
          </div>

          <!-- RIGHT: mini Leaflet map (Topo + OIM power lines) -->
          <div class="map-col">
            <div id="parcel-map-${i}" style="height:100%;min-height:290px;"></div>
            <div class="map-badge" style="background:${collision ? 'rgba(231,76,60,0.9)' : 'rgba(39,174,96,0.9)'};">
              ${collision ? "⚡ kolizja" : "✓ ok"}
            </div>
          </div>
        </div>
      </div>`;
    }).join("\n");

    const summaryRows = results.map((p, i) => {
      const ta = p.data?.compensation?.track_a?.total || 0;
      const tb = p.data?.compensation?.track_b?.total || 0;
      const collision = !!p.data?.infrastructure?.power_lines?.detected;
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
body{font-family:'Inter','Segoe UI',Arial,sans-serif;background:#f4f6f9;color:#1a2035;font-size:14px;line-height:1.5}
@media print{
  body{background:white}
  .no-print{display:none!important}
  .parcel-card{page-break-inside:avoid;break-inside:avoid}
  .page-break{page-break-before:always;break-before:always}
  .report-header,.kpi-card,.razem-box,.track-a,.track-b,.collision-badge{
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
}
.wrap{max-width:1100px;margin:0 auto;padding:28px 20px 60px}
/* PRINT BAR */
.print-bar{text-align:right;margin-bottom:20px}
.btn-print{background:linear-gradient(135deg,#b8963e,#d4af62);color:white;border:none;padding:10px 28px;border-radius:50px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(184,150,62,.4)}
/* HEADER */
.report-header{background:linear-gradient(135deg,#1a1a2e 0%,#2c3e50 60%,#1a2a5c 100%);color:white;padding:36px 44px;border-radius:16px;margin-bottom:28px;box-shadow:0 8px 30px rgba(0,0,0,.25);display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap}
.report-header h1{font-size:24px;font-weight:800;margin-bottom:6px;letter-spacing:-.5px}
.report-header .subtitle{font-size:13px;opacity:.8;margin-bottom:18px}
.meta-grid{display:grid;grid-template-columns:repeat(3,auto);gap:20px}
.meta-item{display:flex;flex-direction:column;gap:2px}
.meta-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;opacity:.65;font-weight:600}
.meta-value{font-size:13px;font-weight:600}
.header-badge-col{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0}
.badge{padding:5px 16px;border-radius:50px;font-size:11px;font-weight:700;letter-spacing:.8px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.15);color:white}
/* KPI — Dompet full-color style */
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:24px}
.kpi-card{border-radius:14px;padding:20px 18px;box-shadow:0 6px 20px rgba(0,0,0,.14);display:flex;justify-content:space-between;align-items:flex-start;position:relative;overflow:hidden}
.kpi-card.blue{background:linear-gradient(135deg,#1e88e5,#42a5f5)}
.kpi-card.red{background:linear-gradient(135deg,#e53935,#ef5350)}
.kpi-card.green{background:linear-gradient(135deg,#43a047,#66bb6a)}
.kpi-card.gold{background:linear-gradient(135deg,#f7971e,#ffd200)}
.kpi-card.dark{background:linear-gradient(135deg,#1a1a2e,#16213e)}
.kpi-card.purple{background:linear-gradient(135deg,#8e24aa,#ab47bc)}
.kpi-icon{width:42px;height:42px;border-radius:12px;background:rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.75);font-weight:700;margin-bottom:6px}
.kpi-value{font-size:26px;font-weight:900;color:white;line-height:1.1;margin-bottom:3px}
.kpi-value.sm{font-size:16px;font-weight:900;color:white}
.kpi-sub{font-size:10px;color:rgba(255,255,255,0.65);font-weight:500}
/* SECTION TITLE */
.section-title{font-size:15px;font-weight:700;color:#1a2035;margin:28px 0 14px;padding-bottom:10px;border-bottom:2px solid #a91079;display:flex;align-items:center;gap:8px}
/* RAZEM BANNER */
.razem-banner{background:linear-gradient(135deg,#1a1a2e,#2c3e50);color:white;padding:22px 32px;border-radius:12px;text-align:center;margin-bottom:24px;box-shadow:0 4px 15px rgba(0,0,0,.15)}
.razem-banner-label{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;opacity:.65;margin-bottom:6px}
.razem-banner-amount{font-size:34px;font-weight:900;color:#f39c12}
/* PARCEL CARD — Material Dashboard style */
.parcel-card{background:white;border-radius:16px;box-shadow:0 6px 28px rgba(0,0,0,.09);border:1px solid #e8eaf0;margin-bottom:24px;overflow:hidden}
.parcel-header{padding:14px 22px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.parcel-header-left{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.parcel-num-badge{width:36px;height:36px;border-radius:50%;color:white;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.parcel-id{font-size:15px;font-weight:800;color:#1a2035}
.parcel-sub{font-size:11px;color:#95a5a6;margin-top:2px}
.geo-link{font-size:11px;color:#3498db;text-decoration:none;font-weight:600}
.collision-badge{padding:4px 14px;border-radius:50px;font-size:12px;font-weight:700;letter-spacing:.5px;color:white}
.parcel-body-grid{display:grid;grid-template-columns:1fr 290px}
/* DATA BOXES */
.data-box-v2{background:#f8f9fc;border-radius:10px;padding:10px 12px;border:1px solid #eef0f5}
.db-label{font-size:10px;color:#95a5a6;margin-bottom:4px;text-transform:uppercase;letter-spacing:.7px;font-weight:700}
.db-value{font-size:13px;font-weight:800;color:#1a2035}
.db-hint{display:block;font-size:10px;color:#e67e22;font-weight:500;margin-top:2px}
/* TRACK BOXES */
.track-box-a{background:#eef4ff;border-radius:10px;padding:14px;border:1px solid #dce8ff}
.track-box-b{background:#fff8ee;border-radius:10px;padding:14px;border:1px solid #fde8c0}
.track-label{font-size:9px;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;margin-bottom:4px}
.track-amount-lg{font-size:16px;font-weight:900}
.track-sub{font-size:10px;color:#95a5a6;margin-top:2px}
.track-detail-row{display:flex;justify-content:space-between;font-size:11px;padding:2px 0}
.track-detail-row .tl{color:#7f8c8d}.track-detail-row .tv{font-weight:700}
/* MAP COLUMN */
.map-col{border-left:1px solid #eef0f3;min-height:280px;position:relative}
.map-badge{position:absolute;bottom:8px;left:8px;z-index:999;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;pointer-events:none;color:white}
.leaflet-container{height:100%;min-height:280px}
/* SUMMARY TABLE */
.summary-table{width:100%;border-collapse:collapse;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.07)}
.summary-table thead tr{background:#1a2035;color:white}
.summary-table thead th{padding:11px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px}
.summary-table tfoot tr{background:#f4f6f9;border-top:2px solid #1a2035}
.summary-table tfoot td{padding:12px;font-weight:800;font-size:14px}
/* FOOTER */
.report-footer{text-align:center;margin-top:40px;font-size:11px;color:#95a5a6;padding:20px;border-top:1px solid #e8ecf0}
</style>
</head>
<body>
<div class="wrap">
  <div class="print-bar no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Drukuj / Zapisz PDF</button>
  </div>

  <!-- HEADER — Szuwara branding -->
  <div class="report-header">
    <div>
      <!-- Szuwara logo area -->
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
        <div style="width:52px;height:52px;border-radius:50%;border:2.5px solid #b8963e;display:flex;align-items:center;justify-content:center;font-size:1.8rem;color:#b8963e;font-weight:800;flex-shrink:0;">§</div>
        <div>
          <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:2.5px;text-transform:uppercase;line-height:1;">SZUWARA</div>
          <div style="font-size:10px;color:#b8963e;letter-spacing:2px;text-transform:uppercase;font-weight:600;margin-top:2px;">Kancelaria Prawno-Podatkowa</div>
        </div>
      </div>
      <h1 style="font-size:18px;font-weight:700;margin-bottom:4px;opacity:0.9;">Raport Zbiorczy — Roszczenia Przesyłowe KSWS</h1>
      <div class="subtitle">Analiza ${results.length} działek · Służebność przesyłu · Track A/B</div>
      <div class="meta-grid" style="margin-top:14px;">
        <div class="meta-item"><span class="meta-label">Data raportu</span><span class="meta-value">${dateStr}</span></div>
        <div class="meta-item"><span class="meta-label">Działek</span><span class="meta-value">${results.length}</span></div>
        <div class="meta-item"><span class="meta-label">Z kolizją</span><span class="meta-value">${collisionCount}</span></div>
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
        <td style="text-align:right;color:#1a2035;">${fmtN(totalA + totalB)} PLN</td>
      </tr>
    </tfoot>
  </table>

  <div class="report-footer">
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">
      <span style="width:28px;height:28px;border-radius:50%;border:1.5px solid #b8963e;display:inline-flex;align-items:center;justify-content:center;font-size:1rem;color:#b8963e;font-weight:800;">§</span>
      <strong style="font-size:13px;letter-spacing:1.5px;color:#1a2035;">SZUWARA</strong>
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
  var PARCEL_MAPS = ${JSON.stringify(results.map(p => ({
    centroid: p.data?.geometry?.centroid_ll,
    geojson: p.data?.geometry?.geojson_ll || p.data?.geometry?.geojson,
    collision: !!p.data?.infrastructure?.power_lines?.detected,
  })))};

  function initMaps() {
    if (typeof L === 'undefined') { setTimeout(initMaps, 300); return; }
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
      var map = L.map(el, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, dragging: false, doubleClickZoom: false });
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
      L.tileLayer.wms('https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow', { layers:'dzialki,numery_dzialek', format:'image/png', transparent:true, opacity:0.7 }).addTo(map);
      if (parcel.geojson && parcel.geojson.coordinates) {
        var color = parcel.collision ? '#e74c3c' : '#27ae60';
        var layer = L.geoJSON(parcel.geojson, { style: { color: color, weight: 2.5, fillColor: color, fillOpacity: 0.25 } }).addTo(map);
        try { map.fitBounds(layer.getBounds(), { padding: [8, 8] }); } catch(e) { map.setView(center, 14); }
      } else {
        map.setView(center, 14);
      }
    });
  }

  if (document.readyState === 'complete') { initMaps(); }
  else { window.addEventListener('load', initMaps); }
})();
</script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) { toast.error("Zablokowano popup — zezwól na okienka dla tej strony"); return; }
    win.document.write(html);
    win.document.close();
    toast.success(`Raport otwarty — ${results.length} działek · użyj Ctrl+P by zapisać PDF`);
  };

  const downloadMapHTML = async () => {
    if (!batchResults?.results) return;
    try {
      toast.info("Generuję mapę interaktywną...");
      const payload = {
        parcels: batchResults.results.map((p) => ({
          parcel_id: p.parcel_id,
          master_record: p.data || {},
        })),
        title: `Analiza ${batchResults.results.length} działek — KSWS`,
      };
      const res = await fetch("/api/report/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Mapa_KSWS_${new Date().toISOString().split("T")[0]}.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Mapa pobrana — otwórz w przeglądarce!");
    } catch (err) {
      toast.error("Błąd mapy: " + err.message);
    }
  };

  const stats = batchResults?.results ? {
    total: batchResults.parcel_count || batchResults.results.length,
    collision: batchResults.results.filter(p => p.data?.infrastructure?.power_lines?.detected).length,
    trackA: batchResults.results.reduce((s, p) => s + (p.data?.compensation?.track_a?.total || 0), 0),
    trackB: batchResults.results.reduce((s, p) => s + (p.data?.compensation?.track_b?.total || 0), 0),
  } : null;

  return (
    <div className="ksws-card">
      <div className="ksws-card-header">
        <span className="ksws-card-header-icon">📄</span>
        <div>
          <div className="ksws-card-header-title">Batch CSV Analysis</div>
          <div className="ksws-card-header-sub">Analiza wielu działek · załaduj CSV</div>
        </div>
      </div>
      <div className="ksws-card-body">
        {batchError && <div style={{ padding: "10px", background: "#ffe6e6", color: "#c0392b", borderRadius: "5px", marginBottom: "15px" }}>❌ {batchError}</div>}

        <form onSubmit={handleUpload} style={{ marginBottom: "20px" }}>
          {/* KROK 1: Wybierz plik */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", padding: "15px", background: "#f9f9f9", borderRadius: "8px" }}>
            <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0])} style={{ flex: 1, minWidth: "150px" }} />
            <button type="button" onClick={downloadCSV} disabled={!batchResults?.results} className="ksws-btn" style={{ whiteSpace: "nowrap" }}>
              ⬇️ CSV
            </button>
            <button type="button" onClick={downloadBatchPDF} disabled={!batchResults?.results} className="ksws-btn" style={{ whiteSpace: "nowrap", background: "#a91079", color: "white", border: "none", fontWeight: "700" }}>
              📊 Raport Zbiorczy
            </button>
            <button type="button" onClick={downloadMapHTML} disabled={!batchResults?.results} className="ksws-btn" style={{ whiteSpace: "nowrap", background: "#2575fc", color: "white", border: "none" }}>
              🗺️ Mapa
            </button>
          </div>

          {/* KROK 2: Po wyborze pliku → duży przycisk URUCHOM ANALIZĘ */}
          {csvFile && (
            <div style={{ marginTop: "12px", padding: "16px", background: "linear-gradient(135deg, #1a1a2e, #16213e)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
              <div style={{ color: "#ccc", fontSize: "0.9rem" }}>
                <span style={{ color: "#f39c12", fontWeight: 700 }}>📋 {csvFile.name}</span>
                <span style={{ marginLeft: "10px", opacity: 0.7 }}>({(csvFile.size / 1024).toFixed(1)} KB)</span>
              </div>
              <button
                type="submit"
                disabled={batchLoading}
                style={{
                  padding: "12px 32px",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  background: batchLoading ? "#555" : "linear-gradient(135deg, #e74c3c, #c0392b)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: batchLoading ? "wait" : "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 15px rgba(231,76,60,0.4)",
                  transition: "transform 0.1s",
                }}
              >
                {batchLoading ? "⏳ Analizuję..." : "🚀 Uruchom analizę"}
              </button>
            </div>
          )}
        </form>

        {stats && (
          <>
            {/* ══ MAPA ZBIORCZA — na górze, widoczna od razu ══ */}
            <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e8eaf0", overflow: "hidden", marginBottom: "24px", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
              <div style={{ height: "5px", background: "linear-gradient(90deg,#e74c3c,#f39c12,#27ae60,#3498db)" }} />
              <div style={{ padding: "16px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f0f2f5" }}>
                <div style={{ fontWeight: "800", fontSize: "0.95em", color: "#1a2035", display: "flex", alignItems: "center", gap: "10px" }}>
                  🗺️ Mapa zbiorcza
                  <span style={{ fontWeight: "400", fontSize: "0.85em", color: "#95a5a6" }}>— wszystkie {stats.total} działek</span>
                </div>
                <div style={{ display: "flex", gap: "16px", fontSize: "0.78em" }}>
                  <span><strong style={{ color: "#e74c3c" }}>🔴 {stats.collision}</strong> z kolizją</span>
                  <span><strong style={{ color: "#27ae60" }}>🟢 {stats.total - stats.collision}</strong> bez kolizji</span>
                </div>
              </div>
              <MapContainer center={[52.0, 20.0]} zoom={7} style={{ height: "480px", width: "100%" }}>
                <BatchMapLayerControl />
                <BatchParcelsLayer results={batchResults.results} />
              </MapContainer>
              <div style={{ padding: "10px 20px", background: "#f8f9fc", display: "flex", gap: "20px", fontSize: "0.75em", color: "#636e72", flexWrap: "wrap", alignItems: "center" }}>
                <span>⚡ <strong style={{ color: "#e74c3c" }}>Linie WN</strong> / <strong style={{ color: "#f39c12" }}>SN</strong> — Open Infrastructure Map (OIM)</span>
                <span>📋 <strong>Warstwy</strong> — przełączaj w kontrolce (prawy górny róg)</span>
              </div>
            </div>

            {/* ════ DASHBOARD WRAPPER ════ */}
            <div style={{ background: "#f0f3f8", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>

              {/* ── Row 1: KPI cards — Dompet/ArchitectUI full-color style ── */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px", marginBottom: "18px" }}>
                {[
                  { label:"Działek",    value:stats.total,                      sub:"załadowanych z CSV",   icon:"📦", grad:"linear-gradient(135deg,#f7971e,#ffd200)", iconBg:"rgba(0,0,0,0.12)" },
                  { label:"Kolizji",    value:stats.collision,                  sub:"wykryta infrastr.",    icon:"⚡", grad:"linear-gradient(135deg,#e53935,#ef5350)", iconBg:"rgba(0,0,0,0.15)" },
                  { label:"Bez kol.",   value:stats.total-stats.collision,      sub:"brak infrastruktury",  icon:"✅", grad:"linear-gradient(135deg,#43a047,#66bb6a)", iconBg:"rgba(0,0,0,0.12)" },
                  { label:"Track A",    value:fmtPLN(stats.trackA),             sub:"ścieżka sądowa",       icon:"⚖️", grad:"linear-gradient(135deg,#1e88e5,#42a5f5)", iconBg:"rgba(0,0,0,0.12)" },
                  { label:"Track B",    value:fmtPLN(stats.trackB),             sub:"negocjacje",           icon:"🤝", grad:"linear-gradient(135deg,#8e24aa,#ab47bc)", iconBg:"rgba(0,0,0,0.12)" },
                ].map((k, i) => (
                  <div key={i} style={{
                    background: k.grad,
                    borderRadius: "14px",
                    padding: "20px 18px",
                    boxShadow: "0 6px 20px rgba(0,0,0,0.14)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    position: "relative",
                    overflow: "hidden",
                  }}>
                    {/* decorative circle */}
                    <div style={{ position:"absolute", bottom:-20, right:-20, width:90, height:90, borderRadius:"50%", background:"rgba(255,255,255,0.08)", pointerEvents:"none" }} />
                    {/* LEFT: label + number + sub */}
                    <div>
                      <div style={{ fontSize:"0.6em", textTransform:"uppercase", letterSpacing:"1.2px", color:"rgba(255,255,255,0.75)", fontWeight:"700", marginBottom:"6px" }}>{k.label}</div>
                      <div style={{ fontSize: typeof k.value === "number" ? "2.2em" : "1.15em", fontWeight:"900", color:"white", lineHeight:1.1, marginBottom:"4px" }}>{k.value}</div>
                      <div style={{ fontSize:"0.62em", color:"rgba(255,255,255,0.65)", fontWeight:"500" }}>{k.sub}</div>
                    </div>
                    {/* RIGHT: icon circle */}
                    <div style={{ width:"42px", height:"42px", borderRadius:"12px", background:k.iconBg, backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.3em", flexShrink:0 }}>
                      {k.icon}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Row 2: Chart + Summary ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "14px" }}>

                {/* ── Compensation per parcel — horizontal bars (jak w dashboardzie) ── */}
                <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize: "0.75em", fontWeight: "700", color: "#1a2035", marginBottom: "14px", letterSpacing: "0.3px" }}>
                    📊 Odszkodowanie wg działki
                  </div>
                  {(() => {
                    const maxRazem = Math.max(...batchResults.results.map(p =>
                      (p.data?.compensation?.track_a?.total || 0) + (p.data?.compensation?.track_b?.total || 0)
                    ), 1);
                    const show = batchResults.results.slice(0, 12);
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                        {show.map((p, i) => {
                          const ta = p.data?.compensation?.track_a?.total || 0;
                          const tb = p.data?.compensation?.track_b?.total || 0;
                          const razem = ta + tb;
                          const pctA = maxRazem > 0 ? (ta / maxRazem * 100) : 0;
                          const pctB = maxRazem > 0 ? (tb / maxRazem * 100) : 0;
                          const collision = !!p.data?.infrastructure?.power_lines?.detected;
                          const shortId = (p.parcel_id || "").split(".").pop() || p.parcel_id;
                          return (
                            <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px", gap: "8px", alignItems: "center" }}>
                              <div style={{ fontSize: "0.72em", color: "#636e72", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.parcel_id}>
                                <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: collision ? "#e74c3c" : "#27ae60", marginRight: "5px", verticalAlign: "middle" }} />
                                {shortId}
                              </div>
                              <div style={{ background: "#f4f6f8", borderRadius: "4px", height: "20px", position: "relative", overflow: "hidden" }}>
                                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pctA}%`, background: "#3498db", borderRadius: "4px 0 0 4px", transition: "width 0.3s" }} />
                                <div style={{ position: "absolute", left: `${pctA}%`, top: 0, bottom: 0, width: `${pctB}%`, background: "#f39c12", transition: "width 0.3s" }} />
                              </div>
                              <div style={{ fontSize: "0.73em", fontWeight: "700", color: "#1a2035", textAlign: "right" }}>
                                {Math.round(razem / 1000).toLocaleString()}k PLN
                              </div>
                            </div>
                          );
                        })}
                        {batchResults.results.length > 12 && (
                          <div style={{ fontSize: "0.68em", color: "#95a5a6", textAlign: "center", paddingTop: "6px" }}>
                            + {batchResults.results.length - 12} kolejnych działek
                          </div>
                        )}
                        <div style={{ display: "flex", gap: "16px", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #f0f0f0" }}>
                          <span style={{ fontSize: "0.68em", color: "#636e72", display: "flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ display: "inline-block", width: "12px", height: "8px", background: "#3498db", borderRadius: "2px" }} /> Track A (sąd)
                          </span>
                          <span style={{ fontSize: "0.68em", color: "#636e72", display: "flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ display: "inline-block", width: "12px", height: "8px", background: "#f39c12", borderRadius: "2px" }} /> Track B (negocjacje)
                          </span>
                          <span style={{ fontSize: "0.68em", color: "#636e72", display: "flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#e74c3c" }} /> Kolizja
                          </span>
                          <span style={{ fontSize: "0.68em", color: "#636e72", display: "flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#27ae60" }} /> Bez kol.
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* ── Summary — Payment received style ── */}
                <div style={{ background: "white", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", minWidth: "220px", display: "flex", flexDirection: "column", gap: "0" }}>
                  <div style={{ fontSize: "0.75em", fontWeight: "700", color: "#1a2035", marginBottom: "16px" }}>💰 Łączne roszczenie</div>
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ fontSize: "0.62em", textTransform: "uppercase", letterSpacing: "1px", color: "#95a5a6", fontWeight: "700", marginBottom: "2px" }}>Razem (A+B)</div>
                    <div style={{ fontSize: "1.65em", fontWeight: "900", color: "#1a2035", lineHeight: 1.1 }}>{fmtPLN(stats.trackA + stats.trackB)}</div>
                  </div>
                  <div style={{ borderTop: "1px solid #f0f2f5", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "0.62em", color: "#95a5a6", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.8px" }}>⚖️ Track A</div>
                        <div style={{ fontSize: "1em", fontWeight: "800", color: "#2c3e50" }}>{fmtPLN(stats.trackA)}</div>
                      </div>
                      <div style={{ display: "flex", gap: "1px" }}>
                        {[3,5,4,6,5,7,4].map((h,i)=><div key={i} style={{width:"4px", height:`${h*3}px`, background:"#3498db", borderRadius:"2px", opacity:0.7}} />)}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "0.62em", color: "#95a5a6", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.8px" }}>🤝 Track B</div>
                        <div style={{ fontSize: "1em", fontWeight: "800", color: "#e67e22" }}>{fmtPLN(stats.trackB)}</div>
                      </div>
                      <div style={{ display: "flex", gap: "1px" }}>
                        {[5,7,6,8,7,9,6].map((h,i)=><div key={i} style={{width:"4px", height:`${h*3}px`, background:"#f39c12", borderRadius:"2px", opacity:0.7}} />)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={downloadBatchPDF}
                    style={{ background: "#1a2035", color: "white", border: "none", borderRadius: "8px", padding: "10px 16px", cursor: "pointer", fontWeight: "700", fontSize: "0.82em", marginTop: "18px" }}
                  >📊 Raport zbiorczy</button>
                </div>
              </div>
            </div>

            {/* ── KARTY DZIAŁEK — Material Dashboard style ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
              {batchResults.results.map((p, i) => {
                const ta = p.data?.compensation?.track_a?.total || 0;
                const tb = p.data?.compensation?.track_b?.total || 0;
                const area = p.data?.geometry?.area_m2 || 0;
                const price = p.data?.market_data?.average_price_m2 || 0;
                const value = p.data?.ksws?.property_value_total || 0;
                const lineLength = p.data?.ksws?.line_length_m || p.data?.infrastructure?.power_lines?.length_m || 0;
                const bandWidth = p.data?.ksws?.band_width_m || 0;
                const bandArea = p.data?.ksws?.band_area_m2 || 0;
                const collision = !!p.data?.infrastructure?.power_lines?.detected;
                const voltage = p.data?.infrastructure?.power_lines?.voltage || "—";
                const razem = ta + tb;
                const msrc = p.data?.ksws?.measurement_source || "";
                const geojson = p.data?.geometry?.geojson_ll || p.data?.geometry?.geojson;
                const centroid = p.data?.geometry?.centroid_ll;
                const VOLT = { WN: "WN >110 kV", SN: "SN 1-110 kV", nN: "nN <1 kV" };
                const pct = area > 0 && bandArea > 0 ? Math.min(100, Math.round(bandArea / area * 100)) : 0;
                const MAP_H = 320;
                // metric boxes
                const metrics = [
                  { label:"Pow. działki",  val:`${Math.round(area).toLocaleString()} m²`,             icon:"📐", grad:"linear-gradient(135deg,#FF6B35,#F7931E)", sh:"rgba(255,107,53,0.4)" },
                  { label:"Cena gruntu",   val:`${price.toFixed(2)} zł/m²`,                           icon:"💰", grad:"linear-gradient(135deg,#43A047,#2E7D32)", sh:"rgba(67,160,71,0.4)" },
                  { label:"Wartość nier.", val:`${Math.round(value).toLocaleString()} PLN`,            icon:"🏠", grad:"linear-gradient(135deg,#8E24AA,#6A1B9A)", sh:"rgba(142,36,170,0.4)" },
                  { label:"Napięcie",      val:VOLT[voltage]||(voltage!=="—"?voltage:"—"),             icon:"⚡", grad:"linear-gradient(135deg,#F9A825,#F57F17)", sh:"rgba(249,168,37,0.4)" },
                  { label:"Dł. linii",     val:lineLength>0?`${Math.round(lineLength)} m`:"—",        icon:"📏", grad:"linear-gradient(135deg,#00897B,#00695C)", sh:"rgba(0,137,123,0.4)", hint:msrc },
                  { label:"Szer. pasa",    val:bandWidth>0?`${bandWidth} m`:"—",                      icon:"↔️", grad:"linear-gradient(135deg,#1E88E5,#1565C0)", sh:"rgba(30,136,229,0.4)" },
                  { label:"Pow. pasa",     val:bandArea>0?`${Math.round(bandArea).toLocaleString()} m²`:"—", icon:"🔲", grad:"linear-gradient(135deg,#5E35B1,#4527A0)", sh:"rgba(94,53,177,0.4)" },
                  { label:"% w pasie",     val:pct>0?`${pct}%`:"—",                                  icon:"📊", grad:"linear-gradient(135deg,#F4511E,#BF360C)", sh:"rgba(244,81,30,0.4)" },
                ];
                return (
                  <div key={i} style={{
                    background:"white", borderRadius:"14px",
                    boxShadow:"0 2px 14px rgba(0,0,0,0.08)",
                    border:"1px solid #dde3ef",
                    overflow:"hidden", isolation:"isolate",
                  }}>
                    {/* ── LIGHT HEADER — colored top stripe + white bg ── */}
                    <div style={{
                      background:"#f8f9fc",
                      borderTop:`4px solid ${collision ? "#e53935" : "#43a047"}`,
                      borderBottom:"1px solid #eef0f7",
                      padding:"13px 18px",
                      display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap",
                    }}>
                      {/* Big parcel number badge */}
                      <div style={{
                        width:"46px", height:"46px", borderRadius:"12px",
                        background:collision ? "#fde8e8" : "#e8f5e9",
                        border:`2px solid ${collision ? "#e53935" : "#43a047"}`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontWeight:"900", fontSize:"1em", color:collision ? "#c62828" : "#2e7d32",
                        flexShrink:0,
                      }}>#{i+1}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:"800", fontSize:"0.95em", color:"#1a2035", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.parcel_id}</div>
                        <a href={`https://mapy.geoportal.gov.pl/imap/Imgp_2.html?identifyParcel=${p.parcel_id||""}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ color:"#3498db", fontSize:"0.65em", textDecoration:"none", fontWeight:"600" }}>🔗 geoportal.gov.pl</a>
                      </div>
                      <span style={{
                        padding:"4px 14px", borderRadius:"50px",
                        background:collision ? "#fde8e8" : "#e8f5e9",
                        color:collision ? "#c62828" : "#2e7d32",
                        fontSize:"0.7em", fontWeight:"800", flexShrink:0,
                        border:`1px solid ${collision ? "#ef9a9a" : "#a5d6a7"}`,
                        whiteSpace:"nowrap",
                      }}>
                        {collision ? "⚡ KOLIZJA" : "✓ BEZ KOLIZJI"}
                      </span>
                      <button onClick={()=>generateParcelPDF(p)} style={{
                        padding:"6px 14px", background:"#1a2035", color:"white",
                        border:"none", borderRadius:"8px", cursor:"pointer",
                        fontSize:"0.7em", fontWeight:"700", flexShrink:0, whiteSpace:"nowrap",
                      }}>
                        📄 Raport
                      </button>
                    </div>

                    {/* ── BODY: 2 columns ── */}
                    <div style={{ display:"flex", alignItems:"stretch" }}>
                      {/* LEFT: metric cards + Track A/B/RAZEM */}
                      <div style={{ flex:1, minWidth:0, padding:"22px 18px 18px" }}>
                        {/* 8 metric KPI cards — bigger numbers */}
                        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px,1fr))", gap:"12px", marginBottom:"18px" }}>
                          {metrics.map((m, j) => (
                            <div key={j} title={m.hint||""} style={{
                              background:"white", borderRadius:"10px",
                              boxShadow:"0 2px 10px rgba(0,0,0,0.06)",
                              border:"1px solid #eef0f7",
                              borderLeft:`3px solid ${m.grad.match(/#[0-9a-fA-F]{6}/)?.[0] || "#3498db"}`,
                              padding:"12px 14px",
                            }}>
                              <div style={{ display:"flex", alignItems:"flex-start", gap:"8px" }}>
                                <div style={{
                                  width:"34px", height:"34px", borderRadius:"8px",
                                  background:m.grad, flexShrink:0,
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  fontSize:"1em",
                                }}>{m.icon}</div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:"0.6em", color:"#9eaab8", fontWeight:"700", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:"3px" }}>{m.label}</div>
                                  <div style={{ fontSize:"1.05em", fontWeight:"900", color:"#1a1a2e", lineHeight:1.2 }}>{m.val}</div>
                                  {m.hint && <div style={{ fontSize:"0.58em", color:"#f39c12", marginTop:"3px" }}>⚠ {m.hint}</div>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Track A / B / RAZEM — clean light boxes, big numbers */}
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"10px" }}>
                          <div style={{ background:"#eef4ff", borderRadius:"12px", padding:"14px 16px", border:"1px solid #d0e2ff" }}>
                            <div style={{ color:"#5c7aaa", fontSize:"0.6em", fontWeight:"700", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"5px" }}>⚖️ Track A · Sąd</div>
                            <div style={{ color:"#1565c0", fontSize:"1.45em", fontWeight:"900", lineHeight:1.1 }}>{Math.round(ta).toLocaleString()}</div>
                            <div style={{ color:"#7f9bbf", fontSize:"0.6em", marginTop:"2px" }}>PLN</div>
                          </div>
                          <div style={{ background:"#fff8ee", borderRadius:"12px", padding:"14px 16px", border:"1px solid #fde8c0" }}>
                            <div style={{ color:"#b08050", fontSize:"0.6em", fontWeight:"700", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"5px" }}>🤝 Track B · Neg.</div>
                            <div style={{ color:"#e65100", fontSize:"1.45em", fontWeight:"900", lineHeight:1.1 }}>{Math.round(tb).toLocaleString()}</div>
                            <div style={{ color:"#c19060", fontSize:"0.6em", marginTop:"2px" }}>PLN</div>
                          </div>
                          <div style={{ background:"#1a2035", borderRadius:"12px", padding:"14px 16px" }}>
                            <div style={{ color:"rgba(255,193,7,0.85)", fontSize:"0.6em", fontWeight:"700", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"5px" }}>💰 Razem A+B</div>
                            <div style={{ color:"white", fontSize:"1.45em", fontWeight:"900", lineHeight:1.1 }}>{Math.round(razem).toLocaleString()}</div>
                            <div style={{ color:"rgba(255,255,255,0.45)", fontSize:"0.6em", marginTop:"2px" }}>PLN</div>
                          </div>
                        </div>
                      </div>

                      {/* RIGHT: satellite + cadastral mini map */}
                      <div style={{ width:"290px", flexShrink:0, borderLeft:"1px solid #f0f2f7", position:"relative", overflow:"hidden" }}>
                        <ParcelMiniMap geojson={geojson} centroid={centroid} collision={collision} height={MAP_H} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ════ HISTORIA BATCHÓW — OFERTY HURTOWE ════ */}
      <div className="ksws-card">
        <div className="ksws-card-header">
          <span className="ksws-card-header-icon">🗂️</span>
          <div>
            <div className="ksws-card-header-title">Oferty Hurtowe — Historia CSV</div>
            <div className="ksws-card-header-sub">Poprzednie analizy batchowe · kliknij kartę aby wczytać</div>
          </div>
        </div>
        <div className="ksws-card-body">
          {(() => {
            try {
              const batchHist = JSON.parse(localStorage.getItem("batch_history") || "[]");
              if (!batchHist.length) {
                return (
                  <div style={{ padding: "40px", textAlign: "center", color: "#b2bec3", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                    <div style={{ fontSize: "3em" }}>📭</div>
                    <div style={{ fontWeight: "700", fontSize: "1.1em", color: "#636e72" }}>Brak historii batchów</div>
                    <div style={{ fontSize: "0.85em" }}>Załaduj plik CSV i uruchom analizę, aby zapisać w historii</div>
                  </div>
                );
              }
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
                  {batchHist.map((b, idx) => {
                    const total = b.summary?.total || (b.summary?.trackA || 0) + (b.summary?.trackB || 0);
                    const collision = b.summary?.collision || 0;
                    const noCollision = (b.parcel_count || 0) - collision;
                    // Rotating Material Design gradients for each history card
                    const HIST_GRADS = [
                      "linear-gradient(135deg,#1976d2,#1565c0)",
                      "linear-gradient(135deg,#388e3c,#2e7d32)",
                      "linear-gradient(135deg,#7b1fa2,#6a1b9a)",
                      "linear-gradient(135deg,#f57c00,#e65100)",
                      "linear-gradient(135deg,#00838f,#006064)",
                      "linear-gradient(135deg,#d32f2f,#b71c1c)",
                    ];
                    const cardGrad = HIST_GRADS[idx % HIST_GRADS.length];
                    return (
                      <div key={idx} style={{
                        background:"white", borderRadius:"18px",
                        boxShadow:"0 8px 28px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)",
                        overflow:"hidden",
                        transition:"box-shadow 0.2s, transform 0.15s",
                      }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 14px 40px rgba(0,0,0,0.16)"; e.currentTarget.style.transform = "translateY(-3px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "none"; }}
                      >
                        {/* COLORED GRADIENT HEADER (Material Dashboard chart-card style) */}
                        <div style={{ background:cardGrad, padding:"22px 22px 50px", position:"relative", overflow:"hidden" }}>
                          <div style={{ position:"absolute", top:-30, right:-30, width:140, height:140, borderRadius:"50%", background:"rgba(255,255,255,0.1)", pointerEvents:"none" }} />
                          <div style={{ position:"absolute", bottom:-45, left:-15, width:170, height:170, borderRadius:"50%", background:"rgba(255,255,255,0.06)", pointerEvents:"none" }} />
                          <div style={{ position:"relative", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                            <div>
                              <div style={{ color:"rgba(255,255,255,0.55)", fontSize:"0.63em", fontWeight:"700", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"6px" }}>KSWS · OFERTA HURTOWA</div>
                              <div style={{ color:"white", fontWeight:"900", fontSize:"1.2em" }}>#{batchHist.length - idx} · {b.parcel_count||0} działek</div>
                              <div style={{ color:"rgba(255,255,255,0.5)", fontSize:"0.68em", marginTop:"4px" }}>📅 {b.date}</div>
                            </div>
                            {/* § logo in corner */}
                            <div style={{ fontSize:"3.2em", color:"rgba(255,255,255,0.15)", fontWeight:"900", lineHeight:1, userSelect:"none" }}>§</div>
                          </div>
                        </div>

                        {/* ELEVATED STATS BOX — Material Dashboard overlapping effect */}
                        <div style={{
                          margin:"0 18px",
                          marginTop:"-30px",
                          background:"white",
                          borderRadius:"14px",
                          boxShadow:"0 6px 24px rgba(0,0,0,0.12)",
                          display:"grid",
                          gridTemplateColumns:"1fr 1fr 1fr",
                          overflow:"hidden",
                          position:"relative",
                          zIndex:2,
                          border:"1px solid #f0f2f7",
                        }}>
                          {[
                            { val:b.parcel_count||0, label:"Działek",  color:"#1565c0", bg:"#e8f0fe" },
                            { val:collision,          label:"Kolizji",  color:collision>0?"#c62828":"#9e9e9e", bg:collision>0?"#ffebee":"#fafafa" },
                            { val:noCollision,        label:"Bez kol.", color:noCollision>0?"#2e7d32":"#9e9e9e", bg:noCollision>0?"#e8f5e9":"#fafafa" },
                          ].map((k,ki) => (
                            <div key={ki} style={{ textAlign:"center", padding:"16px 8px", background:k.bg, borderRight:ki<2?"1px solid #f0f2f7":"none" }}>
                              <div style={{ fontSize:"1.8em", fontWeight:"900", color:k.color, lineHeight:1 }}>{k.val}</div>
                              <div style={{ fontSize:"0.58em", color:"#9e9e9e", textTransform:"uppercase", letterSpacing:"0.8px", fontWeight:"700", marginTop:"4px" }}>{k.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* TRACK A / B / RAZEM */}
                        <div style={{ padding:"16px 18px 0" }}>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginBottom:"10px" }}>
                            <div style={{ background:"linear-gradient(135deg,#1976d2,#1565c0)", borderRadius:"10px", padding:"10px 14px" }}>
                              <div style={{ color:"rgba(255,255,255,0.6)", fontSize:"0.56em", fontWeight:"800", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"3px" }}>⚖️ Track A · Sąd</div>
                              <div style={{ color:"white", fontWeight:"900", fontSize:"1em" }}>{Math.round(b.summary?.trackA||0).toLocaleString()} <span style={{ fontSize:"0.55em", opacity:0.6 }}>PLN</span></div>
                            </div>
                            <div style={{ background:"linear-gradient(135deg,#f57c00,#e65100)", borderRadius:"10px", padding:"10px 14px" }}>
                              <div style={{ color:"rgba(255,255,255,0.6)", fontSize:"0.56em", fontWeight:"800", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"3px" }}>🤝 Track B · Neg.</div>
                              <div style={{ color:"white", fontWeight:"900", fontSize:"1em" }}>{Math.round(b.summary?.trackB||0).toLocaleString()} <span style={{ fontSize:"0.55em", opacity:0.6 }}>PLN</span></div>
                            </div>
                          </div>
                          <div style={{ background:"linear-gradient(135deg,#1a1a2e,#16213e)", borderRadius:"10px", padding:"11px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <div style={{ color:"rgba(255,193,7,0.85)", fontSize:"0.6em", fontWeight:"800", textTransform:"uppercase", letterSpacing:"1px" }}>💰 RAZEM A+B</div>
                            <div style={{ color:"white", fontWeight:"900", fontSize:"1.15em" }}>{Math.round(total).toLocaleString()} <span style={{ fontSize:"0.55em", opacity:0.6 }}>PLN</span></div>
                          </div>
                        </div>

                        {/* ACTIONS */}
                        <div style={{ padding:"12px 18px", display:"flex", gap:"8px" }}>
                          <button
                            onClick={() => {
                              if (b.full_data && b.full_data.length) {
                                setBatchResults({ results: b.full_data, parcel_count: b.parcel_count || b.full_data.length, successful: b.successful || b.full_data.length });
                                toast.success(`Załadowano ofertę: ${b.parcel_count || b.full_data.length} działek`);
                              } else { toast.error("Brak pełnych danych w tej historii"); }
                            }}
                            style={{ flex:1, padding:"10px 14px", background:"linear-gradient(135deg,#1976d2,#1565c0)", color:"white", border:"none", borderRadius:"10px", cursor:"pointer", fontWeight:"700", fontSize:"0.82em" }}
                          >📂 Wczytaj analizę</button>
                          <button
                            onClick={() => {
                              const updated = batchHist.filter((_,i) => i !== idx);
                              localStorage.setItem("batch_history", JSON.stringify(updated));
                              window.location.reload();
                            }}
                            style={{ padding:"10px 13px", background:"transparent", color:"#c62828", border:"1px solid #ffcdd2", borderRadius:"10px", cursor:"pointer", fontSize:"0.82em" }}
                            title="Usuń z historii"
                          >🗑️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            } catch (e) {
              return <div style={{ color: "#c0392b" }}>Błąd historii: {e.message}</div>;
            }
          })()}
        </div>
      </div>
    </div>
  );
}

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
    const next = [entry, ...prev.filter((h) => h.parcel_id !== entry.parcel_id)].slice(0, 20);
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
  const [powerGeoJSON, setPowerGeoJSON] = useState(null);

  // ── History ──────────────────────────────────────────────────────────────────
  const [history, setHistory] = useState(loadHistory);

  // ── Error state (ULDK niedostępny itp.) ──────────────────────────────────────
  const [apiError, setApiError] = useState(null);

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
    setApiError(null);
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
      ) {
        const backendMsg = first.master_record?.message || first.error || "";
        const isUldkDown = backendMsg.includes("niedostępny") || backendMsg.includes("timeout");
        setApiError({ msg: backendMsg, isUldkDown });
        throw new Error(backendMsg || "Działka nie znaleziona — sprawdź format ID");
      }

      setAllResults(data.parcels);
      setResult(first);

      const centroid = first.master_record?.geometry?.centroid_ll;
      if (Array.isArray(centroid) && centroid[0] != null) {
        const lat = Number(centroid[1]);
        const lon = Number(centroid[0]);
        setMapCenter([lat, lon]);
        setMapZoom(16);
      }

      // Użyj GeoJSON linii energetycznych z backendu (Overpass już pobrany przez backend)
      const backendPowerGeoJSON = first.master_record?.infrastructure?.power_lines?.geojson;
      if (backendPowerGeoJSON?.features?.length > 0) {
        setPowerGeoJSON(backendPowerGeoJSON);
      } else {
        setPowerGeoJSON(null);
      }

      // Save to history — FULL calculation data
      const mr2 = first.master_record || {};
      const comp2 = mr2.compensation || {};
      const ksws2 = mr2.ksws || {};
      const geom2 = mr2.geometry || {};
      const mkt2 = mr2.market_data || {};
      const infra2 = mr2.infrastructure || {};
      const pl2 = infra2.power_lines || {};
      const newEntry = {
        parcel_id: first.parcel_id,
        date: nowPL(),
        track_a: comp2.track_a?.total || 0,
        track_b: comp2.track_b?.total || 0,
        razem: (comp2.track_a?.total || 0) + (comp2.track_b?.total || 0),
        area_m2: geom2.area_m2 || 0,
        price_m2: mkt2.average_price_m2 || 0,
        value_pln: ksws2.property_value_total || 0,
        voltage: pl2.voltage || "—",
        collision: !!(pl2.detected),
        line_length_m: pl2.length_m || 0,
        band_width_m: ksws2.band_width_m || 0,
        band_area_m2: ksws2.band_area_m2 || 0,
        location: [mr2.parcel_metadata?.commune, mr2.parcel_metadata?.county, mr2.parcel_metadata?.region].filter(Boolean).join(", "),
        full_master_record: mr2,
      };
      setHistory(saveToHistory(newEntry));

      toast.success("Analiza zakończona ✓");
    } catch (err) {
      const msg = err.message || "Wystąpił błąd.";
      toast.error(msg, { autoClose: 8000 });
      // Jeśli nie ustawiono apiError wcześniej (np. błąd sieci), ustaw teraz
      if (!apiError) {
        const isNet = msg.includes("fetch") || msg.includes("Failed") || msg.includes("network");
        setApiError({ msg, isUldkDown: isNet });
      }
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
          {/* Szuwara § symbol */}
          <div className="ksws-sidebar-logo-symbol">§</div>
          <div className="ksws-sidebar-logo-title">SZUWARA</div>
          <div className="ksws-sidebar-logo-sub">Kancelaria Prawno-Podatkowa</div>
          <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(184,150,62,0.2)", fontSize: "0.62rem", color: "rgba(255,255,255,0.35)", lineHeight: "1.7" }}>
            <div style={{ color: "#b8963e", fontWeight: "700", fontSize: "0.72rem", letterSpacing: "0.5px" }}>KALKULATOR KSWS</div>
            <div>Roszczenia przesyłowe · Track A/B</div>
          </div>
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
          <div style={{ color: "#b8963e", fontWeight: "700", marginBottom: "4px", fontSize: "0.72rem" }}>§ SZUWARA</div>
          <a href="https://www.kancelaria-szuwara.pl" target="_blank" rel="noopener noreferrer">
            www.kancelaria-szuwara.pl
          </a><br />
          <a href="tel:790411412">790 411 412</a><br />
          <div style={{ marginTop: "6px", opacity: 0.5 }}>KSWS v3.0 · Track A/B · GUGiK</div>
        </div>
      </aside>

      {/* ════════════ RIGHT SIDE ════════════ */}
      <div className="ksws-content">

        {/* ── TOP BAR ── */}
        <header className="ksws-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {/* Szuwara § mini logo */}
            <div style={{
              width: "38px", height: "38px", borderRadius: "50%",
              border: "2px solid #b8963e",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.1rem", color: "#b8963e", fontWeight: "800", flexShrink: 0,
            }}>§</div>
            <div>
              <div className="ksws-topbar-title">
                Kalkulator Roszczeń Przesyłowych
                <span style={{ marginLeft: "10px", fontSize: "0.65em", fontWeight: "500", color: "#b8963e", letterSpacing: "1px", textTransform: "uppercase" }}>
                  · Szuwara KPP
                </span>
              </div>
              <div className="ksws-topbar-sub">
                KSWS Track A/B · ULDK GUGiK · OSM Overpass · GUS BDL — wyłącznie dane rzeczywiste
              </div>
            </div>
          </div>
          <div className="ksws-topbar-right">
            <div style={{ fontSize: "0.78rem", color: "#b8963e", fontWeight: "700", letterSpacing: "0.5px" }}>
              <a href="https://www.kancelaria-szuwara.pl" target="_blank" rel="noopener noreferrer"
                style={{ color: "#b8963e", textDecoration: "none" }}>
                kancelaria-szuwara.pl
              </a>
            </div>
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
                  <div className="ksws-card-header-sub">Pełne dane wyliczeń · kliknij aby załadować</div>
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
                        style={{ flexDirection: "column", gap: "8px", padding: "16px", cursor: "pointer" }}
                        onClick={() => {
                          // Załaduj zapisany raport z historii (bez ponownego fetchowania z API)
                          if (item.full_master_record) {
                            const mr = item.full_master_record;
                            const fakeResult = {
                              parcel_id: item.parcel_id,
                              data_status: "REAL",
                              master_record: mr,
                            };
                            setResult(fakeResult);
                            setAllResults([fakeResult]);
                            setParcelIds(item.parcel_id);
                            // Ustaw mapę na centroid działki
                            const centroid = mr.geometry?.centroid_ll;
                            if (Array.isArray(centroid) && centroid[0] != null) {
                              setMapCenter([Number(centroid[1]), Number(centroid[0])]);
                              setMapZoom(16);
                            }
                            // Ustaw GeoJSON linii energetycznych
                            const plGeo = mr.infrastructure?.power_lines?.geojson;
                            if (plGeo?.features?.length > 0) {
                              setPowerGeoJSON(plGeo);
                            } else {
                              setPowerGeoJSON(null);
                            }
                            setActiveNav("analiza");
                            toast.success("Załadowano raport z historii ✓");
                          } else {
                            // Fallback: brak zapisanego raportu → uruchom nową analizę
                            setParcelIds(item.parcel_id);
                            setActiveNav("analiza");
                          }
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div className="ksws-history-full-num">{idx + 1}</div>
                            <div>
                              <div className="ksws-history-full-id" style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                                <a href={`https://mapy.geoportal.gov.pl/imap/Imgp_2.html?identifyParcel=${item.parcel_id}`} target="_blank" rel="noreferrer" style={{ color: "#2575fc", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                                  {item.parcel_id} 🔗
                                </a>
                              </div>
                              <div className="ksws-history-full-date">{item.date}</div>
                              {item.location && <div style={{ fontSize: "0.72rem", color: "#888" }}>{item.location}</div>}
                            </div>
                          </div>
                          <div className="ksws-history-full-arrow">→</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", fontSize: "0.78rem", background: "#f7f8fa", borderRadius: "6px", padding: "10px", marginTop: "4px" }}>
                          <div><span style={{ color: "#999" }}>Pow:</span> <strong>{Math.round(item.area_m2 || 0).toLocaleString()} m²</strong></div>
                          <div><span style={{ color: "#999" }}>Cena:</span> <strong>{Math.round(item.price_m2 || 0)} PLN/m²</strong></div>
                          <div><span style={{ color: "#999" }}>Wartość:</span> <strong>{Math.round(item.value_pln || 0).toLocaleString()} PLN</strong></div>
                          <div><span style={{ color: "#999" }}>Kolizja:</span> <strong style={{ color: item.collision ? "#e74c3c" : "#27ae60" }}>{item.collision ? "TAK" : "NIE"}</strong></div>
                          <div><span style={{ color: "#999" }}>Napięcie:</span> <strong>{item.voltage || "—"}</strong></div>
                          <div><span style={{ color: "#999" }}>Dł linii:</span> <strong>{Math.round(item.line_length_m || 0)} m</strong></div>
                          <div><span style={{ color: "#999" }}>Pas:</span> <strong>{Math.round(item.band_width_m || 0)}m × {Math.round(item.band_area_m2 || 0)} m²</strong></div>
                          <div><span style={{ color: "#999" }}>Razem:</span> <strong style={{ color: "#1a2035" }}>{Math.round(item.razem || item.track_a || 0).toLocaleString()} PLN</strong></div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", fontSize: "0.82rem", marginTop: "4px" }}>
                          <div style={{ background: "#eafaf1", padding: "8px 12px", borderRadius: "6px", textAlign: "center" }}>
                            <div style={{ fontSize: "0.68rem", color: "#999" }}>Track A</div>
                            <div style={{ fontWeight: 700, color: "#27ae60" }}>{Math.round(item.track_a || 0).toLocaleString()} PLN</div>
                          </div>
                          <div style={{ background: "#fef9e7", padding: "8px 12px", borderRadius: "6px", textAlign: "center" }}>
                            <div style={{ fontSize: "0.68rem", color: "#999" }}>Track B</div>
                            <div style={{ fontWeight: 700, color: "#f39c12" }}>{Math.round(item.track_b || 0).toLocaleString()} PLN</div>
                          </div>
                          <div style={{ background: "#eaf2fd", padding: "8px 12px", borderRadius: "6px", textAlign: "center" }}>
                            <div style={{ fontSize: "0.68rem", color: "#999" }}>RAZEM</div>
                            <div style={{ fontWeight: 700, color: "#1a2035" }}>{Math.round(item.razem || item.track_a || 0).toLocaleString()} PLN</div>
                          </div>
                        </div>
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

          {/* ════ BATCH CSV PAGE ════ */}
          {activeNav === "batch" && (
            <BatchCSVSection />
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
                      placeholder="TERYT: 141906_5.0029.60  lub podaj obręb + numer w polach poniżej"
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
                    {/* ESRI World Imagery — satelita */}
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      attribution='© ESRI World Imagery'
                      maxZoom={19}
                    />
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

          {/* ════ BANER BŁĘDU — ULDK niedostępny ════ */}
          {apiError && !result && (
            <div style={{
              background: apiError.isUldkDown ? "#fff8e1" : "#fdecea",
              border: `1px solid ${apiError.isUldkDown ? "#f39c12" : "#e74c3c"}`,
              borderLeft: `5px solid ${apiError.isUldkDown ? "#f39c12" : "#e74c3c"}`,
              borderRadius: 10,
              padding: "18px 24px",
              marginBottom: 16,
              display: "flex",
              alignItems: "flex-start",
              gap: 16,
            }}>
              <div style={{ fontSize: 28, lineHeight: 1 }}>
                {apiError.isUldkDown ? "⏳" : "❌"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#1a2035", marginBottom: 6 }}>
                  {apiError.isUldkDown ? "ULDK GUGiK chwilowo niedostępny" : "Błąd wyszukiwania działki"}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#555", marginBottom: 12 }}>
                  {apiError.isUldkDown
                    ? "Serwer rządowy ULDK (uldk.gugik.gov.pl) nie odpowiedział. To zjawisko przejściowe — spróbuj ponownie."
                    : apiError.msg}
                </div>
                <div style={{ fontSize: "0.8rem", color: "#666", marginBottom: 12, background: "rgba(0,0,0,0.03)", padding: "10px", borderRadius: "5px" }}>
                  <strong>💡 Sposoby podania działki:</strong><br/>
                  1️⃣ Format TERYT (jeśli znasz pełny identyfikator): <code style={{ background: "#fff", padding: "2px 4px", borderRadius: 3 }}>141906_5.0029.60</code><br/>
                  2️⃣ Obręb + numer działki: podaj w polach poniżej np. Obręb: "Niedarzyn" + numer: "114/2"<br/>
                  3️⃣ Jeśli działka ma ukośnik (np. 142010_2.0011.401/2) — spróbuj bez ukośnika: "142010_2.0011.401"
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="ksws-btn ksws-btn-primary"
                    onClick={runAnalysis}
                    disabled={loading}
                    style={{ padding: "8px 20px", fontSize: "0.85rem" }}
                  >
                    🔄 Spróbuj ponownie
                  </button>
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
                  <div className="ksws-result-header-id">
                    {result.parcel_id}
                    {result.parcel_id && (
                      <a
                        href={`https://mapy.geoportal.gov.pl/imap/Imgp_2.html?identifyParcel=${result.parcel_id || ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Otwórz działkę w Geoportalu"
                        style={{ marginLeft: "12px", fontSize: "0.7em", color: "#2575fc", textDecoration: "none", border: "1px solid #2575fc", padding: "4px 8px", borderRadius: "3px", display: "inline-block" }}
                      >
                        🗺️ Geoportal
                      </a>
                    )}
                  </div>
                  <div className="ksws-result-header-meta">
                    {locationStr} · {nowPL()}
                  </div>
                </div>
                <div className="ksws-result-header-right">
                  <span className="ksws-badge ksws-badge-green">✓ REAL DATA</span>
                  {hasLine && (
                    <span className="ksws-badge ksws-badge-danger">⚡ Kolizja z linią</span>
                  )}
                  {hasLine && (
                    <span className="ksws-badge ksws-badge-outline">
                      {ksws.label || infraType || "ELEKTRO_SN"}
                    </span>
                  )}
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
                      : "Brak"}
                  </div>
                  <div className="ksws-kpi-source">
                    {hasLine ? "GESUT GUGiK" : "Nie wykryto kolizji"}
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
                          {/* ESRI World Imagery — satelita jak Geoportal (darmowe, bez klucza) */}
                          <TileLayer
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            attribution='Satelita: © ESRI World Imagery | Linie: OSM Overpass'
                            maxZoom={19}
                          />

                          {/* KIUT GUGiK — uzbrojenie terenu (WMS) */}
                          <InfrastructureLayer />

                          {/* Overpass OSM — linie i słupy energetyczne (pre-loaded) */}
                          <PreloadedPowerLayer geoJSON={powerGeoJSON} />

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
                            OSM · KIUT GUGiK · Overpass
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <a
                              href={`https://mapy.geoportal.gov.pl/imap/Imgp_2.html?identifyParcel=${result?.parcel_id || ""}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: "0.72rem", color: "#a91079", fontWeight: 600, textDecoration: "none" }}
                            >
                              🇵🇱 Geoportal →
                            </a>
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
                            href={`https://mapy.geoportal.gov.pl/imap/Imgp_2.html?identifyParcel=${result?.parcel_id || ""}`}
                            target="_blank"
                            rel="noreferrer"
                            className="ksws-map-outdoor-btn"
                          >
                            🇵🇱 Geoportal
                          </a>
                        </div>
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
                      <div className="ksws-info-item-label">Sieci przesyłowe (KIUT GUGiK)</div>
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
              {ksws.infra_type && hasLine && (
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
