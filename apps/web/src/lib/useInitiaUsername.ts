"use client";

import { useEffect, useState } from "react";
import { fetchInitUsername, formatInitAddress } from "./initiaUsername";

export { fetchInitUsername, formatInitAddress };

/** React hook: resolves a single address to its .init name (or null). */
export function useInitiaUsername(address: string | null | undefined): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setName(null);
      return;
    }
    let cancelled = false;
    fetchInitUsername(address).then((n) => {
      if (!cancelled) setName(n);
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return name;
}
