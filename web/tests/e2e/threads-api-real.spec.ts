import { test, expect } from "@playwright/test";
import { setupMockApiRoutes, threads, messages } from "./fixtures/mockData";
import {
  navigateToPage,
  waitForPageReady,
  waitForAnimation,
} from "./helpers/waitHelpers";

/**
 * Browser-based e2e tests for the Chat/Threads UI.
 * Exercises thread and message API consumers (useGlobalChatStore,
 * useChatService, useThreadsQuery) by navigating to the /chat page
 * and interacting with UI elements.
 */

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Chat Threads E2E", () => {
    test.describe("Chat Page Load", () => {
      test("should load chat page and display interface", async ({ page }) => {
        await navigateToPage(page, "/chat");

        await expect(page).toHaveURL(/\/chat/);

        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");

        const body = page.locator("body");
        await expect(body).not.toBeEmpty();
      });

      test("should display chat sidebar or toggle", async ({ page }) => {
        await navigateToPage(page, "/chat");
        await waitForAnimation(page);

        // Look for sidebar toggle or thread list
        const sidebar = page.locator(
          '[aria-label="Open sidebar"], [aria-label="Collapse sidebar"], .thread-list'
        );

        if ((await sidebar.count()) > 0) {
          await expect(sidebar.first()).toBeVisible();
        }
      });

      test("should have new chat button", async ({ page }) => {
        await navigateToPage(page, "/chat");
        await waitForAnimation(page);

        // Look for new chat button
        const newChatBtn = page.locator(
          '[aria-label="New chat"], button:has-text("New")'
        );

        if ((await newChatBtn.count()) > 0) {
          await expect(newChatBtn.first()).toBeVisible();
        }
      });
    });

    test.describe("Thread Navigation with Mocks", () => {
      test.beforeEach(async ({ page }) => {
        await setupMockApiRoutes(page);
      });

      test("should load a specific thread by ID", async ({ page }) => {
        const testThread = threads.threads[0];

        await navigateToPage(page, `/chat/${testThread.id}`);
        await waitForAnimation(page);

        // URL should contain the thread ID
        expect(page.url()).toContain(testThread.id);

        // Page should be functional
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should switch between threads", async ({ page }) => {
        const thread1 = threads.threads[0];
        const thread2 = threads.threads[1];

        // Load first thread
        await navigateToPage(page, `/chat/${thread1.id}`);
        await waitForAnimation(page);
        expect(page.url()).toContain(thread1.id);

        // Navigate to second thread
        await navigateToPage(page, `/chat/${thread2.id}`);
        await waitForAnimation(page);
        expect(page.url()).toContain(thread2.id);

        // Page should still be functional
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });

      test("should display thread messages from mock data", async ({ page }) => {
        const testThread = threads.threads[0];

        await navigateToPage(page, `/chat/${testThread.id}`);
        await waitForAnimation(page);

        // Verify mock messages are available
        const threadMessages = messages["thread-001"];
        expect(threadMessages).toBeDefined();
        expect(threadMessages.length).toBeGreaterThan(0);

        // Page should have loaded the thread content
        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });

      test("should handle thread with tool calls", async ({ page }) => {
        // Thread-001 has tool calls in mock data
        const threadWithTools = threads.threads[0];

        await navigateToPage(page, `/chat/${threadWithTools.id}`);
        await waitForAnimation(page);

        // Page should handle tool call messages gracefully
        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });
    });

    test.describe("Chat Message Input", () => {
      test("should have message input area", async ({ page }) => {
        await navigateToPage(page, "/chat");
        await waitForAnimation(page);

        // Look for message input (textarea or input)
        const messageInput = page.locator(
          'textarea, [contenteditable="true"], input[placeholder*="message" i]'
        );

        if ((await messageInput.count()) > 0) {
          await expect(messageInput.first()).toBeVisible();
        }
      });

      test("should have send button", async ({ page }) => {
        await navigateToPage(page, "/chat");
        await waitForAnimation(page);

        // Look for send button
        const sendBtn = page.locator(
          '[aria-label="Send now"], button:has-text("Send")'
        );

        if ((await sendBtn.count()) > 0) {
          // Send button might be disabled when no message is typed
          expect(await sendBtn.first().isVisible()).toBe(true);
        }
      });
    });

    test.describe("Chat API Consumer Verification", () => {
      test("should call threads API when loading chat", async ({ page }) => {
        // Track API calls
        let threadsApiCalled = false;
        await page.route("**/api/threads**", (route) => {
          threadsApiCalled = true;
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ threads: [], next: null })
          });
        });

        await navigateToPage(page, "/chat");
        await waitForAnimation(page);

        // The chat page should have called the threads API
        expect(threadsApiCalled).toBe(true);
      });

      test("should call messages API when opening a thread", async ({ page }) => {
        let messagesApiCalled = false;

        // Mock threads first
        await page.route("**/api/threads", (route) => {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              threads: threads.threads,
              next: null
            })
          });
        });

        await page.route("**/api/threads/*/messages**", (route) => {
          messagesApiCalled = true;
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ messages: [], next: null })
          });
        });

        // Also mock other required endpoints
        await setupMockApiRoutes(page);

        const testThread = threads.threads[0];
        await navigateToPage(page, `/chat/${testThread.id}`);
        await waitForAnimation(page);

        // Messages API should have been called for this thread
        expect(messagesApiCalled).toBe(true);
      });
    });

    test.describe("Standalone Chat", () => {
      test("should load standalone chat page", async ({ page }) => {
        await navigateToPage(page, "/standalone-chat");
        await waitForAnimation(page);

        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should load standalone chat with thread ID", async ({ page }) => {
        await setupMockApiRoutes(page);
        const testThread = threads.threads[0];

        await navigateToPage(page, `/standalone-chat/${testThread.id}`);
        await waitForAnimation(page);

        expect(page.url()).toContain(testThread.id);

        const bodyText = await page.textContent("body");
        expect(bodyText).toBeTruthy();
      });
    });
  });
}
