interface AgentAvatarProps {
  name?: string;
  accentColor?: string;
  colorHex?: string;
  size?: number;
}

export function AgentAvatar({ name, accentColor, colorHex, size = 32 }: AgentAvatarProps) {
  // Extract first alphabetic character; fallback to "?" if none found
  const letter = name?.match(/[a-z]/i)?.[0]?.toUpperCase() ?? "?";
  const bg = accentColor || "rgba(129, 108, 249, 0.6)";
  const fg = colorHex || "#ffffff";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "999px",
        background: `radial-gradient(circle at 35% 35%, ${bg}, color-mix(in srgb, ${bg} 70%, #000))`,
        color: fg,
        fontSize: `${Math.round(size * 0.45)}px`,
        fontWeight: 700,
        flexShrink: 0,
        border: "1px solid rgba(255,255,255,0.15)",
        boxShadow: `0 2px 8px rgba(0,0,0,0.3)`,
        userSelect: "none",
      }}
      aria-label={name || "Unknown agent"}
      role="img"
    >
      {letter}
    </span>
  );
}
