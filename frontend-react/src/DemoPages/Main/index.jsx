import React, { Fragment } from "react";
import { connect } from "react-redux";

import AppMain from "../../Layout/AppMain";

// Czysty layout - bez ArchitectUI footera, userboxa, theme options
const Main = () => {
  return (
    <Fragment>
      <div className="ksws-app">
        <AppMain />
      </div>
    </Fragment>
  );
};

export default connect()(Main);
