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

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

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
  const confirmRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Store the element that triggered the dialog
    prevFocusRef.current = document.activeElement as HTMLElement | null;

    // Set initial focus: Confirm for danger, Cancel otherwise
    const target = danger ? confirmRef.current : cancelRef.current;
    target?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      // Restore focus to trigger element when dialog closes
      prevFocusRef.current?.focus();
    };
  }, [open, onCancel, danger]);

  if (!open) return null;

  return (
    <div
      role={danger ? "alertdialog" : "dialog"}
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
        ref={containerRef}
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
            ref={confirmRef}
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
