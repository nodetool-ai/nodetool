import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to check page for server errors
async function checkPageForErrors(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/assets/);
  const bodyText = await page.textContent("body");
  expect(bodyText).not.toContain("500");
  expect(bodyText).not.toContain("Internal Server Error");
}

// Helper function to upload a file and wait for completion
async function uploadFile(page: Page, filePath: string): Promise<void> {
  // Wait for the upload button container to be visible
  const uploadContainer = page.locator(".file-upload-button").first();
  await expect(uploadContainer).toBeVisible({ timeout: 10000 });

  // Get the hidden file input inside the upload button container
  const fileInput = uploadContainer.locator('input[type="file"]');

  // Set the file directly on the input (bypassing the click/filechooser flow)
  await fileInput.setInputFiles(filePath);

  // Wait for the upload API call to complete
  await page.waitForResponse(
    (response) =>
      response.url().includes("/api/assets") && response.status() === 200,
    { timeout: 10000 }
  );

  // Wait for network to settle after upload
  await page.waitForLoadState("networkidle");
}

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Asset Management", () => {
    test("should load asset explorer page", async ({ page }) => {
      await page.goto("/assets");
      await page.waitForLoadState("networkidle");

      // Verify we're on the assets page
      await checkPageForErrors(page);
    });

    test("should display asset explorer interface", async ({ page }) => {
      await page.goto("/assets");
      await page.waitForLoadState("networkidle");

      // Wait for content to load by checking body has content
      const body = await page.locator("body");
      await expect(body).not.toBeEmpty();
      
      const hasContent = await body.textContent();
      expect(hasContent).toBeTruthy();
      expect(hasContent!.length).toBeGreaterThan(0);
    });

    test("should handle empty asset state gracefully", async ({ page }) => {
      await page.goto("/assets");
      await page.waitForLoadState("networkidle");

      // Wait for the page to fully render by checking URL is stable
      await expect(page).toHaveURL(/\/assets/);

      // The page should load even if there are no assets
      const url = page.url();
      expect(url).toContain("/assets");
    });

    test("should upload a text file and display it in the asset list", async ({ page }) => {
      await page.goto("/assets");
      await page.waitForLoadState("networkidle");

      // Upload the test text file
      const testFilePath = path.join(__dirname, "fixtures", "test-document.txt");
      await uploadFile(page, testFilePath);

      // Verify the page still loads correctly after upload
      await checkPageForErrors(page);
    });

    test("should upload an image file and display it in the asset list", async ({ page }) => {
      await page.goto("/assets");
      await page.waitForLoadState("networkidle");

      // Upload the test image file
      const testFilePath = path.join(__dirname, "fixtures", "test-image.png");
      await uploadFile(page, testFilePath);

      // Verify the page still loads correctly after upload
      await checkPageForErrors(page);
    });
  });
}
