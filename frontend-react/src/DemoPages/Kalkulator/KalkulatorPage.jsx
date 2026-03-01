import React, { useState, Fragment } from "react";
import {
  Card,
  CardBody,
  CardTitle,
  Button,
  FormGroup,
  Label,
  Input,
  Row,
  Col,
  Badge,
  Spinner,
} from "reactstrap";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "react-toastify";
import CountUp from "react-countup";
import { CSSTransition, TransitionGroup } from "../../utils/TransitionWrapper";
import PageTitleAlt2 from "../../Layout/AppMain/PageTitleAlt2";
import Tabs, { TabPane } from "../../utils/TabsWrapper";
import { ScrollableInkTabBar } from "../../utils/TabsWrapper";
import { TabContent } from "../../utils/TabsWrapper";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function GeoJSONLayers({ parcelGeojson, powerLineGeojson }) {
  const map = useMap();
  React.useEffect(() => {
    const layers = [];
    if (parcelGeojson) {
      const layer = L.geoJSON(parcelGeojson, { style: { color: "#545cd8", weight: 3, fillOpacity: 0.2 } });
      layer.addTo(map);
      layers.push(layer);
      try {
        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
      } catch (_) {}
    }
    if (powerLineGeojson) {
      const layer = L.geoJSON(powerLineGeojson, { style: { color: "#d92550", weight: 4 } });
      layer.addTo(map);
      layers.push(layer);
    }
    return () => layers.forEach((l) => map.removeLayer(l));
  }, [map, parcelGeojson, powerLineGeojson]);
  return null;
}

const DEFAULT_CENTER = [52.23, 21.01];
const DEFAULT_ZOOM = 6;

