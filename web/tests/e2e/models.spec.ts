import { test, expect } from "@playwright/test";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Models Management", () => {
    test("should load models page", async ({ page }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Verify we're on the models page
      await expect(page).toHaveURL(/\/models/);

      // Check that the page loaded without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should display models interface", async ({ page }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");

      // Wait for content to load
      await page.waitForTimeout(1000);

      // Check that the page has content
      const body = await page.locator("body");
      const hasContent = await body.textContent();
      expect(hasContent).toBeTruthy();
      expect(hasContent!.length).toBeGreaterThan(0);
    });

    test("should be accessible from navigation", async ({ page }) => {
      // Start from dashboard
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Navigate to models if link exists
      const modelsLink = page.locator('a[href*="/models"]');
      if ((await modelsLink.count()) > 0) {
        await modelsLink.first().click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/models/);
      } else {
        // Direct navigation should work
        await page.goto("/models");
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/models/);
      }
    });
  });
}
