import React, { Fragment } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LayoutWrapper from "../../Layout/LayoutWrapper";
import KalkulatorPage from "./KalkulatorPage";
import BatchAnalysisPage from "./BatchAnalysisPage.jsx";
import LandingPage from "./LandingPage.jsx";
import ClientsPage from "./ClientsPage.jsx";
import WzoryPage from "./WzoryPage.jsx";

const Kalkulator = () => {
  return (
    <Fragment>
      <LayoutWrapper>
        <Routes>
          <Route path="home"    element={<LandingPage />} />
          <Route path="analiza" element={<KalkulatorPage />} />
          <Route path="batch"   element={<BatchAnalysisPage />} />
          <Route path="klienci" element={<ClientsPage />} />
          <Route path="wzory"   element={<WzoryPage />} />
          <Route path="*"       element={<Navigate to="home" replace />} />
        </Routes>
      </LayoutWrapper>
    </Fragment>
  );
};

export default Kalkulator;
