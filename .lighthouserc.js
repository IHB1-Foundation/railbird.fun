/** @type {import('@lhci/cli').LhrConfig} */
module.exports = {
  ci: {
    collect: {
      // Start the Next.js server in production mode during CI
      startServerCommand: "pnpm --filter @playerco/web start",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 60000,
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/leaderboard",
        "http://localhost:3000/live",
        "http://localhost:3000/terms",
        "http://localhost:3000/privacy",
      ],
      numberOfRuns: 2,
    },
    assert: {
      preset: "lighthouse:no-pwa",
      assertions: {
        // Performance
        "categories:performance": ["warn", { minScore: 0.75 }],
        // Accessibility — stricter target
        "categories:accessibility": ["error", { minScore: 0.9 }],
        // Best practices
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        // SEO
        "categories:seo": ["warn", { minScore: 0.9 }],
        // Core Web Vitals
        "first-contentful-paint": ["warn", { maxNumericValue: 3000 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 4000 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["warn", { maxNumericValue: 500 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
