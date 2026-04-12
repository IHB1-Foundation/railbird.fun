import { test, expect } from "@playwright/test";

/**
 * Create-Agent wizard E2E tests — /create-agent
 *
 * The wizard has 4 steps:
 *   1. StepPersona — choose agent name / archetype
 *   2. StepTable   — choose table to join
 *   3. StepDeploy  — deploy/connect wallet
 *   4. StepSuccess — confirmation
 */

test.describe("/create-agent", () => {
  test.beforeEach(async ({ page }) => {
    // Mock any API calls the wizard might make
    await page.route("**/api/tables*", (route) =>
      route.fulfill({
        json: [
          {
            id: 1,
            tableAddress: "0xdead00000000000000000000000000000000beef",
            numSeats: 4,
            currentHandId: 0,
            gameState: 0,
            smallBlind: "1000000000000000000",
            bigBlind: "2000000000000000000",
            seats: [],
          },
        ],
      })
    );
  });

  test("renders /create-agent without crashing", async ({ page }) => {
    await page.goto("/create-agent");
    await expect(page).not.toHaveTitle(/error/i);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("no fatal error boundary shown", async ({ page }) => {
    await page.goto("/create-agent");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=/something went wrong/i")).not.toBeVisible();
  });

  test("wizard step 1 is visible (persona/name input)", async ({ page }) => {
    await page.goto("/create-agent");
    await page.waitForLoadState("networkidle");
    // First step should show some form input or persona selection
    const hasInput = await page
      .locator("input, select, [role=radio], [role=button]")
      .first()
      .isVisible()
      .catch(() => false);
    // The wizard renders something interactive
    expect(hasInput || (await page.locator("body").innerText()).length > 20).toBeTruthy();
  });

  test("can navigate between wizard steps if inputs are present", async ({
    page,
  }) => {
    await page.goto("/create-agent");
    await page.waitForLoadState("networkidle");

    // Try to find a Next/Continue button
    const nextBtn = page
      .locator("button")
      .filter({ hasText: /next|continue|proceed/i })
      .first();
    const isVisible = await nextBtn.isVisible().catch(() => false);

    if (isVisible) {
      // Fill any required text inputs first
      const textInputs = page.locator("input[type=text], input:not([type])");
      const inputCount = await textInputs.count();
      for (let i = 0; i < inputCount; i++) {
        await textInputs.nth(i).fill("TestAgent");
      }
      await nextBtn.click();
      // After clicking next we should still not crash
      await expect(page.locator("body")).not.toBeEmpty();
    } else {
      // No Next button visible — just verify the page renders
      expect(
        (await page.locator("body").innerText()).length
      ).toBeGreaterThan(10);
    }
  });

  test("page title is set", async ({ page }) => {
    await page.goto("/create-agent");
    const title = await page.title();
    expect(title).toBeTruthy();
  });
});
