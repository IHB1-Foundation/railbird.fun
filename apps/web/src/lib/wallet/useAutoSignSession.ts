"use client";

/**
 * useAutoSignSession — InterwovenKit auto-sign session hook.
 *
 * Manages a 30-minute Auto-sign session that allows fold/call/raise/check
 * without per-action wallet popups. Reads from the IWKBridge store so it
 * reacts to InterwovenKit state changes without being inside the provider tree.
 *
 * See docs/initia/autosign-session-design.md for scope and threat model.
 */

import { useCallback, useEffect, useState } from "react";
import { getIWKHandle } from "./interwoven";
import { ENABLE_AUTOSIGN as isAutoSignEnabled } from "../featureFlags";

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

const ALLOWED_METHODS = ["fold", "call", "raise", "check", "forceTimeout"];

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

  // Sync state from the real IWK autoSign handle on mount and whenever
  // the IWK chain ID changes (re-renders of IWKBridge update the store).
  useEffect(() => {
    if (!isAutoSignEnabled) return;
    const iwk = getIWKHandle();
    if (!iwk?.autoSign) return;
    const chainId = process.env.NEXT_PUBLIC_INTERWOVEN_CHAIN_ID ?? "";
    const isEnabled = iwk.autoSign.isEnabledByChain[chainId] ?? false;
    const expiredAt = iwk.autoSign.expiredAtByChain[chainId];
    if (isEnabled && expiredAt) {
      const expiresAt = expiredAt.getTime();
      if (expiresAt > Date.now()) {
        setState((prev) => ({
          ...prev,
          isActive: true,
          expiresAt,
          secondsRemaining: Math.floor((expiresAt - Date.now()) / 1000),
        }));
      }
    }
  }, []);

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

  const activate = useCallback(async () => {
    if (!isAutoSignEnabled) {
      setState((prev) => ({ ...prev, error: "Auto-sign is only available on Initia." }));
      return;
    }
    // Check server-side revocation status before activating.
    // A user who revoked on another device must re-consent here too.
    const ownerviewUrl = process.env.NEXT_PUBLIC_OWNERVIEW_URL;
    if (ownerviewUrl) {
      const walletAddress = getIWKHandle()?.hexAddress;
      if (walletAddress) {
        try {
          const res = await fetch(
            `${ownerviewUrl}/session/status?address=${encodeURIComponent(walletAddress)}`,
            { credentials: "include" },
          );
          if (res.ok) {
            const data = (await res.json()) as { isRevoked?: boolean };
            if (data.isRevoked) {
              setState((prev) => ({
                ...prev,
                error: "Your auto-sign session was revoked on another device. Please re-consent.",
              }));
              return;
            }
          }
        } catch {
          // Non-fatal — proceed optimistically if server is unreachable.
        }
      }
    }
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const iwk = getIWKHandle();
      const chainId = process.env.NEXT_PUBLIC_INTERWOVEN_CHAIN_ID ?? "";
      if (iwk?.autoSign) {
        await iwk.autoSign.enable(chainId);
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
      // Fallback: optimistic local session when IWK not yet connected
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
    // Notify server first so revocation is audit-logged even if the tab closes.
    const ownerviewUrl = process.env.NEXT_PUBLIC_OWNERVIEW_URL;
    if (ownerviewUrl) {
      try {
        await fetch(`${ownerviewUrl}/session/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ via: "manual" }),
          credentials: "include",
        });
      } catch {
        // Best-effort — don't block local teardown on server error.
      }
    }
    try {
      const iwk = getIWKHandle();
      const chainId = process.env.NEXT_PUBLIC_INTERWOVEN_CHAIN_ID ?? "";
      if (iwk?.autoSign) await iwk.autoSign.disable(chainId);
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

export function getAutoSignAllowedMethods(): readonly string[] {
  return ALLOWED_METHODS;
}
