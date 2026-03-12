import React from "react";
import { useNavigate } from "react-router-dom";
import "./LandingPage.css";

const FEATURES = [
  {
    icon: "🛰️",
    title: "Automatyczna identyfikacja",
    desc: "Pobiera geometrię, powierzchnię i lokalizację z ULDK GUGiK. Wystarczy TERYT lub numer ewidencyjny + obręb.",
    color: "#6a4c93",
  },
  {
    icon: "⚡",
    title: "Detekcja infrastruktury",
    desc: "Wykrywa kolizje linii energetycznych, gazowych i wod-kan z granicami działki. Dane GESUT + OSM Overpass.",
    color: "#1982c4",
  },
  {
    icon: "⚖️",
    title: "Wyliczenie KSWS",
    desc: "Track A (sądowy) i Track B (negocjacyjny) zgodnie ze standardem KSWS. Ceny gruntów z GUS BDL.",
    color: "#8ac926",
  },
  {
    icon: "📊",
    title: "Analiza zbiorcza CSV",
    desc: "Wgraj plik CSV z listą działek. System przetworzy równolegle do 100 rekordów i wygeneruje raporty HTML.",
    color: "#ff595e",
  },
];

const STEPS = [
  { n: "01", label: "Wpisz numer działki", desc: "Identyfikator TERYT (np. 141906_5.0029.60) lub numer + obręb" },
  { n: "02", label: "System pobiera dane", desc: "ULDK · GUS BDL · GESUT · OpenStreetMap Overpass API" },
  { n: "03", label: "Otrzymujesz raport", desc: "Mapa, kolizje, wyliczenia KSWS, gotowy raport HTML do druku" },
];

const STATS = [
  { val: "< 30s", label: "Czas analizy 1 działki" },
  { val: "99+", label: "Działek w jednej sesji CSV" },
  { val: "3", label: "Rejestrów API (ULDK·GUS·GESUT)" },
  { val: "2", label: "Ścieżki KSWS (A+B)" },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="lp-root">

      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section className="lp-hero">
        <div className="lp-hero-inner">
          <div className="lp-logo-badge">
            <span className="lp-logo-symbol">§</span>
          </div>
          <h1 className="lp-hero-title">
            Kalkulator<br />
            <span className="lp-hero-accent">Służebności Przesyłu</span>
          </h1>
          <p className="lp-hero-sub">
            Profesjonalne narzędzie do wyliczania roszczeń KSWS.<br />
            Automatyczna identyfikacja działek · Dane z rejestrów publicznych · Raporty PDF
          </p>
          <div className="lp-hero-actions">
            <button
              className="lp-btn lp-btn-primary"
              onClick={() => navigate("/kalkulator/analiza")}
            >
              ⚡ Analizuj działkę
            </button>
            <button
              className="lp-btn lp-btn-outline"
              onClick={() => navigate("/kalkulator/batch")}
            >
              📊 Analiza zbiorcza CSV
            </button>
          </div>
        </div>
        <div className="lp-hero-wave" />
      </section>

      {/* ══ STATS ════════════════════════════════════════════════════════ */}
      <section className="lp-stats">
        {STATS.map((s, i) => (
          <div key={i} className="lp-stat-item">
            <div className="lp-stat-val">{s.val}</div>
            <div className="lp-stat-lbl">{s.label}</div>
          </div>
        ))}
      </section>

      {/* ══ FEATURES ═════════════════════════════════════════════════════ */}
      <section className="lp-section">
        <h2 className="lp-section-title">Co robi kalkulator?</h2>
        <div className="lp-features">
          {FEATURES.map((f, i) => (
            <div key={i} className="lp-feature-card" style={{ "--accent": f.color }}>
              <div className="lp-feature-icon">{f.icon}</div>
              <div className="lp-feature-title">{f.title}</div>
              <div className="lp-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ HOW IT WORKS ═════════════════════════════════════════════════ */}
      <section className="lp-section lp-section-alt">
        <h2 className="lp-section-title">Jak to działa?</h2>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <div key={i} className="lp-step">
              <div className="lp-step-num">{s.n}</div>
              <div className="lp-step-label">{s.label}</div>
              <div className="lp-step-desc">{s.desc}</div>
              {i < STEPS.length - 1 && <div className="lp-step-arrow">→</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ══ TRACKS ═══════════════════════════════════════════════════════ */}
      <section className="lp-section">
        <h2 className="lp-section-title">Ścieżki wyliczenia KSWS</h2>
        <div className="lp-tracks">
          <div className="lp-track lp-track-a">
            <div className="lp-track-badge">Track A</div>
            <div className="lp-track-name">⚖️ Sądowy</div>
            <div className="lp-track-formula">WSP × WBK</div>
            <div className="lp-track-desc">
              Wynagrodzenie Służebności Przesyłu obliczane metodą sądową —
              iloczyn wartości pasa służebności i współczynnika branżowego.
            </div>
          </div>
          <div className="lp-track lp-track-b">
            <div className="lp-track-badge">Track B</div>
            <div className="lp-track-name">🤝 Negocjacyjny</div>
            <div className="lp-track-formula">WSP × WBK + OBN</div>
            <div className="lp-track-desc">
              Rozszerzony o odszkodowanie za bezumowne nakłady (OBN) —
              dla negocjacji i ugód pozasądowych z operatorem.
            </div>
          </div>
        </div>
      </section>

      {/* ══ CTA BANNER ═══════════════════════════════════════════════════ */}
      <section className="lp-cta">
        <div className="lp-cta-inner">
          <h2 className="lp-cta-title">Gotowy do analizy?</h2>
          <p className="lp-cta-sub">
            Wpisz numer działki lub wgraj CSV z listą działek.
          </p>
          <div className="lp-hero-actions">
            <button
              className="lp-btn lp-btn-primary"
              onClick={() => navigate("/kalkulator/analiza")}
            >
              ⚡ Analizuj działkę teraz
            </button>
            <button
              className="lp-btn lp-btn-white"
              onClick={() => navigate("/kalkulator/batch")}
            >
              📋 Batch — wgraj CSV
            </button>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════════ */}
      <footer className="lp-footer">
        <div className="lp-footer-logo">
          <span className="lp-footer-symbol">§</span>
          <div>
            <div className="lp-footer-name">SZUWARA</div>
            <div className="lp-footer-tagline">Kancelaria Prawno-Podatkowa</div>
          </div>
        </div>
        <div className="lp-footer-note">
          Narzędzie analityczne · Nie zastępuje operatu szacunkowego · Dane: ULDK GUGiK · GUS BDL · GESUT
        </div>
      </footer>

    </div>
  );
}
