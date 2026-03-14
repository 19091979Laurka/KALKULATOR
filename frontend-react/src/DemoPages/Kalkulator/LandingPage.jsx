import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./LandingPage.css";

/* ═══════════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════════ */

const DASHBOARD_BOXES = [
  { icon: "⚡", val: "< 30s",  label: "Czas analizy działki",      trend: "+100%", up: true,  color: "#6a4c93", bg: "rgba(106,76,147,0.08)" },
  { icon: "📊", val: "100+",   label: "Działek w sesji CSV",        trend: "batch", up: true,  color: "#1982c4", bg: "rgba(25,130,196,0.08)" },
  { icon: "🗺️", val: "7",      label: "Rejestrów API",              trend: "publiczne", up: true, color: "#8ac926", bg: "rgba(138,201,38,0.08)" },
  { icon: "⚖️", val: "2",      label: "Ścieżki KSWS (A+B)",        trend: "sądowa + negoc.", up: true, color: "#f4a261", bg: "rgba(244,162,97,0.08)" },
  { icon: "📄", val: "PDF",    label: "Format raportu",             trend: "gotowy do druku", up: true, color: "#e05252", bg: "rgba(224,82,82,0.08)" },
  { icon: "🔍", val: "R1–R5",  label: "Składniki roszczenia",       trend: "pełna analiza", up: true, color: "#2ec4b6", bg: "rgba(46,196,182,0.08)" },
];

const FEATURES_FULL = [
  {
    icon: "🛰️",
    title: "Automatyczna identyfikacja działki",
    items: [
      "Pobiera geometrię (polygon WKT) z ULDK GUGiK",
      "Identyfikacja po numerze TERYT lub numerze ewidencyjnym + obręb",
      "Powierzchnia, klasa użytku, numer KW",
      "Lokalizacja gminy, powiatu, województwa",
      "Automatyczne przeliczenie układu współrzędnych (EPSG:2180 → WGS84)",
    ],
    color: "#6a4c93",
    bg: "linear-gradient(135deg, #f3eeff 0%, #ebe0ff 100%)",
  },
  {
    icon: "⚡",
    title: "Detekcja infrastruktury energetycznej",
    items: [
      "Wykrywa linie WN (110kV+), SN (15kV) i nN (0,4kV)",
      "Dane z GESUT GUGiK (Sieć Uzbrojenia Terenu)",
      "Dane z OSM Overpass API (power=line/cable/minor_line)",
      "Detekcja kolizji z granicą działki (bufor 20m)",
      "Automatyczny pomiar długości linii na działce",
      "Identyfikacja napięcia, nazwy operatora",
    ],
    color: "#1982c4",
    bg: "linear-gradient(135deg, #e8f4fd 0%, #d0eaf9 100%)",
  },
  {
    icon: "⚖️",
    title: "Wyliczenie roszczeń KSWS",
    items: [
      "Track A (sądowy): WSP × WBK",
      "Track B (negocjacyjny): WSP × WBK + OBN",
      "Składniki R1–R5 wg standardu KSWS",
      "Wartość pasa służebności (WSP) z GUS BDL",
      "Współczynnik branżowy (WBK) wg rodzaju linii",
      "Odszkodowanie bezumowne (OBN) z odsetkami",
      "Automatyczne pobieranie cen gruntów z GUS BDL",
    ],
    color: "#5a9e0f",
    bg: "linear-gradient(135deg, #f0fadf 0%, #e5f7c4 100%)",
  },
  {
    icon: "📊",
    title: "Analiza zbiorcza CSV",
    items: [
      "Wgrywanie pliku CSV z listą działek",
      "Równoległe przetwarzanie do 100 rekordów",
      "Automatyczny raport zbiorczy HTML",
      "Eksport wyników do CSV/Excel",
      "Historia analiz z podglądem wyników",
      "Filtrowanie i sortowanie wyników",
    ],
    color: "#e05252",
    bg: "linear-gradient(135deg, #fff0f0 0%, #ffdede 100%)",
  },
  {
    icon: "📄",
    title: "Generowanie raportów PDF",
    items: [
      "Profesjonalny raport PDF gotowy do druku",
      "Mapa działki z zaznaczonymi liniami",
      "Pełne wyliczenia R1–R5 z podstawą prawną",
      "Dane z rejestrów publicznych z datą pobrania",
      "Branding kancelarii (logo, dane kontaktowe)",
      "Raport zbiorczy dla wielu działek",
    ],
    color: "#f4a261",
    bg: "linear-gradient(135deg, #fff8f0 0%, #ffecd8 100%)",
  },
  {
    icon: "🗺️",
    title: "Wizualizacja na mapie",
    items: [
      "Interaktywna mapa Leaflet z granicą działki",
      "Warstwy: OSM, Ortofoto GUGiK, BDOT10k",
      "Linie energetyczne z kolorami wg napięcia",
      "Pomiar odległości i powierzchni na mapie",
      "Eksport mapy do PNG",
      "Podgląd 3D słupa energetycznego",
    ],
    color: "#2ec4b6",
    bg: "linear-gradient(135deg, #e8faf8 0%, #d0f5f2 100%)",
  },
];

