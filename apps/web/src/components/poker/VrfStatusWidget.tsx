"use client";

import styles from "./VrfStatusWidget.module.css";

export function VrfStatusWidget({ street }: { street: string }) {
  return (
    <div
      className={styles.vrfStatusWidget}
      role="status"
      aria-live="polite"
      aria-label={`Waiting for VRF randomness for ${street}`}
    >
      <span className={styles.vrfSpinner} aria-hidden="true" />
      <span className={styles.vrfLabel}>Waiting for VRF ({street})</span>
    </div>
  );
}
