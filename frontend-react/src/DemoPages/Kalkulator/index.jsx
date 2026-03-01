import React, { Fragment } from "react";
import { Routes, Route } from "react-router-dom";
import KalkulatorPage from "./KalkulatorPage";

const Kalkulator = () => (
  <Fragment>
    <Routes>
      <Route path="analiza" element={<KalkulatorPage />} />
    </Routes>
  </Fragment>
);

export default Kalkulator;
