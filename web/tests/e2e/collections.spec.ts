import { test, expect } from "@playwright/test";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Collections", () => {
    test("should load collections page", async ({ page }) => {
      await page.goto("/collections");
      await page.waitForLoadState("networkidle");

      // Verify we're on the collections page
      await expect(page).toHaveURL(/\/collections/);

      // Check that the page loaded without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should display collections interface", async ({ page }) => {
      await page.goto("/collections");
      await page.waitForLoadState("networkidle");

      // Wait for content to load
      await page.waitForTimeout(1000);

      // Check that the page has content
      const body = await page.locator("body");
      const hasContent = await body.textContent();
      expect(hasContent).toBeTruthy();
      expect(hasContent!.length).toBeGreaterThan(0);
    });

    test("should handle empty collections state gracefully", async ({
      page
    }) => {
      await page.goto("/collections");
      await page.waitForLoadState("networkidle");

      // Wait for the page to fully render
      await page.waitForTimeout(1000);

      // The page should load even if there are no collections
      const url = page.url();
      expect(url).toContain("/collections");
    });
  });
}
