import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, WMSTileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "react-toastify";
import CountUp from "react-countup";
import { Spinner, Badge, Table, Progress } from "reactstrap";
import jsPDF from "jspdf";
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

// ── Batch Parcels Layer - wyświetla wszystkie działki na mapie ──────────────
function BatchParcelsLayer({ results }) {
  const map = useMap();

  useEffect(() => {
    if (!results || !map) return;

    const featureGroup = L.featureGroup();

    results.forEach((p) => {
      const centroid = p.data?.geometry?.centroid_ll;
      if (!centroid || !centroid[0]) return;

      const collision = p.data?.infrastructure?.power_lines?.detected;
      const ta = p.data?.compensation?.track_a?.total || 0;
      const tb = p.data?.compensation?.track_b?.total || 0;
      const color = collision ? "#ff0000" : "#00aa00";

      const popup = `<div style="font-size: 12px; font-family: Arial; min-width: 200px;">
        <strong>${p.parcel_id}</strong><br/>
        Kolizja: ${collision ? "✅ TAK" : "❌ NIE"}<br/>
        Napięcie: ${p.data?.infrastructure?.power_lines?.voltage || "—"}<br/>
        Pow: ${Math.round(p.data?.geometry?.area_m2 || 0)} m²<br/>
        <hr style="margin: 5px 0; border: none; border-top: 1px solid #ddd;" />
        Track A: <strong style="color: #27ae60">${Math.round(ta)} PLN</strong><br/>
        Track B: <strong style="color: #f39c12">${Math.round(tb)} PLN</strong><br/>
        <strong style="color: ${color}">Razem: ${Math.round(ta + tb)} PLN</strong>
      </div>`;

      const marker = L.circleMarker([centroid[1], centroid[0]], {
        radius: collision ? 8 : 6,
        fillColor: color,
        color: color,
        weight: 2,
        opacity: 1,
        fillOpacity: collision ? 0.85 : 0.6,
      }).bindPopup(popup);

      featureGroup.addLayer(marker);
    });

    featureGroup.addTo(map);
    return () => featureGroup.remove();
  }, [map, results]);

  return null;
}

// ── Infrastruktura terenu - warstwa GESUT ──────────────────────────────────
function InfrastructureLayer() {
  const map = useMap();

  useEffect(() => {
    const gesutLayer = L.tileLayer.wms(
      "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu",
      {
        layers: "przewod_elektroenergetyczny,przewod_gazowy,przewod_wodociagowy",
        format: "image/png",
        transparent: true,
        opacity: 0.6,
        attribution: "GESUT GUGiK",
        zIndex: 5,
      }
    );
    gesutLayer.addTo(map);

    return () => map.removeLayer(gesutLayer);
  }, [map]);

  return null;
}