export default function KalkulatorPage() {
  const [parcelIds, setParcelIds] = useState("Szapsk 302/6");
  const [county, setCounty] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);

  const runAnalysis = async (e) => {
    e.preventDefault();
    const pid = parcelIds.trim();
    if (!pid) {
      toast.error("Wprowadź numer działki.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parcel_ids: pid,
          county: county || undefined,
          municipality: municipality || undefined,
          infra_type_pref: "elektro_SN",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
        throw new Error(msg || data.message || "Błąd serwera");
      }
      const first = data.parcels?.[0];
      if (!first) throw new Error("Brak wyników");
      if (first.error) throw new Error(first.error);
      if (first.data_status === "ERROR" || first.master_record?.status === "ERROR")
        throw new Error(first.master_record?.message || first.error || "Działka nie znaleziona");
      setResult(first);
      const m = first.master_record || {};
      const centroid = m.geometry?.centroid_ll;
      if (centroid && centroid[0] != null && centroid[1] != null) {
        setMapCenter([Number(centroid[1]), Number(centroid[0])]);
        setMapZoom(16);
      }
      toast.success("Analiza zakończona.");
    } catch (err) {
      toast.error(err.message || "Wystąpił błąd.");
    } finally {
      setLoading(false);
    }
  };

  const m = result?.master_record || {};
  const geom = m.geometry || {};
  const meta = m.parcel_metadata || {};
  const egib = m.egib || {};
  const plan = m.planning || {};
  const infra = m.infrastructure || {};
  const power = infra.power || {};
  const utilities = infra.utilities || {};
  const build = m.buildings || {};
  const market = m.market_data || {};
  const landUse = Array.isArray(egib.land_use) ? egib.land_use : [];
  const areaM2 = typeof geom.area_m2 === "number" ? geom.area_m2 : 0;
  const loc = [meta.commune, meta.county, meta.region].filter(Boolean).join(", ") || "—";
  const priceM2 = market.average_price_m2;
  const priceSource = market.rcn_price_m2 ? "RCN" : market.gus_price_m2 ? "GUS" : null;
  const fmtPrice = (v) => v != null ? `${Number(v).toFixed(2)} zł/m²` : "n/d";

  return (
    <Fragment>
      <TransitionGroup>
        <CSSTransition component="div" classNames="TabsAnimation" appear={true} timeout={1500} enter={false} exit={false}>
          <div>
      <PageTitleAlt2
        heading="Kalkulator Roszczeń"
        subheading="Analiza działki: ULDK, GESUT, RCN, infrastruktura przesyłowa."
        icon="pe-7s-graph icon-gradient bg-ripe-malin"
      />

      <Card className="main-card mb-3">
        <CardBody>
          <CardTitle className="mb-3">
            <i className="pe-7s-rocket me-2 icon-gradient bg-ripe-malin" /> Raport działki
          </CardTitle>
          <Tabs defaultActiveKey="1" renderTabBar={() => <ScrollableInkTabBar />} renderTabContent={() => <TabContent />}>
            <TabPane tab="Analiza" key="1">
              <form onSubmit={runAnalysis}>
                <Row>
                  <Col md="5">
                    <FormGroup>
                      <Label>Identyfikator działki</Label>
                      <Input
                        type="text"
                        value={parcelIds}
                        onChange={(e) => setParcelIds(e.target.value)}
                        placeholder="np. Szapsk 302/6 lub 142003_2.0001.74/1"
                      />
                    </FormGroup>
                  </Col>
                  <Col md="2">
                    <FormGroup>
                      <Label>Powiat (opc.)</Label>
                      <Input
                        type="text"
                        value={county}
                        onChange={(e) => setCounty(e.target.value)}
                        placeholder="np. płoński"
                      />
                    </FormGroup>
                  </Col>
                  <Col md="2">
                    <FormGroup>
                      <Label>Gmina (opc.)</Label>
                      <Input
                        type="text"
                        value={municipality}
                        onChange={(e) => setMunicipality(e.target.value)}
                        placeholder="np. Baboszewo"
                      />
                    </FormGroup>
                  </Col>
                  <Col md="3" className="d-flex align-items-end">
                    <Button type="submit" color="primary" className="btn-shadow btn-pill" disabled={loading}>
                      {loading ? <Spinner size="sm" className="me-2" /> : <i className="pe-7s-bolt me-2" />}
                      Analizuj
                    </Button>
                  </Col>
                </Row>
              </form>
            </TabPane>
            <TabPane tab="Opcje" key="2">
              <p className="text-muted mb-0">Dodatkowe opcje analizy — w przygotowaniu.</p>
            </TabPane>
          </Tabs>
        </CardBody>
      </Card>

      {!result && !loading && (
        <div className="card mb-3 widget-content bg-heavy-rain">
          <div className="widget-content-wrapper text-center py-5">
            <div className="widget-content-left mx-auto">
              <i className="pe-7s-map-2 fa-4x opacity-5 mb-3 d-block" />
              <div className="widget-heading">Wprowadź numer działki</div>
              <div className="widget-subheading">System pobierze geometrię, infrastrukturę i dane z ULDK oraz GUGiK.</div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <>
          <Card className="main-card mb-3">
            <CardBody className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <h5 className="mb-1">Raport o terenie</h5>
                <small className="text-muted">{new Date().toLocaleString("pl-PL")}</small>
              </div>
              <Badge color="success" className="badge-pill"><i className="pe-7s-check me-1" /> Dane zweryfikowane</Badge>
            </CardBody>
          </Card>

          <Row>
            <Col lg="6" xl="3">
              <div className="card mb-3 widget-content bg-night-fade">
                <div className="widget-content-wrapper text-white">
                  <div className="widget-content-left">
                    <div className="widget-heading">Powierzchnia</div>
                    <div className="widget-subheading">m² (EGiB)</div>
                  </div>
                  <div className="widget-content-right">
                    <div className="widget-numbers text-white">
                      {areaM2 > 0 ? <CountUp end={areaM2} duration={1.2} separator=" " /> : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </Col>
            <Col lg="6" xl="3">
              <div className="card mb-3 widget-content bg-arielle-smile">
                <div className="widget-content-wrapper text-white">
                  <div className="widget-content-left">
                    <div className="widget-heading">Główny użytek</div>
                    <div className="widget-subheading">Klasa OZK</div>
                  </div>
                  <div className="widget-content-right">
                    <div className="widget-numbers text-white">{landUse[0]?.class || "R"}</div>
                  </div>
                </div>
              </div>
            </Col>
            <Col lg="6" xl="3">
              <div className={`card mb-3 widget-content ${power.exists ? "bg-ripe-malin" : "bg-grow-early"}`}>
                <div className="widget-content-wrapper text-white">
                  <div className="widget-content-left">
                    <div className="widget-heading">Linie napowietrzne</div>
                    <div className="widget-subheading">Sieci przesyłowe</div>
                  </div>
                  <div className="widget-content-right">
                    <div className="widget-numbers text-white">{power.exists ? "Tak" : "Brak"}</div>
                  </div>
                </div>
              </div>
            </Col>
            <Col lg="6" xl="3">
              <div className={`card mb-3 widget-content ${plan.mpzp_active ? "bg-mean-fruit" : "bg-tempting-azure"}`}>
                <div className="widget-content-wrapper text-white">
                  <div className="widget-content-left">
                    <div className="widget-heading">Potencjał</div>
                    <div className="widget-subheading">Plan zagospodarowania</div>
                  </div>
                  <div className="widget-content-right">
                    <div className="widget-numbers text-white">{plan.mpzp_active ? "Budowlana" : "Rolna"}</div>
                  </div>
                </div>
              </div>
            </Col>
          </Row>

          <Row>
            <Col md="6">
              <Card className="main-card mb-3">
                <CardBody className="p-0">
                  <div style={{ height: 400 }}>
                    <MapContainer key={result?.parcel_id || "empty"} center={mapCenter} zoom={mapZoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                      <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <GeoJSONLayers parcelGeojson={geom.geojson_ll} powerLineGeojson={power.line_geojson} />
                    </MapContainer>
                  </div>
                </CardBody>
              </Card>
            </Col>
            <Col md="6">
              <div className="card mb-3 widget-content text-start">
                <div className="widget-content-wrapper">
                  <div className="icon-wrapper rounded-circle bg-focus me-3">
                    <i className="pe-7s-map" />
                  </div>
                  <div className="widget-content-left">
                    <div className="widget-heading">EGiB</div>
                    <div className="widget-subheading">
                      {areaM2 > 0 ? areaM2.toLocaleString("pl-PL") : "—"} m²
                      {geom.perimeter_m ? ` · obwód ${Math.round(geom.perimeter_m)} m` : ""}
                      {geom.shape_class ? ` · kształt ${geom.shape_class}` : ""}
                    </div>
                    <div className="widget-subheading text-muted">{loc}</div>
                  </div>
                </div>
              </div>
              <div className="card mb-3 widget-content text-start">
                <div className="widget-content-wrapper">
                  <div className="icon-wrapper rounded-circle bg-info me-3">
                    <i className="pe-7s-plug" />
                  </div>
                  <div className="widget-content-left">
                    <div className="widget-heading">Media</div>
                    <div className="widget-subheading">
                      <span className={utilities.gaz ? "text-success" : "text-muted"}>Gaz</span>
                      {" · "}
                      <span className={utilities.woda ? "text-success" : "text-muted"}>Woda</span>
                      {" · "}
                      <span className={utilities.kanal ? "text-success" : "text-muted"}>Kanal.</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className={`card mb-3 widget-content text-start ${power.exists ? "border-danger" : ""}`}>
                <div className="widget-content-wrapper">
                  <div className={`icon-wrapper rounded-circle me-3 ${power.exists ? "bg-danger" : "bg-success"}`}>
                    <i className="pe-7s-bolt" />
                  </div>
                  <div className="widget-content-left">
                    <div className="widget-heading">Sieci przesyłowe</div>
                    <div className="widget-subheading">
                      {power.exists ? "Wykryto linię" : "Brak kolizji"}
                      {power.exists && power.voltage ? ` · ${power.voltage}` : ""}
                      {power.exists && power.buffer_zone_m ? ` · strefa ${power.buffer_zone_m} m` : ""}
                    </div>
                  </div>
                </div>
              </div>
              <div className="card mb-3 widget-content text-start">
                <div className="widget-content-wrapper">
                  <div className="icon-wrapper rounded-circle bg-warning me-3">
                    <i className="pe-7s-note2" />
                  </div>
                  <div className="widget-content-left">
                    <div className="widget-heading">Prawo / Cena</div>
                    <div className="widget-subheading">
                      <Badge color={plan.mpzp_active ? "success" : "secondary"} className="me-1">{plan.mpzp_active ? "MPZP" : "Brak MPZP"}</Badge>
                      Zabudowania: {build?.count ?? 0}
                      {" · "}
                      {fmtPrice(priceM2)}
                      {priceSource && <Badge color="light" className="ms-1 text-muted" style={{fontSize:"0.7em"}}>{priceSource}</Badge>}
                    </div>
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </>
      )}
          </div>
        </CSSTransition>
      </TransitionGroup>
    </Fragment>
  );
}
