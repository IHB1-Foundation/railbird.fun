"use client";

import styles from "./ChipStack.module.css";

/** Chip denominations: value → [color, borderColor, label] */
const CHIP_DENOMINATIONS: [number, string, string, string][] = [
  [500, "#ef4444", "#b91c1c", "500"],
  [100, "#1d4ed8", "#1e40af", "100"],
  [25,  "#16a34a", "#15803d", "25"],
  [5,   "#dc2626", "#b91c1c", "5"],
  [1,   "#d97706", "#b45309", "1"],
];

interface ChipStackProps {
  /** Amount in chips */
  amount: number;
  /** Max chips to render per denomination (default 5) */
  maxPerDenom?: number;
  /** Display numeric value alongside chips */
  showValue?: boolean;
  /** Value format function */
  formatValue?: (n: number) => string;
  className?: string;
}

/**
 * G-6: ChipStack — renders a visual poker chip stack for a given amount.
 * Uses CSS 3D multi box-shadow for depth.
 */
export function ChipStack({
  amount,
  maxPerDenom = 5,
  showValue = true,
  formatValue,
  className,
}: ChipStackProps) {
  const chips = buildChips(amount, maxPerDenom);

  return (
    <div className={[styles.root, className].filter(Boolean).join(" ")}>
      {chips.length > 0 && (
        <div className={styles.stack} aria-hidden="true">
          {chips.map((chip, i) => (
            <span
              key={i}
              className={styles.chip}
              style={{
                "--chip-color": chip.color,
                "--chip-border": chip.borderColor,
                "--chip-offset": `${i * 2}px`,
              } as React.CSSProperties}
              title={`${chip.label} chip`}
            />
          ))}
        </div>
      )}
      {showValue && (
        <span className={styles.value}>
          {formatValue ? formatValue(amount) : amount.toLocaleString()}
        </span>
      )}
    </div>
  );
}

interface ChipSlot {
  color: string;
  borderColor: string;
  label: string;
}

function buildChips(amount: number, maxPerDenom: number): ChipSlot[] {
  const chips: ChipSlot[] = [];
  let remainder = Math.floor(amount);

  for (const [denom, color, borderColor, label] of CHIP_DENOMINATIONS) {
    if (remainder <= 0) break;
    const count = Math.min(Math.floor(remainder / denom), maxPerDenom);
    for (let i = 0; i < count; i++) {
      chips.push({ color, borderColor, label });
    }
    remainder -= count * denom;
  }

  return chips.slice(0, 12); // cap total rendered chips
}
