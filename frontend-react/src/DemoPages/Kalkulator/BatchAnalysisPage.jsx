import React, { useState, useEffect } from "react";
import {
  Card, CardBody, CardTitle, Button, Progress, Badge, Spinner,
  Table, Row, Col, Alert, Input, Label, FormGroup, Modal, ModalHeader,
  ModalBody, ModalFooter
} from "reactstrap";
import { MapContainer, TileLayer, GeoJSON as GeoJSONComponent } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "react-toastify";
import PageTitleAlt2 from "../../Layout/AppMain/PageTitleAlt2";
import "./BatchAnalysisPage.css";

// Leaflet icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const fmt = (v, dec = 0) =>
  v != null && !isNaN(v)
    ? Number(v).toLocaleString("pl-PL", { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : "—";
const fmtPLN = (v) => (v != null && !isNaN(v) ? `${fmt(v)} PLN` : "—");

export const BatchAnalysisPage = () => {
  const [csvFile, setCsvFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [detailsModal, setDetailsModal] = useState(false);
  const [sortBy, setSortBy] = useState("parcel_id");

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      if (data.ok) {
        setHistory(data.history || []);
      }
    } catch (e) {
      console.error("Error loading history:", e);
    }
  };

  const handleCSVUpload = async (e) => {
    e.preventDefault();
    if (!csvFile) {
      toast.error("Wybierz plik CSV");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("file", csvFile);

    try {
      const res = await fetch("/api/analyze/batch", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      setResults(data);
      setCsvFile(null);
      loadHistory();
      toast.success(`✅ Analizowano ${data.summary.total} działek`);
    } catch (error) {
      toast.error(`❌ Błąd: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadBatchDetails = async (batch_id) => {
    try {
      const res = await fetch(`/api/history/${batch_id}`);
      const data = await res.json();
      if (data.ok) {
        setSelectedBatch(data.data);
        setDetailsModal(true);
      }
    } catch (e) {
      toast.error("Błąd pobierania szczegółów");
    }
  };

  const downloadResultsCSV = () => {
    if (!results?.parcels) return;

    const rows = results.parcels.map(p => {
      const d = p.data?.compensation || {};
      const inf = p.data?.infrastructure?.power_lines || {};
      return {
        "Dz. Nr": p.parcel_id,
        "Konflikt": inf.detected ? "TAK" : "NIE",
        "Napięcie": inf.voltage || "—",
        "Zajęta pow. [m²]": d.band_area_m2 || "—",
        "Linia długość [m]": inf.length_m || "—",
        "Track A [PLN]": fmtPLN(d.track_a_total),
        "Track B [PLN]": fmtPLN(d.track_b_total),
      };
    });

    const csv = [
      Object.keys(rows[0]).join(","),
      ...rows.map(r => Object.values(r).map(v => `"${v}"`).join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `wyniki_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  const getVoltageColor = (voltage) => {
    const colors = { WN: "#e74c3c", SN: "#f39c12", nN: "#27ae60", brak: "#95a5a6" };
    return colors[voltage] || colors.brak;
  };

  // Collective map
  const collectiveGeoJSON = () => {
    if (!results?.parcels) return { type: "FeatureCollection", features: [] };

    return {
      type: "FeatureCollection",
      features: results.parcels
        .filter(p => p.data?.geometry?.geojson)
        .map((p, idx) => ({
          ...p.data.geometry.geojson,
          properties: {
            ...p.data.geometry.geojson.properties,
            parcelId: p.parcel_id,
            voltage: p.data.infrastructure?.power_lines?.voltage || "brak",
            has_conflict: p.data.infrastructure?.power_lines?.detected,
            index: idx
          }
        }))
    };
  };

  const CollectiveMap = () => {
    const geoJSON = collectiveGeoJSON();

    const onEachFeature = (feature, layer) => {
      const voltage = feature.properties?.voltage || "brak";
      const color = getVoltageColor(voltage);

      layer.setStyle({
        color: color,
        weight: 2,
        fillOpacity: 0.3,
      });

      const popup = `
        <div style="font-size: 12px;">
          <strong>${feature.properties.parcelId}</strong><br/>
          Napięcie: ${voltage}<br/>
          Konflikt: ${feature.properties.has_conflict ? "TAK ⚠️" : "NIE ✅"}
        </div>
      `;
      layer.bindPopup(popup);
    };

    return (
      <MapContainer center={[52.0, 20.0]} zoom={7} style={{ height: "500px", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        {geoJSON.features.length > 0 && <GeoJSONComponent data={geoJSON} onEachFeature={onEachFeature} />}
      </MapContainer>
    );
  };

  // Results table
  const renderTable = (parcels) => {
    const sorted = [...(parcels || [])].sort((a, b) => {
      const aVal = a.parcel_id || "";
      const bVal = b.parcel_id || "";
      return aVal.localeCompare(bVal);
    });

    return (
      <table className="batch-table">
        <thead>
          <tr>
            <th>Dz. Nr</th>
            <th>Konflikt?</th>
            <th>Napięcie</th>
            <th>Zajęta pow. [m²]</th>
            <th>Linia [m]</th>
            <th>Track A [PLN]</th>
            <th>Track B [PLN]</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, idx) => {
            const inf = p.data?.infrastructure?.power_lines || {};
            const comp = p.data?.compensation || {};
            const hasConflict = inf.detected;

            return (
              <tr key={idx} style={{ backgroundColor: p.status === "ERROR" ? "#fadbd8" : "transparent" }}>
                <td><strong>{p.parcel_id}</strong></td>
                <td>
                  <span className={`batch-table-badge ${hasConflict ? "danger" : "success"}`}>
                    {hasConflict ? "TAK ⚠️" : "NIE ✅"}
                  </span>
                </td>
                <td>
                  <div
                    className="batch-table-color-box"
                    style={{ backgroundColor: getVoltageColor(inf.voltage) }}
                  />
                  {inf.voltage || "—"}
                </td>
                <td className="text-right">{fmt(comp.band_area_m2, 1)}</td>
                <td className="text-right">{fmt(inf.length_m, 1)}</td>
                <td className="text-right"><strong>{fmtPLN(comp.track_a_total)}</strong></td>
                <td className="text-right"><strong>{fmtPLN(comp.track_b_total)}</strong></td>
                <td>
                  <span className={`batch-table-badge ${p.status === "ERROR" ? "danger" : "info"}`}>
                    {p.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="batch-analysis-wrapper">
      <div className="batch-header">
        <h1>📊 Analiza zbiorcza działek</h1>
        <p>Wgraj CSV, analizuj wszystkie działki naraz, pobierz wyniki</p>
      </div>

      <div className="batch-content">
        {/* Upload Card */}
        <div className="batch-upload-card">
          <h3>📋 Upload CSV</h3>
          <label className="batch-upload-label">
            Format: parcel_id, obreb, county, municipality
          </label>

          <form onSubmit={handleCSVUpload}>
            <div className="batch-file-input-wrapper">
              <input
                id="csvInput"
                type="file"
                accept=".csv"
                className="batch-file-input"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                disabled={loading}
              />
              <label htmlFor="csvInput" className="batch-file-button">
                📁 Wybierz plik CSV
              </label>
              {csvFile && (
                <div className="batch-file-name">
                  ✓ {csvFile.name}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="batch-analyze-button"
              disabled={loading || !csvFile}
            >
              {loading ? (
                <>
                  <Spinner size="sm" /> Analizowanie...
                </>
              ) : (
                <>🚀 Analizuj działki</>
              )}
            </button>
          </form>
        </div>

        {/* History Card */}
        <div className="batch-history-card">
          <h3>📚 Historia analiz</h3>
          {history.length === 0 ? (
            <div className="batch-history-empty">
              Brak historii analiz<br/>
              <small>Wgrywajcie pliki CSV aby je zobaczyć</small>
            </div>
          ) : (
            <div className="batch-history-list">
              {history.map((h) => (
                <div key={h.batch_id} className="batch-history-item">
                  <div className="batch-history-item-header">
                    <div className="batch-history-item-name">{h.file_name}</div>
                    <div className="batch-history-item-badge">
                      {h.successful}/{h.total}
                    </div>
                  </div>
                  <div className="batch-history-item-date">
                    {new Date(h.timestamp).toLocaleString("pl-PL")}
                  </div>
                  <div className="batch-history-item-details">
                    <div className="batch-history-item-stat">
                      <span className="batch-history-item-stat-label">✓ Pomyślne:</span>
                      <span className="batch-history-item-stat-value">{h.successful}</span>
                    </div>
                    <div className="batch-history-item-stat">
                      <span className="batch-history-item-stat-label">✗ Błędy:</span>
                      <span className="batch-history-item-stat-value">{h.total - h.successful}</span>
                    </div>
                  </div>
                  <button
                    className="batch-history-item-button"
                    onClick={() => loadBatchDetails(h.batch_id)}
                  >
                    Szczegóły →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results Section */}
      {results && (
        <div className="batch-results-section">
          {/* Summary Stats */}
          <div className="batch-results-card">
            <div className="batch-results-header">
              <h3>✅ Wyniki analizy</h3>
              <button className="batch-download-button" onClick={downloadResultsCSV}>
                📥 Pobierz CSV
              </button>
            </div>

            <div className="batch-summary-stats">
              <div className="batch-stat-box">
                <div className="batch-stat-label">Wszystkie działki</div>
                <div className="batch-stat-value">{fmt(results.summary.total)}</div>
              </div>
              <div className="batch-stat-box success">
                <div className="batch-stat-label">✓ Analizowane</div>
                <div className="batch-stat-value">{fmt(results.summary.successful)}</div>
              </div>
              <div className="batch-stat-box error">
                <div className="batch-stat-label">✗ Błędy</div>
                <div className="batch-stat-value">{fmt(results.summary.failed)}</div>
              </div>
            </div>

            <div style={{ marginTop: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#7f8c8d", marginBottom: "8px" }}>
                Postęp: {((results.summary.successful / results.summary.total) * 100).toFixed(0)}%
              </div>
              <div className="batch-progress-bar">
                <div
                  className="batch-progress-fill"
                  style={{ width: `${(results.summary.successful / results.summary.total) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="batch-map-card">
            <h3>🗺️ Mapa zbiorcza</h3>
            <div className="batch-map-container">
              <CollectiveMap />
            </div>
            <div className="batch-map-legend">
              <div className="batch-map-legend-item">
                <div className="batch-map-legend-color" style={{ backgroundColor: "#e74c3c" }}></div>
                <span>WN (Wysoki napór)</span>
              </div>
              <div className="batch-map-legend-item">
                <div className="batch-map-legend-color" style={{ backgroundColor: "#f39c12" }}></div>
                <span>SN (Średni napór)</span>
              </div>
              <div className="batch-map-legend-item">
                <div className="batch-map-legend-color" style={{ backgroundColor: "#27ae60" }}></div>
                <span>nN (Niski napór)</span>
              </div>
              <div className="batch-map-legend-item">
                <div className="batch-map-legend-color" style={{ backgroundColor: "#95a5a6" }}></div>
                <span>Brak infrastruktury</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="batch-table-card">
            <h3>📊 Szczegóły działek</h3>
            <div style={{ overflowX: "auto" }}>
              {renderTable(results.parcels)}
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      <Modal isOpen={detailsModal} toggle={() => setDetailsModal(false)} size="lg" className="batch-details-modal">
        <div className="batch-modal-header">
          <h5>📋 Historia: {selectedBatch?.batch_id}</h5>
        </div>
        <div className="batch-modal-body">
          {selectedBatch && renderTable(selectedBatch.results)}
        </div>
        <div style={{ padding: "20px", textAlign: "right", borderTop: "1px solid #ecf0f1" }}>
          <button
            style={{
              background: "#95a5a6",
              color: "white",
              border: "none",
              padding: "10px 20px",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "600"
            }}
            onClick={() => setDetailsModal(false)}
          >
            Zamknij
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default BatchAnalysisPage;
