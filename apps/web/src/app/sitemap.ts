import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://railbird.xyz";
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${base}/live`, lastModified: now, changeFrequency: "always", priority: 0.9 },
    { url: `${base}/leaderboard`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${base}/create-agent`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/evolution`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/compendium`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    // disclaimer is noindex — omit from sitemap
  ];

  return staticRoutes;
}
