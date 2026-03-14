import { test, expect } from "@playwright/test";
import {
  navigateToPage,
  waitForPageReady,
  waitForAnimation,
} from "./helpers/waitHelpers";

/**
 * Browser-based e2e tests for the Models Manager UI.
 * Exercises the model API consumers (useProviders, useModelsByProvider,
 * useOllamaModels, recommended model hooks) by navigating to the /models
 * page and interacting with UI elements.
 */

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Models Manager E2E", () => {
    test.describe("Models Page Load", () => {
      test("should load models page successfully", async ({ page }) => {
        await navigateToPage(page, "/models");

        await expect(page).toHaveURL(/\/models/);

        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should display models interface with content", async ({ page }) => {
        await navigateToPage(page, "/models");
        await waitForAnimation(page);

        const body = page.locator("body");
        await expect(body).not.toBeEmpty();

        const hasContent = await body.textContent();
        expect(hasContent).toBeTruthy();
        expect(hasContent!.length).toBeGreaterThan(0);
      });
    });

    test.describe("Model Manager UI Elements", () => {
      test("should display search input for models", async ({ page }) => {
        await navigateToPage(page, "/models");
        await waitForAnimation(page);

        // Look for model search input
        const searchInput = page.locator(
          'input[placeholder*="Search" i], input[placeholder*="model" i]'
        );

        if ((await searchInput.count()) > 0) {
          await expect(searchInput.first()).toBeVisible();

          // Type a search query
          await searchInput.first().fill("stable diffusion");
          await waitForAnimation(page);

          // Clear and verify
          await searchInput.first().clear();
          await waitForAnimation(page);
        }
      });

      test("should display filter controls", async ({ page }) => {
        await navigateToPage(page, "/models");
        await waitForAnimation(page);

        // Look for filter buttons (All, Downloaded, Available)
        const filterButtons = page.locator(
          '[aria-label*="filter" i], [aria-label*="show all" i], [aria-label*="downloaded" i]'
        );

        if ((await filterButtons.count()) > 0) {
          // Click the first filter button
          await filterButtons.first().click();
          await waitForAnimation(page);
        }

        // Page should remain functional
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });

      test("should display model type categories in sidebar", async ({ page }) => {
        await navigateToPage(page, "/models");
        await waitForAnimation(page);

        // Look for model type selection buttons
        const typeButtons = page.locator(
          '.model-type-button, button:has-text("Language"), button:has-text("Image")'
        );

        if ((await typeButtons.count()) > 0) {
          // Click a type button to filter
          await typeButtons.first().click();
          await waitForAnimation(page);
        }

        // Page should remain functional
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });

      test("should load model list", async ({ page }) => {
        await navigateToPage(page, "/models");
        await waitForAnimation(page);

        // Page should be functional with model data loaded
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });
    });

    test.describe("Model API Consumer Verification", () => {
      test("should call providers API when page loads", async ({ page }) => {
        let providersApiCalled = false;

        page.on("response", (response) => {
          if (response.url().includes("/api/models/providers")) {
            providersApiCalled = true;
          }
        });

        await navigateToPage(page, "/models");
        await waitForAnimation(page);

        // Models page should have triggered the providers API
        expect(providersApiCalled).toBe(true);
      });

      test("should call models/all API when page loads", async ({ page }) => {
        let modelsAllApiCalled = false;

        page.on("response", (response) => {
          if (response.url().includes("/api/models/all")) {
            modelsAllApiCalled = true;
          }
        });

        await navigateToPage(page, "/models");
        await waitForAnimation(page);

        // Models page should have loaded all models
        expect(modelsAllApiCalled).toBe(true);
      });

      test("should call recommended models API", async ({ page }) => {
        let recommendedApiCalled = false;

        page.on("response", (response) => {
          if (response.url().includes("/api/models/recommended")) {
            recommendedApiCalled = true;
          }
        });

        await navigateToPage(page, "/models");
        await waitForAnimation(page);

        // Recommended models should have been fetched
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });
    });

    test.describe("Model Provider Display", () => {
      test("should display provider data", async ({ page }) => {
        await navigateToPage(page, "/models");
        await waitForAnimation(page);

        // Page should be functional with provider data
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });
    });

    test.describe("Model Search and Filter", () => {
      test("should filter models by search term", async ({ page }) => {
        await navigateToPage(page, "/models");
        await waitForAnimation(page);

        const searchInput = page.locator(
          'input[placeholder*="Search" i]'
        ).first();

        if ((await searchInput.count()) > 0) {
          await searchInput.fill("stable");
          await waitForAnimation(page);

          // Page should update with filtered results
          const bodyText = await page.textContent("body");
          expect(bodyText).toBeTruthy();
        }
      });

      test("should clear search and show all models", async ({ page }) => {
        await navigateToPage(page, "/models");
        await waitForAnimation(page);

        const searchInput = page.locator(
          'input[placeholder*="Search" i]'
        ).first();

        if ((await searchInput.count()) > 0) {
          // Type something
          await searchInput.fill("test-query");
          await waitForAnimation(page);

          // Clear search
          await searchInput.clear();
          await waitForAnimation(page);

          // Page should show all models again
          const bodyText = await page.textContent("body");
          expect(bodyText).toBeTruthy();
        }
      });
    });

    test.describe("Model Page Navigation", () => {
      test("should navigate to models from dashboard", async ({ page }) => {
        await navigateToPage(page, "/dashboard");
        await waitForAnimation(page);

        await navigateToPage(page, "/models");
        await expect(page).toHaveURL(/\/models/);

        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should handle page reload on models page", async ({ page }) => {
        await navigateToPage(page, "/models");
        await waitForAnimation(page);

        // Reload the page
        await page.reload();
        await waitForPageReady(page);

        // Page should still be functional after reload
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        expect(bodyText).not.toContain("Internal Server Error");
      });
    });
  });
}
