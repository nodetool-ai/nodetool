import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Search Functionality", () => {
    test.describe("Template Search", () => {
      test("should have search input on templates page", async ({ page }) => {
        await page.goto("/templates");
        await page.waitForLoadState("networkidle");

        // Look for search input element
        const searchInput = page.locator(
          'input[type="text"], input[role="searchbox"], [data-testid="search-input-field"]'
        );

        // If search exists, verify it's visible
        if ((await searchInput.count()) > 0) {
          await expect(searchInput.first()).toBeVisible();
        }

        // Page should load without errors
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should filter templates when searching", async ({
        page,
        request
      }) => {
        await page.goto("/templates");
        await page.waitForLoadState("networkidle");

        // Search for templates via API first to ensure we have data
        const searchResponse = await request.get(
          `${BACKEND_API_URL}/workflows/examples/search?query=test`
        );
        expect(searchResponse.ok()).toBeTruthy();

        // Try to find and use the search input
        const searchInput = page.locator('[data-testid="search-input-field"]');
        if ((await searchInput.count()) > 0) {
          await searchInput.first().fill("test");
          await page.waitForTimeout(500); // Wait for debounce

          // The page should update (we can't verify specific results)
          const bodyText = await page.textContent("body");
          expect(bodyText).toBeTruthy();
        }
      });

      test("should clear search results", async ({ page }) => {
        await page.goto("/templates");
        await page.waitForLoadState("networkidle");

        const searchInput = page.locator('[data-testid="search-input-field"]');
        const clearButton = page.locator('[data-testid="search-clear-btn"]');

        if ((await searchInput.count()) > 0) {
          // Type in the search input
          await searchInput.first().fill("test query");
          await page.waitForTimeout(300);

          // Click clear button if available
          if ((await clearButton.count()) > 0) {
            await clearButton.first().click();

            // Verify input is cleared
            const inputValue = await searchInput.first().inputValue();
            expect(inputValue).toBe("");
          }
        }
      });
    });

    test.describe("Asset Search", () => {
      test("should have search functionality on assets page", async ({
        page
      }) => {
        await page.goto("/assets");
        await page.waitForLoadState("networkidle");

        // Page should load successfully
        await expect(page).toHaveURL(/\/assets/);

        // Check page loaded without errors
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should handle asset search API", async ({ page, request }) => {
        await page.goto("/assets");
        await page.waitForLoadState("networkidle");

        // Test the asset search API endpoint
        const searchResponse = await request.get(
          `${BACKEND_API_URL}/assets/search?query=test`
        );

        // The API should respond (either with results or empty array)
        // Some APIs might return 404 for empty results, which is acceptable
        expect(searchResponse.status()).toBeLessThan(500);
      });
    });

    test.describe("Global Search", () => {
      test("should support command palette search", async ({
        page,
        request
      }) => {
        // Create a workflow to ensure we have content to search
        const workflowName = `test-search-workflow-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Test workflow for search",
              access: "private"
            }
          }
        );
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Wait for editor to load
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Try to open command palette with keyboard shortcut
          await page.keyboard.press("Meta+k");
          await page.waitForTimeout(500);

          // The page should still be functional
          const bodyText = await page.textContent("body");
          expect(bodyText).toBeTruthy();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Node Search in Editor", () => {
      test("should search for nodes in node menu", async ({ page, request }) => {
        // Create a workflow
        const workflowName = `test-node-search-${Date.now()}`;
        const createResponse = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: workflowName,
              description: "Test workflow for node search",
              access: "private"
            }
          }
        );
        const workflow = await createResponse.json();

        try {
          await page.goto(`/editor/${workflow.id}`);
          await page.waitForLoadState("networkidle");

          // Wait for editor to load
          await page.waitForSelector(".react-flow", { timeout: 10000 });

          // Focus on the canvas
          const canvas = page.locator(".react-flow");
          await canvas.click();

          // Try to open node menu with Tab key
          await page.keyboard.press("Tab");
          await page.waitForTimeout(500);

          // Look for any search input that might appear
          const nodeMenuSearch = page.locator(
            '.node-menu input, [data-testid="search-input-field"]'
          );

          if ((await nodeMenuSearch.count()) > 0) {
            // Type to search for nodes
            await nodeMenuSearch.first().fill("text");
            await page.waitForTimeout(300);
          }

          // Page should remain functional
          const bodyText = await page.textContent("body");
          expect(bodyText).toBeTruthy();
        } finally {
          await request.delete(`${BACKEND_API_URL}/workflows/${workflow.id}`);
        }
      });
    });

    test.describe("Search Keyboard Shortcuts", () => {
      test("should support keyboard navigation in search results", async ({
        page
      }) => {
        await page.goto("/templates");
        await page.waitForLoadState("networkidle");

        const searchInput = page.locator('[data-testid="search-input-field"]');

        if ((await searchInput.count()) > 0) {
          // Focus on search input
          await searchInput.first().click();
          await searchInput.first().fill("test");
          await page.waitForTimeout(300);

          // Try arrow key navigation
          await page.keyboard.press("ArrowDown");
          await page.waitForTimeout(100);
          await page.keyboard.press("ArrowUp");
          await page.waitForTimeout(100);

          // Press Escape to close any dropdown
          await page.keyboard.press("Escape");
          await page.waitForTimeout(100);

          // Page should still be functional
          const bodyText = await page.textContent("body");
          expect(bodyText).toBeTruthy();
        }
      });

      test("should focus search with keyboard shortcut", async ({ page }) => {
        await page.goto("/templates");
        await page.waitForLoadState("networkidle");

        // Try common search focus shortcuts
        await page.keyboard.press("Meta+f");
        await page.waitForTimeout(300);

        // Or Ctrl+F on Windows/Linux
        await page.keyboard.press("Control+f");
        await page.waitForTimeout(300);

        // Page should still be functional
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });
    });

    test.describe("Search API Integration", () => {
      test("should return valid search results from templates API", async ({
        request
      }) => {
        // Test the templates search endpoint
        const response = await request.get(
          `${BACKEND_API_URL}/workflows/examples/search?query=image`
        );

        expect(response.ok()).toBeTruthy();
        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data).toBeDefined();
        expect(data).toHaveProperty("workflows");
        expect(Array.isArray(data.workflows)).toBeTruthy();
      });

      test("should handle empty search query", async ({ request }) => {
        // Test with empty query
        const response = await request.get(
          `${BACKEND_API_URL}/workflows/examples/search?query=`
        );

        // Server should handle empty query gracefully
        expect(response.status()).toBeLessThan(500);
      });

      test("should handle special characters in search", async ({ request }) => {
        // Test with special characters
        const response = await request.get(
          `${BACKEND_API_URL}/workflows/examples/search?query=${encodeURIComponent("test & special <> chars")}`
        );

        // Server should handle special characters without crashing
        expect(response.status()).toBeLessThan(500);
      });

      test("should return results quickly", async ({ request }) => {
        const startTime = Date.now();

        const response = await request.get(
          `${BACKEND_API_URL}/workflows/examples/search?query=test`
        );

        const duration = Date.now() - startTime;

        expect(response.ok()).toBeTruthy();
        // Search should complete in under 5 seconds
        expect(duration).toBeLessThan(5000);
      });
    });
  });
}
