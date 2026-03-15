import React, { useState } from "react";
import { Card, CardBody, CardTitle, Button, FormGroup, Label, Input, Row, Col, Badge, Spinner, Container } from "reactstrap";
import { MapContainer, WMSTileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import PageTitleAlt2 from "../../Layout/AppMain/PageTitleAlt2";
import { API_BASE } from "../../config/api";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function GeoLayer({ geojson }) {
  const map = useMap();
  React.useEffect(() => {
    if (!geojson) return;
    const layer = L.geoJSON(geojson, { style: { color: "#545cd8", weight: 3, fillOpacity: 0.2 } });
    layer.addTo(map);
    try {
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } catch (_) {}
    return () => map.removeLayer(layer);
  }, [map, geojson]);
  return null;
}

export default function PodgladPage() {
  const [parcelId, setParcelId] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [center, setCenter] = useState([52.23, 21.01]);

  const fetchPreview = async (e) => {
    e.preventDefault();
    const pid = parcelId.trim();
    if (!pid) return;
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(`${API_BASE}/api/parcel/${encodeURIComponent(pid)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || (typeof d.detail === "string" ? d.detail : "Błąd"));
      setData(d);
      const c = d.centroid;
      if (c?.lon != null && c?.lat != null) setCenter([c.lat, c.lon]);
    } catch (err) {
      setData({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const geom = data?.geometry;
  const hasError = data?.error || (data && !data.ok);

  return (
    <Container fluid>
      <PageTitleAlt2 heading="Szybki podgląd" subheading="ULDK — geometria bez pełnej analizy" icon="pe-7s-look icon-gradient bg-tempting-azure" />
      <Card className="mb-3">
        <CardBody>
          <form onSubmit={fetchPreview} className="d-flex gap-2 align-items-end">
            <FormGroup className="mb-0 flex-grow-1">
              <Label>Identyfikator działki</Label>
              <Input type="text" value={parcelId} onChange={(e) => setParcelId(e.target.value)} placeholder="np. 142003_2.0001.74/1" />
            </FormGroup>
            <Button type="submit" color="primary" disabled={loading}>{loading ? <Spinner size="sm" /> : "Pobierz"}</Button>
          </form>
        </CardBody>
      </Card>

      {data && (
        <Row>
          <Col md="6">
            <Card className="mb-3">
              <CardBody className="p-0">
                <div style={{ height: 350 }}>
                  <MapContainer key={parcelId || "map"} center={center} zoom={16} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                    <WMSTileLayer
                      url="https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution"
                      layers="Raster"
                      format="image/png"
                      transparent={false}
                      version="1.1.1"
                      srs="EPSG:3857"
                      attribution="Geoportal Orto"
                    />
                    <WMSTileLayer
                      url="https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow"
                      layers="dzialki,numery_dzialek"
                      format="image/png"
                      transparent
                      opacity={0.75}
                      version="1.1.1"
                      srs="EPSG:3857"
                      zIndex={400}
                    />
                    <WMSTileLayer
                      url="https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu"
                      layers="przewod_elektroenergetyczny"
                      format="image/png"
                      transparent
                      opacity={0.7}
                      version="1.1.1"
                      srs="EPSG:3857"
                      zIndex={600}
                    />
                    <GeoLayer geojson={hasError ? null : geom} />
                  </MapContainer>
                </div>
              </CardBody>
            </Card>
          </Col>
          <Col md="6">
            <Card className="mb-3">
              <CardBody>
                <CardTitle>Dane ULDK</CardTitle>
                {hasError ? (
                  <Badge color="danger">{data.error}</Badge>
                ) : (
                  <div>
                    <p><strong>Powierzchnia:</strong> {data.area_m2 != null ? `${data.area_m2} m²` : "—"}</p>
                    <p><strong>Gmina:</strong> {data.commune || "—"}</p>
                    <p><strong>Powiat:</strong> {data.county || "—"}</p>
                    <p><strong>Województwo:</strong> {data.voivodeship || "—"}</p>
                    <p><strong>Status:</strong> <Badge color={data.ok ? "success" : "secondary"}>{data.status || (data.ok ? "OK" : "—")}</Badge></p>
                  </div>
                )}
              </CardBody>
            </Card>
          </Col>
        </Row>
      )}
    </Container>
  );
}
