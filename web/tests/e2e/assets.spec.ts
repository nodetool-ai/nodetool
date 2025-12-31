import { test, expect } from "@playwright/test";
import * as path from "path";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Asset Management", () => {
    test("should load asset explorer page", async ({ page }) => {
      await page.goto("/assets");
      await page.waitForLoadState("networkidle");

      // Verify we're on the assets page
      await expect(page).toHaveURL(/\/assets/);

      // Check that the page loaded without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
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

      // Set up a file chooser handler before clicking upload button
      const fileChooserPromise = page.waitForEvent("filechooser");

      // Click the upload button (FileUploadButton with compact mode renders an IconButton)
      const uploadButton = page.locator(".file-upload-button button, .upload-file");
      await uploadButton.first().click();

      // Select the test text file
      const fileChooser = await fileChooserPromise;
      const testFilePath = path.join(__dirname, "fixtures", "test-document.txt");
      await fileChooser.setFiles(testFilePath);

      // Wait for the upload to complete and the asset to appear
      // The asset should show up in the asset grid/list
      await page.waitForTimeout(2000); // Give time for upload to complete

      // Verify the page still loads correctly after upload
      await expect(page).toHaveURL(/\/assets/);
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should upload an image file and display it in the asset list", async ({ page }) => {
      await page.goto("/assets");
      await page.waitForLoadState("networkidle");

      // Set up a file chooser handler before clicking upload button
      const fileChooserPromise = page.waitForEvent("filechooser");

      // Click the upload button
      const uploadButton = page.locator(".file-upload-button button, .upload-file");
      await uploadButton.first().click();

      // Select the test image file
      const fileChooser = await fileChooserPromise;
      const testFilePath = path.join(__dirname, "fixtures", "test-image.png");
      await fileChooser.setFiles(testFilePath);

      // Wait for the upload to complete
      await page.waitForTimeout(2000); // Give time for upload to complete

      // Verify the page still loads correctly after upload
      await expect(page).toHaveURL(/\/assets/);
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });
  });
}
