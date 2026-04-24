import type { MetadataRoute } from "next";

const DEFAULT_APP_URL = "https://www.railbird.fun";

function resolvePublicAppUrl(): string {
  const rawValue = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!rawValue) return DEFAULT_APP_URL;

  try {
    const url = new URL(rawValue);
    if (url.hostname.endsWith(".vercel.app")) {
      return DEFAULT_APP_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_APP_URL;
  }
}

export default function robots(): MetadataRoute.Robots {
  const base = resolvePublicAppUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/me", "/verify", "/embed"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
