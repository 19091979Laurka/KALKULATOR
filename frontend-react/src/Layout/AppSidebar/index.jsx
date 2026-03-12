import React, { Component, Fragment } from "react";
import { connect } from "react-redux";
import cx from "classnames";

import Nav from "../AppNav/VerticalNavWrapper";

import { CSSTransition, TransitionGroup } from '../../utils/TransitionWrapper';

import PerfectScrollbar from "react-perfect-scrollbar";
import HeaderLogo from "../AppLogo";

import { setEnableMobileMenu } from "../../reducers/ThemeOptions";

class AppSidebar extends Component {
  state = {
    items: [
      { id: 1, text: 'Buy eggs' },
    ],
    darkMode: localStorage.getItem('ksws-dark-mode') === 'true' || false
  };

  componentDidMount() {
    // Apply dark mode on mount if enabled
    if (this.state.darkMode) {
      document.documentElement.classList.add('dark-theme');
    }
  }

  toggleMobileSidebar = () => {
    let { enableMobileMenu, setEnableMobileMenu } = this.props;
    setEnableMobileMenu(!enableMobileMenu);
  };

  toggleDarkMode = () => {
    const newDarkMode = !this.state.darkMode;
    this.setState({ darkMode: newDarkMode });

    // Persist to localStorage
    localStorage.setItem('ksws-dark-mode', newDarkMode);

    // Apply/remove dark-theme class
    if (newDarkMode) {
      document.documentElement.classList.add('dark-theme');
    } else {
      document.documentElement.classList.remove('dark-theme');
    }
  };

  render() {
    let {
      backgroundColor,
      enableBackgroundImage,
      enableSidebarShadow,
      backgroundImage,
      backgroundImageOpacity,
    } = this.props;

    const { darkMode } = this.state;

    return (
      <Fragment>
        <div className="sidebar-mobile-overlay" onClick={this.toggleMobileSidebar}/>
        <TransitionGroup>
          <CSSTransition component="div"
            className={cx("app-sidebar", backgroundColor, {
              "sidebar-shadow": enableSidebarShadow,
            })}
             appear={true} enter={false} exit={false} timeout={500}>
            <div>
              <HeaderLogo />
              <PerfectScrollbar>
                <div className="app-sidebar__inner">
                  <Nav />
                </div>
              </PerfectScrollbar>

              {/* Dark/Light Mode Toggle */}
              <div style={{
                padding: '15px 1.5rem',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                backgroundColor: 'var(--bg-secondary)',
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  margin: 0,
                  color: 'var(--text-secondary)',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  userSelect: 'none',
                  flex: 1,
                }}>
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={this.toggleDarkMode}
                    style={{
                      cursor: 'pointer',
                      width: '16px',
                      height: '16px',
                      accentColor: 'var(--accent-cyan)',
                    }}
                  />
                  <span>{darkMode ? '🌙 Dark' : '☀️ Light'}</span>
                </label>
              </div>

              <div className={cx("app-sidebar-bg", backgroundImageOpacity)}
                style={{
                  backgroundImage: enableBackgroundImage
                    ? "url(" + backgroundImage + ")"
                    : null,
                }}>
              </div>
            </div>
          </CSSTransition>
        </TransitionGroup>
      </Fragment>
    );
  }
}

const mapStateToProps = (state) => ({
  enableBackgroundImage: state.ThemeOptions.enableBackgroundImage,
  enableSidebarShadow: state.ThemeOptions.enableSidebarShadow,
  enableMobileMenu: state.ThemeOptions.enableMobileMenu,
  backgroundColor: state.ThemeOptions.backgroundColor,
  backgroundImage: state.ThemeOptions.backgroundImage,
  backgroundImageOpacity: state.ThemeOptions.backgroundImageOpacity,
});

const mapDispatchToProps = (dispatch) => ({
  setEnableMobileMenu: (enable) => dispatch(setEnableMobileMenu(enable)),
});

export default connect(mapStateToProps, mapDispatchToProps)(AppSidebar);
