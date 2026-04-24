"use client";

/**
 * IWKBridge — a null-rendering component that must live inside
 * InterwovenKitProvider. It calls useInterwovenKit() and writes the
 * result into a module-level store so that useInitiaWallet() and
 * useAutoSignSession() can read it from anywhere in the tree.
 */

import { useInterwovenKit } from "@initia/interwovenkit-react";
import { useEffect } from "react";
import { setIWKHandle } from "./interwoven";

export function IWKBridge(): null {
  const iwk = useInterwovenKit();
  useEffect(() => {
    setIWKHandle(iwk);
    return () => {
      setIWKHandle(null);
    };
  });
  return null;
}
