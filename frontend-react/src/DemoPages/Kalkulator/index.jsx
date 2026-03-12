import React, { Fragment } from "react";
import { Routes, Route } from "react-router-dom";
import KalkulatorPage from "./KalkulatorPage";
import BatchAnalysisPage from "./BatchAnalysisPage.jsx";

const Kalkulator = () => {
  return (
    <Fragment>
      <Routes>
        <Route path="analiza" element={<KalkulatorPage />} />
        <Route path="batch" element={<BatchAnalysisPage />} />
      </Routes>
    </Fragment>
  );
};

export default Kalkulator;
