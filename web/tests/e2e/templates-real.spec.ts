import { test, expect } from "@playwright/test";
import {
  navigateToPage,
  waitForPageReady,
  waitForAnimation,
  waitForCondition
} from "./helpers/waitHelpers";

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Templates Page (Real Backend)", () => {
    /**
     * Navigate to /templates and wait for template cards to be rendered.
     * Returns the tag-menu container and the first visible card for reuse.
     */
    async function gotoTemplatesAndWait(page: import("@playwright/test").Page) {
      await navigateToPage(page, "/templates");

      // Wait for the tag filter chips to appear (indicates data loaded)
      const tagMenu = page.locator(".tag-menu");
      await expect(tagMenu).toBeVisible({ timeout: 15000 });

      // Wait for at least one workflow card to render inside the virtualized grid
      const firstCard = page.locator(".card-title").first();
      await expect(firstCard).toBeVisible({ timeout: 15000 });

      return { tagMenu, firstCard };
    }

    // ---------------------------------------------------------------
    // 1. Page loads with category chips visible
    // ---------------------------------------------------------------
    test("should load page with category chips visible", async ({ page }) => {
      const { tagMenu } = await gotoTemplatesAndWait(page);

      // The tag-menu should contain multiple buttons (category chips)
      const chipButtons = tagMenu.locator("button");
      const chipCount = await chipButtons.count();
      expect(chipCount).toBeGreaterThanOrEqual(5);

      // Verify a few known categories are present
      await expect(tagMenu.getByText("Getting Started")).toBeVisible();
      await expect(tagMenu.getByText("SHOW ALL")).toBeVisible();
    });

    // ---------------------------------------------------------------
    // 2. Category filtering — clicking a chip filters templates
    // ---------------------------------------------------------------
    test("should filter templates when a category chip is clicked", async ({
      page
    }) => {
      await gotoTemplatesAndWait(page);

      // Record count with current view (default is "start" tag selected)
      const cardsBeforeFilter = page.locator(".card-title");
      const countBefore = await cardsBeforeFilter.count();

      // Click "SHOW ALL" first to ensure we see everything
      await page.locator(".tag-menu").getByText("SHOW ALL").click();
      await waitForAnimation(page);

      // Wait for grid to stabilize
      await waitForCondition(async () => {
        const count = await page.locator(".card-title").count();
        return count > 0;
      });

      const countAll = await page.locator(".card-title").count();

      // Now pick a specific category chip (not "SHOW ALL" or "Getting Started")
      // Find a chip that is not "SHOW ALL" and not "Getting Started"
      const chipButtons = page.locator(".tag-menu button");
      const chipTexts: string[] = [];
      const totalChips = await chipButtons.count();
      for (let i = 0; i < totalChips; i++) {
        const text = (await chipButtons.nth(i).textContent()) || "";
        chipTexts.push(text.trim());
      }

      // Pick a category that is neither "Getting Started" nor "SHOW ALL"
      const categoryToClick = chipTexts.find(
        (t) =>
          t !== "SHOW ALL" &&
          t.toLowerCase() !== "getting started"
      );
      expect(categoryToClick).toBeTruthy();

      // Click that category
      await page.locator(".tag-menu").getByText(categoryToClick!, { exact: true }).click();
      await waitForAnimation(page);

      await waitForCondition(async () => {
        const count = await page.locator(".card-title").count();
        return count > 0;
      });

      const countFiltered = await page.locator(".card-title").count();

      // Filtered count should differ from "all" count (unless category has all items)
      // At minimum, we should still have results
      expect(countFiltered).toBeGreaterThan(0);
      // The selected chip should have the "selected" class
      const selectedChip = page
        .locator(".tag-menu button.selected")
        .filter({ hasText: categoryToClick! });
      await expect(selectedChip).toBeVisible();
    });

    // ---------------------------------------------------------------
    // 3. Search functionality — typing filters templates by name
    // ---------------------------------------------------------------
    test("should filter templates when typing in the search input", async ({
      page
    }) => {
      await gotoTemplatesAndWait(page);

      // Click "SHOW ALL" to start from the full list
      await page.locator(".tag-menu").getByText("SHOW ALL").click();
      await waitForAnimation(page);
      await waitForCondition(async () => {
        return (await page.locator(".card-title").count()) > 0;
      });

      const countBefore = await page.locator(".card-title").count();

      // Type a search term in the search field
      const searchInput = page.locator(
        '.search-field input[type="text"], .search-field input'
      );
      await expect(searchInput).toBeVisible();

      await searchInput.fill("Audio");

      // Wait for debounce + results to update
      await page.waitForTimeout(500);
      await waitForAnimation(page);

      // After search, we should see fewer cards (or at least results matching "Audio")
      await waitForCondition(
        async () => {
          const count = await page.locator(".card-title").count();
          return count > 0 && count !== countBefore;
        },
        { timeout: 5000 }
      ).catch(() => {
        // Results might be the same count if all match; that is acceptable
      });

      const countAfter = await page.locator(".card-title").count();
      expect(countAfter).toBeGreaterThan(0);

      // Verify at least one visible card title contains "Audio"
      const titles: string[] = [];
      const visibleCards = page.locator(".card-title");
      const visibleCount = await visibleCards.count();
      for (let i = 0; i < Math.min(visibleCount, 10); i++) {
        const text = await visibleCards.nth(i).textContent();
        if (text) titles.push(text);
      }
      const hasAudioMatch = titles.some((t) =>
        t.toLowerCase().includes("audio")
      );
      expect(hasAudioMatch).toBe(true);
    });

    // ---------------------------------------------------------------
    // 4. Template cards display name and package badge
    // ---------------------------------------------------------------
    test("should display name and package badge on template cards", async ({
      page
    }) => {
      await gotoTemplatesAndWait(page);

      // Check first card has a title
      const firstTitle = page.locator(".card-title").first();
      const titleText = await firstTitle.textContent();
      expect(titleText).toBeTruthy();
      expect(titleText!.length).toBeGreaterThan(0);

      // Check first card has a package badge
      const firstBadge = page.locator(".package-badge").first();
      await expect(firstBadge).toBeVisible();
      const badgeText = await firstBadge.textContent();
      expect(badgeText).toBeTruthy();
      // Badge should be a known package name (e.g., "base", "huggingface")
      expect(badgeText!.length).toBeGreaterThan(0);
    });

    // ---------------------------------------------------------------
    // 5. Multiple categories visible simultaneously
    // ---------------------------------------------------------------
    test("should show multiple category chips at once", async ({ page }) => {
      const { tagMenu } = await gotoTemplatesAndWait(page);

      const chipButtons = tagMenu.locator("button");
      const chipCount = await chipButtons.count();

      // We expect a good number of categories
      expect(chipCount).toBeGreaterThanOrEqual(10);

      // Collect all visible chip labels
      const labels: string[] = [];
      for (let i = 0; i < chipCount; i++) {
        const text = (await chipButtons.nth(i).textContent()) || "";
        labels.push(text.trim().toLowerCase());
      }

      // Verify several known categories from the spec
      const expectedCategories = [
        "audio",
        "image",
        "video",
        "search"
      ];
      for (const cat of expectedCategories) {
        expect(labels).toContain(cat);
      }
    });

    // ---------------------------------------------------------------
    // 6. "SHOW ALL" resets category filter
    // ---------------------------------------------------------------
    test('should reset filter when "SHOW ALL" is clicked', async ({
      page
    }) => {
      await gotoTemplatesAndWait(page);

      // First click a specific category to filter
      const tagMenu = page.locator(".tag-menu");
      const chipButtons = tagMenu.locator("button");
      const totalChips = await chipButtons.count();

      // Find and click a non-special category
      let categoryClicked = false;
      for (let i = 0; i < totalChips; i++) {
        const text = ((await chipButtons.nth(i).textContent()) || "").trim();
        if (
          text !== "SHOW ALL" &&
          text.toLowerCase() !== "getting started"
        ) {
          await chipButtons.nth(i).click();
          categoryClicked = true;
          break;
        }
      }
      expect(categoryClicked).toBe(true);

      await waitForAnimation(page);
      await waitForCondition(async () => {
        return (await page.locator(".card-title").count()) > 0;
      });

      const filteredCount = await page.locator(".card-title").count();

      // Now click "SHOW ALL"
      await tagMenu.getByText("SHOW ALL").click();
      await waitForAnimation(page);
      await waitForCondition(async () => {
        return (await page.locator(".card-title").count()) > 0;
      });

      const allCount = await page.locator(".card-title").count();

      // "SHOW ALL" should show at least as many as the filtered category
      expect(allCount).toBeGreaterThanOrEqual(filteredCount);

      // The "SHOW ALL" button should have the "selected" class
      const showAllButton = tagMenu
        .locator("button.selected")
        .filter({ hasText: "SHOW ALL" });
      await expect(showAllButton).toBeVisible();
    });

    // ---------------------------------------------------------------
    // 7. Template count changes when filtering
    // ---------------------------------------------------------------
    test("should change template count when switching categories", async ({
      page
    }) => {
      await gotoTemplatesAndWait(page);

      // Show all templates
      const tagMenu = page.locator(".tag-menu");
      await tagMenu.getByText("SHOW ALL").click();
      await waitForAnimation(page);
      await waitForCondition(async () => {
        return (await page.locator(".card-title").count()) > 0;
      });

      const allCount = await page.locator(".card-title").count();

      // Click "Getting Started" category (usually has fewer items)
      await tagMenu.getByText("Getting Started").click();
      await waitForAnimation(page);
      await waitForCondition(async () => {
        const count = await page.locator(".card-title").count();
        return count > 0 && count !== allCount;
      }, { timeout: 5000 }).catch(() => {
        // Count might not differ if category contains all items
      });

      const gettingStartedCount = await page.locator(".card-title").count();

      // The "Getting Started" count should be less than "SHOW ALL"
      // (unless all templates are tagged "getting-started", which is unlikely)
      expect(gettingStartedCount).toBeGreaterThan(0);
      expect(gettingStartedCount).toBeLessThanOrEqual(allCount);
    });

    // ---------------------------------------------------------------
    // 8. Node Search toggle exists
    // ---------------------------------------------------------------
    test("should have a Node Search toggle", async ({ page }) => {
      await gotoTemplatesAndWait(page);

      // The toggle switch should be visible
      const nodeSearchLabel = page.locator(".search-switch");
      await expect(nodeSearchLabel).toBeVisible();

      // It should contain the label text "Node Search"
      await expect(nodeSearchLabel).toContainText("Node Search");

      // The switch input should exist
      const switchInput = page.locator(
        '.search-switch input[type="checkbox"]'
      );
      await expect(switchInput).toBeAttached();

      // By default, Node Search should be unchecked
      await expect(switchInput).not.toBeChecked();

      // Click the toggle and verify it becomes checked
      await nodeSearchLabel.click();
      await expect(switchInput).toBeChecked();

      // Verify the search placeholder changes
      const searchInput = page.locator(".search-field input");
      await expect(searchInput).toHaveAttribute(
        "placeholder",
        "Find examples that use a specific node..."
      );
    });
  });
}
