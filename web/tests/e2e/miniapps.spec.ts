import { test, expect } from "@playwright/test";
import {
  navigateToPage,
} from "./helpers/waitHelpers";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("MiniApps", () => {
    test("should load miniapps page", async ({ page }) => {
      await navigateToPage(page, "/apps");

      // Verify we're on the apps page
      await expect(page).toHaveURL(/\/apps/);

      // Check that the page loaded without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should display miniapps interface", async ({ page }) => {
      await navigateToPage(page, "/apps");

      // Wait for content to load by checking body has content
      const body = await page.locator("body");
      await expect(body).not.toBeEmpty();
      
      const hasContent = await body.textContent();
      expect(hasContent).toBeTruthy();
      expect(hasContent!.length).toBeGreaterThan(0);
    });

    test("should handle apps route with optional workflow ID", async ({
      page
    }) => {
      // Test without workflow ID
      await navigateToPage(page, "/apps");
      await expect(page).toHaveURL(/\/apps/);

      // Test with a workflow ID parameter
      await navigateToPage(page, "/apps/test-workflow-id");
      
      // Should handle the route (either show the app or handle missing workflow gracefully)
      const url = page.url();
      expect(url).toContain("/apps");
    });
  });
}
