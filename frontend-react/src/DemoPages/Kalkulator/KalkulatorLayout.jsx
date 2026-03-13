import React, { useState } from "react";
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
    if (location.pathname.includes("analiza")) return "analiza";
    if (location.pathname.includes("batch")) return "batch";
    if (location.pathname.includes("historia")) return "historia";
    if (location.pathname.includes("klienci")) return "klienci";
    if (location.pathname.includes("wzory")) return "wzory";
    return "analiza";
  };

  const activeNav = getActiveNav();

  const navItems = [
    { id: "analiza", label: "Analiza działki", icon: "🏠", path: "/kalkulator/analiza" },
    { id: "historia", label: "Historia analiz", icon: "📋", path: "/kalkulator/historia" },
    { id: "batch", label: "Batch CSV", icon: "📄", path: "/kalkulator/batch" },
    { id: "klienci", label: "Klienci", icon: "👥", path: "/kalkulator/klienci" },
    { id: "wzory", label: "Wzory dokumentów", icon: "📝", path: "/kalkulator/wzory" },
  ];

  const handleNavClick = (path) => {
    navigate(path);
  };

  return (
    <div style={{ display: "flex", height: "100vh", flexDirection: "column" }}>
      {/* ════════════ SIDEBAR ════════════ */}
      <aside className="ksws-sidebar">
        <div className="ksws-sidebar-header">
          <div style={{ color: "#b8963e", fontWeight: "700", fontSize: "0.72rem", letterSpacing: "0.5px" }}>
            KALKULATOR KSWS
          </div>
          <div>Roszczenia przesyłowe · Track A/B</div>
        </div>

        <nav className="ksws-sidebar-nav">
          {navItems.map((item) => (
            <div
              key={item.id}
              className={`ksws-sidebar-nav-item${activeNav === item.id ? " active" : ""}`}
              onClick={() => handleNavClick(item.path)}
              style={{ cursor: "pointer" }}
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
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
};

export default KalkulatorLayout;
