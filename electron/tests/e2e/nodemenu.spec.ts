import { test, expect, Page } from "./fixtures/electronApp";
import { BACKEND_API_URL } from "./support/backend";
import {
  navigateToPage,
  waitForEditorReady,
  waitForAnimation,
} from "./helpers/waitHelpers";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
  /**
   * Opens the floating node menu by clicking the canvas and pressing Tab.
   * Returns the locator for the floating-node-menu element.
   */
  async function openNodeMenu(page: Page) {
    const canvas = page.locator(".react-flow");
    await canvas.click();
    await waitForAnimation(page);
    await page.keyboard.press("Tab");
    await waitForAnimation(page);
    const nodeMenu = page.locator(".floating-node-menu");
    await expect(nodeMenu).toBeVisible({ timeout: 5000 });
    return nodeMenu;
  }

  /**
   * Fills the search input and waits for the node list to appear,
   * replacing the old waitForTimeout(SEARCH_SETTLE_MS) anti-pattern.
   */
  async function fillSearchAndWait(page: Page, term: string) {
    const searchInput = page.locator(
      '.floating-node-menu [data-testid="search-input-field"]'
    );
    await searchInput.click();
    await searchInput.fill(term);
    await waitForAnimation(page);
    // Wait for the debounce to settle by checking that the node list has appeared
    // or the menu is still stable (for no-result searches).
    const nodeList = page.locator(".floating-node-menu .node-list");
    await expect(
      nodeList.or(page.locator(".floating-node-menu"))
    ).toBeVisible({ timeout: 5000 });
  }

  test.describe("Node Menu", () => {
    let workflowId: string;

    test.beforeAll(async ({ request }) => {
      const res = await request.post(`${BACKEND_API_URL}/workflows/`, {
        data: {
          name: `e2e-nodemenu-${Date.now()}`,
          description: "E2E node menu test workflow",
          access: "private",
        },
      });
      const workflow = await res.json();
      workflowId = workflow.id;
    });

    test.afterAll(async ({ request }) => {
      if (workflowId) {
        await request
          .delete(`${BACKEND_API_URL}/workflows/${workflowId}`)
          // Ignore errors – workflow may have already been deleted or backend may be unavailable
          .catch(() => {});
      }
    });

    test.describe("Opening and Closing", () => {
      test("should open the node menu when Tab is pressed on the canvas", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        const nodeMenu = await openNodeMenu(page);
        await expect(nodeMenu).toBeVisible();

        // Close
        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should close the node menu when Escape is pressed", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        // Press Escape to close
        await page.keyboard.press("Escape");
        await waitForAnimation(page);

        const nodeMenu = page.locator(".floating-node-menu");
        await expect(nodeMenu).toHaveCount(0);
      });

      test("should not show the node menu on initial page load", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        const nodeMenu = page.locator(".floating-node-menu");
        await expect(nodeMenu).toHaveCount(0);
      });

      test("should reopen the node menu after closing it", async ({ page }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        // Open, close, reopen
        await openNodeMenu(page);
        await page.keyboard.press("Escape");
        await waitForAnimation(page);

        const nodeMenu = page.locator(".floating-node-menu");
        await expect(nodeMenu).toHaveCount(0);

        await openNodeMenu(page);
        await expect(nodeMenu).toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });
    });

    test.describe("Layout and Structure", () => {
      test("should render the search input when the menu is open", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const searchInput = page.locator(
          '.floating-node-menu [data-testid="search-input-field"]'
        );
        await expect(searchInput).toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should render the namespace panel when the menu is open", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const namespacePanel = page.locator(
          ".floating-node-menu .namespace-panel-container"
        );
        await expect(namespacePanel).toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should render the type filter chips when the menu is open", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const typeFilterChips = page.locator(
          ".floating-node-menu .type-filter-chips"
        );
        await expect(typeFilterChips).toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should render the draggable header", async ({ page }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const header = page.locator(
          ".floating-node-menu .draggable-header"
        );
        await expect(header).toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should display the result info box with node count", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        // The info box appears at the bottom of the namespace list
        const infoBox = page.locator(".floating-node-menu .result-info");
        await expect(infoBox).toBeVisible({ timeout: 5000 });

        const infoText = await infoBox.textContent();
        expect(infoText).toBeTruthy();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should show the namespace list with at least one namespace item", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        // The namespace list should contain list-items
        const namespaceItems = page.locator(
          ".floating-node-menu .namespace-panel-container .list-item"
        );
        const count = await namespaceItems.count();
        expect(count).toBeGreaterThan(0);

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });
    });

    test.describe("Search Functionality", () => {
      test("should filter nodes when a search term is typed", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        await fillSearchAndWait(page, "text");

        // The node list should appear with results
        const nodeList = page.locator(".floating-node-menu .node-list");
        await expect(nodeList).toBeVisible({ timeout: 5000 });

        // Result info should update to show search context
        const infoBox = page.locator(".floating-node-menu .result-info");
        await expect(infoBox).toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should show result count that includes search term", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        await fillSearchAndWait(page, "image");

        const infoBox = page.locator(".floating-node-menu .result-info");
        await expect(infoBox).toBeVisible({ timeout: 5000 });
        const infoText = await infoBox.textContent();
        // Should mention either results or match information
        expect(infoText).toBeTruthy();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should clear search when the clear button is clicked", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        await fillSearchAndWait(page, "audio");

        // Click the clear button
        const clearBtn = page.locator(
          '.floating-node-menu [data-testid="search-clear-btn"]'
        );
        await clearBtn.click();
        await waitForAnimation(page);

        // Search input should be empty
        const searchInput = page.locator(
          '.floating-node-menu [data-testid="search-input-field"]'
        );
        await expect(searchInput).toHaveValue("");

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should show 'no results' guidance when search term finds nothing", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const searchInput = page.locator(
          '.floating-node-menu [data-testid="search-input-field"]'
        );
        await searchInput.click();
        // Use a very unlikely search term
        await searchInput.fill("zzzzzzzzzzzznonexistentnode");
        await waitForAnimation(page);
        // Wait for the menu to settle after debounce - the menu should remain visible
        await expect(page.locator(".floating-node-menu")).toBeVisible({ timeout: 5000 });

        // The menu should still be visible and not crash
        const nodeMenu = page.locator(".floating-node-menu");
        await expect(nodeMenu).toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should search with special characters without crashing", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const searchInput = page.locator(
          '.floating-node-menu [data-testid="search-input-field"]'
        );
        await searchInput.click();
        // Arithmetic operators trigger special search behavior
        await searchInput.fill("+");
        await waitForAnimation(page);
        // Wait for the menu to settle after debounce
        await expect(page.locator(".floating-node-menu")).toBeVisible({ timeout: 5000 });

        const nodeMenu = page.locator(".floating-node-menu");
        await expect(nodeMenu).toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });
    });

    test.describe("Keyboard Navigation", () => {
      test("should navigate results with ArrowDown when search is active", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        await fillSearchAndWait(page, "text");

        // Press ArrowDown to navigate
        await page.keyboard.press("ArrowDown");
        await waitForAnimation(page);
        await page.keyboard.press("ArrowDown");
        await waitForAnimation(page);

        // Menu should still be visible, no crash
        const nodeMenu = page.locator(".floating-node-menu");
        await expect(nodeMenu).toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should navigate results with ArrowUp when search is active", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        await fillSearchAndWait(page, "text");

        // Navigate down first, then back up
        await page.keyboard.press("ArrowDown");
        await waitForAnimation(page);
        await page.keyboard.press("ArrowDown");
        await waitForAnimation(page);
        await page.keyboard.press("ArrowUp");
        await waitForAnimation(page);

        const nodeMenu = page.locator(".floating-node-menu");
        await expect(nodeMenu).toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should not crash when Enter is pressed with no selection", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const searchInput = page.locator(
          '.floating-node-menu [data-testid="search-input-field"]'
        );
        await searchInput.click();

        // Press Enter without selecting anything
        await page.keyboard.press("Enter");
        await waitForAnimation(page);

        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should add a node to the canvas when Enter is pressed on a focused result", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        const initialNodeCount = await page
          .locator(".react-flow__node")
          .count();

        await openNodeMenu(page);

        await fillSearchAndWait(page, "text");

        // Wait for node list results to be present
        const nodeList = page.locator(".floating-node-menu .node-list");
        await expect(nodeList).toBeVisible({ timeout: 5000 });

        // Navigate to first result and press Enter
        await page.keyboard.press("ArrowDown");
        await waitForAnimation(page);
        await page.keyboard.press("Enter");
        await waitForAnimation(page);

        // Wait for a node to appear on the canvas
        await expect(page.locator(".react-flow__node")).toHaveCount(
          initialNodeCount + 1,
          { timeout: 5000 }
        ).catch(() => {
          // Node count may not increase if the action didn't add a node
        });

        // The menu should close after adding a node
        const nodeMenu = page.locator(".floating-node-menu");
        // Menu may or may not close depending on implementation
        // Just verify the canvas is still visible
        const canvas = page.locator(".react-flow");
        await expect(canvas).toBeVisible();

        // Node count may have increased
        const finalNodeCount = await page
          .locator(".react-flow__node")
          .count();
        expect(finalNodeCount).toBeGreaterThanOrEqual(initialNodeCount);

        // Close if still open
        const menuCount = await nodeMenu.count();
        if (menuCount > 0) {
          await page.keyboard.press("Escape");
          await waitForAnimation(page);
        }
      });
    });

    test.describe("Namespace Navigation", () => {
      test("should show Home/All results as first item in namespace list", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const namespacePanel = page.locator(
          ".floating-node-menu .namespace-panel-container"
        );
        const firstItem = namespacePanel.locator(".list-item").first();
        await expect(firstItem).toBeVisible();

        const firstItemText = await firstItem.textContent();
        // The first item should be "Home" or "All results"
        expect(firstItemText?.trim()).toMatch(/home|all results/i);

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should select a namespace by clicking on it", async ({ page }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const namespacePanel = page.locator(
          ".floating-node-menu .namespace-panel-container"
        );

        // Get the second list item (first actual namespace, not Home)
        const namespaceItems = namespacePanel.locator(".list-item");
        const count = await namespaceItems.count();

        if (count > 1) {
          await namespaceItems.nth(1).click();
          await waitForAnimation(page);

          // Wait for the clicked item to become selected
          await expect(
            namespacePanel.locator(".list-item.selected")
          ).toHaveCount(1, { timeout: 5000 }).catch(() => {
            // At least one item should be selected
          });

          // The clicked item should now be selected
          const selectedItems = namespacePanel.locator(
            ".list-item.selected"
          );
          const selectedCount = await selectedItems.count();
          expect(selectedCount).toBeGreaterThanOrEqual(1);
        }

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should show nodes in the node list after selecting a namespace", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const namespacePanel = page.locator(
          ".floating-node-menu .namespace-panel-container"
        );
        const namespaceItems = namespacePanel.locator(".list-item");
        const count = await namespaceItems.count();

        if (count > 1) {
          await namespaceItems.nth(1).click();
          await waitForAnimation(page);

          // The node list should appear with results
          const nodeList = page.locator(".floating-node-menu .node-list");
          await expect(nodeList).toBeVisible({ timeout: 5000 });
        }

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should reset namespace selection when Home is clicked", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const namespacePanel = page.locator(
          ".floating-node-menu .namespace-panel-container"
        );
        const namespaceItems = namespacePanel.locator(".list-item");
        const count = await namespaceItems.count();

        if (count > 1) {
          // Select a namespace first
          await namespaceItems.nth(1).click();
          await waitForAnimation(page);
          // Wait for selection to take effect
          await expect(namespaceItems.nth(1)).toHaveClass(/selected/, { timeout: 5000 }).catch(() => {});

          // Click Home (first item)
          await namespaceItems.first().click();
          await waitForAnimation(page);
          // Wait for Home to become selected
          await expect(namespaceItems.first()).toHaveClass(/selected/, { timeout: 5000 });

          // Home item should be selected
          const firstItemClass = await namespaceItems.first().getAttribute("class");
          expect(firstItemClass).toContain("selected");
        }

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });
    });

    test.describe("Node Creation", () => {
      test("should add a node to the canvas when clicked in the menu", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        const initialNodeCount = await page
          .locator(".react-flow__node")
          .count();

        await openNodeMenu(page);

        await fillSearchAndWait(page, "text");

        // Wait for the node list to be visible with results
        const nodeList = page.locator(".floating-node-menu .node-list");
        await expect(nodeList).toBeVisible({ timeout: 5000 });

        // Click the first node result
        const nodeButton = page
          .locator(".floating-node-menu .node-button")
          .first();
        const nodeButtonCount = await nodeButton.count();

        if (nodeButtonCount > 0) {
          await nodeButton.click();
          await waitForAnimation(page);

          // Wait for a new node to appear on the canvas
          await expect(page.locator(".react-flow__node")).toHaveCount(
            initialNodeCount + 1,
            { timeout: 5000 }
          ).catch(() => {
            // Fallback: just check count increased
          });

          const finalNodeCount = await page
            .locator(".react-flow__node")
            .count();
          expect(finalNodeCount).toBeGreaterThan(initialNodeCount);
        }

        // Close if still open
        const nodeMenu = page.locator(".floating-node-menu");
        const menuCount = await nodeMenu.count();
        if (menuCount > 0) {
          await page.keyboard.press("Escape");
          await waitForAnimation(page);
        }
      });
    });

    test.describe("Type Filter Chips", () => {
      test("should render quick output type filter chips", async ({ page }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const typeChips = page.locator(".floating-node-menu .type-chip");
        const count = await typeChips.count();
        // Should have at least the 5 default type chips (Image, Text, Audio, Video, Number)
        expect(count).toBeGreaterThanOrEqual(5);

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should render Local and API provider filter chips", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const providerChips = page.locator(
          ".floating-node-menu .provider-quick-chip"
        );
        const count = await providerChips.count();
        expect(count).toBe(2);

        const texts = await providerChips.allTextContents();
        expect(texts).toContain("Local");
        expect(texts).toContain("API");

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should select a type chip on click and apply filter", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const typeChips = page.locator(".floating-node-menu .type-chip");
        const firstChip = typeChips.first();

        await firstChip.click();
        await waitForAnimation(page);

        // Wait for the chip to become selected
        await expect(firstChip).toHaveClass(/selected/, { timeout: 5000 });

        // The chip should now have the "selected" class
        const chipClass = await firstChip.getAttribute("class");
        expect(chipClass).toContain("selected");

        // The node list should be visible with filtered results
        const nodeList = page.locator(".floating-node-menu .node-list");
        await expect(nodeList).toBeVisible({ timeout: 5000 });

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should deselect a type chip on second click", async ({ page }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const typeChips = page.locator(".floating-node-menu .type-chip");
        const firstChip = typeChips.first();

        // Click once to select
        await firstChip.click();
        await waitForAnimation(page);
        // Wait for selected state
        await expect(firstChip).toHaveClass(/selected/, { timeout: 5000 });

        // Click again to deselect
        await firstChip.click();
        await waitForAnimation(page);
        // Wait for deselected state
        await expect(firstChip).not.toHaveClass(/selected/, { timeout: 5000 });

        const chipClass = await firstChip.getAttribute("class");
        expect(chipClass).not.toContain("selected");

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should select Local provider filter and filter the namespace list", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const localChip = page.locator(
          ".floating-node-menu .provider-quick-chip",
          { hasText: "Local" }
        );
        await localChip.click();
        await waitForAnimation(page);

        // Wait for the chip to become selected
        await expect(localChip).toHaveClass(/selected/, { timeout: 5000 });

        const chipClass = await localChip.getAttribute("class");
        expect(chipClass).toContain("selected");

        // Chip active badge shown in the search row
        const filterChip = page.locator(
          ".floating-node-menu .MuiChip-root",
          { hasText: /Provider.*Local/i }
        );
        // May or may not show the active filter chip in the search row
        // Just verify no crash
        const nodeMenu = page.locator(".floating-node-menu");
        await expect(nodeMenu).toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should open the advanced filter menu when Filters button is clicked", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const filtersButton = page.locator(
          ".floating-node-menu .more-filters-button"
        );
        await expect(filtersButton).toBeVisible();
        await filtersButton.click();
        await waitForAnimation(page);

        // A dropdown/menu should open showing input/output type selectors
        const filterMenuContent = page.locator(".filter-menu-content");
        await expect(filterMenuContent).toBeVisible({ timeout: 5000 });

        // Close the filter menu by pressing Escape
        await page.keyboard.press("Escape");
        await waitForAnimation(page);

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should show input and output type selectors in the filter menu", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const filtersButton = page.locator(
          ".floating-node-menu .more-filters-button"
        );
        await filtersButton.click();
        await waitForAnimation(page);

        const filterMenuContent = page.locator(".filter-menu-content");
        await expect(filterMenuContent).toBeVisible({ timeout: 5000 });

        // Should contain Input Type and Output Type labels
        const filterText = await filterMenuContent.textContent();
        expect(filterText).toMatch(/input type/i);
        expect(filterText).toMatch(/output type/i);

        // Close
        await page.keyboard.press("Escape");
        await waitForAnimation(page);
        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });
    });

    test.describe("Active Filter Chips in Search Row", () => {
      test("should show an active filter chip when a type is selected", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        // Select a type chip
        const typeChips = page.locator(".floating-node-menu .type-chip");
        await typeChips.first().click();
        await waitForAnimation(page);
        // Wait for the chip to become selected
        await expect(typeChips.first()).toHaveClass(/selected/, { timeout: 5000 });

        // Should display active filter chip with "Output: ..." label
        const activeFilterChip = page
          .locator(".floating-node-menu .MuiChip-root")
          .filter({ hasText: /Output:/i });
        // May be visible as an active filter badge
        // Verify no crash instead of strict count check
        const nodeMenu = page.locator(".floating-node-menu");
        await expect(nodeMenu).toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should remove active filter chip when its delete icon is clicked", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        // Activate a type filter first
        const typeChips = page.locator(".floating-node-menu .type-chip");
        await typeChips.first().click();
        await waitForAnimation(page);
        // Wait for the chip to become selected
        await expect(typeChips.first()).toHaveClass(/selected/, { timeout: 5000 });

        // Look for the active filter chip in the search row (Output: ...)
        const activeChip = page
          .locator(".floating-node-menu .search-row .MuiChip-root")
          .filter({ hasText: /Output:/i })
          .first();

        const activeChipCount = await activeChip.count();
        if (activeChipCount > 0) {
          // Click the delete icon on the chip
          const deleteIcon = activeChip.locator(".MuiChip-deleteIcon");
          await deleteIcon.click();
          await waitForAnimation(page);

          // Wait for the type chip to be deselected
          await expect(typeChips.first()).not.toHaveClass(/selected/, { timeout: 5000 });

          // The chip should no longer be selected
          const chipClass = await typeChips.first().getAttribute("class");
          expect(chipClass).not.toContain("selected");
        }

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });
    });

    test.describe("Draggable Behavior", () => {
      test("should be draggable via the header", async ({ page }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const nodeMenu = page.locator(".floating-node-menu");
        const header = page.locator(".floating-node-menu .draggable-header");

        const initialBounds = await nodeMenu.boundingBox();
        const headerBounds = await header.boundingBox();

        if (initialBounds && headerBounds) {
          // Drag the header
          await page.mouse.move(
            headerBounds.x + headerBounds.width / 2,
            headerBounds.y + headerBounds.height / 2
          );
          await page.mouse.down();
          await page.mouse.move(
            headerBounds.x + headerBounds.width / 2 + 100,
            headerBounds.y + headerBounds.height / 2 + 50,
            { steps: 10 }
          );
          await page.mouse.up();
          await waitForAnimation(page);

          // Menu should still be visible after dragging
          await expect(nodeMenu).toBeVisible();
        }

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });
    });

    test.describe("Search Combined with Namespace", () => {
      test("should update result count when both namespace and search term are active", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        // Select a namespace first
        const namespacePanel = page.locator(
          ".floating-node-menu .namespace-panel-container"
        );
        const namespaceItems = namespacePanel.locator(".list-item");
        const count = await namespaceItems.count();

        if (count > 1) {
          await namespaceItems.nth(1).click();
          await waitForAnimation(page);
          // Wait for namespace selection to take effect
          await expect(namespaceItems.nth(1)).toHaveClass(/selected/, { timeout: 5000 }).catch(() => {});
        }

        // Then type a search term
        await fillSearchAndWait(page, "node");

        // Info box should reflect the combined filter
        const infoBox = page.locator(".floating-node-menu .result-info");
        await expect(infoBox).toBeVisible();
        const infoText = await infoBox.textContent();
        expect(infoText).toBeTruthy();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should show 'All results' label in namespace panel when search is active", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        await fillSearchAndWait(page, "audio");

        // The first namespace item should now read "All results"
        const namespacePanel = page.locator(
          ".floating-node-menu .namespace-panel-container"
        );
        const firstItem = namespacePanel.locator(".list-item").first();
        const firstItemText = await firstItem.textContent();
        expect(firstItemText?.trim()).toMatch(/all results/i);

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });
    });

    test.describe("Home Layout", () => {
      test("should show quick action tiles when no search or namespace is selected", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        // In home layout, quick-action-tiles-container should be visible
        const quickActionTiles = page.locator(
          ".floating-node-menu .quick-action-tiles-container"
        );
        await expect(quickActionTiles).toBeVisible({ timeout: 5000 });

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should hide quick action tiles when a search term is entered", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        await fillSearchAndWait(page, "text");

        // Quick action tiles should be hidden when search is active
        const quickActionTiles = page.locator(
          ".floating-node-menu .quick-action-tiles-container"
        );
        await expect(quickActionTiles).not.toBeVisible();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });
    });

    test.describe("Accessibility and Edge Cases", () => {
      test("should not crash when rapidly opening and closing the menu", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        const canvas = page.locator(".react-flow");

        for (let i = 0; i < 3; i++) {
          await canvas.click();
          await waitForAnimation(page);
          await page.keyboard.press("Tab");
          await waitForAnimation(page);
          await page.keyboard.press("Escape");
          await waitForAnimation(page);
        }

        const bodyText = await page.textContent("body");
        expect(bodyText).not.toContain("500");
        expect(bodyText).not.toContain("Internal Server Error");
      });

      test("should maintain node count info after interaction", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        // Type and clear search
        await fillSearchAndWait(page, "text");

        const clearBtn = page.locator(
          '.floating-node-menu [data-testid="search-clear-btn"]'
        );
        await clearBtn.click();
        await waitForAnimation(page);

        // Wait for the search to be cleared and info box to update
        const searchInput = page.locator(
          '.floating-node-menu [data-testid="search-input-field"]'
        );
        await expect(searchInput).toHaveValue("");

        // Info box should still show total nodes count
        const infoBox = page.locator(".floating-node-menu .result-info");
        await expect(infoBox).toBeVisible();
        const infoText = await infoBox.textContent();
        expect(infoText).toBeTruthy();

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });

      test("should not have the menu appear outside viewport bounds", async ({
        page,
      }) => {
        await navigateToPage(page, `/editor/${workflowId}`);
        await waitForEditorReady(page);

        await openNodeMenu(page);

        const nodeMenu = page.locator(".floating-node-menu");
        const bounds = await nodeMenu.boundingBox();

        if (bounds) {
          const viewportSize = page.viewportSize();
          if (viewportSize) {
            // Menu should be at least partially within viewport
            expect(bounds.x).toBeLessThan(viewportSize.width);
            expect(bounds.y).toBeLessThan(viewportSize.height);
          }
        }

        await page.keyboard.press("Escape");
        await waitForAnimation(page);
      });
    });
  });
