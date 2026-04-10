"use client";
import { useEffect } from "react";

/**
 * PD-F5: Prevents body scroll when a modal/overlay is open.
 * Uses a ref-count so multiple overlays stacking don't fight each other.
 */
let lockCount = 0;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    lockCount++;
    if (lockCount === 1) {
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
    }

    return () => {
      lockCount--;
      if (lockCount === 0) {
        const top = document.body.style.top;
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        if (top) {
          window.scrollTo(0, parseInt(top || "0") * -1);
        }
      }
    };
  }, [active]);
}