const DATA_SOURCES = [
  {
    name: "ULDK GUGiK",
    full: "Usługa Lokalizacji Działek Katastralnych",
    desc: "Geometria działek, numery KW, klasy użytków, powierzchnia ewidencyjna",
    url: "https://uldk.gugik.gov.pl",
    color: "#6a4c93",
    type: "REST API",
  },
  {
    name: "GUS BDL",
    full: "Bank Danych Lokalnych GUS",
    desc: "Ceny transakcyjne gruntów według gmin i rodzajów użytków, aktualizowane co kwartał",
    url: "https://bdl.stat.gov.pl",
    color: "#1982c4",
    type: "REST API",
  },
  {
    name: "GESUT GUGiK",
    full: "Geodezyjna Ewidencja Sieci Uzbrojenia Terenu",
    desc: "Linie energetyczne, gazowe, wodociągowe i telekomunikacyjne z dokładnością 1m",
    url: "https://integracja.gugik.gov.pl",
    color: "#e05252",
    type: "WMS/WFS",
  },
  {
    name: "OSM Overpass",
    full: "OpenStreetMap Overpass API",
    desc: "Infrastruktura energetyczna: power=line, cable, minor_line, tower, pole",
    url: "https://overpass-api.de",
    color: "#f4a261",
    type: "REST API",
  },
  {
    name: "BDOT10k",
    full: "Baza Danych Obiektów Topograficznych",
    desc: "Topografia terenu, budynki, drogi, sieci uzbrojenia w skali 1:10 000",
    url: "https://mapy.geoportal.gov.pl",
    color: "#8ac926",
    type: "WMS/WFS",
  },
  {
    name: "Geoportal GUGiK",
    full: "Krajowy Geoportal Infrastruktury Informacji Przestrzennej",
    desc: "Ortofotomapa, NMT, NMPT, dane z ewidencji gruntów i budynków (EGiB)",
    url: "https://geoportal.gov.pl",
    color: "#2ec4b6",
    type: "WMS/WMTS",
  },
  {
    name: "KIUT GUGiK",
    full: "Krajowa Integracja Uzbrojenia Terenu",
    desc: "Zintegrowana baza sieci uzbrojenia terenu z całego kraju, aktualizacja w czasie rzeczywistym",
    url: "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu",
    color: "#9b59b6",
    type: "WMS",
  },
  {
    name: "Open Infra Map",
    full: "OpenInfraMap — infrastruktura energetyczna",
    desc: "Wizualizacja linii wysokiego napięcia, stacji transformatorowych i kabli podziemnych",
    url: "https://openinframap.org",
    color: "#e67e22",
    type: "MVT Tiles",
  },
];

