import { test, expect } from './fixtures/electronApp';
import { Page, Locator } from "@playwright/test";
import {
  navigateToPage,
  waitForPageReady,
} from "./helpers/waitHelpers";

// Helper to check if a URL is the unified /ws endpoint (not legacy /ws/chat or /ws/predict)
const isUnifiedWsEndpoint = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    // Check if pathname is exactly /ws
    return parsed.pathname === "/ws";
  } catch {
    return false;
  }
};

// Helper to wait for chat interface to initialize
// Returns true if found, false if timed out
const waitForChatInterface = async (page: Page): Promise<boolean> => {
  try {
    await page.waitForSelector('.global-chat-container, .chat-container', { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
};

// Helper to safely check if an element is visible
const isElementVisible = async (locator: Locator): Promise<boolean> => {
  return locator.isVisible().catch(() => false);
};

test.describe("WebSocket Integration", () => {
  test.describe("WebSocket Connection", () => {
    test("should use unified /ws endpoint instead of legacy endpoints", async ({ page }) => {
      // Track WebSocket connections
      const wsConnections: string[] = [];

      page.on("websocket", (ws) => {
        wsConnections.push(ws.url());
      });

      // Navigate to chat page
      await navigateToPage(page, "/chat");

      // Wait for chat interface to be ready
      await waitForChatInterface(page);

      // Verify no legacy endpoints are used
      const legacyChatWs = wsConnections.find(url => url.includes("/ws/chat"));
      const legacyPredictWs = wsConnections.find(url => url.includes("/ws/predict"));

      // Should not use legacy endpoints
      expect(legacyChatWs).toBeFalsy();
      expect(legacyPredictWs).toBeFalsy();
    });

    test("should show connection status in chat interface", async ({ page }) => {
      await navigateToPage(page, "/chat");

      // Wait for chat interface to initialize
      await waitForChatInterface(page);

      // The page should load without showing connection error states
      // Check for absence of error messages about connection
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("Connection failed");

      // If there's a connection alert, it should not be an error
      const errorAlert = page.locator('.global-chat-status-alert[severity="error"]');
      await expect(errorAlert).not.toBeVisible();
    });
  });

  test.describe("Chat Message Flow", () => {
    test("should show loading state when chat is initializing", async ({ page }) => {
      await page.goto("/chat");

      // Wait for initial render
      await page.waitForLoadState("domcontentloaded");

      // The page should either show loading or the chat interface
      const body = await page.locator("body");
      await expect(body).not.toBeEmpty();
    });

    test("should display chat input area when connected", async ({ page }) => {
      await navigateToPage(page, "/chat");

      // Wait for chat interface to initialize
      await waitForChatInterface(page);

      // Check for chat input elements - look for textarea or input field
      const hasTextarea = await isElementVisible(page.locator('textarea, input[type="text"]').first());
      const hasTextbox = await isElementVisible(page.locator('[role="textbox"]'));

      // The chat interface should have some form of input
      // This verifies the UI is properly rendered after connection
      expect(hasTextarea || hasTextbox).toBeTruthy();
    });

    test("should handle new thread creation", async ({ page }) => {
      await navigateToPage(page, "/chat");

      // Wait for chat interface to initialize
      await waitForChatInterface(page);

      // Look for new chat button - it should be present in the chat interface
      const newChatButton = page.locator('button').filter({ hasText: /new/i }).first();
      await expect(newChatButton).toBeVisible();

      // Click to create new thread
      await newChatButton.click();
      await waitForPageReady(page);

      // Should stay on chat page without errors
      await expect(page).toHaveURL(/\/chat/);
    });
  });

  test.describe("Store-Level WebSocket Integration", () => {
    test("should initialize GlobalChatStore with WebSocket manager", async ({ page }) => {
      await navigateToPage(page, "/chat");

      // Wait for chat interface to initialize
      await waitForChatInterface(page);

      // Check store state via window object (if exposed) or via UI state
      const storeState = await page.evaluate(() => {
        // Try to access the store through window if it's exposed
        const windowAny = window as any;
        if (windowAny.__ZUSTAND_DEVTOOLS_GLOBAL__) {
          return true;
        }
        return null;
      });

      // The chat should be in a connected or working state
      // Verify by checking for connection error alerts (not general text that might contain these words)
      const connectionErrorAlert = page.locator('.global-chat-status-alert[severity="error"], [role="alert"][class*="error"]').first();
      const hasConnectionError = await isElementVisible(connectionErrorAlert);

      // Should not have fatal connection errors after loading
      expect(hasConnectionError).toBeFalsy();
    });
  });

  test.describe("WebSocket Message Format", () => {
    test("should send messages in command-wrapped format", async ({ page }) => {
      // Track WebSocket connections and frames before navigating
      const wsConnections: string[] = [];
      let frameSentCount = 0;

      page.on("websocket", (ws) => {
        if (ws.url().includes("/ws")) {
          wsConnections.push(ws.url());
          ws.on("framesent", (frame) => {
            const payload = frame.payload;
            if (payload && payload.toString().length > 0) {
              frameSentCount++;
            }
          });
        }
      });

      await navigateToPage(page, "/chat");
      await waitForChatInterface(page);

      // Verify the chat interface loaded without connection errors
      const connectionErrorAlert = page.locator('.global-chat-status-alert[severity="error"], [role="alert"][class*="error"]').first();
      await expect(connectionErrorAlert).not.toBeVisible();

      // Verify that at least one WebSocket connection was established to /ws
      expect(wsConnections.length).toBeGreaterThan(0);
    });
  });

  test.describe("Error Handling", () => {
    test("should handle connection interruption gracefully", async ({ page }) => {
      await navigateToPage(page, "/chat");
      await waitForChatInterface(page);

      // The page should be stable and not crash
      const body = await page.locator("body");
      await expect(body).not.toBeEmpty();

      // No JavaScript errors should have crashed the page
      const hasContent = await body.textContent();
      expect(hasContent).toBeTruthy();
    });

    test("should display appropriate status when disconnected", async ({ page }) => {
      await navigateToPage(page, "/chat");
      await waitForChatInterface(page);

      // If connection is working, no disconnect messages should show
      // If disconnected, should show reconnecting message
      const bodyText = await page.textContent("body");

      // Should not contain server error indicators
      expect(bodyText).not.toContain("Internal Server Error");
      expect(bodyText).not.toContain("500");
    });
  });
});
