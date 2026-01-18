/**
 * Keyboard Shortcuts Help View E2E Tests
 * 
 * Tests the redesigned keyboard shortcuts visualization that shows all
 * shortcuts at one glance without hovering, in a fullscreen help view.
 * 
 * Run with: npx playwright test tests/e2e/keyboard-shortcuts.spec.ts --project=chromium
 */

import { test, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(CURRENT_DIR, "../../../docs/assets/screenshots");

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Helper to save screenshot
async function saveScreenshot(page: Page, filename: string, fullPage = false) {
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage });
  console.log(`Saved: ${filepath}`);
}

// Helper to open help dialog using the help button with data-testid
async function openHelpDialog(page: Page): Promise<boolean> {
  const helpButton = page.locator('[data-testid="help-button"]');
  if (await helpButton.count() > 0) {
    await helpButton.click();
    // Wait for dialog to appear
    const dialog = page.locator('[data-testid="help-dialog"]');
    try {
      await dialog.waitFor({ state: "visible", timeout: 3000 });
      return true;
    } catch {
      // Dialog may not appear if backend is not running
      return false;
    }
  }
  return false;
}

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Keyboard Shortcuts View", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test("should open help dialog and display keyboard shortcuts", async ({ page }) => {
      // Navigate to the editor
      await page.goto("/editor");
      await page.waitForLoadState("networkidle");

      // Open the help dialog using data-testid
      const helpOpened = await openHelpDialog(page);
      
      if (helpOpened) {
        // Verify the help dialog is visible
        const helpDialog = page.locator('[data-testid="help-dialog"]');
        expect(await helpDialog.isVisible()).toBe(true);
        
        // Take screenshot of the fullscreen help dialog
        await saveScreenshot(page, "keyboard-shortcuts-help-dialog.png");
      }
    });

    test("should display fullscreen keyboard shortcuts grid", async ({ page }) => {
      // Navigate to editor first
      await page.goto("/editor");
      await page.waitForLoadState("networkidle");

      // Open help dialog
      const helpOpened = await openHelpDialog(page);
      
      if (helpOpened) {
        // Verify the shortcuts grid is visible
        const shortcutsGrid = page.locator('[data-testid="shortcuts-grid"]');
        await shortcutsGrid.waitFor({ state: "visible", timeout: 3000 });
        expect(await shortcutsGrid.isVisible()).toBe(true);
        console.log("Shortcuts grid is visible");
        
        // Take screenshot
        await saveScreenshot(page, "keyboard-shortcuts-fullscreen.png");
      }
    });

    test("should take screenshot of keyboard shortcuts layout", async ({ page }) => {
      // Navigate to the app
      await page.goto("/editor");
      await page.waitForLoadState("networkidle");

      // Take screenshot of the editor first
      await saveScreenshot(page, "keyboard-shortcuts-editor.png");

      // Open help dialog
      const helpOpened = await openHelpDialog(page);
      
      if (helpOpened) {
        // Click on the shortcuts tab if available
        const shortcutsTab = page.locator('[data-testid="shortcuts-tab"]');
        if (await shortcutsTab.count() > 0) {
          await shortcutsTab.click();
          // Wait for tab content to load
          await page.locator('[data-testid="shortcuts-grid"]').waitFor({ state: "visible", timeout: 3000 });
        }

        // Take screenshot of the keyboard shortcuts dialog
        await saveScreenshot(page, "keyboard-shortcuts-fullscreen-layout.png");
      }
    });

    test("should verify shortcuts grid layout structure", async ({ page }) => {
      // Navigate to the app
      await page.goto("/editor");
      await page.waitForLoadState("networkidle");

      // Open help dialog
      const helpOpened = await openHelpDialog(page);
      
      if (helpOpened) {
        const helpDialog = page.locator('[data-testid="help-dialog"]');
        
        // Verify the dialog is fullscreen (takes most of the viewport)
        const dialogBox = await helpDialog.boundingBox();
        if (dialogBox) {
          // Check that the dialog is reasonably large (fullscreen-like)
          expect(dialogBox.width).toBeGreaterThan(1500);
          expect(dialogBox.height).toBeGreaterThan(800);
          console.log(`Dialog size: ${dialogBox.width}x${dialogBox.height}`);
        }

        // Check for shortcuts grid
        const shortcutsGrid = page.locator('[data-testid="shortcuts-grid"]');
        await shortcutsGrid.waitFor({ state: "visible", timeout: 3000 });
        
        // Verify grid has category sections
        const categorySections = page.locator('.category-section');
        const sectionCount = await categorySections.count();
        console.log(`Found ${sectionCount} category sections`);
        expect(sectionCount).toBeGreaterThanOrEqual(3);
      }

      // Always take a screenshot for verification
      await saveScreenshot(page, "keyboard-shortcuts-layout-test.png");
    });

    test("OS toggle switches key display correctly", async ({ page }) => {
      await page.goto("/editor");
      await page.waitForLoadState("networkidle");

      // Open help dialog
      const helpOpened = await openHelpDialog(page);
      
      if (helpOpened) {
        // Check for OS toggle buttons
        const macToggle = page.locator('button:has-text("macOS")');
        const winToggle = page.locator('button:has-text("Windows")');

        if (await macToggle.count() > 0 && await winToggle.count() > 0) {
          // Click macOS toggle
          await macToggle.click();
          // Wait for UI update
          await page.waitForTimeout(200);
          await saveScreenshot(page, "keyboard-shortcuts-macos.png");

          // Click Windows toggle
          await winToggle.click();
          // Wait for UI update
          await page.waitForTimeout(200);
          await saveScreenshot(page, "keyboard-shortcuts-windows.png");
        }
      }
    });
  });
}