const METHODOLOGY = [
  {
    code: "R1",
    name: "Wartość pasa służebności",
    formula: "PS × Cg × WR",
    desc: "Powierzchnia pasa służebności (PS) × cena gruntu (Cg) × współczynnik rodzaju użytku (WR). Ceny z GUS BDL dla danej gminy.",
    color: "#6a4c93",
  },
  {
    code: "R2",
    name: "Wynagrodzenie za ustanowienie",
    formula: "R1 × WBK",
    desc: "Wynagrodzenie za ustanowienie służebności przesyłu. Współczynnik branżowy (WBK) zależy od napięcia linii: WN=0.5, SN=0.3, nN=0.2.",
    color: "#1982c4",
  },
  {
    code: "R3",
    name: "Odszkodowanie za bezumowne korzystanie",
    formula: "R2 × Lata × (1 + r)",
    desc: "Odszkodowanie za okres bezumownego korzystania z nieruchomości. Uwzględnia odsetki ustawowe za opóźnienie.",
    color: "#e05252",
  },
  {
    code: "R4",
    name: "Utracone pożytki",
    formula: "PS × Dp × Lata",
    desc: "Utracone korzyści z tytułu niemożności korzystania z gruntu w pasie służebności. Dochód z produkcji rolnej (Dp) wg GUS.",
    color: "#8ac926",
  },
  {
    code: "R5",
    name: "Obniżenie wartości nieruchomości",
    formula: "Wn × WOW",
    desc: "Trwałe obniżenie wartości nieruchomości (Wn) przez ustanowienie służebności. Współczynnik obniżenia wartości (WOW) wg KSWS.",
    color: "#f4a261",
  },
];

const STEPS = [
  { n: "01", icon: "🔍", label: "Wpisz numer działki", desc: "TERYT (np. 141906_5.0029.60) lub numer ewidencyjny + obręb" },
  { n: "02", icon: "⚙️", label: "System pobiera dane", desc: "Automatyczne zapytania do 7 rejestrów publicznych równolegle" },
  { n: "03", icon: "⚡", label: "Detekcja linii", desc: "Analiza kolizji infrastruktury z granicą działki" },
  { n: "04", icon: "📄", label: "Raport KSWS", desc: "Kompletne wyliczenia R1–R5, mapa, PDF gotowy do druku" },
];

