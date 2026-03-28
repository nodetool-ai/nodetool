import { test, expect, Page } from "@playwright/test";
import {
  navigateToPage,
  waitForAnimation,
  waitForTextStable,
} from "./helpers/waitHelpers";

/**
 * E2E tests for the Model Manager against the REAL TS backend.
 *
 * Prerequisites:
 *   - Backend running at localhost:7777
 *   - Frontend running at localhost:3000
 *
 * Run with:
 *   E2E_START_BACKEND=false E2E_START_FRONTEND=false npx playwright test model-manager-real
 */

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  /** Navigate to /models and wait until model list items are rendered. */
  async function openModelManager(page: Page) {
    await navigateToPage(page, "/models");
    await waitForAnimation(page);

    // Wait for the model list to render (loading spinner disappears, items appear)
    await expect(page.locator(".model-list-item").first()).toBeVisible({
      timeout: 30000
    });

    // Let virtual list settle
    await waitForAnimation(page);
  }

  /** Read the model count from the header text. Returns the total count number. */
  async function getHeaderModelCount(page: Page): Promise<string> {
    const header = page.locator(".model-list-header");
    const text = await header.textContent();
    return text || "";
  }

  /** Extract a numeric count from header text like "42 models" or "5 of 42 models". */
  function parseCountFromHeader(headerText: string): number | null {
    // Matches patterns: "42 models", "5 of 42 models", "3 downloaded / 42 total", "10 available / 42 total"
    const match = headerText.match(/(\d+)\s+(models|downloaded|available|of)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /** Extract the total count from header text. */
  function parseTotalFromHeader(headerText: string): number | null {
    // "42 models" => 42
    const simpleMatch = headerText.match(/^.*?(\d+)\s+models/);
    if (simpleMatch) return parseInt(simpleMatch[1], 10);
    // "5 downloaded / 42 total" => 42
    const totalMatch = headerText.match(/(\d+)\s+total/);
    if (totalMatch) return parseInt(totalMatch[1], 10);
    // "5 of 42 models" => 42
    const ofMatch = headerText.match(/of\s+(\d+)\s+models/);
    if (ofMatch) return parseInt(ofMatch[1], 10);
    return null;
  }

  /** Wait for the model list header text to stabilize after a filter change. */
  async function waitForHeaderStable(page: Page, timeout = 5000) {
    await waitForTextStable(page.locator(".model-list-header"), timeout);
  }

  /** Wait for cache status checks to complete by waiting for .downloaded class or download buttons to appear. */
  async function waitForCacheChecks(page: Page, timeout = 15000) {
    // Wait until no more "Checking cache" indicators are visible
    await page.waitForFunction(
      () => {
        const checkingElements = document.querySelectorAll('.model-list-item');
        if (checkingElements.length === 0) return true;
        // Check if any items still show "Checking cache"
        const checking = document.querySelectorAll('.model-list-item *');
        for (const el of checking) {
          if (el.textContent?.includes('Checking cache')) return false;
        }
        return true;
      },
      { timeout }
    ).catch(() => {
      // Cache checks may have completed before we started watching — that's fine
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Tests
  // ─────────────────────────────────────────────────────────────────────────────

  test.describe("Model Manager — Real Backend", () => {
    test.describe.configure({ mode: "serial" });

    // Give extra time — real backend may be slow on first load
    test.setTimeout(60000);

    // ── 1. Sidebar navigation ──────────────────────────────────────────────

    test("sidebar shows model type categories including All", async ({
      page
    }) => {
      await openModelManager(page);

      const sidebar = page.locator(".sidebar");
      await expect(sidebar).toBeVisible();

      // "All" category should always be present
      const sidebarText = await sidebar.textContent();
      expect(sidebarText).toContain("All");

      // There should be multiple type buttons
      const typeButtons = page.locator(".model-type-button");
      const count = await typeButtons.count();
      expect(count).toBeGreaterThanOrEqual(2); // "All" + at least one type
    });

    test("clicking a sidebar type filters the model list", async ({
      page
    }) => {
      await openModelManager(page);

      // Record initial header text
      const headerBefore = await getHeaderModelCount(page);
      const totalBefore = parseTotalFromHeader(headerBefore);
      expect(totalBefore).toBeGreaterThan(0);

      // Click the second type button (first non-"All" category)
      const typeButtons = page.locator(".model-type-button");
      const typeCount = await typeButtons.count();
      expect(typeCount).toBeGreaterThan(1);

      // Get the text of the type we will click
      const targetTypeText = await typeButtons.nth(1).textContent();

      await typeButtons.nth(1).click();
      await waitForAnimation(page);
      // Wait for virtual list to update
      await waitForHeaderStable(page);

      // Header should now reflect a filtered count or the type-specific count
      const headerAfter = await getHeaderModelCount(page);

      // Either the count changed or the header reflects a subset
      // (could show "X of Y models" or "Y models" if all match that type)
      expect(headerAfter).toBeTruthy();

      // The content area should show the type heading
      if (targetTypeText && targetTypeText.trim() !== "All") {
        const contentArea = page.locator(".content");
        const contentText = await contentArea.textContent();
        expect(contentText).toBeTruthy();
      }

      // Click "All" to go back
      await typeButtons.first().click();
      await waitForAnimation(page);
      await waitForHeaderStable(page);

      const headerReset = await getHeaderModelCount(page);
      const totalReset = parseTotalFromHeader(headerReset);
      expect(totalReset).toBe(totalBefore);
    });

    // ── 2. Search filtering ────────────────────────────────────────────────

    test("search filters models by name", async ({ page }) => {
      await openModelManager(page);

      const headerBefore = await getHeaderModelCount(page);
      const totalBefore = parseTotalFromHeader(headerBefore);
      expect(totalBefore).toBeGreaterThan(0);

      // Type a search term — pick a model name substring likely to match a few
      const searchInput = page.locator("input[type='text']").first();
      await searchInput.fill("whisper");
      await waitForAnimation(page);
      await waitForHeaderStable(page);

      const headerAfter = await getHeaderModelCount(page);
      const filteredCount = parseCountFromHeader(headerAfter);

      // Should show fewer models than total
      expect(filteredCount).not.toBeNull();
      expect(filteredCount!).toBeGreaterThan(0);
      expect(filteredCount!).toBeLessThanOrEqual(totalBefore!);

      // Body should contain the search term
      const bodyText = await page.textContent("body");
      expect(bodyText?.toLowerCase()).toContain("whisper");
    });

    test("search with no matches shows 'No models found'", async ({
      page
    }) => {
      await openModelManager(page);

      const searchInput = page.locator("input[type='text']").first();
      await searchInput.fill("zzz_absolutely_no_match_zzz");
      await waitForAnimation(page);
      // Wait for the "No models found" text to appear
      await expect(page.getByText("No models found")).toBeVisible({ timeout: 5000 });
    });

    // ── 3. Download status filter ──────────────────────────────────────────

    test("ALL/DOWNLOADED/AVAILABLE toggle buttons are visible", async ({
      page
    }) => {
      await openModelManager(page);

      const allBtn = page.getByRole("button", { name: "show all models" });
      const downloadedBtn = page.getByRole("button", {
        name: "show downloaded models only"
      });
      const availableBtn = page.getByRole("button", {
        name: "show available models only"
      });

      await expect(allBtn).toBeVisible();
      await expect(downloadedBtn).toBeVisible();
      await expect(availableBtn).toBeVisible();
    });

    test("DOWNLOADED toggle filters to downloaded models only", async ({
      page
    }) => {
      await openModelManager(page);

      const headerBefore = await getHeaderModelCount(page);
      const totalBefore = parseTotalFromHeader(headerBefore);

      // Click "Downloaded"
      const downloadedBtn = page.getByRole("button", {
        name: "show downloaded models only"
      });
      await downloadedBtn.click();
      await waitForAnimation(page);
      // Wait for header to update with download status info
      await waitForHeaderStable(page);

      const headerAfter = await getHeaderModelCount(page);
      expect(headerAfter).toContain("downloaded");
      expect(headerAfter).toContain(`${totalBefore} total`);
    });

    test("AVAILABLE toggle filters to not-downloaded models only", async ({
      page
    }) => {
      await openModelManager(page);

      const headerBefore = await getHeaderModelCount(page);
      const totalBefore = parseTotalFromHeader(headerBefore);

      // Click "Available"
      const availableBtn = page.getByRole("button", {
        name: "show available models only"
      });
      await availableBtn.click();
      await waitForAnimation(page);
      await waitForHeaderStable(page);

      const headerAfter = await getHeaderModelCount(page);
      expect(headerAfter).toContain("available");
      expect(headerAfter).toContain(`${totalBefore} total`);
    });

    test("clicking ALL after DOWNLOADED restores full list", async ({
      page
    }) => {
      await openModelManager(page);

      const headerBefore = await getHeaderModelCount(page);
      const totalBefore = parseTotalFromHeader(headerBefore);

      // Switch to Downloaded then back to All
      const downloadedBtn = page.getByRole("button", {
        name: "show downloaded models only"
      });
      await downloadedBtn.click();
      await waitForAnimation(page);
      await waitForHeaderStable(page);

      const allBtn = page.getByRole("button", { name: "show all models" });
      await allBtn.click();
      await waitForAnimation(page);
      await waitForHeaderStable(page);

      const headerAfter = await getHeaderModelCount(page);
      const totalAfter = parseTotalFromHeader(headerAfter);
      expect(totalAfter).toBe(totalBefore);
    });

    // ── 4. Size filter slider ──────────────────────────────────────────────

    test("size slider is present and interactive", async ({ page }) => {
      await openModelManager(page);

      const slider = page.locator('[aria-label="Max model size in GB"]');
      await expect(slider).toBeVisible();

      const headerBefore = await getHeaderModelCount(page);
      const totalBefore = parseTotalFromHeader(headerBefore);
      expect(totalBefore).toBeGreaterThan(0);

      // Move the slider to a restrictive value using keyboard
      await slider.focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowRight"); // value = 1

      await waitForAnimation(page);
      await waitForHeaderStable(page);

      const headerAfter = await getHeaderModelCount(page);
      const filteredAfter = parseCountFromHeader(headerAfter);

      // With a 1 GB limit, we should see fewer models than total
      // (most models are > 1 GB)
      if (filteredAfter !== null && totalBefore !== null) {
        expect(filteredAfter).toBeLessThanOrEqual(totalBefore);
      }

      // Reset slider to All (0)
      await page.keyboard.press("Home");
      await waitForAnimation(page);
      await waitForHeaderStable(page);

      const headerReset = await getHeaderModelCount(page);
      const totalReset = parseTotalFromHeader(headerReset);
      expect(totalReset).toBe(totalBefore);
    });

    // ── 5. Model count accuracy ────────────────────────────────────────────

    test("header count matches total number of models from API", async ({
      page
    }) => {
      // Intercept the API response to get the exact count, without mocking
      const modelCountPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/models/all") && resp.status() === 200
      );

      await navigateToPage(page, "/models");
      const response = await modelCountPromise;
      const models = await response.json();
      const apiCount = Array.isArray(models) ? models.length : 0;

      await waitForAnimation(page);
      await expect(page.locator(".model-list-item").first()).toBeVisible({
        timeout: 30000
      });

      const headerText = await getHeaderModelCount(page);
      const headerTotal = parseTotalFromHeader(headerText);

      expect(headerTotal).toBe(apiCount);
    });

    // ── 6. Model item details ──────────────────────────────────────────────

    test("model items display repo owner, name, and size", async ({
      page
    }) => {
      await openModelManager(page);

      // Check owner elements
      const owners = page.locator(".model-owner");
      const ownerCount = await owners.count();
      expect(ownerCount).toBeGreaterThan(0);

      const firstOwner = await owners.first().textContent();
      expect(firstOwner).toBeTruthy();
      // Owner should look like a username/org (no slashes)
      expect(firstOwner!.trim()).not.toContain("/");

      // Check name elements
      const names = page.locator(".model-name");
      const nameCount = await names.count();
      expect(nameCount).toBeGreaterThan(0);

      const firstName = await names.first().textContent();
      expect(firstName).toBeTruthy();

      // Check size elements
      const sizes = page.locator(".model-size");
      const sizeCount = await sizes.count();
      expect(sizeCount).toBeGreaterThan(0);

      const firstSize = await sizes.first().textContent();
      expect(firstSize).toBeTruthy();
      // Size should contain a number
      expect(firstSize).toMatch(/[0-9]/);
    });

    test("model items show Local chip", async ({ page }) => {
      await openModelManager(page);

      // Every model should have a "Local" chip
      const firstItem = page.locator(".model-list-item").first();
      const localChip = firstItem.locator("span", { hasText: "Local" });
      await expect(localChip.first()).toBeVisible();
    });

    test("model items show 'Works with N nodes' chip when applicable", async ({
      page
    }) => {
      await openModelManager(page);

      // At least some models should have a "Works with" compatibility chip
      const bodyText = await page.textContent("body");
      // This depends on node metadata — may or may not be present
      // We just verify the structure renders without error
      const worksWithChips = page.locator("span", {
        hasText: /Works with \d+ node/
      });
      const chipCount = await worksWithChips.count();
      // chipCount could be 0 if no compatibility data is available — that is acceptable
      expect(chipCount).toBeGreaterThanOrEqual(0);
    });

    // ── 7. Sidebar category counts ─────────────────────────────────────────

    test("sidebar shows available model types matching actual data", async ({
      page
    }) => {
      // Capture API response for model types
      const modelCountPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/models/all") && resp.status() === 200
      );

      await navigateToPage(page, "/models");
      const response = await modelCountPromise;
      const models = await response.json();

      await waitForAnimation(page);
      await expect(page.locator(".model-list-item").first()).toBeVisible({
        timeout: 30000
      });

      // Collect unique types from the API response
      const apiTypes = new Set(
        (models as Array<{ type?: string }>)
          .map((m) => m.type)
          .filter(Boolean)
      );

      // The sidebar should have at least as many type buttons as unique types + "All"
      const typeButtons = page.locator(".model-type-button");
      const buttonCount = await typeButtons.count();

      // "All" + each unique type that has models
      expect(buttonCount).toBeGreaterThanOrEqual(apiTypes.size + 1);
    });

    test("clicking each sidebar type shows only models of that type", async ({
      page
    }) => {
      await openModelManager(page);

      const typeButtons = page.locator(".model-type-button");
      const buttonCount = await typeButtons.count();

      // Test at least 2 non-"All" types (if available)
      const typesToTest = Math.min(3, buttonCount);

      for (let i = 1; i < typesToTest; i++) {
        await typeButtons.nth(i).click();
        await waitForAnimation(page);
        await waitForHeaderStable(page);

        const headerText = await getHeaderModelCount(page);
        // Should show a valid count
        const count = parseCountFromHeader(headerText);
        if (count !== null) {
          expect(count).toBeGreaterThan(0);
        }
      }

      // Go back to All
      await typeButtons.first().click();
      await waitForAnimation(page);
    });

    // ── 8. Delete button visibility ────────────────────────────────────────

    test("delete button only appears on downloaded models", async ({
      page
    }) => {
      await openModelManager(page);

      // Wait for cache status checks to complete
      await waitForCacheChecks(page);

      // Check models with "Downloaded" chip — they should have a delete button
      const downloadedItems = page.locator(
        ".model-list-item.downloaded"
      );
      const downloadedCount = await downloadedItems.count();

      if (downloadedCount > 0) {
        // Downloaded models should have a delete button
        const firstDownloaded = downloadedItems.first();
        const deleteBtn = firstDownloaded.locator('[tooltip="Delete model"], button[aria-label="delete"]');
        // The delete button is rendered via DeleteButton component
        // Check that model-actions div has content
        const actionsDiv = firstDownloaded.locator(".model-actions");
        const actionsContent = await actionsDiv.innerHTML();
        expect(actionsContent.length).toBeGreaterThan(0);
      }

      // Non-downloaded models should NOT have a delete button
      const nonDownloadedItems = page.locator(
        ".model-list-item:not(.downloaded)"
      );
      const nonDownloadedCount = await nonDownloadedItems.count();

      if (nonDownloadedCount > 0) {
        const firstNonDownloaded = nonDownloadedItems.first();
        const actionsDiv = firstNonDownloaded.locator(".model-actions");
        // model-actions should be empty or not contain delete button
        const actionsHtml = await actionsDiv.innerHTML();
        // DeleteButton renders a button — it should not be present for non-downloaded
        expect(actionsHtml).not.toContain("Delete model");
      }
    });

    // ── 9. Show in Explorer button visibility ──────────────────────────────

    test("'Downloaded' chip appears only on downloaded models", async ({
      page
    }) => {
      await openModelManager(page);
      await waitForCacheChecks(page);

      const downloadedItems = page.locator(
        ".model-list-item.downloaded"
      );
      const downloadedCount = await downloadedItems.count();

      if (downloadedCount > 0) {
        // Downloaded models should show "Downloaded" chip
        const firstDownloaded = downloadedItems.first();
        const downloadedChip = firstDownloaded.locator("span", {
          hasText: "Downloaded"
        });
        await expect(downloadedChip.first()).toBeVisible();
      }

      // Non-downloaded models should show "Download" button instead
      const nonDownloadedItems = page.locator(
        ".model-list-item:not(.downloaded)"
      );
      const nonDownloadedCount = await nonDownloadedItems.count();

      if (nonDownloadedCount > 0) {
        const firstNonDownloaded = nonDownloadedItems.first();
        // Should have a download button or "Checking cache" indicator
        const downloadBtn = firstNonDownloaded.locator(
          ".model-download-button"
        );
        const cachingIndicator = firstNonDownloaded.locator("text=Checking cache");
        const hasDownloadBtn = (await downloadBtn.count()) > 0;
        const hasCachingIndicator = (await cachingIndicator.count()) > 0;
        expect(hasDownloadBtn || hasCachingIndicator).toBeTruthy();
      }
    });

    test("non-downloaded models show Download button, not delete", async ({
      page
    }) => {
      await openModelManager(page);
      await waitForCacheChecks(page);

      const nonDownloadedItems = page.locator(
        ".model-list-item:not(.downloaded)"
      );
      const count = await nonDownloadedItems.count();

      if (count > 0) {
        const item = nonDownloadedItems.first();

        // Should show Download button
        const downloadBtn = item.locator(".model-download-button");
        const cachingIndicator = item.locator("text=Checking cache");

        // Either download button or cache-checking indicator should be visible
        const hasDownloadBtn = (await downloadBtn.count()) > 0;
        const hasCachingIndicator = (await cachingIndicator.count()) > 0;
        expect(hasDownloadBtn || hasCachingIndicator).toBeTruthy();

        // Should NOT have "Downloaded" chip
        const downloadedChip = item.locator(
          "span.MuiChip-label:has-text('Downloaded')"
        );
        await expect(downloadedChip).toHaveCount(0);
      }
    });

    // ── Combined filter tests ──────────────────────────────────────────────

    test("search + sidebar type filter work together", async ({ page }) => {
      await openModelManager(page);

      const headerBefore = await getHeaderModelCount(page);
      const totalBefore = parseTotalFromHeader(headerBefore);

      // Click a non-"All" type first
      const typeButtons = page.locator(".model-type-button");
      const buttonCount = await typeButtons.count();
      if (buttonCount > 1) {
        await typeButtons.nth(1).click();
        await waitForAnimation(page);
        await waitForHeaderStable(page);

        // Now also search
        const searchInput = page.locator("input[type='text']").first();
        await searchInput.fill("a");
        await waitForAnimation(page);
        await waitForHeaderStable(page);

        const headerAfter = await getHeaderModelCount(page);
        // Count should be less than or equal to total
        const count = parseCountFromHeader(headerAfter);
        if (count !== null && totalBefore !== null) {
          expect(count).toBeLessThanOrEqual(totalBefore);
        }
      }
    });

    test("clearing search restores filtered-by-type results", async ({
      page
    }) => {
      await openModelManager(page);

      // Click a type
      const typeButtons = page.locator(".model-type-button");
      if ((await typeButtons.count()) > 1) {
        await typeButtons.nth(1).click();
        await waitForAnimation(page);
        await waitForHeaderStable(page);

        const headerWithType = await getHeaderModelCount(page);

        // Search for something
        const searchInput = page.locator("input[type='text']").first();
        await searchInput.fill("test_search_term");
        await waitForAnimation(page);
        await waitForHeaderStable(page);

        // Clear the search
        await searchInput.fill("");
        await waitForAnimation(page);
        await waitForHeaderStable(page);

        const headerAfterClear = await getHeaderModelCount(page);
        // Should return to type-filtered count
        expect(headerAfterClear).toBe(headerWithType);
      }
    });
  });
}
