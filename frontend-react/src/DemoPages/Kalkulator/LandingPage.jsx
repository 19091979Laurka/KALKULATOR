import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./LandingPage.css";

const FEATURES = [
  {
    icon: "🛰️",
    title: "Automatyczna identyfikacja",
    desc: "Pobiera geometrię, powierzchnię i lokalizację z ULDK GUGiK. Wystarczy TERYT lub numer ewidencyjny + obręb.",
    color: "#6a4c93",
    bg: "linear-gradient(135deg, #f3eeff 0%, #ebe0ff 100%)",
  },
  {
    icon: "⚡",
    title: "Detekcja infrastruktury",
    desc: "Wykrywa kolizje linii energetycznych, gazowych i wod-kan z granicami działki. Dane GESUT + OSM Overpass.",
    color: "#1982c4",
    bg: "linear-gradient(135deg, #e8f4fd 0%, #d0eaf9 100%)",
  },
  {
    icon: "⚖️",
    title: "Wyliczenie KSWS",
    desc: "Track A (sądowy) i Track B (negocjacyjny) zgodnie ze standardem KSWS. Ceny gruntów z GUS BDL.",
    color: "#5a9e0f",
    bg: "linear-gradient(135deg, #f0fadf 0%, #e5f7c4 100%)",
  },
  {
    icon: "📊",
    title: "Analiza zbiorcza CSV",
    desc: "Wgraj plik CSV z listą działek. System przetworzy równolegle do 100 rekordów i wygeneruje raporty HTML.",
    color: "#e05252",
    bg: "linear-gradient(135deg, #fff0f0 0%, #ffdede 100%)",
  },
];

const STEPS = [
  {
    n: "01",
    label: "Wpisz numer działki",
    desc: "Identyfikator TERYT (np. 141906_5.0029.60) lub numer + obręb",
    icon: "🔍",
  },
  {
    n: "02",
    label: "System pobiera dane",
    desc: "ULDK · GUS BDL · GESUT · OpenStreetMap Overpass API",
    icon: "⚙️",
  },
  {
    n: "03",
    label: "Otrzymujesz raport",
    desc: "Mapa, kolizje, wyliczenia KSWS, gotowy raport HTML do druku",
    icon: "📄",
  },
];

const STATS = [
  { val: "< 30s", label: "Czas analizy 1 działki", icon: "⏱️" },
  { val: "99+", label: "Działek w jednej sesji CSV", icon: "📋" },
  { val: "3", label: "Rejestry API (ULDK·GUS·GESUT)", icon: "🔗" },
  { val: "2", label: "Ścieżki KSWS (Track A+B)", icon: "⚖️" },
];

