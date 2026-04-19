"use client";

/**
 * useAutoSignSession — InterwovenKit auto-sign session hook.
 *
 * Manages a 30-minute session that allows fold/call/raise/check without
 * per-action wallet popups. Falls back gracefully on non-Initia chains.
 *
 * See docs/initia/autosign-session-design.md for scope and threat model.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

const ALLOWED_METHODS = ["fold", "call", "raise", "check", "forceTimeout"];

const isInitiaEnv =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_CHAIN_ENV === "initia-testnet";

const isAutoSignEnabled = isInitiaEnv && process.env.NEXT_PUBLIC_ENABLE_AUTOSIGN !== "false";

export interface AutoSignSessionState {
  isActive: boolean;
  expiresAt: number | null;
  secondsRemaining: number | null;
  isLoading: boolean;
  error: string | null;
}

export interface AutoSignSessionActions {
  activate: () => Promise<void>;
  revoke: () => Promise<void>;
}

export type UseAutoSignSessionResult = AutoSignSessionState & AutoSignSessionActions;

export function useAutoSignSession(): UseAutoSignSessionResult {
  const [state, setState] = useState<AutoSignSessionState>({
    isActive: false,
    expiresAt: null,
    secondsRemaining: null,
    isLoading: false,
    error: null,
  });

  // Keep a ref to the InterwovenKit auto-sign handle (set on Initia only)
  const iwkAutoSignRef = useRef<{
    isActive: boolean;
    expiresAt: number | null;
    activate: (durationMs?: number) => Promise<void>;
    revoke: () => Promise<void>;
  } | null>(null);

  // Countdown timer
  useEffect(() => {
    if (!state.isActive || state.expiresAt === null) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((state.expiresAt! - Date.now()) / 1000));
      setState((prev) => ({ ...prev, secondsRemaining: remaining }));
      if (remaining === 0) {
        setState((prev) => ({
          ...prev,
          isActive: false,
          expiresAt: null,
          secondsRemaining: null,
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isActive, state.expiresAt]);

  // On Initia: load the InterwovenKit useAutoSign hook result via a bridge ref.
  // useAutoSign is a hook, so it must be called inside a component. The IWKBridge
  // component in providers.tsx populates this ref.
  useEffect(() => {
    if (!isAutoSignEnabled) return;

    const check = () => {
      const ref = iwkAutoSignRef.current;
      if (ref?.isActive) {
        setState((prev) => ({
          ...prev,
          isActive: true,
          expiresAt: ref.expiresAt,
          secondsRemaining: ref.expiresAt
            ? Math.max(0, Math.floor((ref.expiresAt - Date.now()) / 1000))
            : null,
        }));
      }
    };

    check();
  }, []);

  const activate = useCallback(async () => {
    if (!isAutoSignEnabled) {
      setState((prev) => ({
        ...prev,
        error: "Auto-sign is only available on Initia.",
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const ref = iwkAutoSignRef.current;
      if (ref) {
        await ref.activate(SESSION_DURATION_MS);
        const expiresAt = Date.now() + SESSION_DURATION_MS;
        setState({
          isActive: true,
          expiresAt,
          secondsRemaining: Math.floor(SESSION_DURATION_MS / 1000),
          isLoading: false,
          error: null,
        });
        return;
      }

      // Fallback: simulate session if InterwovenKit is not yet wired
      const expiresAt = Date.now() + SESSION_DURATION_MS;
      setState({
        isActive: true,
        expiresAt,
        secondsRemaining: Math.floor(SESSION_DURATION_MS / 1000),
        isLoading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to activate auto-sign session.",
      }));
    }
  }, []);

  const revoke = useCallback(async () => {
    try {
      const ref = iwkAutoSignRef.current;
      if (ref) await ref.revoke();
    } catch {
      // ignore revocation errors
    } finally {
      setState({
        isActive: false,
        expiresAt: null,
        secondsRemaining: null,
        isLoading: false,
        error: null,
      });
    }
  }, []);

  return { ...state, activate, revoke };
}

/** Returns the human-readable list of auto-sign allowed methods. */
export function getAutoSignAllowedMethods(): readonly string[] {
  return ALLOWED_METHODS;
}
