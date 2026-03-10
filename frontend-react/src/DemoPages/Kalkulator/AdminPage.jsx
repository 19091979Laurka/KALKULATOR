import React, { useState, useEffect } from "react";
import { Card, CardBody, CardTitle, Button, Container, Badge, Spinner } from "reactstrap";
import PageTitleAlt2 from "../../Layout/AppMain/PageTitleAlt2";
import { API_BASE } from "../../config/api";

export default function AdminPage() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cacheClearing, setCacheClearing] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      const data = await res.json();
      setHealth(data);
    } catch (e) {
      setHealth({ status: "error", message: e.message });
    } finally {
      setLoading(false);
    }
  };

  const clearCache = async () => {
    setCacheClearing(true);
    try {
      const res = await fetch(`${API_BASE}/api/cache/clear`, { method: "POST" });
      const data = await res.json();
      if (res.ok) fetchHealth();
    } finally {
      setCacheClearing(false);
    }
  };

  useEffect(() => { fetchHealth(); }, []);

  return (
    <Container fluid>
      <PageTitleAlt2 heading="Admin" subheading="Status API i cache" icon="pe-7s-config icon-gradient bg-premium-dark" />
      <Row>
        <Col md="6">
          <Card className="mb-3">
            <CardBody>
              <CardTitle className="d-flex justify-content-between align-items-center">
                Health <Button size="sm" outline onClick={fetchHealth} disabled={loading}>{loading ? <Spinner size="sm" /> : "Odśwież"}</Button>
              </CardTitle>
              {health && (
                <div>
                  <p><strong>Status:</strong> <Badge color={health.status === "healthy" ? "success" : "danger"}>{health.status}</Badge></p>
                  <p><strong>Wersja:</strong> {health.version || "—"}</p>
                  <p><strong>Cache:</strong> {health.cache_size ?? "—"} wpisów</p>
                  <p><strong>Aktywne joby:</strong> {health.active_jobs ?? "—"}</p>
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
        <Col md="6">
          <Card className="mb-3">
            <CardBody>
              <CardTitle>Cache</CardTitle>
              <p className="text-muted">Wyczyść cache analiz (wymusza ponowne pobranie danych).</p>
              <Button color="warning" onClick={clearCache} disabled={cacheClearing}>{cacheClearing ? <Spinner size="sm" /> : null} Wyczyść cache</Button>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
