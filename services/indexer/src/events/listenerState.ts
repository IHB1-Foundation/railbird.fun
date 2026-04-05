/**
 * Module-level event listener health state.
 * Shared between index.ts (which manages the listener lifecycle)
 * and routes.ts (which exposes /api/health).
 */

export type ListenerStatus = "disabled" | "starting" | "running" | "failed";

let _status: ListenerStatus = "disabled";
let _failedAt: string | null = null;
let _failedReason: string | null = null;

export function setListenerStatus(status: ListenerStatus, reason?: string): void {
  _status = status;
  if (status === "failed") {
    _failedAt = new Date().toISOString();
    _failedReason = reason ?? null;
  } else {
    _failedAt = null;
    _failedReason = null;
  }
}

export function getListenerHealth(): {
  status: ListenerStatus;
  failedAt: string | null;
  failedReason: string | null;
} {
  return { status: _status, failedAt: _failedAt, failedReason: _failedReason };
}
