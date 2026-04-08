"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
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
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback((type: ToastType, message: string) => {
    const id = ++nextId;
    setToasts((prev) => {
      const updated = [...prev, { id, type, message }];
      return updated.slice(-3); // max 3
    });
    if (type !== "error") {
      setTimeout(() => dismiss(id), 5000);
    }
  }, [dismiss]);

  const success = useCallback((msg: string) => add("success", msg), [add]);
  const error = useCallback((msg: string) => add("error", msg), [add]);
  const info = useCallback((msg: string) => add("info", msg), [add]);

  const EXPLORER = process.env.NEXT_PUBLIC_BLOCK_EXPLORER || "https://testnet-explorer.hsk.xyz";

  return (
    <ToastContext.Provider value={{ success, error, info }}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: "1rem",
          right: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          zIndex: 9999,
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
              animation: "toast-in 0.25s ease-out",
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
                flexShrink: 0,
              }}
              aria-label="Dismiss"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
