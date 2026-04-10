import { webcrypto } from "node:crypto";

type GlobalWithCrypto = typeof globalThis & {
  crypto?: typeof webcrypto;
};

export function ensureWebCrypto(): typeof webcrypto {
  const globalWithCrypto = globalThis as GlobalWithCrypto;
  const cryptoImpl = globalWithCrypto.crypto;

  if (
    cryptoImpl &&
    typeof cryptoImpl.getRandomValues === "function" &&
    typeof cryptoImpl.subtle !== "undefined"
  ) {
    return cryptoImpl;
  }

  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
    enumerable: true,
    writable: true,
  });

  return webcrypto;
}
