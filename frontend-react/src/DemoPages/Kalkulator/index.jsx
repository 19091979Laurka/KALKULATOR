import React, { Fragment } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import KalkulatorPage from "./KalkulatorPage";
import BatchAnalysisPage from "./BatchAnalysisPage.jsx";
import BatchHistoryPage from "./BatchHistoryPage.jsx";
import HistoriaAnalizPage from "./HistoriaAnalizPage.jsx";
import LandingPage from "./LandingPage.jsx";
import ClientsPage from "./ClientsPage.jsx";
import WzoryPage from "./WzoryPage.jsx";
import KalkulatorLayout from "./KalkulatorLayout.jsx";
import PrintPreviewPage from "./PrintPreviewPage.jsx";
import ErrorBoundaryKalkulator from "./ErrorBoundaryKalkulator.jsx";

/**
 * Logika zakładek i przepływ: docs/KALKULATOR_PRZEPLYW_ZAKLADEK.md
 * - Jedna działka: Analiza działki → (localStorage) → Historia analiz → raport-druk
 * - Wiele działek: Analiza hurtowa → (backend) → Historia raportów → raport-druk
 */
const Kalkulator = () => {
  return (
    <Fragment>
      <Routes>
        {/* Widok do druku bez sidebarów */}
        <Route path="raport-druk" element={<PrintPreviewPage />} />

        {/* KalkulatorPage ma własny sidebar, ale my go wyrzuciliśmy i dodaliśmy KalkulatorLayout */}
        <Route path="analiza"  element={<KalkulatorLayout><ErrorBoundaryKalkulator><KalkulatorPage /></ErrorBoundaryKalkulator></KalkulatorLayout>} />

        {/* Layout (strona główna, batch, historia): Analiza działki | Batch CSV | Historia zbiorcza */}
        <Route path="home"     element={<KalkulatorLayout><LandingPage /></KalkulatorLayout>} />
        <Route path="historia-analiz" element={<KalkulatorLayout><HistoriaAnalizPage /></KalkulatorLayout>} />
        <Route path="batch"    element={<KalkulatorLayout><BatchAnalysisPage /></KalkulatorLayout>} />
        <Route path="historia" element={<KalkulatorLayout><BatchHistoryPage /></KalkulatorLayout>} />
        <Route path="klienci"  element={<KalkulatorLayout><ClientsPage /></KalkulatorLayout>} />
        <Route path="wzory"    element={<KalkulatorLayout><WzoryPage /></KalkulatorLayout>} />

        <Route path="*"        element={<Navigate to="/kalkulator/home" replace />} />
      </Routes>
    </Fragment>
  );
};

export default Kalkulator;
