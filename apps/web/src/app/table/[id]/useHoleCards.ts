"use client";

import { useState, useEffect, useRef } from "react";
import type { HoleCardsResponse } from "@/lib/auth";

interface UseHoleCardsResult {
  holeCards: HoleCardsResponse | null;
}

/**
 * Fetches and caches decrypted hole cards for the authenticated owner.
 * The decrypted result is cached per handId so re-encryption / re-fetch are
 * avoided on every WebSocket or polling update while the same hand is active.
 * Cache is cleared automatically when the hand changes or the user disconnects.
 */
export function useHoleCards(
  isAuthenticated: boolean,
  tableId: string,
  handId: string | undefined,
  getHoleCards: (tableId: string, handId: string) => Promise<HoleCardsResponse | null>
): UseHoleCardsResult {
  const [holeCards, setHoleCards] = useState<HoleCardsResponse | null>(null);

  // Per-hand cache: handId → HoleCardsResponse
  const holeCardCache = useRef<Map<string, HoleCardsResponse>>(new Map());
  const lastCachedHandIdRef = useRef<string | null>(null);

  // Clear cache when the user disconnects
  useEffect(() => {
    if (!isAuthenticated) {
      holeCardCache.current.clear();
      lastCachedHandIdRef.current = null;
      setHoleCards(null);
    }
  }, [isAuthenticated]);

  // Fetch hole cards when authenticated and a hand is active.
  useEffect(() => {
    let cancelled = false;

    const fetchHoleCards = async () => {
      if (!isAuthenticated || !handId) {
        setHoleCards(null);
        return;
      }

      // Clear cache when a new hand begins
      if (lastCachedHandIdRef.current !== null && lastCachedHandIdRef.current !== handId) {
        holeCardCache.current.clear();
      }
      lastCachedHandIdRef.current = handId;

      // Return cached result if available for the current hand
      const cached = holeCardCache.current.get(handId);
      if (cached) {
        if (!cancelled) setHoleCards(cached);
        return;
      }

      try {
        const cards = await getHoleCards(tableId, handId);
        if (!cancelled) {
          if (cards) {
            holeCardCache.current.set(handId, cards);
          }
          setHoleCards(cards);
        }
      } catch (err) {
        console.error("[useHoleCards] Failed to fetch hole cards:", err);
        if (!cancelled) setHoleCards(null);
      }
    };

    fetchHoleCards();
    return () => { cancelled = true; };
  }, [isAuthenticated, tableId, handId, getHoleCards]);

  return { holeCards };
}
