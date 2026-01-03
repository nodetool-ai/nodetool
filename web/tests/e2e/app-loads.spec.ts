import { test, expect } from "@playwright/test";
import { BACKEND_HOST } from "./support/backend";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("App Loading", () => {
    test("should load the home page successfully", async ({ page }) => {
      // Navigate to the root
      await page.goto("/");
      
      // Wait for the page to load
      await page.waitForLoadState("networkidle");
      
      // Check that we're on a valid page (not an error page)
      const title = await page.title();
      expect(title).toBeTruthy();
      
      // Check that the page doesn't show a generic error
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should have working navigation", async ({ page }) => {
      // Navigate to the root
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      
      // Try to navigate to workflows page
      await page.goto("/workflows");
      await page.waitForLoadState("networkidle");
      
      // Check URL changed
      await expect(page).toHaveURL(/\/workflows/);
    });

    test("should connect to backend API", async ({ page }) => {
      // Set up a request interceptor to check for API calls
      let apiCallMade = false;
      
      page.on("response", (response) => {
        const url = response.url();
        if (url.includes(BACKEND_HOST) || url.includes("/api/")) {
          apiCallMade = true;
        }
      });

      // Navigate to the app
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      
      // Give it a moment for any initial API calls
      await page.waitForTimeout(2000);
      
      // We expect at least some API call to have been made
      // This verifies the frontend can reach the backend
      expect(apiCallMade).toBe(true);
    });
  });
}
