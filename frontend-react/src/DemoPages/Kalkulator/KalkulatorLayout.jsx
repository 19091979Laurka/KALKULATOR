import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./KalkulatorPage.css";

/**
 * ════════════════════════════════════════════════════════════════
 * UNIFIED KALKULATOR LAYOUT - Purple sidebar + mobile hamburger
 * ════════════════════════════════════════════════════════════════
 */

const KalkulatorLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Close menu on ESC key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") setMobileMenuOpen(false); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

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

  const mainNavItems = [
    { id: "analiza",  label: "Analiza działki",   icon: "⚡",  path: "/kalkulator/analiza", title: "Pojedyncza działka · formularz i mapa" },
    { id: "batch",    label: "Batch CSV",         icon: "📊", path: "/kalkulator/batch",   title: "Analiza zbiorcza · wgraj CSV" },
    { id: "historia", label: "Historia zbiorcza",  icon: "📋", path: "/kalkulator/historia", title: "Raporty batch · otwórz raport z mapami" },
  ];

  const mgmtNavItems = [
    { id: "klienci", label: "Klienci",            icon: "👥", path: "/kalkulator/klienci" },
    { id: "wzory",   label: "Wzory dokumentów",   icon: "📝", path: "/kalkulator/wzory" },
  ];

  const handleNav = (path) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const SidebarContent = () => (
    <>
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
        {mainNavItems.map((item) => (
          <div
            key={item.id}
            className={`ksws-sidebar-nav-item${activeNav === item.id ? " active" : ""}`}
            onClick={() => handleNav(item.path)}
            style={{ cursor: "pointer" }}
            title={item.title}
          >
            <span className="ksws-sidebar-nav-icon">{item.icon}</span>
            {item.label}
          </div>
        ))}

        <div style={{ margin: "8px 16px", borderTop: "1px solid rgba(255,255,255,0.1)" }} />

        {mgmtNavItems.map((item) => (
          <div
            key={item.id}
            className={`ksws-sidebar-nav-item${activeNav === item.id ? " active" : ""}`}
            onClick={() => handleNav(item.path)}
            style={{ cursor: "pointer" }}
          >
            <span className="ksws-sidebar-nav-icon">{item.icon}</span>
            {item.label}
          </div>
        ))}

        <div style={{ margin: "8px 16px", borderTop: "1px solid rgba(255,255,255,0.1)" }} />

        <div
          className={`ksws-sidebar-nav-item${activeNav === "home" ? " active" : ""}`}
          onClick={() => handleNav("/kalkulator/home")}
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
    </>
  );

  return (
    <div className="ksws-layout">

      {/* ════════════ MOBILE TOP BAR ════════════ */}
      <div className="ksws-mobile-topbar">
        <button
          className="ksws-hamburger"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Otwórz menu"
          aria-expanded={mobileMenuOpen}
        >
          <span className={`ksws-hamburger-line${mobileMenuOpen ? " open" : ""}`} />
          <span className={`ksws-hamburger-line${mobileMenuOpen ? " open" : ""}`} />
          <span className={`ksws-hamburger-line${mobileMenuOpen ? " open" : ""}`} />
        </button>
        <div className="ksws-mobile-topbar-logo">
          <span className="ksws-mobile-topbar-symbol">§</span>
          <span className="ksws-mobile-topbar-title">SZUWARA KSWS</span>
        </div>
        <div className="ksws-mobile-topbar-active">
          {mainNavItems.find(i => i.id === activeNav)?.icon ||
           mgmtNavItems.find(i => i.id === activeNav)?.icon || "🏠"}
          {" "}
          {mainNavItems.find(i => i.id === activeNav)?.label ||
           mgmtNavItems.find(i => i.id === activeNav)?.label ||
           "Strona główna"}
        </div>
      </div>

      {/* ════════════ MOBILE OVERLAY ════════════ */}
      {mobileMenuOpen && (
        <div
          className="ksws-mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ════════════ SIDEBAR (desktop) + DRAWER (mobile) ════════════ */}
      <aside className={`ksws-sidebar${mobileMenuOpen ? " ksws-sidebar--open" : ""}`}>
        {/* Mobile close button */}
        <button
          className="ksws-sidebar-close"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Zamknij menu"
        >
          ✕
        </button>
        <SidebarContent />
      </aside>

      {/* ════════════ CONTENT ════════════ */}
      <div className="ksws-content">
        {children}
      </div>
    </div>
  );
};

export default KalkulatorLayout;
