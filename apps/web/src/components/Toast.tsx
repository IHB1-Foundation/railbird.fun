"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type ToastType = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  action?: ToastAction;
  exiting?: boolean;
}

interface ToastContextValue {
  success: (message: string, action?: ToastAction) => void;
  error: (message: string, action?: ToastAction) => void;
  info: (message: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    // Set exiting state, then remove after animation
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 260);
  }, []);

  const add = useCallback((type: ToastType, message: string, action?: ToastAction) => {
    const id = ++nextId;
    setToasts((prev) => {
      const updated = [...prev, { id, type, message, action, exiting: false }];
      return updated.slice(-3); // max 3
    });
    // Error toasts without actions auto-dismiss; with actions stay until dismissed
    if (type !== "error" && !action) {
      setTimeout(() => dismiss(id), 5000);
    } else if (type !== "error" && action) {
      setTimeout(() => dismiss(id), 8000);
    }
  }, [dismiss]);

  const success = useCallback((msg: string, action?: ToastAction) => add("success", msg, action), [add]);
  const error = useCallback((msg: string, action?: ToastAction) => add("error", msg, action), [add]);
  const info = useCallback((msg: string, action?: ToastAction) => add("info", msg, action), [add]);

  const EXPLORER = process.env.NEXT_PUBLIC_BLOCK_EXPLORER || "https://testnet-explorer.hsk.xyz";

  const srStyle: React.CSSProperties = {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: 0,
  };

  const errorToasts = toasts.filter((t) => t.type === "error");
  const otherToasts = toasts.filter((t) => t.type !== "error");

  return (
    <ToastContext.Provider value={{ success, error, info }}>
      {children}
      {/* Screen-reader live regions */}
      <div aria-live="assertive" aria-atomic="true" style={srStyle}>
        {errorToasts.map((t) => t.message).join(" ")}
      </div>
      <div aria-live="polite" aria-atomic="true" style={srStyle}>
        {otherToasts.map((t) => t.message).join(" ")}
      </div>
      <div
        role="status"
        aria-label="Notifications"
        style={{
          position: "fixed",
          /* PD-H6: safe-area-inset for iPhone notch/home indicator */
          bottom: "max(1rem, env(safe-area-inset-bottom))",
          right: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          /* PD-H6: use --z-toast token (300) via inline var reference */
          zIndex: "var(--z-toast)" as unknown as number,
          maxWidth: "360px",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: "0.65rem 0.85rem",
              borderRadius: "10px",
              fontSize: "0.82rem",
              lineHeight: 1.4,
              color: "#fff",
              background:
                t.type === "success"
                  ? "rgba(22, 101, 52, 0.92)"
                  : t.type === "error"
                  ? "rgba(127, 29, 29, 0.92)"
                  : "rgba(30, 58, 138, 0.92)",
              border: `1px solid ${
                t.type === "success"
                  ? "rgba(74, 222, 128, 0.4)"
                  : t.type === "error"
                  ? "rgba(248, 113, 113, 0.4)"
                  : "rgba(96, 165, 250, 0.4)"
              }`,
              backdropFilter: "blur(8px)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              animation: t.exiting ? "toast-out 0.25s ease-in forwards" : "toast-in 0.25s ease-out",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "0.5rem",
              wordBreak: "break-word",
            }}
          >
            <span
              dangerouslySetInnerHTML={{
                __html: t.message.replace(
                  /tx=(0x[a-fA-F0-9]+)/g,
                  `tx=<a href="${EXPLORER}/tx/$1" target="_blank" rel="noopener" style="color:#93c5fd;text-decoration:underline">$1</a>`
                ),
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
              {t.action && (
                <button
                  onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    padding: "0.2rem 0.55rem",
                    borderRadius: "6px",
                    whiteSpace: "nowrap",
                  }}
                  aria-label={t.action.label}
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.6)",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  padding: 0,
                  lineHeight: 1,
                }}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
