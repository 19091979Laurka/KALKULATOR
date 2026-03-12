import React, { Fragment } from "react";
import { connect } from "react-redux";
import AppHeader from "../AppHeader";
import AppSidebar from "../AppSidebar";
import "./index.css";

const LayoutWrapper = ({ children, enableMobileMenu }) => {
  return (
    <Fragment>
      <div className="ksws-layout-container">
        {/* Fixed Header */}
        <header className="ksws-header">
          <AppHeader />
        </header>

        {/* Main layout: Sidebar + Content */}
        <div className="ksws-main-wrapper">
          {/* Sidebar */}
          <aside className="ksws-sidebar">
            <AppSidebar />
          </aside>

          {/* Content Area */}
          <main className="ksws-content">
            {children}
          </main>
        </div>
      </div>
    </Fragment>
  );
};

const mapStateToProps = (state) => ({
  enableMobileMenu: state.ThemeOptions.enableMobileMenu,
});

export default connect(mapStateToProps)(LayoutWrapper);