// ── PDF Report Generator ────────────────────────────────────────────────────
function generateParcelPDF(parcel, batchData) {
  try {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.text("RAPORT ODSZKODOWANIA - KSWS", pageWidth / 2, yPos, { align: "center" });

    // Date
    yPos += 10;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const now = new Date();
    doc.text(`Data: ${now.toLocaleDateString("pl-PL")} ${now.toLocaleTimeString("pl-PL")}`, pageWidth / 2, yPos, { align: "center" });

    // Separator
    yPos += 15;
    doc.setDrawColor(37, 117, 252);
    doc.line(20, yPos, pageWidth - 20, yPos);

    // Parcel ID Section
    yPos += 8;
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("IDENTYFIKACJA DZIAŁKI", 20, yPos);

    yPos += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    const parcelInfo = [
      [`Identyfikator działki:`, parcel.parcel_id],
      [`Kolizja z liniami energetycznymi:`, parcel.data?.infrastructure?.power_lines?.detected ? "TAK" : "NIE"],
      [`Napięcie linii [kV]:`, parcel.data?.infrastructure?.power_lines?.voltage || "—"],
    ];

    parcelInfo.forEach(([label, value]) => {
      doc.setFont(undefined, "bold");
      doc.text(label, 20, yPos);
      doc.setFont(undefined, "normal");
      doc.text(String(value), 100, yPos);
      yPos += 6;
    });

    // Geometry Section
    yPos += 8;
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("PARAMETRY GEOMETRYCZNE", 20, yPos);

    yPos += 8;
    doc.setFont(undefined, "normal");
    const area = parcel.data?.geometry?.area_m2 || 0;
    const price = parcel.data?.market_data?.average_price_m2 || 0;
    const value = parcel.data?.ksws?.property_value_total || 0;
    const lineLength = parcel.data?.infrastructure?.power_lines?.length_m || 0;
    const bandWidth = parcel.data?.ksws?.band_width_m || 0;
    const bandArea = parcel.data?.ksws?.band_area_m2 || 0;

    const geoInfo = [
      [`Pow. działki [m²]:`, Math.round(area).toLocaleString()],
      [`Cena rynkowa [PLN/m²]:`, Math.round(price).toLocaleString()],
      [`Wartość nieruchomości [PLN]:`, Math.round(value).toLocaleString()],
      [`Dł. linii energetycznej [m]:`, Math.round(lineLength).toLocaleString()],
      [`Szerokość pasa ochronnego [m]:`, Math.round(bandWidth).toLocaleString()],
      [`Pow. pasa ochronnego [m²]:`, Math.round(bandArea).toLocaleString()],
    ];

    geoInfo.forEach(([label, val]) => {
      doc.setFont(undefined, "bold");
      doc.text(label, 20, yPos);
      doc.setFont(undefined, "normal");
      doc.text(String(val), 100, yPos);
      yPos += 6;
    });

    // Compensation Section
    yPos += 8;
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("ODSZKODOWANIE KSWS", 20, yPos);

    yPos += 8;
    doc.setFont(undefined, "normal");
    const ta = parcel.data?.compensation?.track_a?.total || 0;
    const tb = parcel.data?.compensation?.track_b?.total || 0;
    const total = ta + tb;

    const compInfo = [
      [`Track A [PLN]:`, Math.round(ta).toLocaleString()],
      [`Track B [PLN]:`, Math.round(tb).toLocaleString()],
      [`RAZEM [PLN]:`, Math.round(total).toLocaleString()],
    ];

    compInfo.forEach(([label, val], idx) => {
      doc.setFont(undefined, "bold");
      if (idx === 2) {
        doc.setFontSize(11);
        doc.setTextColor(39, 174, 96);
      }
      doc.text(label, 20, yPos);
      doc.setFont(undefined, "bold");
      doc.text(String(val), 100, yPos);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      yPos += 8;
    });

    // Summary Box
    yPos += 8;
    doc.setDrawColor(37, 117, 252);
    doc.setFillColor(245, 249, 255);
    doc.rect(20, yPos - 5, pageWidth - 40, 30, "F");
    doc.setDrawColor(37, 117, 252);
    doc.rect(20, yPos - 5, pageWidth - 40, 30);

    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.setTextColor(37, 117, 252);
    doc.text("PODSUMOWANIE", 25, yPos + 2);

    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(`Status kolizji: ${parcel.data?.infrastructure?.power_lines?.detected ? "WYKRYTA" : "BRAK"}`, 25, yPos + 10);
    doc.text(`Całkowita kwota odszkodowania: ${Math.round(total).toLocaleString()} PLN`, 25, yPos + 17);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Raport wygenerowany automatycznie przez Kalkulator KSWS", pageWidth / 2, pageHeight - 10, { align: "center" });

    // Save
    doc.save(`${parcel.parcel_id}_KSWS_Report.pdf`);
    toast.success(`PDF dla ${parcel.parcel_id} pobrany!`);
  } catch (err) {
    console.error("PDF Error:", err);
    toast.error("Błąd przy generowaniu PDF");
  }
}

