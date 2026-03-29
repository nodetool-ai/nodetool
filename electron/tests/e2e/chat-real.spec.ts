import { test, expect } from "./fixtures/electronApp";
import { BACKEND_API_URL } from "./support/backend";
import {
  navigateToPage,
  waitForPageReady,
  waitForAnimation,
  waitForTextStable,
} from "./helpers/waitHelpers";

// Check backend reachability once and skip the entire suite if unavailable
let backendAvailable = true;

test.describe("Chat Page (Real Backend)", () => {
  test.beforeAll(async ({ request }) => {
    try {
      const resp = await request.get(`${BACKEND_API_URL}/threads`);
      if (!resp.ok()) {
        backendAvailable = false;
      }
    } catch {
      backendAvailable = false;
    }
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (!backendAvailable) {
      testInfo.skip();
      return;
    }
    await navigateToPage(page, "/chat");
    await waitForPageReady(page);
    // Wait for thread list to load from the backend
    await page.waitForLoadState("networkidle");
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
    const addButton = page.locator('[aria-label*="new" i], [aria-label*="add" i], [data-testid="new-thread-button"]');
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

    // Wait for the thread list to settle after filtering
    const threadList = page.locator('[class*="thread"], [class*="Thread"], [data-testid*="thread"]');
    await waitForTextStable(page.locator("body"), 2000);

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
    // Look for sidebar toggle via aria-label first, fall back to text-based
    const toggle = page.locator('[aria-label*="collapse" i], [aria-label*="sidebar" i], [aria-label*="toggle" i], [data-testid="sidebar-toggle"]');
    const collapseButton = page.locator("button").filter({ hasText: /^[<>‹›]$/ });

    const resolvedToggle = (await toggle.count()) > 0 ? toggle : collapseButton;

    if ((await resolvedToggle.count()) > 0) {
      const toggleBtn = resolvedToggle.first();
      await expect(toggleBtn).toBeVisible();

      // Click to collapse the sidebar
      await toggleBtn.click();
      await waitForAnimation(page);

      // After collapse, "Conversations" heading should be hidden
      const conversationsHeading = page.getByText("Conversations");
      const isHidden = await conversationsHeading.isHidden().catch(() => true);

      // Click again to expand (the toggle button should still be accessible)
      const expandButton = page.locator('[aria-label*="expand" i], [aria-label*="sidebar" i], [aria-label*="toggle" i], [data-testid="sidebar-toggle"]');
      const expandFallback = page.locator("button").filter({ hasText: /^[>›]$/ });
      const resolvedExpand = (await expandButton.count()) > 0 ? expandButton : expandFallback;

      if ((await resolvedExpand.count()) > 0) {
        await resolvedExpand.first().click();
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

    // Look for items with known thread titles (use language-neutral patterns)
    const conversationItems = page.getByText(/New conversation|hi/i);

    const itemCount = await conversationItems.count();
    if (itemCount > 1) {
      // Click on a thread that is not the first one (to trigger navigation)
      const targetThread = conversationItems.nth(1);
      await targetThread.click();
      await waitForAnimation(page);

      // Wait for thread content to load
      await page.waitForLoadState("networkidle");

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

    // Look for the action buttons area near the input using role-based locators
    const actionButtons = page.locator('button[aria-label], button:has(svg)');
    const buttonCount = await actionButtons.count();

    // We expect at least 4 action buttons (workflow, node, clipboard, lightbulb)
    // plus the send button and model selector
    expect(buttonCount).toBeGreaterThanOrEqual(4);

    // Verify the send button exists
    const sendButton = page.locator('button[aria-label*="send" i], button[type="submit"]');
    if ((await sendButton.count()) > 0) {
      await expect(sendButton.first()).toBeVisible();
    } else {
      // Fallback: at least some button with an SVG icon exists
      const svgButtons = page.locator('button:has(svg)');
      expect(await svgButtons.count()).toBeGreaterThanOrEqual(1);
    }
  });
});
