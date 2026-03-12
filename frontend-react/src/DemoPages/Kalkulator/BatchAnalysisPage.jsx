import React, { useState, useEffect } from "react";
import "./BatchAnalysisPage.css";

const BatchAnalysisPage = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log("✅ BatchAnalysisPage mounted");
    loadData();
  }, []);

  const loadData = async () => {
    console.log("🔄 Loading data...");
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/history/20260311_194524");
      console.log("📡 Response status:", res.status);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      console.log("✅ Data loaded:", json.data?.results?.length, "parcels");

      if (json.ok && json.data?.results) {
        setResults(json.data);
      }
    } catch (err) {
      console.error("❌ Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: "40px" }}>⏳ Ładowanie...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: "40px", color: "red" }}>
        <h2>❌ Błąd: {error}</h2>
        <button onClick={loadData}>Spróbuj ponownie</button>
      </div>
    );
  }

  if (!results) {
    return <div style={{ padding: "40px" }}>📥 Brak danych</div>;
  }

  const stats = {
    total: results.parcel_count || results.results?.length || 0,
    ok: results.successful || 0,
    collision: (results.results || []).filter(p => p.data?.infrastructure?.power_lines?.detected).length,
    trackA: (results.results || []).reduce((s, p) => s + (p.data?.compensation?.track_a?.total || 0), 0),
    trackB: (results.results || []).reduce((s, p) => s + (p.data?.compensation?.track_b?.total || 0), 0),
  };

  return (
    <div style={{ padding: "30px", maxWidth: "1400px", margin: "0 auto" }}>
      <h1>📊 Batch Analysis KSWS - {stats.total} Działek</h1>

      {/* STATS CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "15px", marginBottom: "30px" }}>
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #eee", borderLeft: "4px solid #b8963e", textAlign: "center" }}>
          <div style={{ fontSize: "2em", fontWeight: "800" }}>{stats.total}</div>
          <div style={{ fontSize: "0.85em", color: "#888" }}>Razem</div>
        </div>
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #eee", borderLeft: "4px solid #27ae60", textAlign: "center" }}>
          <div style={{ fontSize: "2em", fontWeight: "800", color: "#27ae60" }}>{stats.ok}</div>
          <div style={{ fontSize: "0.85em", color: "#888" }}>OK</div>
        </div>
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #eee", borderLeft: "4px solid #f39c12", textAlign: "center" }}>
          <div style={{ fontSize: "2em", fontWeight: "800", color: "#f39c12" }}>{stats.collision}</div>
          <div style={{ fontSize: "0.85em", color: "#888" }}>Kolizja</div>
        </div>
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #eee", borderLeft: "4px solid #27ae60", textAlign: "center" }}>
          <div style={{ fontSize: "1.5em", fontWeight: "800", color: "#27ae60" }}>{Math.round(stats.trackA).toLocaleString()}</div>
          <div style={{ fontSize: "0.75em", color: "#888" }}>Track A</div>
        </div>
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #eee", borderLeft: "4px solid #f39c12", textAlign: "center" }}>
          <div style={{ fontSize: "1.5em", fontWeight: "800", color: "#f39c12" }}>{Math.round(stats.trackB).toLocaleString()}</div>
          <div style={{ fontSize: "0.75em", color: "#888" }}>Track B</div>
        </div>
      </div>

      {/* TOTAL BOX */}
      <div style={{ background: "linear-gradient(135deg, #27ae60, #2ecc71)", color: "white", padding: "30px", borderRadius: "10px", textAlign: "center", marginBottom: "30px" }}>
        <div style={{ fontSize: "1.2em", marginBottom: "10px" }}>💰 RAZEM ODSZKODOWANIA</div>
        <div style={{ fontSize: "3em", fontWeight: "800" }}>{Math.round(stats.trackA + stats.trackB).toLocaleString()} PLN</div>
      </div>

      {/* DATA TABLE */}
      <div style={{ background: "white", borderRadius: "8px", border: "1px solid #eee", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85em" }}>
          <thead>
            <tr style={{ background: "#3d2319", color: "white", position: "sticky", top: 0 }}>
              <th style={{ padding: "12px", textAlign: "left" }}>Działka</th>
              <th style={{ padding: "12px" }}>Kolizja</th>
              <th style={{ padding: "12px" }}>Napięcie</th>
              <th style={{ padding: "12px", textAlign: "right" }}>Pow [m²]</th>
              <th style={{ padding: "12px", textAlign: "right" }}>Cena [PLN/m²]</th>
              <th style={{ padding: "12px", textAlign: "right" }}>Track A</th>
              <th style={{ padding: "12px", textAlign: "right" }}>Track B</th>
              <th style={{ padding: "12px", textAlign: "right" }}>Razem</th>
            </tr>
          </thead>
          <tbody>
            {(results.results || []).map((p, i) => {
              const area = p.data?.geometry?.area_m2 || 0;
              const price = p.data?.market_data?.average_price_m2 || 0;
              const trackA = p.data?.compensation?.track_a?.total || 0;
              const trackB = p.data?.compensation?.track_b?.total || 0;
              const voltage = p.data?.infrastructure?.power_lines?.voltage || "—";
              const collision = p.data?.infrastructure?.power_lines?.detected;

              return (
                <tr key={i} style={{ borderBottom: "1px solid #f0f0f0", background: i % 2 === 0 ? "#fafafa" : "white" }}>
                  <td style={{ padding: "10px" }}><strong>{p.parcel_id}</strong></td>
                  <td style={{ padding: "10px", textAlign: "center" }}>{collision ? "✅" : "❌"}</td>
                  <td style={{ padding: "10px", textAlign: "center" }}>{voltage}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{Math.round(area)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{Math.round(price)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: "#27ae60", fontWeight: "bold" }}>{Math.round(trackA)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: "#f39c12", fontWeight: "bold" }}>{Math.round(trackB)}</td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: "bold" }}>{Math.round(trackA + trackB)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ textAlign: "center", color: "#999", marginTop: "15px" }}>
        Pokazano {results.results?.length || 0} działek
      </p>
    </div>
  );
};

export default BatchAnalysisPage;
