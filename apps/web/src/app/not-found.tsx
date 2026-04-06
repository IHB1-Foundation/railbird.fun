import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ padding: "4rem", textAlign: "center", fontFamily: "monospace" }}>
      <h1 style={{ fontSize: "4rem", margin: "0 0 1rem" }}>404</h1>
      <h2>Page Not Found</h2>
      <p style={{ color: "#888", margin: "1rem 0 2rem" }}>
        This page does not exist or the resource has been removed.
      </p>
      <Link href="/" style={{ padding: "0.5rem 1.5rem", textDecoration: "underline" }}>
        Return to Lobby
      </Link>
    </div>
  );
}
