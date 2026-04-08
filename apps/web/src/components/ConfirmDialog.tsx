"use client";

import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(3px)",
        }}
        aria-hidden="true"
      />
      {/* Dialog box */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "linear-gradient(160deg, var(--card-bg), var(--card-bg-strong))",
          border: "1px solid var(--card-border)",
          borderRadius: "16px",
          padding: "1.5rem",
          maxWidth: "360px",
          width: "100%",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <h3 id="confirm-dialog-title" style={{ marginBottom: "0.6rem", fontSize: "var(--text-lg)" }}>
          {title}
        </h3>
        <p style={{ color: "var(--muted)", fontSize: "var(--text-sm)", marginBottom: "1.2rem", lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
          <button
            ref={cancelRef}
            className="btn-ghost ghost-btn"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={danger ? "btn" : "wallet-button"}
            onClick={onConfirm}
            style={danger ? { background: "linear-gradient(135deg, var(--danger), #c0392b)" } : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
