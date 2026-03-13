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

  // Kolejność: 1 Strona główna, 2 CRM, 3 Wzory, 4 Analiza działki, 5 Historia analiz, 6 Analiza hurtowa, 7 Historia raportów
  const getActiveNav = () => {
    // We are using HashRouter. The actual path is in location.pathname.
    // e.g. /kalkulator/historia-analiz
    
    const path = location.pathname;
    
    if (path === "/kalkulator/home")          return "home";
    if (path === "/kalkulator/klienci")       return "crm";
    if (path === "/kalkulator/wzory")          return "wzory";
    if (path === "/kalkulator/analiza") return "analiza";
    if (path === "/kalkulator/historia-analiz") return "historia-analiz";
    if (path === "/kalkulator/batch")         return "batch";
    if (path === "/kalkulator/historia")       return "historia"; // Historia raportów (batch)
    
    // Default fallback
    return "home";
  };

  const activeNav = getActiveNav();

  const navItems = [
    { id: "home",            label: "Strona główna",     icon: "🏠",  path: "/kalkulator/home" },
    { id: "crm",             label: "CRM",               icon: "👥",  path: "/kalkulator/klienci", title: "Client Case Dashboard" },
    { id: "wzory",           label: "Wzory dokumentów", icon: "📝",  path: "/kalkulator/wzory" },
    { id: "analiza",         label: "Analiza działki",   icon: "⚡",  path: "/kalkulator/analiza", title: "Formularz → raport + mapa (podgląd); PDF lub Archiwum; po wyjściu zeruje się" },
    { id: "historia-analiz", label: "Historia analiz",   icon: "📋",  path: "/kalkulator/historia-analiz", title: "Lista analiz pojedynczych (oznaczona)" },
    { id: "batch",           label: "Analiza hurtowa",   icon: "📊",  path: "/kalkulator/batch", title: "CSV → raporty zbiorcze (podgląd), potem trafiają do Historii raportów" },
    { id: "historia",        label: "Historia raportów", icon: "🗂️",  path: "/kalkulator/historia", title: "Oferty Hurtowe — Historia CSV" },
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
          {navItems.map((item) => (
            <div
              key={item.id}
              className={`ksws-sidebar-nav-item${activeNav === item.id ? " active" : ""}`}
              onClick={() => navigate(item.path)}
              style={{ cursor: "pointer" }}
              title={item.title || item.label}
            >
              <span className="ksws-sidebar-nav-icon">{item.icon}</span>
              {item.label}
            </div>
          ))}
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
