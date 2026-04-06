"use client";

export function VrfStatusWidget({ street }: { street: string }) {
  return (
    <div
      className="vrf-status-widget"
      role="status"
      aria-live="polite"
      aria-label={`Waiting for VRF randomness for ${street}`}
    >
      <span className="vrf-spinner" aria-hidden="true" />
      <span className="vrf-label">Waiting for VRF ({street})</span>
    </div>
  );
}
