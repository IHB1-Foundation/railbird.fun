"use client";

import { useState } from "react";
import { shortenAddress, explorerAddressUrl } from "@/lib/utils";

interface AddressDisplayProps {
  address: string;
  /** Override the displayed short form */
  label?: string;
  /** Show explorer link on click (default true) */
  showExplorer?: boolean;
  /** Show copy-to-clipboard button (default true) */
  showCopy?: boolean;
}

/**
 * UX-9.2: Unified address display — shortened + explorer link + copy button.
 * Use this wherever a contract or wallet address needs to be shown.
 */
export function AddressDisplay({
  address,
  label,
  showExplorer = true,
  showCopy = true,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const display = label ?? shortenAddress(address);
  const explorerUrl = explorerAddressUrl(address);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
      {showExplorer && explorerUrl ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-mono"
          title={address}
          style={{ color: "inherit", textDecoration: "underline dotted" }}
        >
          {display}
        </a>
      ) : (
        <span className="text-mono" title={address}>
          {display}
        </span>
      )}
      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied!" : "Copy address"}
          title={copied ? "Copied!" : "Copy address"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0.1rem 0.2rem",
            color: copied ? "var(--success)" : "var(--muted)",
            fontSize: "0.72rem",
            lineHeight: 1,
          }}
        >
          {copied ? "✓" : "⎘"}
        </button>
      )}
    </span>
  );
}
