import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://railbird.xyz";
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