/* ═══════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  /* Particle animation */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    const pts = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.5, dx: (Math.random() - 0.5) * 0.35, dy: (Math.random() - 0.5) * 0.35,
      a: Math.random() * 0.4 + 0.1,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pts.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.a})`; ctx.fill();
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <div className="lp-root">

      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <section className="lp-hero">
        <canvas ref={canvasRef} className="lp-particles" />
        <div className="lp-hero-content">
          <div className="lp-hero-badge">
            <span className="lp-badge-dot" />
            Kancelaria Szuwara · Narzędzie analityczne KSWS
          </div>
          <div className="lp-hero-logo">§</div>
          <h1 className="lp-hero-title">
            Kalkulator<br />
            <span className="lp-hero-accent">Służebności Przesyłu</span>
          </h1>
          <p className="lp-hero-sub">
            Profesjonalne narzędzie do wyliczania roszczeń KSWS (R1–R5).<br />
            Automatyczna identyfikacja działek · 7 rejestrów publicznych · Raporty PDF
          </p>
          <div className="lp-hero-actions">
            <button className="lp-btn lp-btn-primary" onClick={() => navigate("/kalkulator/analiza")}>
              <span>⚡</span> Analizuj działkę
            </button>
            <button className="lp-btn lp-btn-outline" onClick={() => navigate("/kalkulator/batch")}>
              <span>📊</span> Analiza zbiorcza CSV
            </button>
          </div>
          <div className="lp-hero-flow-hint">
            <span className="lp-flow-item">Jedna działka → <strong>Analiza działki</strong> → Historia analiz → raport do druku</span>
            <span className="lp-flow-sep"> · </span>
            <span className="lp-flow-item">Wiele działek → <strong>Analiza hurtowa</strong> → Historia raportów → raport zbiorczy</span>
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

      {/* ══ DASHBOARD BOXES ══════════════════════════════════════════════ */}
      <section className="lp-section lp-section-light">
        <div className="lp-section-header">
          <div className="lp-section-eyebrow">Statystyki</div>
          <h2 className="lp-section-title">Kalkulator w liczbach</h2>
        </div>
        <div className="lp-dash-grid">
          {DASHBOARD_BOXES.map((box, i) => (
            <div key={i} className="lp-dash-box">
              <div className="lp-dash-icon-wrap" style={{ background: box.bg }}>
                <span className="lp-dash-icon">{box.icon}</span>
              </div>
              <div className="lp-dash-val">{box.val}</div>
              <div className="lp-dash-label">{box.label}</div>
              <div className="lp-dash-trend" style={{ color: box.color }}>
                <span className="lp-dash-arrow">{box.up ? "↑" : "↓"}</span>
                {box.trend}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ 3D POWER LINE VISUALIZATION ══════════════════════════════════ */}
      <section className="lp-section lp-section-dark">
        <div className="lp-section-header">
          <div className="lp-section-eyebrow lp-eyebrow-light">Wizualizacja</div>
          <h2 className="lp-section-title lp-title-light">Infrastruktura energetyczna na mapie</h2>
          <p className="lp-section-sub lp-sub-light">
            Kalkulator automatycznie wykrywa linie energetyczne przecinające działkę i wizualizuje je na mapie 3D.
          </p>
        </div>
        <div className="lp-map3d-container">
          {/* SVG 3D power line visualization */}
          <div className="lp-map3d-scene">
            <svg viewBox="0 0 800 420" className="lp-map3d-svg" xmlns="http://www.w3.org/2000/svg">
              {/* Sky gradient */}
              <defs>
                <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a0a2e" />
                  <stop offset="100%" stopColor="#2d1b5e" />
                </linearGradient>
                <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2d4a1e" />
                  <stop offset="100%" stopColor="#1a2d10" />
                </linearGradient>
                <linearGradient id="parcelGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3a6b28" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#2d5420" stopOpacity="0.4" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="glowStrong">
                  <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
                  <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>

              {/* Background */}
              <rect width="800" height="420" fill="url(#skyGrad)" />

              {/* Stars */}
              {[
                [50,30],[120,15],[200,40],[300,20],[400,10],[500,35],[600,18],[700,28],[750,45],
                [80,60],[160,55],[250,70],[350,50],[450,65],[550,42],[650,58],[720,72]
              ].map(([x,y],i) => (
                <circle key={i} cx={x} cy={y} r="1" fill="white" opacity={0.4 + Math.random()*0.4} />
              ))}

              {/* Ground perspective */}
              <polygon points="0,280 800,280 800,420 0,420" fill="url(#groundGrad)" />

              {/* Grid lines on ground (perspective) */}
              {[0,1,2,3,4,5,6,7].map(i => (
                <line key={i} x1={i*100+50} y1="280" x2={i*100} y2="420"
                  stroke="rgba(138,201,38,0.12)" strokeWidth="1" />
              ))}
              {[0,1,2,3].map(i => (
                <line key={i} x1="0" y1={280+i*47} x2="800" y2={280+i*47}
                  stroke="rgba(138,201,38,0.08)" strokeWidth="1" />
              ))}

              {/* Parcel boundary (highlighted) */}
              <polygon
                points="180,295 420,285 480,310 440,330 200,340 150,318"
                fill="url(#parcelGrad)"
                stroke="#8ac926"
                strokeWidth="2"
                strokeDasharray="6,3"
                filter="url(#glow)"
              />
              <text x="290" y="318" fill="#8ac926" fontSize="11" fontWeight="700" textAnchor="middle" opacity="0.9">
                DZIAŁKA 142010_2.0052.327/2
              </text>

              {/* Power line tower LEFT (3D) */}
              {/* Tower base */}
              <line x1="100" y1="280" x2="100" y2="100" stroke="#aaa" strokeWidth="3" />
              {/* Cross arms */}
              <line x1="60" y1="120" x2="140" y2="120" stroke="#aaa" strokeWidth="2.5" />
              <line x1="70" y1="140" x2="130" y2="140" stroke="#aaa" strokeWidth="2" />
              <line x1="75" y1="160" x2="125" y2="160" stroke="#aaa" strokeWidth="2" />
              {/* Diagonal braces */}
              <line x1="100" y1="100" x2="60" y2="120" stroke="#888" strokeWidth="1.5" />
              <line x1="100" y1="100" x2="140" y2="120" stroke="#888" strokeWidth="1.5" />
              <line x1="100" y1="120" x2="70" y2="140" stroke="#888" strokeWidth="1.5" />
              <line x1="100" y1="120" x2="130" y2="140" stroke="#888" strokeWidth="1.5" />
              <line x1="100" y1="140" x2="75" y2="160" stroke="#888" strokeWidth="1.5" />
              <line x1="100" y1="140" x2="125" y2="160" stroke="#888" strokeWidth="1.5" />
              {/* Tower top */}
              <polygon points="95,95 105,95 102,80 98,80" fill="#aaa" />
              {/* Insulators */}
              <circle cx="60" cy="120" r="4" fill="#ddd" />
              <circle cx="140" cy="120" r="4" fill="#ddd" />
              <circle cx="70" cy="140" r="4" fill="#ddd" />
              <circle cx="130" cy="140" r="4" fill="#ddd" />
              {/* Tower shadow */}
              <ellipse cx="100" cy="282" rx="15" ry="4" fill="rgba(0,0,0,0.3)" />

              {/* Power line tower RIGHT (3D) */}
              <line x1="680" y1="280" x2="680" y2="100" stroke="#aaa" strokeWidth="3" />
              <line x1="640" y1="120" x2="720" y2="120" stroke="#aaa" strokeWidth="2.5" />
              <line x1="650" y1="140" x2="710" y2="140" stroke="#aaa" strokeWidth="2" />
              <line x1="655" y1="160" x2="705" y2="160" stroke="#aaa" strokeWidth="2" />
              <line x1="680" y1="100" x2="640" y2="120" stroke="#888" strokeWidth="1.5" />
              <line x1="680" y1="100" x2="720" y2="120" stroke="#888" strokeWidth="1.5" />
              <line x1="680" y1="120" x2="650" y2="140" stroke="#888" strokeWidth="1.5" />
              <line x1="680" y1="120" x2="710" y2="140" stroke="#888" strokeWidth="1.5" />
              <line x1="680" y1="140" x2="655" y2="160" stroke="#888" strokeWidth="1.5" />
              <line x1="680" y1="140" x2="705" y2="160" stroke="#888" strokeWidth="1.5" />
              <polygon points="675,95 685,95 682,80 678,80" fill="#aaa" />
              <circle cx="640" cy="120" r="4" fill="#ddd" />
              <circle cx="720" cy="120" r="4" fill="#ddd" />
              <circle cx="650" cy="140" r="4" fill="#ddd" />
              <circle cx="710" cy="140" r="4" fill="#ddd" />
              <ellipse cx="680" cy="282" rx="15" ry="4" fill="rgba(0,0,0,0.3)" />

              {/* Power lines (catenary curves) - WN 110kV */}
              {/* Top wires */}
              <path d="M60,120 Q390,145 640,120" stroke="#ffcc00" strokeWidth="2.5" fill="none" filter="url(#glow)" opacity="0.9" />
              <path d="M140,120 Q390,145 720,120" stroke="#ffcc00" strokeWidth="2.5" fill="none" filter="url(#glow)" opacity="0.9" />
              {/* Middle wires */}
              <path d="M70,140 Q390,165 650,140" stroke="#ffcc00" strokeWidth="2" fill="none" filter="url(#glow)" opacity="0.8" />
              <path d="M130,140 Q390,165 710,140" stroke="#ffcc00" strokeWidth="2" fill="none" filter="url(#glow)" opacity="0.8" />
              {/* Bottom wires */}
              <path d="M75,160 Q390,185 655,160" stroke="#ffcc00" strokeWidth="1.5" fill="none" filter="url(#glow)" opacity="0.7" />
              <path d="M125,160 Q390,185 705,160" stroke="#ffcc00" strokeWidth="1.5" fill="none" filter="url(#glow)" opacity="0.7" />

              {/* Crossing point indicator */}
              <circle cx="390" cy="165" r="8" fill="none" stroke="#ff4444" strokeWidth="2" filter="url(#glow)" />
              <circle cx="390" cy="165" r="3" fill="#ff4444" filter="url(#glow)" />
              <line x1="390" y1="173" x2="390" y2="300" stroke="#ff4444" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7" />

              {/* Labels */}
              <rect x="310" y="60" width="160" height="30" rx="6" fill="rgba(255,204,0,0.15)" stroke="rgba(255,204,0,0.4)" strokeWidth="1" />
              <text x="390" y="79" fill="#ffcc00" fontSize="11" fontWeight="700" textAnchor="middle" filter="url(#glow)">
                WN 110kV — linia napowietrzna
              </text>

              {/* Crossing label */}
              <rect x="410" y="150" width="140" height="26" rx="5" fill="rgba(255,68,68,0.15)" stroke="rgba(255,68,68,0.5)" strokeWidth="1" />
              <text x="480" y="167" fill="#ff6666" fontSize="10" fontWeight="700" textAnchor="middle">
                ⚡ Kolizja z działką
              </text>

              {/* Distance indicator */}
              <line x1="180" y1="340" x2="440" y2="330" stroke="#8ac926" strokeWidth="1.5" strokeDasharray="3,2" />
              <text x="310" y="355" fill="#8ac926" fontSize="10" fontWeight="600" textAnchor="middle">
                ← dł. linii na działce: ~148m →
              </text>

              {/* Compass */}
              <g transform="translate(750,60)">
                <circle cx="0" cy="0" r="18" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                <text x="0" y="-8" fill="white" fontSize="8" textAnchor="middle" fontWeight="700">N</text>
                <text x="0" y="14" fill="white" fontSize="7" textAnchor="middle">S</text>
                <text x="-12" y="4" fill="white" fontSize="7" textAnchor="middle">W</text>
                <text x="12" y="4" fill="white" fontSize="7" textAnchor="middle">E</text>
                <line x1="0" y1="-14" x2="0" y2="14" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
                <line x1="-14" y1="0" x2="14" y2="0" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
                <polygon points="0,-14 -3,-4 3,-4" fill="#ff4444" />
              </g>

              {/* Legend */}
              <rect x="20" y="350" width="200" height="60" rx="6" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <line x1="30" y1="368" x2="60" y2="368" stroke="#ffcc00" strokeWidth="2" />
              <text x="68" y="372" fill="white" fontSize="10">Linia WN 110kV</text>
              <rect x="30" y="380" width="12" height="8" rx="2" fill="none" stroke="#8ac926" strokeWidth="1.5" strokeDasharray="3,2" />
              <text x="48" y="388" fill="white" fontSize="10">Granica działki</text>
              <circle cx="35" cy="400" r="4" fill="none" stroke="#ff4444" strokeWidth="1.5" />
              <circle cx="35" cy="400" r="1.5" fill="#ff4444" />
              <text x="48" y="404" fill="white" fontSize="10">Punkt kolizji</text>
            </svg>

            {/* Info overlay */}
            <div className="lp-map3d-info">
              <div className="lp-map3d-badge lp-badge-wn">WN 110kV</div>
              <div className="lp-map3d-badge lp-badge-detect">✓ Wykryto automatycznie</div>
            </div>
          </div>
          <div className="lp-map3d-caption">
            Przykładowa wizualizacja działki 142010_2.0052.327/2 (Raciąż, mazowieckie) z linią WN 110kV
          </div>
        </div>
      </section>

      {/* ══ FEATURES FULL ════════════════════════════════════════════════ */}
      <section className="lp-section">
        <div className="lp-section-header">
          <div className="lp-section-eyebrow">Możliwości</div>
          <h2 className="lp-section-title">Co robi kalkulator?</h2>
          <p className="lp-section-sub">
            Kompletny zestaw narzędzi do analizy służebności przesyłu — od identyfikacji działki po gotowy raport sądowy.
          </p>
        </div>
        <div className="lp-features-grid">
          {FEATURES_FULL.map((f, i) => (
            <div key={i} className="lp-feature-card" style={{ "--accent": f.color }}>
              <div className="lp-feature-header" style={{ background: f.bg }}>
                <span className="lp-feature-icon">{f.icon}</span>
                <div className="lp-feature-title">{f.title}</div>
              </div>
              <ul className="lp-feature-list">
                {f.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ══ HOW IT WORKS ═════════════════════════════════════════════════ */}
      <section className="lp-section lp-section-light">
        <div className="lp-section-header">
          <div className="lp-section-eyebrow">Proces</div>
          <h2 className="lp-section-title">Jak to działa?</h2>
          <p className="lp-section-sub">Cztery kroki do kompletnego raportu KSWS.</p>
        </div>
        <div className="lp-steps-row">
          {STEPS.map((s, i) => (
            <React.Fragment key={i}>
              <div className="lp-step-box">
                <div className="lp-step-num">{s.n}</div>
                <div className="lp-step-icon">{s.icon}</div>
                <div className="lp-step-label">{s.label}</div>
                <div className="lp-step-desc">{s.desc}</div>
              </div>
              {i < STEPS.length - 1 && <div className="lp-step-sep">›</div>}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* ══ METHODOLOGY ══════════════════════════════════════════════════ */}
      <section className="lp-section lp-section-dark">
        <div className="lp-section-header">
          <div className="lp-section-eyebrow lp-eyebrow-light">Metodologia</div>
          <h2 className="lp-section-title lp-title-light">Składniki roszczenia KSWS (R1–R5)</h2>
          <p className="lp-section-sub lp-sub-light">
            Standard KSWS (Kancelaria Służebności Przesyłu) definiuje 5 składników roszczenia obliczanych automatycznie.
          </p>
        </div>
        <div className="lp-method-grid">
          {METHODOLOGY.map((m, i) => (
            <div key={i} className="lp-method-card" style={{ "--mc": m.color }}>
              <div className="lp-method-code">{m.code}</div>
              <div className="lp-method-name">{m.name}</div>
              <div className="lp-method-formula">{m.formula}</div>
              <div className="lp-method-desc">{m.desc}</div>
            </div>
          ))}
          {/* Track summary */}
          <div className="lp-method-summary">
            <div className="lp-method-track">
              <div className="lp-track-badge lp-badge-a">Track A — Sądowy</div>
              <div className="lp-track-formula-sm">R1 + R2 + R3</div>
              <div className="lp-track-note">Wynagrodzenie za ustanowienie + odszkodowanie bezumowne</div>
            </div>
            <div className="lp-method-track">
              <div className="lp-track-badge lp-badge-b">Track B — Negocjacyjny</div>
              <div className="lp-track-formula-sm">R1 + R2 + R3 + R4 + R5</div>
              <div className="lp-track-note">Pełne roszczenie z utraconymi pożytkami i obniżeniem wartości</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ DATA SOURCES ═════════════════════════════════════════════════ */}
      <section className="lp-section">
        <div className="lp-section-header">
          <div className="lp-section-eyebrow">Źródła danych</div>
          <h2 className="lp-section-title">8 rejestrów publicznych</h2>
          <p className="lp-section-sub">
            Kalkulator korzysta wyłącznie z oficjalnych, publicznych rejestrów państwowych i otwartych danych geograficznych.
          </p>
        </div>
        <div className="lp-sources-grid">
          {DATA_SOURCES.map((src, i) => (
            <div key={i} className="lp-source-card" style={{ "--sc": src.color }}>
              <div className="lp-source-top">
                <div className="lp-source-dot" />
                <div className="lp-source-type">{src.type}</div>
              </div>
              <div className="lp-source-name">{src.name}</div>
              <div className="lp-source-full">{src.full}</div>
              <div className="lp-source-desc">{src.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ CTA ══════════════════════════════════════════════════════════ */}
      <section className="lp-cta">
        <div className="lp-cta-bg" />
        <div className="lp-cta-content">
          <div className="lp-cta-icon">§</div>
          <h2 className="lp-cta-title">Gotowy do analizy?</h2>
          <p className="lp-cta-sub">
            Wpisz numer działki lub wgraj CSV z listą działek i otrzymaj kompletny raport KSWS (R1–R5).
          </p>
          <div className="lp-cta-actions">
            <button className="lp-btn lp-btn-white" onClick={() => navigate("/kalkulator/analiza")}>
              <span>⚡</span> Analizuj działkę teraz
            </button>
            <button className="lp-btn lp-btn-ghost" onClick={() => navigate("/kalkulator/batch")}>
              <span>📋</span> Batch — wgraj CSV
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
