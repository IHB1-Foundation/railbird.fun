"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  /** Label shown in the fallback header (e.g. "Trading Widget"). */
  label?: string;
  children: ReactNode;
  /** Optional custom fallback to render instead of the default. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Reusable React error boundary.  Catches render-time errors in its subtree
 * and shows a labelled fallback with a retry button.  A crash in one
 * boundary does not propagate to sibling trees.
 *
 * Usage (server or client parent):
 *   <ErrorBoundary label="Trading Widget">
 *     <NadFunTradingWidget ... />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.label ?? "unknown"}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    const { label = "Component", fallback, children } = this.props;

    if (error) {
      if (fallback) return fallback(error, this.reset);

      return (
        <div
          role="alert"
          style={{
            padding: "1rem",
            borderRadius: "8px",
            border: "1px solid rgba(248,113,113,0.3)",
            background: "rgba(248,113,113,0.07)",
            color: "#fca5a5",
            fontSize: "0.875rem",
          }}
        >
          <strong>{label} failed to render.</strong>
          <p style={{ margin: "0.4rem 0 0.8rem", opacity: 0.8 }}>{error.message}</p>
          <button
            type="button"
            onClick={this.reset}
            style={{
              padding: "0.3rem 0.9rem",
              borderRadius: "6px",
              border: "1px solid rgba(248,113,113,0.4)",
              background: "transparent",
              color: "#fca5a5",
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return children;
  }
}
