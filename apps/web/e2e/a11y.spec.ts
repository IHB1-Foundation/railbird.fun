import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility (a11y) tests using axe-core.
 *
 * Scans 5 key pages for critical/serious accessibility violations.
 * WCAG 2.1 AA standard. Zero tolerance for critical or serious issues.
 *
 * Pages tested:
 *   1. / (home)
 *   2. /live
 *   3. /create-agent
 *   4. /terms
 *   5. /leaderboard
 */

// Helper to mock API calls so pages render without a real backend
async function mockApis(page: Page) {
  await page.route("**/api/**", (route) =>
    route.fulfill({ json: [] })
  );
  await page.route("**/ws", (route) => route.abort());
}

async function assertNoA11yViolations({ page }: { page: Page }) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const criticalOrSerious = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );

  if (criticalOrSerious.length > 0) {
    const summary = criticalOrSerious
      .map(
        (v) =>
          `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`
      )
      .join("\n");
    throw new Error(
      `Found ${criticalOrSerious.length} critical/serious a11y violation(s):\n${summary}`
    );
  }
}

test.describe("Accessibility (axe-core)", () => {
  test("/ (home) — no critical/serious a11y violations", async ({ page }) => {
    await mockApis(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await assertNoA11yViolations({ page });
  });

  test("/live — no critical/serious a11y violations", async ({ page }) => {
    await mockApis(page);
    await page.route("**/api/tables*", (route) =>
      route.fulfill({ json: [] })
    );
    await page.goto("/live");
    await page.waitForLoadState("networkidle");
    await assertNoA11yViolations({ page });
  });

  test("/create-agent — no critical/serious a11y violations", async ({
    page,
  }) => {
    await mockApis(page);
    await page.route("**/api/tables*", (route) =>
      route.fulfill({ json: [] })
    );
    await page.goto("/create-agent");
    await page.waitForLoadState("networkidle");
    await assertNoA11yViolations({ page });
  });

  test("/terms — no critical/serious a11y violations", async ({ page }) => {
    await mockApis(page);
    await page.goto("/terms");
    await page.waitForLoadState("networkidle");
    await assertNoA11yViolations({ page });
  });

  test("/leaderboard — no critical/serious a11y violations", async ({
    page,
  }) => {
    await mockApis(page);
    await page.route("**/api/leaderboard*", (route) =>
      route.fulfill({ json: [] })
    );
    await page.goto("/leaderboard");
    await page.waitForLoadState("networkidle");
    await assertNoA11yViolations({ page });
  });
});
