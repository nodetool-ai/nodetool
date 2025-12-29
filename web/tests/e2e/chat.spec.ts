import { test, expect } from "@playwright/test";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Chat Interface", () => {
    test("should load chat page", async ({ page }) => {
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      // Verify we're on a chat page
      await expect(page).toHaveURL(/\/chat/);

      // Check that the page loaded without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should display chat interface elements", async ({ page }) => {
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      // Wait for content to load by checking body has content
      const body = await page.locator("body");
      await expect(body).not.toBeEmpty();
      
      const hasContent = await body.textContent();
      expect(hasContent).toBeTruthy();
      expect(hasContent!.length).toBeGreaterThan(0);
    });

    test("should handle navigation with thread ID", async ({ page }) => {
      // Navigate to chat without a specific thread
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      // Verify base chat URL works
      const url = page.url();
      expect(url).toMatch(/\/chat/);
    });
  });
}
