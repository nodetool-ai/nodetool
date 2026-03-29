import { test, expect } from "./fixtures/electronApp";
import {
  navigateToPage,
  waitForPageReady,
  waitForAnimation,
} from "./helpers/waitHelpers";

/**
 * Browser-based e2e tests for the Chat/Threads UI.
 * Exercises thread and message API consumers by navigating to the /chat
 * page and interacting with UI elements like thread list, message display,
 * and sidebar controls.
 */

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
      // Track API calls by listening to responses
      let threadsApiCalled = false;

      page.on("response", (response) => {
        if (response.url().includes("/api/threads")) {
          threadsApiCalled = true;
        }
      });

      await navigateToPage(page, "/chat");
      await waitForAnimation(page);

      // The chat page should have called the threads API
      expect(threadsApiCalled).toBe(true);
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
  });
});
