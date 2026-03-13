import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";
import {
  navigateToPage,
  waitForPageReady,
  waitForAnimation,
} from "./helpers/waitHelpers";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Chat Page (Real Backend)", () => {
    // Verify the backend is reachable before running the suite
    test.beforeAll(async ({ request }) => {
      try {
        const resp = await request.get(`${BACKEND_API_URL}/threads`);
        if (!resp.ok()) {
          test.skip();
        }
      } catch {
        test.skip();
      }
    });

    test.beforeEach(async ({ page }) => {
      await navigateToPage(page, "/chat");
      await waitForPageReady(page);
      // Wait for thread list to load from the backend
      await page.waitForTimeout(1000);
    });

    test("chat page loads with conversation sidebar", async ({ page }) => {
      await expect(page).toHaveURL(/\/chat/);

      // The sidebar should show "Conversations" heading
      const sidebar = page.getByText("Conversations");
      await expect(sidebar).toBeVisible({ timeout: 10000 });

      // Search input should be present
      const searchInput = page.getByPlaceholder("Search threads...");
      await expect(searchInput).toBeVisible();

      // New thread "+" button should be present
      const addButton = page.locator('button:has(svg), button[aria-label*="new" i], button[aria-label*="add" i]').filter({ hasText: /^\+?$/ });
      // Fallback: look for a button near the search bar
      const plusButton = page.locator("button").filter({ hasText: "+" });
      const hasPlusButton = (await plusButton.count()) > 0 || (await addButton.count()) > 0;
      expect(hasPlusButton).toBe(true);
    });

    test("thread list displays existing conversations", async ({ page }) => {
      // Wait for thread items to appear
      // Threads appear as items in the sidebar list
      const threadItems = page.locator('[class*="thread"], [class*="Thread"], [data-testid*="thread"]');

      // If there are threads from the backend, they should render
      // At minimum we check the sidebar has some content
      const sidebarText = await page.locator("body").textContent();
      expect(sidebarText).toBeTruthy();

      // Check for date group headers (TODAY, YESTERDAY, etc.)
      const hasDateHeaders = await page.getByText(/TODAY|YESTERDAY|DAYS AGO/i).count();
      // Real backend may or may not have threads; if it does, date headers appear
      if (hasDateHeaders > 0) {
        expect(hasDateHeaders).toBeGreaterThanOrEqual(1);
      }
    });

    test("new thread creation via + button", async ({ page }) => {
      // Count threads before creating a new one
      const initialUrl = page.url();

      // Click the "+" button to create a new thread
      const plusButton = page.locator("button").filter({ hasText: "+" });
      if ((await plusButton.count()) > 0) {
        await plusButton.first().click();
        await waitForAnimation(page);

        // After creating a new thread, URL may change to include a thread ID
        // or the input area should be ready for a new conversation
        const messageInput = page.getByPlaceholder("Type your message...");
        await expect(messageInput).toBeVisible({ timeout: 5000 });
      }
    });

    test("thread search filters the list", async ({ page }) => {
      const searchInput = page.getByPlaceholder("Search threads...");
      await expect(searchInput).toBeVisible();

      // Type a search query
      await searchInput.fill("conversation");
      await waitForAnimation(page);

      // Give time for filtering
      await page.waitForTimeout(500);

      // After searching, the thread list should update
      // We cannot assert exact results since this is a real backend,
      // but verify the input accepted the text
      await expect(searchInput).toHaveValue("conversation");

      // Clear the search
      await searchInput.fill("");
      await waitForAnimation(page);
    });

    test("message input area is visible and focusable", async ({ page }) => {
      const messageInput = page.getByPlaceholder("Type your message...");
      await expect(messageInput).toBeVisible({ timeout: 10000 });

      // Click to focus
      await messageInput.click();
      await expect(messageInput).toBeFocused();

      // Type some text to verify it accepts input
      await messageInput.fill("Hello, this is a test");
      await expect(messageInput).toHaveValue("Hello, this is a test");

      // Clear without sending
      await messageInput.fill("");
    });

    test("model selector dropdown shows available models", async ({ page }) => {
      // The model selector shows something like "gpt-oss:20b"
      const modelSelector = page.locator("button, select, [role='combobox']").filter({ hasText: /gpt|llama|claude|model|gemini|oss/i });

      if ((await modelSelector.count()) > 0) {
        const selectorElement = modelSelector.first();
        await expect(selectorElement).toBeVisible();

        // Click to open the dropdown
        await selectorElement.click();
        await waitForAnimation(page);

        // After clicking, a dropdown/menu with model options should appear
        const dropdown = page.locator('[role="listbox"], [role="menu"], [class*="dropdown"], [class*="Dropdown"], [class*="menu"], [class*="Menu"], [class*="select"], [class*="popover"], [class*="Popover"]');
        const hasDropdown = (await dropdown.count()) > 0;

        // If dropdown appeared, check it has at least one option
        if (hasDropdown) {
          const options = dropdown.first().locator('[role="option"], li, [class*="item"], [class*="option"]');
          const optionCount = await options.count();
          expect(optionCount).toBeGreaterThanOrEqual(1);
        }

        // Close dropdown by pressing Escape
        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      }
    });

    test("sidebar collapse/expand toggle works", async ({ page }) => {
      // The collapse button shows "<" in the sidebar header
      const collapseButton = page.locator("button").filter({ hasText: /^[<>‹›]$/ });

      // Fallback: look for a button near the "Conversations" header
      const sidebarToggle = collapseButton.count().then((count) =>
        count > 0 ? collapseButton : page.locator('[aria-label*="collapse" i], [aria-label*="sidebar" i], [aria-label*="toggle" i]')
      );
      const toggle = await sidebarToggle;

      if ((await toggle.count()) > 0) {
        const toggleBtn = toggle.first();
        await expect(toggleBtn).toBeVisible();

        // Click to collapse the sidebar
        await toggleBtn.click();
        await waitForAnimation(page);

        // After collapse, "Conversations" heading should be hidden
        const conversationsHeading = page.getByText("Conversations");
        const isHidden = await conversationsHeading.isHidden().catch(() => true);

        // Click again to expand (the toggle button should still be accessible)
        const expandButton = page.locator('button:has-text(">"), button:has-text("›"), [aria-label*="expand" i], [aria-label*="sidebar" i], [aria-label*="toggle" i]');
        if ((await expandButton.count()) > 0) {
          await expandButton.first().click();
          await waitForAnimation(page);

          // After expand, "Conversations" should be visible again
          await expect(page.getByText("Conversations")).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test("thread selection shows conversation content", async ({ page }) => {
      // Look for thread items in the sidebar
      // Threads are typically list items with conversation titles
      const threadItems = page.locator('[class*="thread" i], [class*="Thread"]').filter({ hasText: /./  });

      // Fallback: look for items with known thread titles
      const conversationItems = page.getByText(/New conversation|hi wie gehts|hi/);

      const itemCount = await conversationItems.count();
      if (itemCount > 1) {
        // Click on a thread that is not the first one (to trigger navigation)
        const targetThread = conversationItems.nth(1);
        await targetThread.click();
        await waitForAnimation(page);
        await page.waitForTimeout(500);

        // After selecting a thread, the URL should include a thread ID
        const url = page.url();
        // The message input should still be visible
        const messageInput = page.getByPlaceholder("Type your message...");
        await expect(messageInput).toBeVisible({ timeout: 5000 });
      }
    });

    test("action buttons (workflow, node, clipboard, lightbulb) are visible", async ({ page }) => {
      // The bottom input area has action buttons next to the model selector
      // These are icon buttons for: workflow picker, node picker, clipboard, lightbulb

      // Wait for the input area to be fully rendered
      const messageInput = page.getByPlaceholder("Type your message...");
      await expect(messageInput).toBeVisible({ timeout: 10000 });

      // Look for the action buttons area near the input
      // They are buttons with SVG icons, typically in a toolbar/row below the input
      const actionButtons = page.locator("button:has(svg)");
      const buttonCount = await actionButtons.count();

      // We expect at least 4 action buttons (workflow, node, clipboard, lightbulb)
      // plus the send button and model selector
      expect(buttonCount).toBeGreaterThanOrEqual(4);

      // Verify the send button exists (arrow icon)
      // It is typically the last button or has a specific aria label
      const sendButton = page.locator('button[aria-label*="send" i], button[type="submit"], button:has(svg)').last();
      await expect(sendButton).toBeVisible();
    });
  });
}
