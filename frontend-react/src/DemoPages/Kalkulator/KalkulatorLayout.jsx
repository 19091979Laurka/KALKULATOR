import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./KalkulatorPage.css";

/**
 * ════════════════════════════════════════════════════════════════
 * UNIFIED KALKULATOR LAYOUT - Purple sidebar on all pages
 * Mobile: topbar + hamburger → drawer
 * ════════════════════════════════════════════════════════════════
 */

const KalkulatorLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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

  const activeLabel = navItems.find((i) => i.id === activeNav)?.label || "Menu";
  const closeMobileSidebar = () => setMobileSidebarOpen(false);
  const goTo = (path) => {
    navigate(path);
    closeMobileSidebar();
  };

  return (
    <div className="ksws-layout">
      {/* ════════════ MOBILE TOPBAR (hamburger + logo) ════════════ */}
      <header className="ksws-mobile-topbar">
        <div className="ksws-mobile-topbar-logo">
          <img src="/logo_szuwara_baner.png" alt="SZUWARA" className="ksws-mobile-topbar-img" />
          <div>
            <div className="ksws-mobile-topbar-title">Kalkulator Roszczeń Przesyłowych</div>
            <div className="ksws-mobile-topbar-active">{activeLabel}</div>
          </div>
        </div>
        <button
          type="button"
          className="ksws-hamburger"
          onClick={() => setMobileSidebarOpen((v) => !v)}
          aria-label="Otwórz menu"
        >
          <span className={`ksws-hamburger-line ${mobileSidebarOpen ? "open" : ""}`} />
          <span className={`ksws-hamburger-line ${mobileSidebarOpen ? "open" : ""}`} />
          <span className={`ksws-hamburger-line ${mobileSidebarOpen ? "open" : ""}`} />
        </button>
      </header>

      {/* ════════════ OVERLAY (mobile, zamyka drawer) ════════════ */}
      {mobileSidebarOpen && (
        <div
          className="ksws-mobile-overlay"
          role="button"
          tabIndex={0}
          onClick={closeMobileSidebar}
          onKeyDown={(e) => e.key === "Escape" && closeMobileSidebar()}
          aria-label="Zamknij menu"
        />
      )}

      {/* ════════════ SIDEBAR ════════════ */}
      <aside className={`ksws-sidebar ${mobileSidebarOpen ? "ksws-sidebar--open" : ""}`}>
        <button
          type="button"
          className="ksws-sidebar-close"
          onClick={closeMobileSidebar}
          aria-label="Zamknij menu"
        >
          ✕
        </button>
        <div className="ksws-sidebar-logo">
          <img src="/logo_szuwara_baner.png" alt="SZUWARA Kancelaria Prawno-Podatkowa" className="ksws-sidebar-logo-img" />
          <div className="ksws-sidebar-app-title">Kalkulator Roszczeń Przesyłowych</div>
        </div>

        <nav className="ksws-sidebar-nav">
          {navItems.map((item) => (
            <div
              key={item.id}
              className={`ksws-sidebar-nav-item${activeNav === item.id ? " active" : ""}`}
              onClick={() => goTo(item.path)}
              style={{ cursor: "pointer" }}
              title={item.title || item.label}
            >
              <span className="ksws-sidebar-nav-icon">{item.icon}</span>
              {item.label}
            </div>
          ))}
        </nav>

        <div className="ksws-sidebar-footer">
          <div className="ksws-sidebar-footer-name">Kancelaria Prawno Podatkowa Rafał Szuwara</div>
          <a href="https://www.kancelaria-szuwara.pl" target="_blank" rel="noopener noreferrer" className="ksws-sidebar-footer-link">www.kancelaria-szuwara.pl</a>
          <a href="tel:500013269" className="ksws-sidebar-footer-link">500 013 269</a>
          <div className="ksws-sidebar-footer-created">Created by Rafał Szuwara</div>
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
