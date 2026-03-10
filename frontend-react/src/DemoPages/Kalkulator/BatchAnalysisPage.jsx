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
      <div className="table-responsive">
        <Table striped hover size="sm">
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
                <tr key={idx} style={{ backgroundColor: p.status === "ERROR" ? "#fee" : "white" }}>
                  <td>{p.parcel_id}</td>
                  <td>
                    <Badge color={hasConflict ? "danger" : "success"}>
                      {hasConflict ? "TAK ⚠️" : "NIE ✅"}
                    </Badge>
                  </td>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        backgroundColor: getVoltageColor(inf.voltage),
                        color: "white",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        fontSize: "12px",
                      }}
                    >
                      {inf.voltage || "—"}
                    </span>
                  </td>
                  <td>{fmt(comp.band_area_m2, 1)}</td>
                  <td>{fmt(inf.length_m, 1)}</td>
                  <td>{fmtPLN(comp.track_a_total)}</td>
                  <td>{fmtPLN(comp.track_b_total)}</td>
                  <td>
                    <Badge color={p.status === "ERROR" ? "danger" : "info"}>
                      {p.status}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    );
  };

  return (
    <>
      <PageTitleAlt2 heading="Analiza zbiorcza działek (99)" subheading="CSV upload + Historia + Mapa" />

      <div className="row">
        <div className="col-lg-6">
          <Card className="main-card mb-3">
            <CardBody>
              <CardTitle tag="h5">📋 Upload CSV</CardTitle>
              <form onSubmit={handleCSVUpload}>
                <FormGroup>
                  <Label for="csvInput">Plik CSV (parcel_id, obreb, county, municipality)</Label>
                  <Input
                    id="csvInput"
                    type="file"
                    accept=".csv"
                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                    disabled={loading}
                  />
                </FormGroup>
                <Button color="primary" type="submit" disabled={loading || !csvFile}>
                  {loading ? <Spinner size="sm" /> : "🚀 Analizuj"}
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>

        <div className="col-lg-6">
          <Card className="main-card mb-3">
            <CardBody>
              <CardTitle tag="h5">📚 Historia analiz</CardTitle>
              {history.length === 0 ? (
                <p className="text-muted">Brak historii</p>
              ) : (
                <div style={{ maxHeight: "250px", overflowY: "auto" }}>
                  {history.map((h) => (
                    <div key={h.batch_id} className="mb-2 p-2" style={{ border: "1px solid #ddd", borderRadius: "4px" }}>
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <strong>{h.file_name}</strong>
                          <br />
                          <small className="text-muted">{new Date(h.timestamp).toLocaleString("pl-PL")}</small>
                        </div>
                        <Badge color="info">{h.successful}/{h.total}</Badge>
                      </div>
                      <Button
                        size="sm"
                        color="link"
                        onClick={() => loadBatchDetails(h.batch_id)}
                        className="mt-2"
                      >
                        Szczegóły →
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Wyniki */}
      {results && (
        <>
          <Card className="main-card mb-3">
            <CardBody>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <CardTitle tag="h5">
                  ✅ Wyniki ({results.summary.successful}/{results.summary.total})
                </CardTitle>
                <Button color="success" size="sm" onClick={downloadResultsCSV}>
                  📥 Pobierz CSV
                </Button>
              </div>

              <Row className="mb-3">
                <Col md="4">
                  <div className="text-center">
                    <h4>{fmt(results.summary.total)}</h4>
                    <small className="text-muted">Wszystkie działki</small>
                  </div>
                </Col>
                <Col md="4">
                  <div className="text-center">
                    <h4 className="text-success">{fmt(results.summary.successful)}</h4>
                    <small className="text-muted">Analizowane</small>
                  </div>
                </Col>
                <Col md="4">
                  <div className="text-center">
                    <h4 className="text-danger">{fmt(results.summary.failed)}</h4>
                    <small className="text-muted">Błędy</small>
                  </div>
                </Col>
              </Row>

              <Progress value={(results.summary.successful / results.summary.total) * 100} />
            </CardBody>
          </Card>

          {/* Mapa */}
          <Card className="main-card mb-3">
            <CardBody>
              <CardTitle tag="h5">🗺️ Mapa zbiorcza</CardTitle>
              <CollectiveMap />
              <small className="text-muted mt-2 d-block">
                Kolory: <span style={{ color: "#e74c3c" }}>●</span> WN |
                <span style={{ color: "#f39c12" }}> ●</span> SN |
                <span style={{ color: "#27ae60" }}> ●</span> nN |
                <span style={{ color: "#95a5a6" }}> ●</span> Brak
              </small>
            </CardBody>
          </Card>

          {/* Tabela */}
          <Card className="main-card mb-3">
            <CardBody>
              <CardTitle tag="h5">📊 Szczegóły działek</CardTitle>
              {renderTable(results.parcels)}
            </CardBody>
          </Card>
        </>
      )}

      {/* Details Modal */}
      <Modal isOpen={detailsModal} toggle={() => setDetailsModal(false)} size="lg">
        <ModalHeader toggle={() => setDetailsModal(false)}>
          Historia: {selectedBatch?.batch_id}
        </ModalHeader>
        <ModalBody>{selectedBatch && renderTable(selectedBatch.results)}</ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setDetailsModal(false)}>
            Zamknij
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default BatchAnalysisPage;
