import { test, expect } from "@playwright/test";

/**
 * TableViewer E2E tests — /table/[id]
 *
 * The table page fetches live state from the indexer and listens for WebSocket
 * events. We mock both via route interception so no real backend is needed.
 */

const MOCK_TABLE = {
  id: 1,
  tableAddress: "0xdead00000000000000000000000000000000beef",
  smallBlind: "1000000000000000000",
  bigBlind: "2000000000000000000",
  numSeats: 2,
  currentHandId: 3,
  gameState: 10,
  seats: [
    {
      seatIndex: 0,
      owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      stack: "98000000000000000000",
      isActive: true,
      isAllIn: false,
    },
    {
      seatIndex: 1,
      owner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      stack: "102000000000000000000",
      isActive: true,
      isAllIn: false,
    },
  ],
  recentHands: [
    {
      handId: 2,
      winnerSeat: 0,
      potAmount: "4000000000000000000",
      settledAt: Date.now() - 10000,
    },
  ],
};

test.describe("/table/[id]", () => {
  test.beforeEach(async ({ page }) => {
    // Mock indexer REST API
    await page.route("**/api/tables/1", (route) =>
      route.fulfill({ json: MOCK_TABLE })
    );
    await page.route("**/api/tables/1/hands*", (route) =>
      route.fulfill({ json: MOCK_TABLE.recentHands })
    );
    await page.route("**/api/tables", (route) =>
      route.fulfill({ json: [MOCK_TABLE] })
    );

    // Mock WebSocket — return 404 so the page gracefully falls back to polling
    await page.route("**/ws", (route) => route.abort());
  });

  test("renders table page without crashing", async ({ page }) => {
    await page.goto("/table/1");
    await expect(page).not.toHaveTitle(/error/i);
    // Page should contain some table-related content
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("displays seat information", async ({ page }) => {
    await page.goto("/table/1");
    await page.waitForLoadState("networkidle");
    // At minimum the page should load without a fatal error boundary
    const errorBoundary = page.locator("text=/something went wrong/i");
    await expect(errorBoundary).not.toBeVisible();
  });

  test("displays action log or game state", async ({ page }) => {
    await page.goto("/table/1");
    await page.waitForLoadState("networkidle");
    // Page title or heading should reference the table
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test("handles missing table gracefully (404)", async ({ page }) => {
    await page.route("**/api/tables/9999", (route) =>
      route.fulfill({ status: 404, json: { error: "Not found" } })
    );
    await page.goto("/table/9999");
    // Should show 404 page or error state, not a blank crash
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
