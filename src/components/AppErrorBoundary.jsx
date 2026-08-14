import { Component } from "react";

import { reportAppError } from "../lib/errorReporter.js";

export class AppErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    void reportAppError({
      error,
      source: "react",
      action: "render",
      screen: window.location.pathname,
      componentStack: info.componentStack,
    });
  }

  reset = () => {
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main role="alert" style={{ minHeight: "100vh", background: "#0F0F1A", color: "#F0F0FF", display: "grid", placeItems: "center", padding: 24, fontFamily: "'Nunito', sans-serif" }}>
        <div style={{ width: "100%", maxWidth: 430, textAlign: "center" }}>
          <div aria-hidden="true" style={{ fontSize: 44, marginBottom: 12 }}>!</div>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Algo nao saiu como esperado</h1>
          <p style={{ color: "#9090B0", fontSize: 14, lineHeight: 1.5, margin: "0 0 22px" }}>
            A falha foi identificada. Tente abrir a tela novamente.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button type="button" onClick={this.reset} style={{ padding: "11px 18px", border: 0, borderRadius: 8, background: "#FF6B35", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Tentar novamente</button>
            <button type="button" onClick={() => window.location.reload()} style={{ padding: "11px 18px", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 8, background: "transparent", color: "#F0F0FF", fontWeight: 800, cursor: "pointer" }}>Recarregar</button>
          </div>
        </div>
      </main>
    );
  }
}