const APIS = [
  { name: "ULDK GUGiK", desc: "Geometria i dane ewidencyjne działek", color: "#6a4c93" },
  { name: "GUS BDL", desc: "Ceny transakcyjne gruntów wg gmin", color: "#1982c4" },
  { name: "GESUT", desc: "Sieć uzbrojenia terenu (linie energetyczne)", color: "#e05252" },
  { name: "OSM Overpass", desc: "Infrastruktura energetyczna OpenStreetMap", color: "#f4a261" },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const heroRef = useRef(null);

  useEffect(() => {
    // Particle animation
    const canvas = document.getElementById("lp-particles");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.5,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.5 + 0.1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="lp-root">

      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section className="lp-hero" ref={heroRef}>
        <canvas id="lp-particles" className="lp-particles" />
        <div className="lp-hero-content">
          <div className="lp-hero-badge">
            <span className="lp-badge-dot" />
            Kancelaria Szuwara · Narzędzie analityczne
          </div>
          <div className="lp-hero-logo-wrap">
            <div className="lp-hero-logo">§</div>
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
              <span className="lp-btn-icon">⚡</span>
              Analizuj działkę
            </button>
            <button
              className="lp-btn lp-btn-outline"
              onClick={() => navigate("/kalkulator/batch")}
            >
              <span className="lp-btn-icon">📊</span>
              Analiza zbiorcza CSV
            </button>
          </div>
          <div className="lp-hero-scroll-hint">
            <span>Przewiń, aby dowiedzieć się więcej</span>
            <div className="lp-scroll-arrow">↓</div>
          </div>
        </div>
        <div className="lp-hero-wave">
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="#f5f7fa" />
          </svg>
        </div>
      </section>

      {/* ══ STATS ════════════════════════════════════════════════════════ */}
      <section className="lp-stats-section">
        <div className="lp-stats-grid">
          {STATS.map((s, i) => (
            <div key={i} className="lp-stat-card">
              <div className="lp-stat-icon">{s.icon}</div>
              <div className="lp-stat-val">{s.val}</div>
              <div className="lp-stat-lbl">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ FEATURES ═════════════════════════════════════════════════════ */}
      <section className="lp-section">
        <div className="lp-section-header">
          <div className="lp-section-eyebrow">Możliwości</div>
          <h2 className="lp-section-title">Co robi kalkulator?</h2>
          <p className="lp-section-sub">
            Kompletny zestaw narzędzi do analizy służebności przesyłu — od identyfikacji działki po gotowy raport.
          </p>
        </div>
        <div className="lp-features-grid">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="lp-feature-card"
              style={{ "--accent": f.color, "--bg": f.bg }}
            >
              <div className="lp-feature-icon-wrap" style={{ background: f.bg }}>
                <span className="lp-feature-icon">{f.icon}</span>
              </div>
              <div className="lp-feature-body">
                <div className="lp-feature-title">{f.title}</div>
                <div className="lp-feature-desc">{f.desc}</div>
              </div>
              <div className="lp-feature-arrow">→</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ HOW IT WORKS ═════════════════════════════════════════════════ */}
      <section className="lp-section lp-section-dark">
        <div className="lp-section-header">
          <div className="lp-section-eyebrow lp-eyebrow-light">Proces</div>
          <h2 className="lp-section-title lp-title-light">Jak to działa?</h2>
          <p className="lp-section-sub lp-sub-light">
            Trzy proste kroki dzielą Cię od kompletnego raportu KSWS.
          </p>
        </div>
        <div className="lp-steps-timeline">
          {STEPS.map((s, i) => (
            <div key={i} className="lp-step-card">
              <div className="lp-step-number">{s.n}</div>
              <div className="lp-step-icon-wrap">{s.icon}</div>
              <div className="lp-step-label">{s.label}</div>
              <div className="lp-step-desc">{s.desc}</div>
              {i < STEPS.length - 1 && (
                <div className="lp-step-connector">
                  <div className="lp-connector-line" />
                  <div className="lp-connector-arrow">›</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ══ TRACKS ═══════════════════════════════════════════════════════ */}
      <section className="lp-section">
        <div className="lp-section-header">
          <div className="lp-section-eyebrow">Metodologia</div>
          <h2 className="lp-section-title">Ścieżki wyliczenia KSWS</h2>
          <p className="lp-section-sub">
            Kalkulator obsługuje dwie ścieżki wyliczenia zgodne ze standardem KSWS.
          </p>
        </div>
        <div className="lp-tracks-grid">
          <div className="lp-track-card lp-track-a">
            <div className="lp-track-header">
              <div className="lp-track-badge lp-badge-a">Track A</div>
              <div className="lp-track-type">Sądowy</div>
            </div>
            <div className="lp-track-formula">WSP × WBK</div>
            <div className="lp-track-desc">
              Wynagrodzenie Służebności Przesyłu obliczane metodą sądową —
              iloczyn wartości pasa służebności i współczynnika branżowego.
            </div>
            <ul className="lp-track-list">
              <li>✓ Wartość pasa służebności (WSP)</li>
              <li>✓ Współczynnik branżowy (WBK)</li>
              <li>✓ Ceny gruntów z GUS BDL</li>
            </ul>
          </div>
          <div className="lp-track-card lp-track-b">
            <div className="lp-track-header">
              <div className="lp-track-badge lp-badge-b">Track B</div>
              <div className="lp-track-type">Negocjacyjny</div>
            </div>
            <div className="lp-track-formula">WSP × WBK + OBN</div>
            <div className="lp-track-desc">
              Rozszerzony o odszkodowanie za bezumowne nakłady (OBN) —
              dla negocjacji i ugód pozasądowych z operatorem.
            </div>
            <ul className="lp-track-list">
              <li>✓ Wszystkie składniki Track A</li>
              <li>✓ Odszkodowanie bezumowne (OBN)</li>
              <li>✓ Optymalizacja dla ugód</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ══ API SOURCES ══════════════════════════════════════════════════ */}
      <section className="lp-section lp-section-light">
        <div className="lp-section-header">
          <div className="lp-section-eyebrow">Źródła danych</div>
          <h2 className="lp-section-title">Dane z rejestrów publicznych</h2>
          <p className="lp-section-sub">
            Kalkulator korzysta wyłącznie z oficjalnych, publicznych rejestrów państwowych.
          </p>
        </div>
        <div className="lp-apis-grid">
          {APIS.map((api, i) => (
            <div key={i} className="lp-api-card" style={{ "--api-color": api.color }}>
              <div className="lp-api-dot" />
              <div className="lp-api-name">{api.name}</div>
              <div className="lp-api-desc">{api.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ CTA BANNER ═══════════════════════════════════════════════════ */}
      <section className="lp-cta">
        <div className="lp-cta-bg" />
        <div className="lp-cta-content">
          <div className="lp-cta-icon">§</div>
          <h2 className="lp-cta-title">Gotowy do analizy?</h2>
          <p className="lp-cta-sub">
            Wpisz numer działki lub wgraj CSV z listą działek i otrzymaj kompletny raport KSWS.
          </p>
          <div className="lp-cta-actions">
            <button
              className="lp-btn lp-btn-white"
              onClick={() => navigate("/kalkulator/analiza")}
            >
              <span className="lp-btn-icon">⚡</span>
              Analizuj działkę teraz
            </button>
            <button
              className="lp-btn lp-btn-ghost"
              onClick={() => navigate("/kalkulator/batch")}
            >
              <span className="lp-btn-icon">📋</span>
              Batch — wgraj CSV
            </button>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════════════════ */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-footer-logo">
              <span className="lp-footer-symbol">§</span>
              <div>
                <div className="lp-footer-name">SZUWARA</div>
                <div className="lp-footer-tagline">Kancelaria Prawno-Podatkowa</div>
              </div>
            </div>
            <div className="lp-footer-contact">
              <a href="https://www.kancelaria-szuwara.pl" target="_blank" rel="noopener noreferrer">
                www.kancelaria-szuwara.pl
              </a>
              <a href="tel:790411412">790 411 412</a>
            </div>
          </div>
          <div className="lp-footer-note">
            Narzędzie analityczne · Nie zastępuje operatu szacunkowego<br />
            Dane: ULDK GUGiK · GUS BDL · GESUT · OSM
          </div>
          <div className="lp-footer-version">KSWS v3.0 · Track A/B · GUGiK</div>
        </div>
      </footer>

    </div>
  );
}
