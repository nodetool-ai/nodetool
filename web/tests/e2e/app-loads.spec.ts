import { test, expect } from "@playwright/test";
import { BACKEND_HOST } from "./support/backend";
import { navigateToPage, waitForPageReady } from "./helpers/waitHelpers";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("App Loading", () => {
    test("should load the home page successfully", async ({ page }) => {
      // Navigate to the root using optimized navigation
      await navigateToPage(page, "/");
      
      // Check that we're on a valid page (not an error page)
      const title = await page.title();
      expect(title).toBeTruthy();
      
      // Check that the page doesn't show a generic error
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should have working navigation", async ({ page }) => {
      // Navigate to the root using optimized navigation
      await navigateToPage(page, "/");
      
      // Try to navigate to dashboard page
      await navigateToPage(page, "/dashboard");
      
      // Check URL changed
      await expect(page).toHaveURL(/\/dashboard/);
    });

    test("should connect to backend API", async ({ page }) => {
      // Set up a request interceptor to check for API calls
      let apiCallMade = false;
      
      const responseHandler = (response: any) => {
        const url = response.url();
        if (url.includes(BACKEND_HOST) || url.includes("/api/")) {
          apiCallMade = true;
        }
      };
      
      page.on("response", responseHandler);

      // Navigate to the app
      await navigateToPage(page, "/");
      
      // Wait for initial API calls with a proper condition check
      await page.waitForFunction(
        () => {
          // Check if any API elements or data have loaded
          const body = document.querySelector("body");
          return body && body.textContent && body.textContent.length > 100;
        },
        { timeout: 5000 }
      );
      
      // Clean up listener
      page.off("response", responseHandler);
      
      // We expect at least some API call to have been made
      // This verifies the frontend can reach the backend
      expect(apiCallMade).toBe(true);
    });
  });
}
