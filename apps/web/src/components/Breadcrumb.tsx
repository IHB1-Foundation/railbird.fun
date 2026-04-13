"use client";

import Link from "next/link";

interface Crumb {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  crumbs: Crumb[];
}

export function Breadcrumb({ crumbs }: BreadcrumbProps) {
  if (crumbs.length === 0) return null;
  const parent = crumbs[crumbs.length - 2];

  return (
    <nav aria-label="Breadcrumb" style={{ marginBottom: "0.75rem" }}>
      {/* Desktop breadcrumb */}
      <ol
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          listStyle: "none",
          fontSize: "0.78rem",
          color: "var(--muted)",
          flexWrap: "wrap",
        }}
        className="breadcrumb-desktop"
      >
        {crumbs.map((crumb, i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            {i > 0 && (
              <span aria-hidden="true" style={{ opacity: 0.5 }}>
                ›
              </span>
            )}
            {crumb.href ? (
              <Link
                href={crumb.href}
                style={{
                  color: i === crumbs.length - 1 ? "var(--foreground)" : "var(--muted)",
                  fontWeight: i === crumbs.length - 1 ? 600 : 400,
                }}
              >
                {crumb.label}
              </Link>
            ) : (
              <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>

      {/* Mobile back link */}
      {parent?.href && (
        <Link
          href={parent.href}
          className="breadcrumb-mobile"
          style={{
            display: "none",
            alignItems: "center",
            gap: "0.3rem",
            fontSize: "0.82rem",
            color: "var(--muted)",
          }}
        >
          <span aria-hidden="true">←</span> Back
        </Link>
      )}

      <style>{`
        @media (max-width: 640px) {
          .breadcrumb-desktop { display: none !important; }
          .breadcrumb-mobile { display: flex !important; }
        }
      `}</style>
    </nav>
  );
}
