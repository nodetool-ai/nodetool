/**
 * Screenshot capture script for NodeTool documentation
 * 
 * This script captures screenshots of the NodeTool UI for documentation purposes.
 * Run with: npx playwright test tests/e2e/screenshots.spec.ts --project=chromium
 * 
 * Note: Requires the web frontend to be running on localhost:3000
 * Some screenshots require the backend server on localhost:7777
 */

import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = path.join(__dirname, '../../../docs/assets/screenshots');

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Helper to save screenshot
async function saveScreenshot(page: ReturnType<typeof test.extend>, filename: string) {
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`Saved: ${filepath}`);
}

// Check if screenshot already exists
function screenshotExists(filename: string): boolean {
  const filepath = path.join(SCREENSHOT_DIR, filename);
  return fs.existsSync(filepath);
}

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe('Documentation Screenshots', () => {
    test.beforeEach(async ({ page }) => {
      // Set viewport to standard documentation size
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Dashboard Overview', async ({ page }) => {
      test.skip(screenshotExists('dashboard-overview.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'dashboard-overview.png');
    });

    test('Dashboard Workflows', async ({ page }) => {
      test.skip(screenshotExists('dashboard-workflows.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'dashboard-workflows.png');
    });

    test('Templates Grid', async ({ page }) => {
      test.skip(screenshotExists('templates-grid.png'), 'Screenshot already exists');
      await page.goto('/templates');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'templates-grid.png');
    });

    test('Chat Interface', async ({ page }) => {
      test.skip(screenshotExists('global-chat-interface.png'), 'Screenshot already exists');
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'global-chat-interface.png');
    });

    test('Chat Thread List', async ({ page }) => {
      test.skip(screenshotExists('chat-thread-list.png'), 'Screenshot already exists');
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'chat-thread-list.png');
    });

    test('Assets Page', async ({ page }) => {
      test.skip(screenshotExists('asset-explorer.png'), 'Screenshot already exists');
      await page.goto('/assets');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'asset-explorer.png');
    });

    test('App Header', async ({ page }) => {
      test.skip(screenshotExists('app-header.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      // Screenshot just the header area
      const header = page.locator('header').first();
      if (await header.count() > 0) {
        await header.screenshot({ path: path.join(SCREENSHOT_DIR, 'app-header.png') });
        console.log('Saved: app-header.png');
      } else {
        // Take full page if header not found
        await saveScreenshot(page, 'app-header.png');
      }
    });

    test('Settings Dialog', async ({ page }) => {
      test.skip(screenshotExists('settings-dialog.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      // Try to open settings via various methods
      const settingsButton = page.locator('[aria-label*="Settings"], [data-testid*="settings"], button:has-text("Settings")').first();
      if (await settingsButton.count() > 0) {
        await settingsButton.click();
        await page.waitForTimeout(1000);
      }
      await saveScreenshot(page, 'settings-dialog.png');
    });

    test('Command Menu', async ({ page }) => {
      test.skip(screenshotExists('command-menu.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      // Try opening command palette with Cmd+K or Ctrl+K
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'command-menu.png');
    });

    // Editor Screenshots - require a workflow to be open
    test('Canvas Workflow', async ({ page }) => {
      test.skip(screenshotExists('canvas-workflow.png'), 'Screenshot already exists');
      // Navigate to editor - this may need a specific workflow
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'canvas-workflow.png');
    });

    test('Node Menu Open', async ({ page }) => {
      test.skip(screenshotExists('node-menu-open.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      // Try right-clicking to open context menu or double-click for node menu
      await page.mouse.dblclick(500, 400);
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'node-menu-open.png');
    });

    test('Properties Panel', async ({ page }) => {
      test.skip(screenshotExists('properties-panel.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'properties-panel.png');
    });
  });
}
