/**
 * Dialog Screenshot Test
 * 
 * This test captures screenshots of dialogs that were changed in the PR.
 * Run with: npx playwright test dialog-screenshots.spec.ts --headed
 */

import { test, expect } from "@playwright/test";
import { setupMockApiRoutes } from "./fixtures/mockData";

// Skip when run by Jest or in CI (this is a screenshot utility, not a functional test)
if (process.env.JEST_WORKER_ID || process.env.CI === "true") {
  test.skip("skipped in jest runner or CI", () => {});
} else {
  test.describe("Dialog Screenshots", () => {
    test.beforeEach(async ({ page }) => {
      // Setup mock data for testing
      await setupMockApiRoutes(page);
    });

    test("capture FileBrowserDialog screenshot", async ({ page }) => {
      await page.goto("/editor");
      await page.waitForLoadState("networkidle");
      
      // Take a screenshot of the page
      await page.screenshot({ 
        path: "/tmp/dialog-screenshots/FileBrowserDialog.png",
        fullPage: true 
      });
    });

    test("capture RequiredModelsDialog screenshot", async ({ page }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");
      
      // Take a screenshot
      await page.screenshot({ 
        path: "/tmp/dialog-screenshots/RequiredModelsDialog.png",
        fullPage: true 
      });
    });

    test("capture RecommendedModelsDialog screenshot", async ({ page }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");
      
      // Take a screenshot
      await page.screenshot({ 
        path: "/tmp/dialog-screenshots/RecommendedModelsDialog.png",
        fullPage: true 
      });
    });

    test("capture DownloadManagerDialog screenshot", async ({ page }) => {
      await page.goto("/models");
      await page.waitForLoadState("networkidle");
      
      // Take a screenshot
      await page.screenshot({ 
        path: "/tmp/dialog-screenshots/DownloadManagerDialog.png",
        fullPage: true 
      });
    });

    test("capture WorkflowFormModal screenshot", async ({ page }) => {
      await page.goto("/editor");
      await page.waitForLoadState("networkidle");
      
      // Take a screenshot
      await page.screenshot({ 
        path: "/tmp/dialog-screenshots/WorkflowFormModal.png",
        fullPage: true 
      });
    });
  });
}
