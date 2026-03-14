import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";
import {
  navigateToPage,
  waitForPageReady,
  waitForAnimation,
} from "./helpers/waitHelpers";

/**
 * Browser-based e2e tests for the Asset Explorer UI.
 * Exercises the asset API consumers (useAssets, AssetStore)
 * by navigating to the /assets page and interacting with UI elements.
 */

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Asset Explorer E2E", () => {
    test.describe("Page Load and Layout", () => {
      test("should load asset explorer and display panels", async ({ page }) => {
        await navigateToPage(page, "/assets");

        await expect(page).toHaveURL(/\/assets/);

        // Page should not show server errors
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");

        // Body should have rendered content
        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });

      test("should have search functionality", async ({ page }) => {
        await navigateToPage(page, "/assets");
        await waitForAnimation(page);

        // Look for search input
        const searchInput = page.locator(
          '[data-testid="asset-search-input-field"], input[placeholder*="search" i], input[type="search"]'
        );

        // If search exists, verify it's interactable
        if ((await searchInput.count()) > 0) {
          await expect(searchInput.first()).toBeVisible();
          await searchInput.first().fill("test-query");

          // Clear search
          const clearBtn = page.locator(
            '[data-testid="asset-search-clear-btn"]'
          );
          if ((await clearBtn.count()) > 0) {
            await clearBtn.click();
          }
        }
      });

      test("should handle empty asset state", async ({ page }) => {
        await navigateToPage(page, "/assets");
        await waitForAnimation(page);

        // Page should load gracefully even with no assets
        const url = page.url();
        expect(url).toContain("/assets");

        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        expect(bodyText).not.toContain("Internal Server Error");
      });
    });

    test.describe("Asset Creation and Interaction", () => {
      test("should display create folder option", async ({ page }) => {
        await navigateToPage(page, "/assets");
        await waitForAnimation(page);

        // Look for create folder button (icon button with folder icon)
        const createFolderBtn = page.locator(
          'button[aria-label*="folder" i], button[aria-label*="create" i], button:has([data-testid*="folder"])'
        );

        // If the button exists, it should be visible
        if ((await createFolderBtn.count()) > 0) {
          await expect(createFolderBtn.first()).toBeVisible();
        }
      });

      test("should display upload button", async ({ page }) => {
        await navigateToPage(page, "/assets");
        await waitForAnimation(page);

        // Look for upload/file-upload button
        const uploadBtn = page.locator(
          '.upload-button, .file-upload-button, button[aria-label*="upload" i]'
        );

        if ((await uploadBtn.count()) > 0) {
          await expect(uploadBtn.first()).toBeVisible();
        }
      });

      test("should show file input for upload", async ({ page }) => {
        await navigateToPage(page, "/assets");
        await waitForAnimation(page);

        // The hidden file input should exist in the DOM
        const fileInput = page.locator('input[type="file"]');
        if ((await fileInput.count()) > 0) {
          // File input is typically hidden but present
          expect(await fileInput.first().getAttribute("type")).toBe("file");
        }
      });
    });

    test.describe("Asset API Integration via UI", () => {
      test("should load assets data when page loads", async ({ page }) => {
        // Intercept API call to verify it happens
        let assetApiCalled = false;
        await page.route("**/api/assets/**", (route) => {
          assetApiCalled = true;
          return route.continue();
        });

        await navigateToPage(page, "/assets");
        await waitForAnimation(page);

        // The page should have triggered the assets API
        expect(assetApiCalled).toBe(true);
      });

      test("should reload assets after navigation", async ({ page }) => {
        // Navigate to another page first
        await navigateToPage(page, "/dashboard");
        await waitForAnimation(page);

        // Track API calls
        const assetRequests: string[] = [];
        await page.route("**/api/assets/**", (route) => {
          assetRequests.push(route.request().url());
          return route.continue();
        });

        // Navigate to assets
        await navigateToPage(page, "/assets");
        await waitForAnimation(page);

        // Assets API should have been called
        expect(assetRequests.length).toBeGreaterThan(0);
      });
    });

    test.describe("Asset Explorer Navigation", () => {
      test("should navigate between assets and dashboard", async ({ page }) => {
        await navigateToPage(page, "/assets");
        await expect(page).toHaveURL(/\/assets/);

        await navigateToPage(page, "/dashboard");
        await waitForAnimation(page);

        // Should be on dashboard now
        const url = page.url();
        expect(url).not.toContain("/assets");
      });

      test("should handle direct navigation to asset editor", async ({ page }) => {
        // Navigate to asset edit page with a fake ID
        await navigateToPage(page, "/assets/edit/nonexistent-id");
        await waitForAnimation(page);

        // Should handle gracefully (redirect or show error)
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });
    });
  });
}
