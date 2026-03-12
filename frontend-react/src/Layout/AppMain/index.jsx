import { Routes, Route, Navigate } from "react-router-dom";
import React, { Suspense, lazy, Fragment } from "react";
import Loader from "react-loaders";
import { ToastContainer } from "react-toastify";

const Kalkulator = lazy(() => import("../../DemoPages/Kalkulator"));

const AppMain = () => {
    return (
        <Fragment>
            <Routes>
                <Route path="/kalkulator/*" element={
                    <Suspense fallback={
                        <div className="loader-container">
                            <div className="loader-container-inner">
                                <div className="text-center">
                                    <Loader type="ball-pulse-rise"/>
                                </div>
                                <h6 className="mt-5">Ładowanie Kalkulatora…</h6>
                            </div>
                        </div>
                    }>
                        <Kalkulator />
                    </Suspense>
                } />
                <Route path="*" element={<Navigate to="/kalkulator/home" replace />} />
            </Routes>
            <ToastContainer/>
        </Fragment>
    )
};

export default AppMain;
