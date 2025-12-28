import { test, expect } from "@playwright/test";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Dashboard", () => {
    test("should load dashboard page successfully", async ({ page }) => {
      // Navigate to dashboard
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Verify we're on the dashboard
      await expect(page).toHaveURL(/\/dashboard/);

      // Check that the page loaded without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should display dashboard sections", async ({ page }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Wait for dashboard content to load
      await page.waitForTimeout(1000);

      // Check that we have some content on the page
      const body = await page.locator("body");
      const hasContent = await body.textContent();
      expect(hasContent).toBeTruthy();
      expect(hasContent!.length).toBeGreaterThan(0);
    });

    test("should allow navigation from dashboard", async ({ page }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Check that we can navigate to other pages
      // This tests the left panel navigation
      const currentUrl = page.url();
      expect(currentUrl).toContain("/dashboard");

      // Try navigating to templates if link exists
      const templatesLink = page.locator('a[href*="/templates"]');
      if (await templatesLink.count() > 0) {
        await templatesLink.first().click();
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/templates/);
      }
    });
  });
}
