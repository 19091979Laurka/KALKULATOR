import React, { Fragment } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import KalkulatorPage from "./KalkulatorPage";
import BatchAnalysisPage from "./BatchAnalysisPage.jsx";
import BatchHistoryPage from "./BatchHistoryPage.jsx";
import LandingPage from "./LandingPage.jsx";
import ClientsPage from "./ClientsPage.jsx";
import WzoryPage from "./WzoryPage.jsx";

const Kalkulator = () => {
  return (
    <Fragment>
      <Routes>
        <Route path="home"    element={<LandingPage />} />
        <Route path="analiza" element={<KalkulatorPage />} />
        <Route path="batch"   element={<BatchAnalysisPage />} />
        <Route path="historia" element={<BatchHistoryPage />} />
        <Route path="klienci" element={<ClientsPage />} />
        <Route path="wzory"   element={<WzoryPage />} />
        <Route path="*"       element={<Navigate to="/kalkulator/home" replace />} />
      </Routes>
    </Fragment>
  );
};

export default Kalkulator;