// ── Batch CSV Component ─────────────────────────────────────────────────────
function BatchCSVSection() {
  const [batchResults, setBatchResults] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [batchError, setBatchError] = useState(null);

  useEffect(() => {
    loadBatchData();
  }, []);

  const loadBatchData = async () => {
    try {
      setBatchError(null);
      const res = await fetch("/api/history/20260311_194524");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.ok && json.data?.results) {
        setBatchResults(json.data);
        // Zapisz pełne dane do historii
        saveBatchToHistory(json.data);
      }
    } catch (err) {
      setBatchError(err.message);
    }
  };

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
    setBatchLoading(true);
    setBatchError(null);
    const form = new FormData();
    form.append("file", csvFile);
    try {
      const res = await fetch("/api/analyze/batch", { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Błąd");
      setBatchResults(data.data);
      // Zapisz do historii
      if (data.data?.results) {
        saveBatchToHistory(data.data);
      }
      setCsvFile(null);
      toast.success("Batch załadowany i zapisany do historii!");
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
      Math.round(p.data?.infrastructure?.power_lines?.length_m || 0),  // Dł_Linii_m
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
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPos = 20;

      // Header
      doc.setFontSize(18);
      doc.setFont(undefined, "bold");
      doc.text("RAPORT ZBIORCZY - BATCH KSWS", pageWidth / 2, yPos, { align: "center" });

      // Date
      yPos += 10;
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      const now = new Date();
      doc.text(`Data: ${now.toLocaleDateString("pl-PL")} ${now.toLocaleTimeString("pl-PL")}`, pageWidth / 2, yPos, { align: "center" });

      // Separator
      yPos += 12;
      doc.setDrawColor(37, 117, 252);
      doc.line(20, yPos, pageWidth - 20, yPos);

      // Summary Stats
      yPos += 10;
      doc.setFontSize(12);
      doc.setFont(undefined, "bold");
      doc.text("PODSUMOWANIE ANALIZY", 20, yPos);

      yPos += 8;
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");

      const totalTrackA = stats.trackA;
      const totalTrackB = stats.trackB;
      const collision = batchResults.results.filter(p => p.data?.infrastructure?.power_lines?.detected).length;

      const summaryInfo = [
        [`Liczba działek:`, stats.total],
        [`Działek z kolizją:`, collision],
        [`Działek bez kolizji:`, stats.total - collision],
        [`Track A razem [PLN]:`, Math.round(totalTrackA).toLocaleString()],
        [`Track B razem [PLN]:`, Math.round(totalTrackB).toLocaleString()],
        [`RAZEM ODSZKODOWANIE [PLN]:`, Math.round(totalTrackA + totalTrackB).toLocaleString()],
      ];

      summaryInfo.forEach(([label, value], idx) => {
        doc.setFont(undefined, "bold");
        if (idx === 5) {
          doc.setFontSize(11);
          doc.setTextColor(39, 174, 96);
        }
        doc.text(label, 20, yPos);
        doc.setFont(undefined, "bold");
        doc.text(String(value), 100, yPos);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        yPos += 7;
      });

      // Detailed Table
      yPos += 10;
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      doc.text("SZCZEGÓŁY DZIAŁEK", 20, yPos);

      yPos += 8;
      doc.setFontSize(9);
      doc.setFont(undefined, "normal");

      const tableData = batchResults.results.map(p => [
        p.parcel_id,
        p.data?.infrastructure?.power_lines?.detected ? "✓" : "—",
        p.data?.infrastructure?.power_lines?.voltage || "—",
        Math.round(p.data?.geometry?.area_m2 || 0),
        Math.round(p.data?.compensation?.track_a?.total || 0),
        Math.round(p.data?.compensation?.track_b?.total || 0),
        Math.round((p.data?.compensation?.track_a?.total || 0) + (p.data?.compensation?.track_b?.total || 0)),
      ]);

      const headers = ["ID", "Kolizja", "kV", "Pow[m²]", "Track A", "Track B", "Razem"];
      const startY = yPos;
      let currentY = startY;
      const rowHeight = 6;
      const cellPadding = 2;

      // Draw header
      doc.setFillColor(26, 32, 53);
      doc.setTextColor(255, 255, 255);
      doc.setFont(undefined, "bold");
      const colWidths = [30, 15, 15, 20, 20, 20, 25];
      let xPos = 20;
      headers.forEach((header, idx) => {
        doc.text(header, xPos + cellPadding, currentY + rowHeight - 1, { maxWidth: colWidths[idx] - 2 * cellPadding });
        xPos += colWidths[idx];
      });
      currentY += rowHeight;

      // Draw rows
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, "normal");
      tableData.forEach((row, idx) => {
        if (currentY > pageHeight - 20) {
          doc.addPage();
          currentY = 20;
          // Redraw header on new page
          doc.setFillColor(26, 32, 53);
          doc.setTextColor(255, 255, 255);
          doc.setFont(undefined, "bold");
          xPos = 20;
          headers.forEach((header, hIdx) => {
            doc.text(header, xPos + cellPadding, currentY + rowHeight - 1, { maxWidth: colWidths[hIdx] - 2 * cellPadding });
            xPos += colWidths[hIdx];
          });
          currentY += rowHeight;
          doc.setTextColor(0, 0, 0);
          doc.setFont(undefined, "normal");
        }

        if (idx % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(20, currentY - 2, pageWidth - 40, rowHeight, "F");
        }

        xPos = 20;
        row.forEach((cell, cellIdx) => {
          const align = cellIdx === 0 ? "left" : "right";
          doc.text(String(cell), xPos + cellPadding, currentY + rowHeight - 1, { maxWidth: colWidths[cellIdx] - 2 * cellPadding, align });
          xPos += colWidths[cellIdx];
        });
        currentY += rowHeight;
      });

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Raport wygenerowany automatycznie przez Kalkulator KSWS", pageWidth / 2, pageHeight - 10, { align: "center" });

      doc.save(`Batch_KSWS_Report_${new Date().toISOString().split("T")[0]}.pdf`);
      toast.success("Raport PDF pobrany!");
    } catch (err) {
      console.error("PDF Error:", err);
      toast.error("Błąd przy generowaniu PDF");
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

        <form onSubmit={handleUpload} style={{ marginBottom: "20px", padding: "15px", background: "#f9f9f9", borderRadius: "8px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0])} style={{ flex: 1, minWidth: "150px" }} />
            <button type="submit" disabled={!csvFile || batchLoading} className="ksws-btn ksws-btn-primary" style={{ whiteSpace: "nowrap" }}>
              {batchLoading ? "⏳ Upload..." : "🚀 Upload CSV"}
            </button>
            <button type="button" onClick={downloadCSV} disabled={!batchResults?.results} className="ksws-btn" style={{ whiteSpace: "nowrap" }}>
              ⬇️ CSV
            </button>
            <button type="button" onClick={downloadBatchPDF} disabled={!batchResults?.results} className="ksws-btn" style={{ whiteSpace: "nowrap", background: "#27ae60", color: "white", border: "none" }}>
              📄 PDF Raport
            </button>
          </div>
        </form>

        {stats && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px", marginBottom: "20px" }}>
              <div style={{ background: "white", padding: "15px", borderRadius: "8px", border: "1px solid #eee", textAlign: "center" }}>
                <div style={{ fontSize: "1.8em", fontWeight: "800" }}>{stats.total}</div>
                <div style={{ fontSize: "0.8em", color: "#888" }}>Razem</div>
              </div>
              <div style={{ background: "white", padding: "15px", borderRadius: "8px", border: "1px solid #eee", textAlign: "center" }}>
                <div style={{ fontSize: "1.8em", fontWeight: "800", color: "#f39c12" }}>{stats.collision}</div>
                <div style={{ fontSize: "0.8em", color: "#888" }}>Kolizja</div>
              </div>
              <div style={{ background: "white", padding: "15px", borderRadius: "8px", border: "1px solid #eee", textAlign: "center" }}>
                <div style={{ fontSize: "1.5em", fontWeight: "800", color: "#27ae60" }}>{fmtPLN(stats.trackA)}</div>
                <div style={{ fontSize: "0.8em", color: "#888" }}>Track A</div>
              </div>
              <div style={{ background: "white", padding: "15px", borderRadius: "8px", border: "1px solid #eee", textAlign: "center" }}>
                <div style={{ fontSize: "1.5em", fontWeight: "800", color: "#f39c12" }}>{fmtPLN(stats.trackB)}</div>
                <div style={{ fontSize: "0.8em", color: "#888" }}>Track B</div>
              </div>
            </div>

            <div style={{ background: "linear-gradient(135deg, #27ae60, #2ecc71)", color: "white", padding: "20px", borderRadius: "8px", textAlign: "center", marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9em", marginBottom: "5px" }}>💰 RAZEM</div>
              <div style={{ fontSize: "2em", fontWeight: "800" }}>{fmtPLN(stats.trackA + stats.trackB)}</div>
            </div>

            {/* MAPA ZBIORCZA Z WARSTWĄ UZBROJENIA TERENU */}
            <div style={{ background: "white", borderRadius: "8px", border: "1px solid #eee", padding: "20px", marginBottom: "20px" }}>
              <h3 style={{ marginTop: 0, marginBottom: "15px" }}>🗺️ Mapa geograficzna - wszystkie {stats.total} działek</h3>
              <MapContainer center={[52.0, 20.0]} zoom={7} style={{ height: "550px", width: "100%", borderRadius: "6px", marginBottom: "15px", border: "1px solid #ddd" }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
                <InfrastructureLayer />
                <BatchParcelsLayer results={batchResults.results} />
              </MapContainer>
              <div style={{ padding: "12px", background: "#f9f9f9", borderRadius: "6px", fontSize: "0.85em", color: "#555", lineHeight: "1.6" }}>
                <div style={{ marginBottom: "8px", fontWeight: "600" }}>Legenda:</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <strong style={{ color: "#ff0000" }}>🔴 {stats.collision}</strong> działek z <strong>kolizją</strong>
                  </div>
                  <div>
                    <strong style={{ color: "#00aa00" }}>🟢 {stats.total - stats.collision}</strong> działek <strong>bez kolizji</strong>
                  </div>
                  <div style={{ gridColumn: "1 / -1", marginTop: "5px", paddingTop: "8px", borderTop: "1px solid #ddd" }}>
                    <strong style={{ color: "#2575fc" }}>📡 Warstwa uzbrojenia terenu</strong> - drogi, gazociągi, wodociągi, przewody energetyczne (GESUT GUGiK)
                  </div>
                </div>
              </div>
            </div>

            <div style={{ overflowX: "auto", background: "white", borderRadius: "8px", border: "1px solid #eee" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8em" }}>
                <thead>
                  <tr style={{ background: "#1a2035", color: "white", position: "sticky", top: 0 }}>
                    <th style={{ padding: "10px", textAlign: "left" }}>ID</th>
                    <th style={{ padding: "10px", textAlign: "center" }}>Kolizja</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Napięcie [kV]</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Pow_m2</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Cena_PLN/m²</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Wartość_PLN</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Dł_Linii_m</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Szer_Pasa_m</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Pow_Pasa_m2</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Track_A_PLN</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Track_B_PLN</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Razem_PLN</th>
                    <th style={{ padding: "10px", textAlign: "center" }}>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {batchResults.results.map((p, i) => {
                    const ta = p.data?.compensation?.track_a?.total || 0;
                    const tb = p.data?.compensation?.track_b?.total || 0;
                    const area = p.data?.geometry?.area_m2 || 0;
                    const price = p.data?.market_data?.average_price_m2 || 0;
                    const value = p.data?.ksws?.property_value_total || 0;
                    const lineLength = p.data?.infrastructure?.power_lines?.length_m || 0;
                    const bandWidth = p.data?.ksws?.band_width_m || 0;
                    const bandArea = p.data?.ksws?.band_area_m2 || 0;
                    const collision = p.data?.infrastructure?.power_lines?.detected;

                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f0f0f0", background: i % 2 === 0 ? "#fafafa" : "white" }}>
                        <td style={{ padding: "8px", fontWeight: "bold" }}>
                          <a href={`https://www.geoportal.gov.pl/pl/mapy-i-dane/usluga-wyszukiwania-dzialek-ewidencyjnych/?par_id=${encodeURIComponent(p.parcel_id || "")}`} target="_blank" rel="noopener noreferrer" style={{ color: "#2575fc", textDecoration: "none" }} title="Otwórz w Geoportalu">
                            {p.parcel_id} 🔗
                          </a>
                        </td>
                        <td style={{ padding: "8px", textAlign: "center" }}>{collision ? "✅" : "❌"}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{p.data?.infrastructure?.power_lines?.voltage || "—"}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{Math.round(area).toLocaleString()}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{Math.round(price).toLocaleString()}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{Math.round(value).toLocaleString()}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{Math.round(lineLength).toLocaleString()}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{Math.round(bandWidth).toLocaleString()}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{Math.round(bandArea).toLocaleString()}</td>
                        <td style={{ padding: "8px", textAlign: "right", color: "#27ae60", fontWeight: "bold" }}>{Math.round(ta).toLocaleString()}</td>
                        <td style={{ padding: "8px", textAlign: "right", color: "#f39c12", fontWeight: "bold" }}>{Math.round(tb).toLocaleString()}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: "bold" }}>{Math.round(ta + tb).toLocaleString()}</td>
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          <button
                            onClick={() => generateParcelPDF(p, batchResults)}
                            style={{ padding: "4px 10px", background: "#2575fc", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.85em" }}
                          >
                            📄
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ════ HISTORIA BATCHÓW ════ */}
      <div className="ksws-card">
        <div className="ksws-card-header">
          <span className="ksws-card-header-icon">📋</span>
          <div>
            <div className="ksws-card-header-title">Historia Batch CSV</div>
            <div className="ksws-card-header-sub">Poprzednie analizy batchów</div>
          </div>
        </div>
        <div className="ksws-card-body">
          {(() => {
            try {
              const batchHist = JSON.parse(localStorage.getItem("batch_history") || "[]");
              if (!batchHist.length) {
                return <div style={{ padding: "20px", textAlign: "center", color: "#999" }}>📭 Brak historii batchów</div>;
              }
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {batchHist.map((b, idx) => (
                    <div key={idx} style={{ background: "#f9f9f9", padding: "15px", borderRadius: "8px", border: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: "bold", marginBottom: "5px" }}>📅 {b.date}</div>
                        <div style={{ fontSize: "0.9em", color: "#666", marginBottom: "5px" }}>📦 Działek: {b.parcel_count}</div>
                        <div style={{ fontSize: "0.9em", color: "#27ae60", fontWeight: "bold" }}>💰 Track A: {Math.round(b.summary?.trackA || 0).toLocaleString()} PLN</div>
                        <div style={{ fontSize: "0.9em", color: "#f39c12", fontWeight: "bold" }}>💰 Track B: {Math.round(b.summary?.trackB || 0).toLocaleString()} PLN</div>
                        <div style={{ fontSize: "0.85em", color: "#555", marginTop: "5px" }}>🎯 Razem: {Math.round(b.summary?.total || 0).toLocaleString()} PLN</div>
                      </div>
                      <button
                        onClick={() => {
                          const updated = batchHist.filter((_, i) => i !== idx);
                          localStorage.setItem("batch_history", JSON.stringify(updated));
                          window.location.reload();
                        }}
                        style={{ padding: "8px 16px", background: "#e74c3c", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", whiteSpace: "nowrap" }}
                        title="Usuń z historii"
                      >
                        🗑️ Usuń
                      </button>
                    </div>
                  ))}
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
                        href={`https://geoportal.gov.pl/?zoom=18&x=${result.data?.geometry?.centroid_ll?.[0] || 20}&y=${result.data?.geometry?.centroid_ll?.[1] || 52}&baselayer=ORTOFOTOMAPA`}
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
                              href={`https://www.geoportal.gov.pl/pl/mapy-i-dane/usluga-wyszukiwania-dzialek-ewidencyjnych/?par_id=${encodeURIComponent(result?.parcel_id || "")}`}
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
