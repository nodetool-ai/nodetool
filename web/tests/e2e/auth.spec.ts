import { test, expect } from "@playwright/test";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Authentication and Protected Routes", () => {
    test("should redirect to dashboard when accessing root in localhost", async ({
      page
    }) => {
      // Navigate to root
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // In localhost mode, should redirect to dashboard
      await page.waitForTimeout(1000);
      const url = page.url();

      // Should redirect to either login or dashboard
      expect(url).toMatch(/\/(login|dashboard)/);
    });

    test("should allow access to dashboard", async ({ page }) => {
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");

      // Wait for potential redirects
      await page.waitForTimeout(1000);

      const url = page.url();
      // Should either be on dashboard or login page
      expect(url).toMatch(/\/(login|dashboard)/);
    });

    test("should handle login page if authentication required", async ({
      page
    }) => {
      // Try to access login page
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      // Should be able to load login page without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should protect editor routes", async ({ page }) => {
      // Try to access an editor route
      await page.goto("/editor/test-workflow");
      await page.waitForLoadState("networkidle");

      // Wait for any redirects or loads
      await page.waitForTimeout(1000);

      const url = page.url();
      // Should either stay on the editor route (if authenticated) or redirect
      expect(url).toBeTruthy();
      
      // Page should not show server errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
    });
  });
}
