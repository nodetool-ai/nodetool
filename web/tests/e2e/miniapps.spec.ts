import { test, expect } from "@playwright/test";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("MiniApps", () => {
    test("should load miniapps page", async ({ page }) => {
      await page.goto("/apps");
      await page.waitForLoadState("networkidle");

      // Verify we're on the apps page
      await expect(page).toHaveURL(/\/apps/);

      // Check that the page loaded without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should display miniapps interface", async ({ page }) => {
      await page.goto("/apps");
      await page.waitForLoadState("networkidle");

      // Wait for content to load
      await page.waitForTimeout(1000);

      // Check that the page has content
      const body = await page.locator("body");
      const hasContent = await body.textContent();
      expect(hasContent).toBeTruthy();
      expect(hasContent!.length).toBeGreaterThan(0);
    });

    test("should handle apps route with optional workflow ID", async ({
      page
    }) => {
      // Test without workflow ID
      await page.goto("/apps");
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/apps/);

      // Test with a workflow ID parameter
      await page.goto("/apps/test-workflow-id");
      await page.waitForLoadState("networkidle");
      
      // Should handle the route (either show the app or handle missing workflow gracefully)
      const url = page.url();
      expect(url).toContain("/apps");
    });
  });
}
