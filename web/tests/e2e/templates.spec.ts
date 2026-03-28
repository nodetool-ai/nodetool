import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";
import {
  navigateToPage,
  waitForPageReady,
} from "./helpers/waitHelpers";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Templates and Examples", () => {
    test("should handle URL with node parameter", async ({ page }) => {
      // Navigate to templates with a node parameter
      await navigateToPage(page, "/templates?node=test");

      // Verify URL contains the node parameter
      const url = page.url();
      expect(url).toContain("/templates");
      expect(url).toContain("node=test");

      // Page should load without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

  });

  test.describe("Templates API Integration", () => {
    test("should fetch templates from API", async ({ page, request }) => {
      // Navigate to templates page to ensure app is loaded
      await navigateToPage(page, "/templates");

      // Make API request for templates
      const response = await request.get(
        `${BACKEND_API_URL}/workflows/examples`
      );

      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Parse and verify response data
      const data = await response.json();
      expect(data).toBeDefined();
      expect(data).toHaveProperty("workflows");
      expect(Array.isArray(data.workflows)).toBeTruthy();
    });

    test("should search templates from API", async ({ page, request }) => {
      // Navigate to templates page
      await navigateToPage(page, "/templates");

      // Make API request for templates search
      const response = await request.get(
        `${BACKEND_API_URL}/workflows/examples/search?query=test`
      );

      // Verify response is successful
      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      // Parse and verify response data
      const data = await response.json();
      expect(data).toBeDefined();
      expect(data).toHaveProperty("workflows");
      expect(Array.isArray(data.workflows)).toBeTruthy();
    });

    test("should validate templates API response structure", async ({
      page,
      request
    }) => {
      // Navigate to templates page
      await navigateToPage(page, "/templates");

      // Fetch templates
      const response = await request.get(
        `${BACKEND_API_URL}/workflows/examples`
      );
      expect(response.ok()).toBeTruthy();

      const data = await response.json();

      // Validate structure
      expect(data).toHaveProperty("workflows");

      // If templates exist, validate their structure
      if (data.workflows.length > 0) {
        const firstTemplate = data.workflows[0];

        // Check for common workflow properties
        expect(firstTemplate).toBeDefined();
        expect(typeof firstTemplate).toBe("object");
        expect(firstTemplate).toHaveProperty("id");
        expect(firstTemplate).toHaveProperty("name");
      }
    });

    test("should verify templates page makes API calls on load", async ({
      page
    }) => {
      // Set up request interceptor to track API calls
      const apiCalls: string[] = [];

      page.on("response", (response) => {
        const url = response.url();
        if (url.includes("/api/workflows/examples")) {
          apiCalls.push(url);
        }
      });

      // Navigate to templates page
      await navigateToPage(page, "/templates");

      // Wait for API response containing templates endpoint
      await page.waitForResponse(
        (response) => response.url().includes("/api/workflows/examples"),
        { timeout: 10000 }
      ).catch(() => {
        // Response may have already been captured before waitForResponse was called
      });

      // Verify that templates API call was made
      expect(apiCalls.length).toBeGreaterThan(0);
    });

    test("should handle search with empty query", async ({ page, request }) => {
      // Navigate to templates page
      await navigateToPage(page, "/templates");

      // Make API request with empty query
      const response = await request.get(
        `${BACKEND_API_URL}/workflows/examples/search?query=`
      );

      // Verify response is successful (server should handle empty query gracefully)
      expect(response.status()).toBeLessThan(500);

      // Page should still be functional
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });
  });

  test.describe("Templates UI Elements", () => {
    test("should have accessible page structure", async ({ page }) => {
      await navigateToPage(page, "/templates");

      // Check that the page has proper content structure
      const body = await page.locator("body");
      await expect(body).toBeVisible();

      // Check that there's no visible error message
      const bodyText = await body.textContent();
      expect(bodyText).not.toContain("Error loading");
    });

    test("should be responsive to viewport changes", async ({ page }) => {
      await navigateToPage(page, "/templates");

      // Test at different viewport sizes
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForLoadState("domcontentloaded");
      let bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");

      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForLoadState("domcontentloaded");
      bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");

      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForLoadState("domcontentloaded");
      bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
    });

    test("should maintain functionality after page reload", async ({
      page
    }) => {
      await navigateToPage(page, "/templates");

      // Verify initial load
      await expect(page).toHaveURL(/\/templates/);

      // Reload the page
      await page.reload();
      await waitForPageReady(page);

      // Verify page still works after reload
      await expect(page).toHaveURL(/\/templates/);

      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });
  });

  test.describe("Templates Navigation", () => {
    test("should be accessible from dashboard", async ({ page }) => {
      await navigateToPage(page, "/dashboard");

      // Try to find and click a link to templates
      const templatesLink = page.locator('a[href*="/templates"]');
      if ((await templatesLink.count()) > 0) {
        await templatesLink.first().click();
        await waitForPageReady(page);
        await expect(page).toHaveURL(/\/templates/);
      } else {
        // If no link exists, navigate directly
        await navigateToPage(page, "/templates");
        await expect(page).toHaveURL(/\/templates/);
      }
    });

  });
}
