"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  /** When true, tooltip content has interactive links — pointer events are enabled */
  interactive?: boolean;
}

export function Tooltip({ text, children, interactive = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [openBelow, setOpenBelow] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoClose = useCallback(() => {
    if (autoCloseRef.current !== null) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    clearAutoClose();
  }, [clearAutoClose]);

  // Check viewport boundary after tooltip becomes visible
  useEffect(() => {
    if (!visible || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // If less than 80px above container, show below
    setOpenBelow(rect.top < 80);
  }, [visible]);

  // Cleanup auto-close timer on unmount
  useEffect(() => () => clearAutoClose(), [clearAutoClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault(); // prevent ghost click
    if (visible) {
      close();
    } else {
      setVisible(true);
      // Auto-close after 5 seconds on touch
      clearAutoClose();
      autoCloseRef.current = setTimeout(close, 5000);
    }
  };

  const tooltipStyle: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 100,
    background: "rgba(12, 13, 28, 0.97)",
    border: "1px solid var(--card-border)",
    borderRadius: "8px",
    padding: "0.4rem 0.65rem",
    fontSize: "0.74rem",
    color: "var(--foreground)",
    maxWidth: "220px",
    whiteSpace: "normal" as React.CSSProperties["whiteSpace"],
    textAlign: "center",
    pointerEvents: interactive ? "auto" : "none",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    ...(openBelow
      ? { top: "calc(100% + 0.4rem)" }
      : { bottom: "calc(100% + 0.4rem)" }),
  };

  return (
    <span
      ref={containerRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", cursor: "help" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={close}
      onFocus={() => setVisible(true)}
      onBlur={close}
      onTouchStart={handleTouchStart}
      tabIndex={0}
      role="button"
      aria-describedby={visible ? "tooltip-content" : undefined}
    >
      {children}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "0.9rem",
          height: "0.9rem",
          borderRadius: "999px",
          border: "1px solid var(--muted)",
          color: "var(--muted)",
          fontSize: "0.6rem",
          fontWeight: 700,
          marginLeft: "0.25rem",
          verticalAlign: "middle",
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        ?
      </span>
      {visible && (
        <span
          ref={tooltipRef}
          id="tooltip-content"
          role="tooltip"
          style={tooltipStyle}
        >
          {text}
        </span>
      )}
    </span>
  );
}
