import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Collections", () => {
    test("should load collections page", async ({ page }) => {
      await page.goto("/collections");
      await page.waitForLoadState("networkidle");

      // Verify we're on the collections page
      await expect(page).toHaveURL(/\/collections/);

      // Check that the page loaded without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should display collections interface", async ({ page }) => {
      await page.goto("/collections");
      await page.waitForLoadState("networkidle");

      // Wait for content to load by checking body has content
      const body = await page.locator("body");
      await expect(body).not.toBeEmpty();

      const hasContent = await body.textContent();
      expect(hasContent).toBeTruthy();
      expect(hasContent!.length).toBeGreaterThan(0);
    });

    test("should handle empty collections state gracefully", async ({
      page
    }) => {
      await page.goto("/collections");
      await page.waitForLoadState("networkidle");

      // Wait for the page to fully render by checking URL is stable
      await expect(page).toHaveURL(/\/collections/);

      // The page should load even if there are no collections
      const url = page.url();
      expect(url).toContain("/collections");
    });

    test("should create a collection and upload a text file", async ({
      page,
      request
    }) => {
      // Generate a unique collection name for this test run
      const collectionName = `test-collection-${Date.now()}`;

      // Step 1: Create a collection via API
      const createResponse = await request.post(
        "http://localhost:7777/api/collections/",
        {
          data: {
            name: collectionName,
            embedding_model: "all-minilm:latest"
          }
        }
      );
      expect(createResponse.ok()).toBe(true);

      // Step 2: Navigate to collections page and verify collection exists
      await page.goto("/collections");
      await page.waitForLoadState("networkidle");

      // Wait for collection list to load and show our new collection
      await expect(page.getByText(collectionName)).toBeVisible({
        timeout: 10000
      });

      // Step 3: Create a temporary text file for upload
      const tmpDir = os.tmpdir();
      const testFileName = `test-file-${Date.now()}.txt`;
      const testFilePath = path.join(tmpDir, testFileName);
      const testFileContent = "This is a test file for the collection upload.";
      fs.writeFileSync(testFilePath, testFileContent);

      try {
        // Step 4: Find the collection item and upload a file via drag and drop
        // Use getByRole with name to find the specific list item containing our collection
        const collectionItem = page
          .locator(".MuiListItem-root")
          .filter({ hasText: collectionName });
        await expect(collectionItem).toBeVisible();

        // Create a DataTransfer-like object for file upload
        // Playwright supports setInputFiles for file inputs and can simulate drag events
        const dataTransfer = await page.evaluateHandle(
          ({ content, name }: { content: string; name: string }) => {
            const dt = new DataTransfer();
            const file = new File([content], name, { type: "text/plain" });
            dt.items.add(file);
            return dt;
          },
          { content: testFileContent, name: testFileName }
        );

        // Dispatch drag and drop events on the collection item
        await collectionItem.dispatchEvent("dragenter", { dataTransfer });
        await collectionItem.dispatchEvent("dragover", { dataTransfer });
        await collectionItem.dispatchEvent("drop", { dataTransfer });

        // Step 5: Wait for the indexing to complete and verify the item count changes
        // The UI shows "{count} items" for all counts (including 1)
        await expect(
          collectionItem.getByText("1 items")
        ).toBeVisible({ timeout: 30000 });

        // Verify the collection is still displayed
        await expect(page.getByText(collectionName)).toBeVisible();
      } finally {
        // Cleanup: Delete the temporary file
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }

        // Cleanup: Delete the collection via API
        await request.delete(
          `http://localhost:7777/api/collections/${collectionName}`
        );
      }
    });
  });
}
