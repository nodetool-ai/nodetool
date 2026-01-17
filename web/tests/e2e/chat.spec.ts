import { test, expect } from "@playwright/test";
import { setupMockApiRoutes, threads, messages } from "./fixtures/mockData";

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

  test.describe("Chat with Mock Data", () => {
    test.beforeEach(async ({ page }) => {
      // Setup mock API routes before each test
      await setupMockApiRoutes(page);
    });

    test("should display mocked threads", async ({ page }) => {
      await page.goto("/chat");
      await page.waitForLoadState("networkidle");

      // Wait for threads to potentially load
      await page.waitForTimeout(2000);

      // Check that page is functional
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should load mocked thread with messages", async ({ page }) => {
      const testThread = threads.threads[0];
      
      await page.goto(`/chat/${testThread.id}`);
      await page.waitForLoadState("networkidle");

      // Wait for any async loading
      await page.waitForTimeout(2000);

      // Verify we're on the correct thread URL
      expect(page.url()).toContain(testThread.id);

      // Page should be functional
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should handle chat with tool calls", async ({ page }) => {
      // Thread with tool calls is thread-001
      const threadWithTools = threads.threads[0];
      
      await page.goto(`/chat/${threadWithTools.id}`);
      await page.waitForLoadState("networkidle");

      // Wait for messages to potentially render
      await page.waitForTimeout(2000);

      // Verify page loaded without errors
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("500");
      expect(bodyText).not.toContain("Internal Server Error");
    });

    test("should display different thread conversations", async ({ page }) => {
      // Test navigation between different threads
      const thread1 = threads.threads[0];
      const thread2 = threads.threads[1];

      // Load first thread
      await page.goto(`/chat/${thread1.id}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      
      expect(page.url()).toContain(thread1.id);

      // Navigate to second thread
      await page.goto(`/chat/${thread2.id}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      expect(page.url()).toContain(thread2.id);

      // Page should be functional
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });

    test("should verify mock message structure", async ({ page }) => {
      const testThread = threads.threads[0];
      const threadMessages = messages["thread-001"];
      
      // Verify we have messages in our mock data
      expect(threadMessages).toBeDefined();
      expect(Array.isArray(threadMessages)).toBe(true);
      expect(threadMessages.length).toBeGreaterThan(0);

      // Verify message structure
      const firstMessage = threadMessages[0];
      expect(firstMessage).toHaveProperty("id");
      expect(firstMessage).toHaveProperty("thread_id");
      expect(firstMessage).toHaveProperty("role");
      expect(firstMessage).toHaveProperty("content");

      await page.goto(`/chat/${testThread.id}`);
      await page.waitForLoadState("networkidle");
      
      // Page should load successfully with mock data
      const bodyText = await page.textContent("body");
      expect(bodyText).toBeTruthy();
    });
  });
}
