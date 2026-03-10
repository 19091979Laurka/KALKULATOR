import React, { useState, Fragment } from "react";
import {
  Card, CardBody, CardTitle, Button, FormGroup, Label,
  Input, Row, Col, Badge, Spinner, Table, Progress,
} from "reactstrap";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "react-toastify";
import CountUp from "react-countup";
import { CSSTransition, TransitionGroup } from "../../utils/TransitionWrapper";
import PageTitleAlt2 from "../../Layout/AppMain/PageTitleAlt2";
import Tabs, { TabPane } from "../../utils/TabsWrapper";
import { ScrollableInkTabBar, TabContent } from "../../utils/TabsWrapper";
import ReportGenerator from "../../Components/ReportGenerator";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Mapa ─────────────────────────────────────────────────────────────────────
function GeoJSONLayers({ parcelGeojson }) {
  const map = useMap();
  React.useEffect(() => {
    if (!parcelGeojson) return;
    const layer = L.geoJSON(parcelGeojson, {
      style: { color: "#545cd8", weight: 3, fillColor: "#545cd8", fillOpacity: 0.15 },
    });
    layer.addTo(map);
    try {
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
    } catch (_) {}
    return () => map.removeLayer(layer);
  }, [map, parcelGeojson]);
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (v, dec = 0) =>
  v != null && !isNaN(v)
    ? Number(v).toLocaleString("pl-PL", { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : "—";
const fmtPLN = (v) => (v != null && !isNaN(v) ? `${fmt(v)} PLN` : "—");
const fmtM2  = (v) => (v != null && !isNaN(v) ? `${fmt(v, 2)} zł/m²` : "—");

// ── Kafelek statystyczny ──────────────────────────────────────────────────────
function StatWidget({ heading, subheading, value, gradient = "bg-night-fade", icon = "pe-7s-graph" }) {
  return (
    <div className={`card mb-3 widget-content ${gradient}`}>
      <div className="widget-content-wrapper text-white">
        <div className="widget-content-left me-3 opacity-7">
          <i className={`${icon} fa-2x`} />
        </div>
        <div className="widget-content-left">
          <div className="widget-heading">{heading}</div>
          <div className="widget-subheading">{subheading}</div>
        </div>
        <div className="widget-content-right">
          <div className="widget-numbers text-white">{value}</div>
        </div>
      </div>
    </div>
  );
}

// ── Główny komponent ──────────────────────────────────────────────────────────
const DEFAULT_CENTER = [52.1, 19.5];
const DEFAULT_ZOOM   = 6;

export default function KalkulatorPage() {
  const [parcelIds,    setParcelIds]    = useState("141906_5.0029.60, 141906_5.0029.129");
  const [obreb,        setObreb]        = useState("");
  const [county,       setCounty]       = useState("");
  const [municipality, setMunicipality] = useState("");
  // Infrastruktura - auto-detect z GUGiK (domyślnie SN)
  const infraType = "elektro_SN";
  const [loading,      setLoading]      = useState(false);
  const [pdfLoading,   setPdfLoading]   = useState(false);
  const [result,       setResult]       = useState(null);
  const [allResults,   setAllResults]   = useState(null); // pełna odpowiedź /api/analyze
  const [mapCenter,    setMapCenter]    = useState(DEFAULT_CENTER);
  const [mapZoom,      setMapZoom]      = useState(DEFAULT_ZOOM);
  // Korekta ręczna
  const [showManual,        setShowManual]        = useState(false);
  const [manualPrice,       setManualPrice]       = useState("");
  const [manualLandType,    setManualLandType]    = useState("");
  const [manualInfraDetect, setManualInfraDetect] = useState("");
  const [manualVoltage,     setManualVoltage]     = useState("");

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const runAnalysis = async (e) => {
    e.preventDefault();
    const pid = parcelIds.trim();
    if (!pid) { toast.error("Wprowadź numer działki."); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parcel_ids: pid,
          obreb:        obreb        || undefined,
          county:       county       || undefined,
          municipality: municipality || undefined,
          infra_type_pref: infraType,
          manual_price_m2:      manualPrice       ? parseFloat(manualPrice)           : undefined,
          manual_land_type:     manualLandType    || undefined,
          manual_infra_detected: manualInfraDetect !== "" ? manualInfraDetect === "true" : undefined,
          manual_voltage:       manualVoltage     || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
        throw new Error(msg || data.message || "Błąd serwera");
      }
      const first = data.parcels?.[0];
      if (!first) throw new Error("Brak wyników");
      if (first.data_status === "ERROR" || first.master_record?.status === "ERROR")
        throw new Error(first.master_record?.message || first.error || "Działka nie znaleziona");
      setAllResults(data.parcels);
      setResult(first);
      const centroid = first.master_record?.geometry?.centroid_ll;
      if (Array.isArray(centroid) && centroid[0] != null) {
        setMapCenter([Number(centroid[1]), Number(centroid[0])]);
        setMapZoom(16);
      }
      toast.success("Analiza zakończona ✓");
    } catch (err) {
      toast.error(err.message || "Wystąpił błąd.");
    } finally {
      setLoading(false);
    }
  };

  // ── PDF Download ─────────────────────────────────────────────────────────
  const downloadPdf = async () => {
    if (!allResults) return;
    setPdfLoading(true);
    try {
      const res = await fetch("/api/report/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parcels: allResults,
          owner_name: "Właściciel",
          kw_number:  "",
          address:    "",
        }),
      });
      if (!res.ok) throw new Error("Błąd generowania PDF");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const cd   = res.headers.get("Content-Disposition") || "";
      const fnMatch = cd.match(/filename="([^"]+)"/);
      a.href     = url;
      a.download = fnMatch ? fnMatch[1] : "raport_KSWS.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF pobrany ✓");
    } catch (err) {
      toast.error(err.message || "Błąd PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Destrukturyzacja odpowiedzi ───────────────────────────────────────────
  const mr      = result?.master_record || {};
  const geom    = mr.geometry           || {};
  const meta    = mr.parcel_metadata    || {};
  const egib    = mr.egib               || {};
  const plan    = mr.planning           || {};
  const infra   = mr.infrastructure     || {};
  const power   = infra.power           || {};
  const powerL  = infra.power_lines     || {};
  const utils   = infra.utilities       || {};
  const market  = mr.market_data        || {};
  const ksws    = mr.ksws               || {};
  const comp    = mr.compensation       || {};
  const trackA  = comp.track_a          || {};
  const trackB  = comp.track_b          || {};
  const invest  = mr.investments        || {};
  const landUse = Array.isArray(egib.land_use) ? egib.land_use : [];

  const areaM2       = geom.area_m2 || 0;
  const primaryClass = egib.primary_class || landUse[0]?.class || "R";
  const hasLine      = !!(powerL.detected || power.exists);
  const hasMpzp      = !!plan.mpzp_active;
  const locationStr  = [meta.commune, meta.county, meta.region].filter(Boolean).join(", ") || "—";
  // KSWS: bez linii = bez kompensacji
  const trackATotal  = hasLine ? (trackA.total || 0) : 0;
  const trackBTotal  = hasLine ? (trackB.total || 0) : 0;
  const priceM2      = market.average_price_m2;
  const priceSource  = market.price_source || (market.rcn_price_m2 ? "RCN" : market.gus_price_m2 ? "GUS BDL" : null);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Fragment>
      <TransitionGroup>
        <CSSTransition component="div" classNames="TabsAnimation" appear timeout={1500} enter={false} exit={false}>
          <div>
            <PageTitleAlt2
              heading="Kalkulator Roszczeń Przesyłowych"
              subheading="KSWS Track A/B · ULDK · GESUT · RCN · GUS BDL — wyłącznie dane rzeczywiste"
              icon="pe-7s-graph icon-gradient bg-ripe-malin"
            />

            {/* ── Formularz ── */}
            <Card className="main-card mb-3" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)", borderRadius: "8px" }}>
              <CardBody>
                <CardTitle className="mb-3" style={{ fontSize: "18px", fontWeight: 600, color: "#2c3e50" }}>
                  <i className="pe-7s-rocket me-2 icon-gradient bg-ripe-malin" /> Identyfikacja działki
                </CardTitle>
                <Tabs defaultActiveKey="1" renderTabBar={() => <ScrollableInkTabBar />} renderTabContent={() => <TabContent />}>
                  <TabPane tab="Analiza" key="1">
                    <form onSubmit={runAnalysis}>
                      <Row className="align-items-end">
                        <Col md="4">
                          <FormGroup>
                            <Label>Identyfikator działki *</Label>
                            <Input value={parcelIds} onChange={e => setParcelIds(e.target.value)}
                              placeholder="Szapsk 302/6 lub 142003_2.0001.74/1" />
                          </FormGroup>
                        </Col>
                        <Col md="2">
                          <FormGroup>
                            <Label>Obręb</Label>
                            <Input value={obreb} onChange={e => setObreb(e.target.value)} placeholder="np. Szapsk" />
                          </FormGroup>
                        </Col>
                        <Col md="2">
                          <FormGroup>
                            <Label>Powiat</Label>
                            <Input value={county} onChange={e => setCounty(e.target.value)} placeholder="np. płoński" />
                          </FormGroup>
                        </Col>
                        <Col md="2">
                          <FormGroup>
                            <Label>Gmina</Label>
                            <Input value={municipality} onChange={e => setMunicipality(e.target.value)} placeholder="np. Baboszewo" />
                          </FormGroup>
                        </Col>
                        {/* Typ infrastruktury - auto-detect z GUGiK, nie ma dropdown */}
                      </Row>

                      {/* ── Korekta ręczna ── */}
                      <div className="mb-3">
                        <Button
                          type="button" color="link" size="sm"
                          className="p-0 text-muted text-decoration-none"
                          onClick={() => setShowManual(v => !v)}
                        >
                          <i className={`me-1 pe-7s-angle-${showManual ? "up" : "down"}`} />
                          {showManual ? "Ukryj" : "Korekta ręczna"} — nadpisz dane API
                        </Button>
                      </div>
                      {showManual && (
                        <div className="p-3 mb-3 rounded" style={{ background: "#fff8e1", border: "1px solid #ffe082" }}>
                          <div className="small fw-semibold mb-2 text-warning-emphasis">
                            <i className="pe-7s-tools me-1" />
                            Korekta ręczna — gdy API zwraca błędne dane (np. rolna zamiast budowlanej, brak wykrytej linii)
                          </div>
                          <Row>
                            <Col md="3">
                              <FormGroup>
                                <Label className="small">Cena rynkowa [zł/m²]</Label>
                                <Input
                                  type="number" step="0.01" min="0"
                                  placeholder="np. 200"
                                  value={manualPrice}
                                  onChange={e => setManualPrice(e.target.value)}
                                  bsSize="sm"
                                />
                              </FormGroup>
                            </Col>
                            <Col md="3">
                              <FormGroup>
                                <Label className="small">Typ gruntu</Label>
                                <Input
                                  type="select" value={manualLandType}
                                  onChange={e => setManualLandType(e.target.value)}
                                  bsSize="sm"
                                >
                                  <option value="">— auto —</option>
                                  <option value="building">Budowlany</option>
                                  <option value="agricultural">Rolny</option>
                                </Input>
                              </FormGroup>
                            </Col>
                            <Col md="3">
                              <FormGroup>
                                <Label className="small">Infrastruktura wykryta</Label>
                                <Input
                                  type="select" value={manualInfraDetect}
                                  onChange={e => setManualInfraDetect(e.target.value)}
                                  bsSize="sm"
                                >
                                  <option value="">— auto —</option>
                                  <option value="true">TAK — potwierdzona</option>
                                  <option value="false">NIE — brak</option>
                                </Input>
                              </FormGroup>
                            </Col>
                            <Col md="3">
                              <FormGroup>
                                <Label className="small">Napięcie</Label>
                                <Input
                                  type="select" value={manualVoltage}
                                  onChange={e => setManualVoltage(e.target.value)}
                                  bsSize="sm"
                                >
                                  <option value="">— auto —</option>
                                  <option value="WN">WN (110–400 kV)</option>
                                  <option value="SN">SN (15–30 kV)</option>
                                  <option value="nN">nN (&lt;1 kV)</option>
                                </Input>
                              </FormGroup>
                            </Col>
                          </Row>
                          {(manualPrice || manualLandType || manualInfraDetect || manualVoltage) && (
                            <div className="mt-1">
                              <Badge color="warning" className="text-dark me-1">Aktywna korekta:</Badge>
                              {manualPrice       && <Badge color="secondary" className="me-1">cena {manualPrice} zł/m²</Badge>}
                              {manualLandType    && <Badge color="secondary" className="me-1">{manualLandType === "building" ? "budowlany" : "rolny"}</Badge>}
                              {manualInfraDetect && <Badge color="secondary" className="me-1">infra: {manualInfraDetect === "true" ? "TAK" : "NIE"}</Badge>}
                              {manualVoltage     && <Badge color="secondary" className="me-1">{manualVoltage}</Badge>}
                              <Button type="button" color="link" size="sm" className="text-muted p-0 ms-2"
                                onClick={() => { setManualPrice(""); setManualLandType(""); setManualInfraDetect(""); setManualVoltage(""); }}>
                                Wyczyść
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      <Button
                        type="submit"
                        color="primary"
                        className="btn-shadow btn-pill px-5 fw-semibold"
                        disabled={loading}
                        style={{ background: "linear-gradient(135deg, #a91079 0%, #d81b60 100%)", border: "none", fontSize: "15px" }}
                      >
                        {loading
                          ? <><Spinner size="sm" className="me-2" />Analizuję…</>
                          : <><i className="pe-7s-bolt me-2" />Generuj raport</>}
                      </Button>
                    </form>
                  </TabPane>
                </Tabs>
              </CardBody>
            </Card>

            {/* ── Pusty stan ── */}
            {!result && !loading && (
              <div className="card mb-3 widget-content bg-heavy-rain">
                <div className="widget-content-wrapper text-center py-5">
                  <div className="widget-content-left mx-auto">
                    <i className="pe-7s-map-2 opacity-5 mb-3 d-block" style={{ fontSize: "4rem" }} />
                    <div className="widget-heading">Wprowadź numer działki</div>
                    <div className="widget-subheading mt-1">
                      System pobierze geometrię (ULDK), infrastrukturę (GESUT), ceny (RCN/GUS)<br />
                      i wyliczy roszczenie wg metodyki KSWS Track A/B.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════ WYNIKI ════════════════ */}
            {result && (
              <>
                {/* Pasek nagłówka */}
                <Card className="main-card mb-3 border-0"
                  style={{ background: "linear-gradient(135deg,#3f0d59 0%,#a91079 100%)", boxShadow: "0 4px 12px rgba(169, 16, 121, 0.2)", borderRadius: "8px" }}>
                  <CardBody className="d-flex justify-content-between align-items-center flex-wrap gap-2 py-3">
                    <div className="text-white">
                      <h5 className="mb-0">{result.parcel_id}</h5>
                      <small className="opacity-7">{locationStr} · {new Date().toLocaleString("pl-PL")}</small>
                    </div>
                    <div className="d-flex gap-2 flex-wrap align-items-center">
                      <Badge pill color="success"><i className="pe-7s-check me-1" />REAL DATA</Badge>
                      {hasLine && <Badge pill color="danger"><i className="pe-7s-bolt me-1" />Kolizja z linią</Badge>}
                      <Badge pill color="light" className="text-dark">{ksws.label || infraType}</Badge>
                      <Button
                        color="light" size="sm"
                        className="btn-pill ms-2 fw-semibold"
                        style={{ background: "#fff", border: "1px solid #ddd", color: "#E74C3C" }}
                        onClick={downloadPdf}
                        disabled={pdfLoading}
                        title="Pobierz raport PDF z wizualizacją 3D"
                      >
                        {pdfLoading
                          ? <><Spinner size="sm" className="me-1" />Generuję PDF…</>
                          : <><i className="pe-7s-download me-1" />Pobierz PDF</>}
                      </Button>
                    </div>
                  </CardBody>
                </Card>

                {/* ── INFRASTRUKTURA: Karta do potwierdzenia ── */}
                {!power.exists && manualInfraDetect !== "true" && (
                  <Card className="main-card mb-3" style={{ borderLeft: "4px solid #f39c12", background: "#fffbf0" }}>
                    <CardBody>
                      <div className="d-flex align-items-start gap-3">
                        <div style={{ fontSize: "2rem" }}>⚡</div>
                        <div className="flex-grow-1">
                          <h6 className="mb-2">
                            <strong>System: Brak infrastruktury</strong>
                          </h6>
                          <p className="text-muted small mb-3">
                            Automatyczna detekacja nie znalazła linii (WFS niedostępny).
                            Ale jeśli <strong>WIESZ że działka ma linie</strong> — potwierdź poniżej aby przeliczyć Track A/B.
                          </p>
                          <div className="d-flex gap-2">
                            <Button
                              color="success" size="sm" className="btn-pill"
                              onClick={() => {
                                setManualInfraDetect("true");
                                // Odśwież analizę
                                runAnalysis({ preventDefault: () => {} });
                              }}
                            >
                              ✓ TAK — ma linie (przeliczy Track A/B)
                            </Button>
                            <Button
                              color="secondary" size="sm" className="btn-outline"
                              onClick={() => setManualInfraDetect("false")}
                            >
                              ✗ NIE — na pewno brak
                            </Button>
                            <Button
                              color="link" size="sm" className="text-muted p-0"
                              onClick={() => setShowManual(true)}
                            >
                              Szczegóły...
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                )}

                {/* ── 4 kafelki ── */}
                <Row>
                  <Col lg="6" xl="3">
                    <StatWidget heading="Powierzchnia" subheading="EGiB / ULDK" gradient="bg-night-fade"
                      icon="pe-7s-map"
                      value={areaM2 > 0 ? <><CountUp end={areaM2} duration={1.2} separator=" " /> m²</> : "—"} />
                  </Col>
                  <Col lg="6" xl="3">
                    <StatWidget heading="Klasa gruntu" subheading={egib.land_type === "agricultural" ? "Rolny" : "Budowlany"}
                      gradient="bg-arielle-smile" icon="pe-7s-leaf"
                      value={primaryClass} />
                  </Col>
                  <Col lg="6" xl="3">
                    <StatWidget
                      heading="Sieci przesyłowe"
                      subheading={hasLine
                        ? `${power.voltage || powerL.voltage || "—"} · strefa ${power.buffer_zone_m || ksws.band_width_m || "—"} m`
                        : "Brak kolizji"}
                      gradient={hasLine ? "bg-ripe-malin" : "bg-grow-early"} icon="pe-7s-bolt"
                      value={hasLine ? "Wykryto" : "Brak"} />
                  </Col>
                  <Col lg="6" xl="3">
                    <StatWidget heading="Cena rynkowa" subheading={`Źródło: ${priceSource || "brak"}`}
                      gradient="bg-tempting-azure" icon="pe-7s-cash"
                      value={fmtM2(priceM2)} />
                  </Col>
                </Row>

                {/* ── ODSZKODOWANIE ── */}
                <Row className="mb-1">
                  {/* Track A */}
                  <Col md="6">
                    <Card className="main-card mb-3 h-100" style={{ borderLeft: "4px solid #545cd8" }}>
                      <CardBody>
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div>
                            <h6 className="mb-0">Track A — Ścieżka sądowa</h6>
                            <small className="text-muted">TK P 10/16 · WSP + WBK + OBN</small>
                          </div>
                          <Badge color="primary" pill>Sąd</Badge>
                        </div>
                        <div style={{ fontSize: "2rem", fontWeight: 700, color: "#545cd8" }} className="mb-3">
                          {trackATotal > 0
                            ? <><CountUp end={trackATotal} duration={1.5} separator=" " decimals={2} decimal="," /> PLN</>
                            : <span className="text-muted fs-6">Brak wykrytej linii</span>}
                        </div>
                        {trackA.total > 0 && (
                          <Table size="sm" borderless className="mb-0">
                            <tbody>
                              <tr>
                                <td className="text-muted ps-0">WSP <small>(służebność przesyłu)</small></td>
                                <td className="text-end fw-semibold">{fmtPLN(trackA.wsp)}</td>
                              </tr>
                              <tr>
                                <td className="text-muted ps-0">WBK <small>(bezumowne korzystanie)</small></td>
                                <td className="text-end fw-semibold">{fmtPLN(trackA.wbk)}</td>
                              </tr>
                              <tr>
                                <td className="text-muted ps-0">OBN <small>(obniżenie wartości)</small></td>
                                <td className="text-end fw-semibold">{fmtPLN(trackA.obn)}</td>
                              </tr>
                              <tr className="border-top">
                                <td className="ps-0 fw-bold">Razem ({trackA.years || 10} lat)</td>
                                <td className="text-end fw-bold text-primary">{fmtPLN(trackA.total)}</td>
                              </tr>
                            </tbody>
                          </Table>
                        )}
                      </CardBody>
                    </Card>
                  </Col>

                  {/* Track B */}
                  <Col md="6">
                    <Card className="main-card mb-3 h-100" style={{ borderLeft: "4px solid #f7b924" }}>
                      <CardBody>
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div>
                            <h6 className="mb-0">Track B — Ścieżka negocjacyjna</h6>
                            <small className="text-muted">Track A × {trackB.multiplier || "—"} (benchmark rynkowy)</small>
                          </div>
                          <Badge color="warning" pill className="text-dark">Negocjacje</Badge>
                        </div>
                        <div style={{ fontSize: "2rem", fontWeight: 700, color: "#f7b924" }} className="mb-3">
                          {trackBTotal > 0
                            ? <><CountUp end={trackBTotal} duration={1.5} separator=" " decimals={2} decimal="," /> PLN</>
                            : <span className="text-muted fs-6">Brak wykrytej linii</span>}
                        </div>
                        {trackATotal > 0 && trackBTotal > 0 && (
                          <>
                            <div className="text-muted small mb-1">Przedział roszczenia:</div>
                            <div className="d-flex justify-content-between small mb-1">
                              <span className="text-primary fw-semibold">{fmtPLN(trackATotal)}</span>
                              <span className="text-warning fw-semibold">{fmtPLN(trackBTotal)}</span>
                            </div>
                            <Progress multi style={{ height: 10, borderRadius: 6 }}>
                              <Progress bar color="primary" value={55} />
                              <Progress bar color="warning" value={45} />
                            </Progress>
                            <div className="d-flex justify-content-between mt-1" style={{ fontSize: "0.7rem", color: "#aaa" }}>
                              <span>Min (ścieżka sądowa)</span>
                              <span>Max (negocjacje)</span>
                            </div>
                          </>
                        )}
                      </CardBody>
                    </Card>
                  </Col>
                </Row>

                {/* ── Mapa + panel boczny ── */}
                <Row>
                  <Col lg="7">
                    <Card className="main-card mb-3">
                      <CardBody className="p-0" style={{ overflow: "hidden", borderRadius: "inherit" }}>
                        <div style={{ height: 420 }}>
                          <MapContainer
                            key={result?.parcel_id || "empty"}
                            center={mapCenter} zoom={mapZoom}
                            style={{ height: "100%", width: "100%" }}
                            scrollWheelZoom
                          >
                            <TileLayer
                              attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a>'
                              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            <GeoJSONLayers parcelGeojson={geom.geojson_ll || geom.geojson} />
                          </MapContainer>
                        </div>
                      </CardBody>
                    </Card>
                  </Col>

                  <Col lg="5">
                    {/* Geometria */}
                    <InfoCard icon="pe-7s-map" iconBg="bg-primary" title="Geometria EGiB"
                      sub={`${areaM2 > 0 ? `${fmt(areaM2)} m² (${fmt(areaM2 / 10000, 4)} ha)` : "—"}${geom.perimeter_m ? ` · obwód ${Math.round(geom.perimeter_m)} m` : ""}`}
                      extra={locationStr} />

                    {/* Użytek gruntowy */}
                    <InfoCard icon="pe-7s-leaf" iconBg="bg-success" title="Użytek gruntowy"
                      sub={landUse.length
                        ? landUse.map((u, i) => <span key={i} className="me-2"><Badge color="secondary" className="me-1">{u.class}</Badge>{u.area_m2 ? `${fmt(u.area_m2)} m²` : ""}</span>)
                        : primaryClass}
                      extra={`Typ: ${egib.land_type === "agricultural" ? "rolny" : "budowlany"}`} />

                    {/* Infrastruktura */}
                    <InfoCard
                      icon="pe-7s-bolt"
                      iconBg={hasLine ? "bg-danger" : "bg-success"}
                      title="Sieci przesyłowe (GESUT)"
                      highlight={hasLine}
                      sub={hasLine
                        ? <>{<Badge color="danger" className="me-1">Wykryto</Badge>}{power.voltage || powerL.voltage ? ` ${power.voltage || powerL.voltage}` : ""}{power.buffer_zone_m ? ` · strefa ${power.buffer_zone_m} m` : ""}{power.line_length_m > 0 ? ` · dł. ${fmt(power.line_length_m)} m` : ""}{ksws.band_area_m2 > 0 ? <span className="text-danger ms-1"> pas {fmt(ksws.band_area_m2)} m²</span> : ""}</>
                        : <Badge color="success">Brak kolizji</Badge>}
                      extra={`Gaz: ${utils.gaz ? "✓" : "—"} · Woda: ${utils.woda ? "✓" : "—"} · Kanal.: ${utils.kanal ? "✓" : "—"}`} />

                    {/* Planowanie */}
                    <InfoCard icon="pe-7s-note2" iconBg="bg-warning" title="Planowanie przestrzenne"
                      sub={<>{<Badge color={hasMpzp ? "success" : "secondary"} className="me-1">{hasMpzp ? "MPZP" : "Brak MPZP"}</Badge>}{plan.usage && <span className="me-1">{plan.usage}</span>}{plan.studium_usage && <span className="text-muted small">{plan.studium_usage}</span>}</>}
                      extra={`Pozwolenia: ${invest.active_permits || 0} · Budynki w okolicy: ${mr.buildings?.count ?? 0}`} />

                    {/* Cena rynkowa */}
                    <InfoCard icon="pe-7s-cash" iconBg="bg-info" title="Cena rynkowa"
                      sub={<><span className="fw-semibold">{fmtM2(priceM2)}</span>{priceSource && <Badge color="light" className="ms-2 text-muted" style={{ fontSize: "0.7em" }}>{priceSource}</Badge>}</>}
                      extra={[market.rcn_price_m2 && `RCN: ${fmtM2(market.rcn_price_m2)}`, market.gus_price_m2 && `GUS: ${fmtM2(market.gus_price_m2)}`, market.transactions_count > 0 && `${market.transactions_count} transakcji`].filter(Boolean).join(" · ")} />
                  </Col>
                </Row>

                {/* ── KSWS szczegóły ── */}
                {ksws.infra_type && (
                  <Card className="main-card mb-3">
                    <CardBody>
                      <CardTitle className="mb-3">
                        <i className="pe-7s-calculator me-2 icon-gradient bg-ripe-malin" />
                        Podstawa wyceny KSWS
                      </CardTitle>
                      <Row>
                        <Col md="6">
                          <Table size="sm" className="mb-0">
                            <tbody>
                              <tr><td className="text-muted">Typ infrastruktury</td><td className="fw-semibold">{ksws.label || ksws.infra_type}</td></tr>
                              <tr><td className="text-muted">Szerokość pasa ochronnego</td><td className="fw-semibold">{ksws.band_width_m} m</td></tr>
                              <tr><td className="text-muted">Powierzchnia pasa</td><td className="fw-semibold">{fmt(ksws.band_area_m2)} m²</td></tr>
                              <tr><td className="text-muted">Wartość nieruchomości</td><td className="fw-semibold">{fmtPLN(ksws.property_value_total)}</td></tr>
                              <tr><td className="text-muted">Cena bazowa</td><td className="fw-semibold">{fmtM2(ksws.price_per_m2)}</td></tr>
                            </tbody>
                          </Table>
                        </Col>
                        <Col md="6">
                          {comp.basis && (
                            <Table size="sm" className="mb-0">
                              <thead>
                                <tr><th>Wsp.</th><th>Wartość</th><th className="text-muted">Opis</th></tr>
                              </thead>
                              <tbody>
                                <tr><td><code>S</code></td><td>{comp.basis.S}</td><td className="text-muted small">obniżenie wartości pasa</td></tr>
                                <tr><td><code>k</code></td><td>{comp.basis.k}</td><td className="text-muted small">współczynnik korzystania</td></tr>
                                <tr><td><code>R</code></td><td>{comp.basis.R}</td><td className="text-muted small">stopa kapitalizacji</td></tr>
                                <tr><td><code>impact</code></td><td>{comp.basis.impact_judicial}</td><td className="text-muted small">wpływ sądowy (OBN)</td></tr>
                                <tr><td><code>×B</code></td><td>{comp.basis.track_b_multiplier}</td><td className="text-muted small">mnożnik Track B</td></tr>
                              </tbody>
                            </Table>
                          )}
                        </Col>
                      </Row>
                    </CardBody>
                  </Card>
                )}
              </>
            )}
          </div>
        </CSSTransition>
      </TransitionGroup>
    </Fragment>
  );
}

// ── Helper komponent karty bocznej ────────────────────────────────────────────
function InfoCard({ icon, iconBg, title, sub, extra, highlight = false }) {
  return (
    <div className={`card mb-2 widget-content text-start${highlight ? " border-danger" : ""}`}>
      <div className="widget-content-wrapper py-2 px-3">
        <div
          className={`icon-wrapper rounded-circle me-3 ${iconBg}`}
          style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <i className={`${icon} text-white`} />
        </div>
        <div className="widget-content-left">
          <div className="widget-heading">{title}</div>
          <div className="widget-subheading">{sub}</div>
          {extra && <div className="widget-subheading text-muted" style={{ fontSize: "0.75rem" }}>{extra}</div>}
        </div>
      </div>
    </div>
  );
}
