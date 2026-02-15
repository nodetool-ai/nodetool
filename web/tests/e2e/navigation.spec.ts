import { test, expect } from "@playwright/test";
import {
  navigateToPage,
  waitForPageReady,
} from "./helpers/waitHelpers";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Navigation and Routing", () => {
    const routes = [
      { path: "/", expectedRedirect: /^\/(dashboard|login)?$/ }, // Root may stay at / or redirect
      { path: "/dashboard", expectedUrl: /^\/(dashboard|login)/ },
      { path: "/assets", expectedUrl: /^\/assets/ },
      { path: "/collections", expectedUrl: /^\/collections/ },
      { path: "/templates", expectedUrl: /^\/templates/ },
      { path: "/models", expectedUrl: /^\/models/ },
      { path: "/apps", expectedUrl: /^\/apps/ },
      { path: "/chat", expectedUrl: /^\/chat/ }
    ];

    for (const route of routes) {
      test(`should navigate to ${route.path}`, async ({ page }) => {
        await navigateToPage(page, route.path);

        // Determine the expected URL pattern
        const expectedPattern = route.expectedRedirect || route.expectedUrl!;
        
        // For redirect routes, wait for potential client-side navigation
        if (route.expectedRedirect && route.path === "/") {
          try {
            await page.waitForURL(/\/(dashboard|login)/, { timeout: 5000 });
          } catch {
            // Timeout is acceptable - may stay at root
          }
        }
        
        // Check URL path matches expected pattern (extract pathname from full URL)
        const url = page.url();
        const pathname = new URL(url).pathname;
        expect(pathname).toMatch(expectedPattern);

        // Ensure no server errors
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });
    }

    test("should maintain state when navigating between pages", async ({
      page
    }) => {
      // Navigate through several pages
      await navigateToPage(page, "/dashboard");

      await navigateToPage(page, "/assets");
      await expect(page).toHaveURL(/\/assets/);

      await navigateToPage(page, "/templates");
      await expect(page).toHaveURL(/\/templates/);

      // Navigate back
      await page.goBack();
      await waitForPageReady(page);
      await expect(page).toHaveURL(/\/assets/);
    });

    test("should handle browser back and forward navigation", async ({
      page
    }) => {
      // Navigate to dashboard
      await navigateToPage(page, "/dashboard");

      // Navigate to templates
      await navigateToPage(page, "/templates");
      await expect(page).toHaveURL(/\/templates/);

      // Go back
      await page.goBack();
      await waitForPageReady(page);
      
      // After network is idle, URL should be stable
      const urlAfterBack = page.url();
      expect(urlAfterBack).toMatch(/\/(dashboard|login)/);

      // Go forward
      await page.goForward();
      await waitForPageReady(page);
      await expect(page).toHaveURL(/\/templates/);
    });

    test("should handle invalid routes gracefully", async ({ page }) => {
      await navigateToPage(page, "/non-existent-route-12345");

      // Should either redirect or show error page, but not crash
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });
  });
}
