"use client";

import { useState } from "react";
import styles from "./VrfStatusWidget.module.css";

export function VrfStatusWidget({ street }: { street: string }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={styles.vrfStatusWidget}
      role="status"
      aria-live="polite"
      aria-label={`Shuffling cards for ${street} — using blockchain randomness (VRF)`}
    >
      <span className={styles.vrfSpinner} aria-hidden="true" />
      <div className={styles.vrfContent}>
        <span className={styles.vrfLabel}>Shuffling cards...</span>
        <span className={styles.vrfSubtext}>
          Verified by blockchain randomness (VRF)
          {" "}
          <button
            type="button"
            className={styles.vrfInfoBtn}
            onClick={() => setShowTooltip((v) => !v)}
            aria-expanded={showTooltip}
            aria-label="More information about VRF"
          >
            ?
          </button>
        </span>
        <span className={styles.vrfEstimate}>Usually takes 5–15 seconds</span>
        {showTooltip && (
          <div className={styles.vrfTooltip} role="tooltip">
            VRF (Verifiable Random Function) ensures cards are dealt fairly using tamper-proof randomness that cannot be manipulated by any party.
          </div>
        )}
      </div>
    </div>
  );
}
