import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./KalkulatorPage.css";

/**
 * ════════════════════════════════════════════════════════════════
 * UNIFIED KALKULATOR LAYOUT - Purple sidebar on all pages
 * ════════════════════════════════════════════════════════════════
 */

const KalkulatorLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine active nav based on current route
  const getActiveNav = () => {
    if (location.pathname.includes("analiza"))  return "analiza";
    if (location.pathname.includes("batch"))    return "batch";
    if (location.pathname.includes("historia")) return "historia";
    if (location.pathname.includes("klienci"))  return "klienci";
    if (location.pathname.includes("wzory"))    return "wzory";
    if (location.pathname.includes("home"))     return "home";
    return "analiza";
  };

  const activeNav = getActiveNav();

  // Główne zakładki (Layout = strona główna, batch, historia z backendu)
  // Batch CSV = wgranie pliku + wyniki | Historia zbiorcza = raporty batch z mapami (backend)
  const mainNavItems = [
    { id: "analiza",  label: "Analiza działki",   icon: "⚡",  path: "/kalkulator/analiza", title: "Pojedyncza działka · formularz i mapa" },
    { id: "batch",    label: "Batch CSV",         icon: "📊", path: "/kalkulator/batch",   title: "Analiza zbiorcza · wgraj CSV" },
    { id: "historia", label: "Historia zbiorcza",  icon: "📋", path: "/kalkulator/historia", title: "Raporty batch · otwórz raport z mapami" },
  ];

  // Zakładki zarządzania
  const mgmtNavItems = [
    { id: "klienci", label: "Klienci",            icon: "👥", path: "/kalkulator/klienci" },
    { id: "wzory",   label: "Wzory dokumentów",   icon: "📝", path: "/kalkulator/wzory" },
  ];

  return (
    <div className="ksws-layout">
      {/* ════════════ SIDEBAR ════════════ */}
      <aside className="ksws-sidebar">
        <div className="ksws-sidebar-logo">
          <div className="ksws-sidebar-logo-symbol">§</div>
          <div className="ksws-sidebar-logo-title">SZUWARA</div>
          <div className="ksws-sidebar-logo-sub">Kancelaria Prawno-Podatkowa</div>
          <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(184,150,62,0.2)", fontSize: "0.62rem", color: "rgba(255,255,255,0.35)", lineHeight: "1.7" }}>
            <div style={{ color: "#b8963e", fontWeight: "700", fontSize: "0.72rem", letterSpacing: "0.5px" }}>KALKULATOR KSWS</div>
            <div>Roszczenia przesyłowe · Track A/B</div>
          </div>
        </div>

        <nav className="ksws-sidebar-nav">
          {/* ── Kalkulator ── */}
          {mainNavItems.map((item) => (
            <div
              key={item.id}
              className={`ksws-sidebar-nav-item${activeNav === item.id ? " active" : ""}`}
              onClick={() => navigate(item.path)}
              style={{ cursor: "pointer" }}
              title={item.title}
            >
              <span className="ksws-sidebar-nav-icon">{item.icon}</span>
              {item.label}
            </div>
          ))}

          {/* ── Separator ── */}
          <div style={{ margin: "8px 16px", borderTop: "1px solid rgba(255,255,255,0.1)" }} />

          {/* ── Zarządzanie ── */}
          {mgmtNavItems.map((item) => (
            <div
              key={item.id}
              className={`ksws-sidebar-nav-item${activeNav === item.id ? " active" : ""}`}
              onClick={() => navigate(item.path)}
              style={{ cursor: "pointer" }}
            >
              <span className="ksws-sidebar-nav-icon">{item.icon}</span>
              {item.label}
            </div>
          ))}

          {/* ── Separator ── */}
          <div style={{ margin: "8px 16px", borderTop: "1px solid rgba(255,255,255,0.1)" }} />

          {/* ── Strona główna ── */}
          <div
            className={`ksws-sidebar-nav-item${activeNav === "home" ? " active" : ""}`}
            onClick={() => navigate("/kalkulator/home")}
            style={{ cursor: "pointer", opacity: 0.7 }}
          >
            <span className="ksws-sidebar-nav-icon">🏠</span>
            Strona główna
          </div>
        </nav>

        <div className="ksws-sidebar-footer">
          <div style={{ color: "#b8963e", fontWeight: "700", marginBottom: "4px", fontSize: "0.72rem" }}>
            § SZUWARA
          </div>
          <a
            href="https://www.kancelaria-szuwara.pl"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "inherit", textDecoration: "none", fontSize: "0.75rem" }}
          >
            www.kancelaria-szuwara.pl
          </a>
          <br />
          <a
            href="tel:790411412"
            style={{ color: "inherit", textDecoration: "none", fontSize: "0.75rem" }}
          >
            790 411 412
          </a>
          <br />
          <div style={{ marginTop: "6px", opacity: 0.5, fontSize: "0.7rem" }}>KSWS v3.0 · Track A/B · GUGiK</div>
        </div>
      </aside>

      {/* ════════════ CONTENT ════════════ */}
      <div className="ksws-content">
        {children}
      </div>
    </div>
  );
};

export default KalkulatorLayout;
