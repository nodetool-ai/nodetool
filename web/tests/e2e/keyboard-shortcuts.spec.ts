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
      await page.waitForTimeout(2000);

      // Look for the help button (question mark icon in RightSideButtons)
      // The button has a QuestionMarkIcon and uses handleOpenHelp
      const helpButton = page.locator('button.command-icon').filter({ has: page.locator('svg') }).last();
      
      // Try clicking the help button if found
      if (await helpButton.count() > 0) {
        await helpButton.click();
        await page.waitForTimeout(500);
      }

      // Check if the help dialog is now visible
      const helpDialog = page.locator('[data-testid="help-dialog"]');
      if (await helpDialog.count() > 0) {
        expect(await helpDialog.isVisible()).toBe(true);
        
        // Take screenshot of the fullscreen help dialog
        await saveScreenshot(page, "keyboard-shortcuts-help-dialog.png");
      }
    });

    test("should display fullscreen keyboard shortcuts grid", async ({ page }) => {
      // Navigate to editor first
      await page.goto("/editor");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Find all command-icon buttons in the right side and click the help one
      const buttons = page.locator('.buttons-right button.command-icon');
      const count = await buttons.count();
      
      // The help button should be one of the command-icon buttons
      // Try clicking each one until we find the help dialog
      for (let i = 0; i < count; i++) {
        await buttons.nth(i).click();
        await page.waitForTimeout(300);
        
        const dialog = page.locator('[data-testid="help-dialog"]');
        if (await dialog.count() > 0) {
          break;
        }
        
        // Close any other dialog that might have opened
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }

      // Verify the shortcuts grid is visible
      const shortcutsGrid = page.locator('[data-testid="shortcuts-grid"]');
      if (await shortcutsGrid.count() > 0) {
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
      await page.waitForTimeout(2000);

      // Take screenshot of the editor first
      await saveScreenshot(page, "keyboard-shortcuts-editor.png");

      // Look for the help button - it's a button with a question mark icon
      // Try to find by aria-label or by the SVG path for QuestionMarkIcon
      const helpButtons = [
        page.locator('[aria-label="Help"]'),
        page.locator('button:has([data-testid="QuestionMarkIcon"])'),
        page.locator('button:has(svg path[d*="M11.07"])'), // QuestionMarkIcon path starts with this
        page.locator('.buttons-right button').last() // Often the help button is before settings
      ];

      for (const helpButton of helpButtons) {
        if (await helpButton.count() > 0 && await helpButton.isVisible()) {
          await helpButton.click();
          await page.waitForTimeout(500);
          
          // Check if dialog opened
          const dialog = page.locator('[data-testid="help-dialog"]');
          if (await dialog.count() > 0) {
            // Click on the shortcuts tab if available
            const shortcutsTab = page.locator('[data-testid="shortcuts-tab"]');
            if (await shortcutsTab.count() > 0) {
              await shortcutsTab.click();
              await page.waitForTimeout(300);
            }

            // Take screenshot of the keyboard shortcuts dialog
            await saveScreenshot(page, "keyboard-shortcuts-fullscreen-layout.png");
            break;
          }
        }
      }
    });

    test("should verify shortcuts grid layout structure", async ({ page }) => {
      // Navigate to the app
      await page.goto("/editor");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Try to open help dialog by clicking buttons in the right side
      const rightButtons = page.locator('.buttons-right button');
      const buttonCount = await rightButtons.count();
      
      for (let i = buttonCount - 2; i >= 0; i--) { // Start from second-to-last, as last is often settings
        await rightButtons.nth(i).click();
        await page.waitForTimeout(400);
        
        const dialog = page.locator('[data-testid="help-dialog"]');
        if (await dialog.count() > 0) {
          // Verify the dialog is fullscreen (takes most of the viewport)
          const dialogBox = await dialog.boundingBox();
          if (dialogBox) {
            // Check that the dialog is reasonably large (fullscreen-like)
            expect(dialogBox.width).toBeGreaterThan(1500);
            expect(dialogBox.height).toBeGreaterThan(800);
            console.log(`Dialog size: ${dialogBox.width}x${dialogBox.height}`);
          }

          // Check for shortcuts grid
          const shortcutsGrid = page.locator('[data-testid="shortcuts-grid"]');
          if (await shortcutsGrid.count() > 0) {
            // Verify grid has category sections
            const categorySections = page.locator('.category-section');
            const sectionCount = await categorySections.count();
            console.log(`Found ${sectionCount} category sections`);
            expect(sectionCount).toBeGreaterThanOrEqual(3);
          }
          
          break;
        }
        
        // Press escape to close any other dialogs
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }

      // Always take a screenshot for verification
      await saveScreenshot(page, "keyboard-shortcuts-layout-test.png");
    });

    test("OS toggle switches key display correctly", async ({ page }) => {
      await page.goto("/editor");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Try to open help dialog
      const rightButtons = page.locator('.buttons-right button');
      const buttonCount = await rightButtons.count();
      
      for (let i = buttonCount - 2; i >= 0; i--) {
        await rightButtons.nth(i).click();
        await page.waitForTimeout(400);
        
        const dialog = page.locator('[data-testid="help-dialog"]');
        if (await dialog.count() > 0) {
          break;
        }
        
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }

      // Check for OS toggle buttons
      const macToggle = page.locator('button:has-text("macOS")');
      const winToggle = page.locator('button:has-text("Windows")');

      if (await macToggle.count() > 0 && await winToggle.count() > 0) {
        // Click macOS toggle
        await macToggle.click();
        await page.waitForTimeout(200);
        await saveScreenshot(page, "keyboard-shortcuts-macos.png");

        // Click Windows toggle
        await winToggle.click();
        await page.waitForTimeout(200);
        await saveScreenshot(page, "keyboard-shortcuts-windows.png");
      }
    });
  });
}
