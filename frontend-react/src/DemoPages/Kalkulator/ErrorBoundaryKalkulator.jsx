import React from "react";
import { useNavigate } from "react-router-dom";

/**
 * Łapie błędy w drzewie komponentów (np. KalkulatorPage) i pokazuje fallback zamiast białego ekranu.
 */
class ErrorBoundaryClass extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundaryKalkulator:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          padding: 48,
          maxWidth: 480,
          margin: "40px auto",
          textAlign: "center",
          background: "#fff8f0",
          border: "2px solid #e67e22",
          borderRadius: 12,
        }}>
          <h2 style={{ color: "#c0392b", marginBottom: 12 }}>Coś poszło nie tak</h2>
          <p style={{ color: "#555", marginBottom: 20 }}>
            Strona analizy zgłosiła błąd. Odśwież lub wróć do strony głównej.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 20px",
                background: "#e67e22",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Odśwież stronę
            </button>
            {this.props.navigateToHome ? this.props.navigateToHome() : null}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function NavigateButton({ to, children }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      style={{
        padding: "10px 20px",
        background: "#5c3d8f",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

export default function ErrorBoundaryKalkulator({ children }) {
  return (
    <ErrorBoundaryClass navigateToHome={() => <NavigateButton to="/kalkulator/home">Strona główna</NavigateButton>}>
      {children}
    </ErrorBoundaryClass>
  );
}
