import React, { useState, useEffect, useRef } from "react";
import { Card, CardBody, CardTitle, Button, FormGroup, Label, Input, Row, Col, Badge, Spinner, Container, Progress } from "reactstrap";
import { toast } from "react-toastify";
import PageTitleAlt2 from "../../Layout/AppMain/PageTitleAlt2";
import { API_BASE, WS_BASE } from "../../config/api";

function getWsBase() {
  if (WS_BASE) return `${WS_BASE}/ws`;
  const p = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${p}//${window.location.host}/ws`;
}

export default function BatchPage() {
  const [parcelIds, setParcelIds] = useState("");
  const [obreb, setObreb] = useState("");
  const [county, setCounty] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [useCache, setUseCache] = useState(true);
  const [infraType, setInfraType] = useState("elektro_SN");
  const [isFarmer, setIsFarmer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState([]);
  const wsRef = useRef(null);
  const pollRef = useRef(null);

  const fetchStatus = async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`${API_BASE}/api/status/${jobId}`);
      const data = await res.json();
      setStatus(data);
      if (data.status === "completed") {
        setResults(data.results || []);
        setLoading(false);
        toast.success(`Zakończono: ${data.progress?.completed}/${data.progress?.total} działek`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!jobId || !loading) return;
    pollRef.current = setInterval(fetchStatus, 2000);
    return () => clearInterval(pollRef.current);
  }, [jobId, loading]);

  useEffect(() => {
    if (!jobId) return;
    const wsBase = getWsBase();
    const wsUrl = `${wsBase}/${jobId}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "progress") setStatus((s) => ({ ...s, progress: { ...s?.progress, completed: msg.completed, total: msg.total, errors: msg.errors } }));
        if (msg.type === "complete") fetchStatus();
      } catch (_) {}
    };
    wsRef.current = ws;
    return () => { ws.close(); wsRef.current = null; };
  }, [jobId]);

  const runBatch = async (e) => {
    e.preventDefault();
    const ids = parcelIds.trim().split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (ids.length < 4) {
      toast.warning("Batch: minimum 4 działki (po przecinku lub nowej linii)");
      return;
    }
    setLoading(true);
    setJobId(null);
    setStatus(null);
    setResults([]);
    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parcel_ids: ids.join(", "),
          obreb: obreb || undefined,
          county: county || undefined,
          municipality: municipality || undefined,
          infra_type_pref: infraType,
          is_farmer: isFarmer,
          use_cache: useCache,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || "Błąd");
      if (data.mode !== "async" || !data.job_id) {
        toast.info("Mniej niż 4 działki — przejdź do Analiza dla wyników synchronicznych.");
        setLoading(false);
        return;
      }
      setJobId(data.job_id);
      toast.info(`Rozpoczęto analizę ${ids.length} działek`);
      fetchStatus();
    } catch (err) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  const pct = status?.progress ? Math.round(status.progress.percentage || 0) : 0;

  return (
    <Container fluid>
      <PageTitleAlt2 heading="Batch / Kolejka" subheading="Analiza wielu działek (4+) — status w tle" icon="pe-7s-graph2 icon-gradient bg-happy-green" />
      <Card className="mb-3">
        <CardBody>
          <CardTitle className="mb-3"><i className="pe-7s-add-user me-2 icon-gradient bg-arielle-smile" /> Analiza batch</CardTitle>
          <form onSubmit={runBatch}>
            <Row>
              <Col md="6">
                <FormGroup>
                  <Label>Identyfikatory działek (min. 4, po przecinku lub nowej linii)</Label>
                  <Input type="textarea" rows={4} value={parcelIds} onChange={(e) => setParcelIds(e.target.value)} placeholder="142003_2.0001.74/1, 142003_2.0001.75/1..." />
                </FormGroup>
              </Col>
              <Col md="2">
                <FormGroup>
                  <Label>Infrastruktura</Label>
                  <Input type="select" value={infraType} onChange={(e) => setInfraType(e.target.value)}>
                    <option value="elektro_SN">SN (średnie)</option>
                    <option value="elektro_WN">WN (wysokie)</option>
                    <option value="elektro_nN">nN (niskie)</option>
                  </Input>
                </FormGroup>
              </Col>
              <Col md="2">
                <FormGroup>
                  <Label>Obręb / Powiat / Gmina</Label>
                  <Input type="text" value={obreb} onChange={(e) => setObreb(e.target.value)} placeholder="Obręb" className="mb-1" />
                  <Input type="text" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Powiat" className="mb-1" />
                  <Input type="text" value={municipality} onChange={(e) => setMunicipality(e.target.value)} placeholder="Gmina" />
                </FormGroup>
              </Col>
              <Col md="2" className="d-flex flex-column justify-content-end">
                <FormGroup check>
                  <Label check><Input type="checkbox" checked={useCache} onChange={(e) => setUseCache(e.target.checked)} /> Cache</Label>
                </FormGroup>
                <FormGroup check>
                  <Label check style={{ color: isFarmer ? "#1a7a2e" : undefined, fontWeight: isFarmer ? 600 : 400 }}>
                    <Input type="checkbox" checked={isFarmer} onChange={(e) => setIsFarmer(e.target.checked)} /> 🌾 Rolnicy (R5)
                  </Label>
                </FormGroup>
                <Button type="submit" color="primary" disabled={loading}>{(loading) ? <Spinner size="sm" /> : null} Uruchom batch</Button>
              </Col>
            </Row>
          </form>
        </CardBody>
      </Card>

      {jobId && (
        <Card className="mb-3">
          <CardBody>
            <CardTitle className="mb-2">Job: {jobId}</CardTitle>
            {status && (
              <>
                <Progress value={pct} className="mb-2" />
                <div className="d-flex gap-3 text-muted">
                  <span>Ukończono: {status.progress?.completed ?? 0} / {status.progress?.total ?? 0}</span>
                  {status.progress?.errors > 0 && <Badge color="danger">Błędy: {status.progress.errors}</Badge>}
                </div>
              </>
            )}
          </CardBody>
        </Card>
      )}

      {results.length > 0 && (
        <Card>
          <CardBody>
            <CardTitle>Wyniki ({results.length})</CardTitle>
            <div className="table-responsive">
              <table className="table table-sm table-hover">
                <thead className="table-dark">
                  <tr>
                    <th>Działka</th>
                    <th>Status</th>
                    <th>Pow. [m²]</th>
                    <th>Cena [zł/m²]</th>
                    <th>Track A [PLN]</th>
                    <th>Track B [PLN]</th>
                    <th>R5 rolna</th>
                    <th>Łącznie</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const mr  = r.master_record || {};
                    const ta  = mr.compensation?.track_a || {};
                    const tb  = mr.compensation?.track_b || {};
                    const cq  = mr.claims_qualification || {};
                    const r5  = cq.R5 || {};
                    const fmt = (v) => v != null ? Number(v).toLocaleString("pl-PL", { maximumFractionDigits: 0 }) : "—";
                    return (
                      <tr key={r.parcel_id}>
                        <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{r.parcel_id}</td>
                        <td><Badge color={r.data_status === "ERROR" ? "danger" : "success"}>{r.data_status}</Badge></td>
                        <td>{fmt(mr.geometry?.area_m2)}</td>
                        <td>{mr.ksws?.price_per_m2 != null ? `${mr.ksws.price_per_m2.toFixed(2)} zł` : "—"}</td>
                        <td style={{ fontWeight: 600, color: "#2c3e7a" }}>{fmt(ta.total)}</td>
                        <td style={{ fontWeight: 600, color: "#b7770d" }}>{fmt(tb.total)}</td>
                        <td style={{ color: "#1a7a2e" }}>{r5.active ? fmt(r5.value) : "—"}</td>
                        <td style={{ fontWeight: 700 }}>{fmt(cq.total_active_claims)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {results.length > 1 && (() => {
                  const sumA = results.reduce((s, r) => s + (r.master_record?.compensation?.track_a?.total || 0), 0);
                  const sumB = results.reduce((s, r) => s + (r.master_record?.compensation?.track_b?.total || 0), 0);
                  const sumR5 = results.reduce((s, r) => s + (r.master_record?.claims_qualification?.R5?.value || 0), 0);
                  const sumAll = results.reduce((s, r) => s + (r.master_record?.claims_qualification?.total_active_claims || 0), 0);
                  const fmt = (v) => v > 0 ? v.toLocaleString("pl-PL", { maximumFractionDigits: 0 }) : "—";
                  return (
                    <tfoot className="table-secondary fw-bold">
                      <tr>
                        <td colSpan={4}>SUMA ({results.length} działek)</td>
                        <td style={{ color: "#2c3e7a" }}>{fmt(sumA)}</td>
                        <td style={{ color: "#b7770d" }}>{fmt(sumB)}</td>
                        <td style={{ color: "#1a7a2e" }}>{fmt(sumR5)}</td>
                        <td>{fmt(sumAll)}</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          </CardBody>
        </Card>
      )}
    </Container>
  );
}
