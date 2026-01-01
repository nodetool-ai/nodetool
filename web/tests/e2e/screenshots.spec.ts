/**
 * Comprehensive Screenshot Capture Script for NodeTool Documentation
 * 
 * This script captures screenshots of every thinkable screen in the NodeTool UI.
 * Run with: npx playwright test tests/e2e/screenshots.spec.ts --project=chromium
 * 
 * To capture all screenshots (even existing ones):
 * FORCE_SCREENSHOTS=true npx playwright test tests/e2e/screenshots.spec.ts --project=chromium
 * 
 * Note: Requires the web frontend to be running on localhost:3000
 * Full functionality requires the backend server on localhost:7777
 */

import { test, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOT_DIR = path.join(__dirname, '../../../docs/assets/screenshots');

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

// Helper to save element screenshot
async function saveElementScreenshot(page: Page, selector: string, filename: string) {
  const filepath = path.join(SCREENSHOT_DIR, filename);
  const element = page.locator(selector).first();
  if (await element.count() > 0) {
    await element.screenshot({ path: filepath });
    console.log(`Saved: ${filepath}`);
    return true;
  }
  return false;
}

// Check if screenshot already exists (skip if FORCE_SCREENSHOTS is set)
function shouldSkip(filename: string): boolean {
  if (process.env.FORCE_SCREENSHOTS === 'true') {
    return false;
  }
  const filepath = path.join(SCREENSHOT_DIR, filename);
  return fs.existsSync(filepath);
}

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {

  // ============================================================================
  // MAIN PAGES - Core application routes
  // ============================================================================
  test.describe('Main Pages', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Login Page', async ({ page }) => {
      test.skip(shouldSkip('login-page.png'), 'Screenshot already exists');
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await saveScreenshot(page, 'login-page.png');
    });

    test('Dashboard Overview', async ({ page }) => {
      test.skip(shouldSkip('dashboard-overview.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'dashboard-overview.png');
    });

    test('Dashboard Workflows', async ({ page }) => {
      test.skip(shouldSkip('dashboard-workflows.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'dashboard-workflows.png');
    });

    test('Templates Grid', async ({ page }) => {
      test.skip(shouldSkip('templates-grid.png'), 'Screenshot already exists');
      await page.goto('/templates');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'templates-grid.png');
    });

    test('Assets Explorer', async ({ page }) => {
      test.skip(shouldSkip('asset-explorer.png'), 'Screenshot already exists');
      await page.goto('/assets');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'asset-explorer.png');
    });

    test('Collections Explorer', async ({ page }) => {
      test.skip(shouldSkip('collections-explorer.png'), 'Screenshot already exists');
      await page.goto('/collections');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'collections-explorer.png');
    });

    test('Models List', async ({ page }) => {
      test.skip(shouldSkip('models-list.png'), 'Screenshot already exists');
      await page.goto('/models');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'models-list.png');
    });
  });

  // ============================================================================
  // CHAT - Global chat interface and features
  // ============================================================================
  test.describe('Chat Interface', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Global Chat Interface', async ({ page }) => {
      test.skip(shouldSkip('global-chat-interface.png'), 'Screenshot already exists');
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'global-chat-interface.png');
    });

    test('Chat Thread List', async ({ page }) => {
      test.skip(shouldSkip('chat-thread-list.png'), 'Screenshot already exists');
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'chat-thread-list.png');
    });

    test('Chat Empty State', async ({ page }) => {
      test.skip(shouldSkip('chat-empty-state.png'), 'Screenshot already exists');
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
      await saveScreenshot(page, 'chat-empty-state.png');
    });

    test('Standalone Chat', async ({ page }) => {
      test.skip(shouldSkip('standalone-chat.png'), 'Screenshot already exists');
      await page.goto('/standalone-chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'standalone-chat.png');
    });

    test('Chat Model Selector', async ({ page }) => {
      test.skip(shouldSkip('chat-model-selector.png'), 'Screenshot already exists');
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Click model selector if exists
      const modelSelector = page.locator('[data-testid*="model"], .model-selector, button:has-text("Model")').first();
      if (await modelSelector.count() > 0) {
        await modelSelector.click();
        await page.waitForTimeout(500);
      }
      await saveScreenshot(page, 'chat-model-selector.png');
    });

    test('Chat Tools Menu', async ({ page }) => {
      test.skip(shouldSkip('chat-tools-menu.png'), 'Screenshot already exists');
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Look for tools button/menu
      const toolsButton = page.locator('[data-testid*="tools"], button:has-text("Tools"), [aria-label*="Tools"]').first();
      if (await toolsButton.count() > 0) {
        await toolsButton.click();
        await page.waitForTimeout(500);
      }
      await saveScreenshot(page, 'chat-tools-menu.png');
    });

    test('Agent Mode Enabled', async ({ page }) => {
      test.skip(shouldSkip('agent-mode-enabled.png'), 'Screenshot already exists');
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Look for agent mode toggle
      const agentToggle = page.locator('[data-testid*="agent"], .agent-mode, [aria-label*="Agent"]').first();
      if (await agentToggle.count() > 0) {
        await agentToggle.click();
        await page.waitForTimeout(500);
      }
      await saveScreenshot(page, 'agent-mode-enabled.png');
    });
  });

  // ============================================================================
  // MINI-APPS - Mini application interface
  // ============================================================================
  test.describe('Mini-Apps', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Mini-Apps Page', async ({ page }) => {
      test.skip(shouldSkip('mini-apps-page.png'), 'Screenshot already exists');
      await page.goto('/apps');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'mini-apps-page.png');
    });

    test('Mini-App Interface', async ({ page }) => {
      test.skip(shouldSkip('mini-app-interface.png'), 'Screenshot already exists');
      await page.goto('/apps');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'mini-app-interface.png');
    });

    test('Mini-App Builder', async ({ page }) => {
      test.skip(shouldSkip('mini-app-builder.png'), 'Screenshot already exists');
      await page.goto('/apps');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'mini-app-builder.png');
    });
  });

  // ============================================================================
  // WORKFLOW EDITOR - Canvas, nodes, and editing features
  // ============================================================================
  test.describe('Workflow Editor', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Editor Empty State', async ({ page }) => {
      test.skip(shouldSkip('editor-empty-state.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'editor-empty-state.png');
    });

    test('Canvas Workflow', async ({ page }) => {
      test.skip(shouldSkip('canvas-workflow.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'canvas-workflow.png');
    });

    test('Editor Workflow View', async ({ page }) => {
      test.skip(shouldSkip('editor-workflow-view.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'editor-workflow-view.png');
    });

    test('Node Menu Open', async ({ page }) => {
      test.skip(shouldSkip('node-menu-open.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Double-click to open node menu
      await page.mouse.dblclick(600, 400);
      await page.waitForTimeout(800);
      await saveScreenshot(page, 'node-menu-open.png');
    });

    test('Node Menu with Search', async ({ page }) => {
      test.skip(shouldSkip('node-menu-open-detailed.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Double-click to open node menu
      await page.mouse.dblclick(600, 400);
      await page.waitForTimeout(500);
      // Type search query
      await page.keyboard.type('image');
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'node-menu-open-detailed.png');
    });

    test('Properties Panel', async ({ page }) => {
      test.skip(shouldSkip('properties-panel.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'properties-panel.png');
    });

    test('Inspector Panel', async ({ page }) => {
      test.skip(shouldSkip('inspector-panel.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'inspector-panel.png');
    });

    test('Left Panel Assets View', async ({ page }) => {
      test.skip(shouldSkip('left-panel-assets.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Look for assets tab in left panel
      const assetsTab = page.locator('[data-testid*="assets"], button:has-text("Assets")').first();
      if (await assetsTab.count() > 0) {
        await assetsTab.click();
        await page.waitForTimeout(500);
      }
      await saveScreenshot(page, 'left-panel-assets.png');
    });

    test('Context Menu on Node', async ({ page }) => {
      test.skip(shouldSkip('context-menu-node.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Right-click to open context menu
      await page.mouse.click(600, 400, { button: 'right' });
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'context-menu-node.png');
    });

    test('Context Menu on Canvas', async ({ page }) => {
      test.skip(shouldSkip('context-menu-canvas.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.mouse.click(800, 500, { button: 'right' });
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'context-menu-canvas.png');
    });

    test('Workflow Tabs', async ({ page }) => {
      test.skip(shouldSkip('workflow-tabs.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'workflow-tabs.png');
    });
  });

  // ============================================================================
  // HEADER AND NAVIGATION
  // ============================================================================
  test.describe('Header and Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('App Header', async ({ page }) => {
      test.skip(shouldSkip('app-header.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Try to screenshot header element
      const saved = await saveElementScreenshot(page, 'header, [data-testid*="header"], .app-header', 'app-header.png');
      if (!saved) {
        // Fallback: take full page and user can crop
        await saveScreenshot(page, 'app-header.png');
      }
    });

    test('App Layout Annotated', async ({ page }) => {
      test.skip(shouldSkip('app-layout-annotated.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'app-layout-annotated.png');
    });

    test('Notification Button/Panel', async ({ page }) => {
      test.skip(shouldSkip('notification-panel.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const notifButton = page.locator('[data-testid*="notification"], [aria-label*="Notification"], button:has-text("Notifications")').first();
      if (await notifButton.count() > 0) {
        await notifButton.click();
        await page.waitForTimeout(500);
      }
      await saveScreenshot(page, 'notification-panel.png');
    });
  });

  // ============================================================================
  // SETTINGS AND CONFIGURATION
  // ============================================================================
  test.describe('Settings and Configuration', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Settings Dialog', async ({ page }) => {
      test.skip(shouldSkip('settings-dialog.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Open settings
      const settingsButton = page.locator('[aria-label*="Settings"], [data-testid*="settings"], button:has-text("Settings")').first();
      if (await settingsButton.count() > 0) {
        await settingsButton.click();
        await page.waitForTimeout(1000);
      }
      await saveScreenshot(page, 'settings-dialog.png');
    });

    test('Settings General', async ({ page }) => {
      test.skip(shouldSkip('settings-general.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const settingsButton = page.locator('[aria-label*="Settings"], [data-testid*="settings"], button:has-text("Settings")').first();
      if (await settingsButton.count() > 0) {
        await settingsButton.click();
        await page.waitForTimeout(1000);
      }
      await saveScreenshot(page, 'settings-general.png');
    });

    test('Settings API Keys', async ({ page }) => {
      test.skip(shouldSkip('settings-api-keys.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const settingsButton = page.locator('[aria-label*="Settings"], [data-testid*="settings"], button:has-text("Settings")').first();
      if (await settingsButton.count() > 0) {
        await settingsButton.click();
        await page.waitForTimeout(500);
        // Look for API keys tab/section
        const apiTab = page.locator('button:has-text("API"), button:has-text("Keys"), [data-testid*="api"]').first();
        if (await apiTab.count() > 0) {
          await apiTab.click();
          await page.waitForTimeout(500);
        }
      }
      await saveScreenshot(page, 'settings-api-keys.png');
    });

    test('Settings API Secrets', async ({ page }) => {
      test.skip(shouldSkip('settings-api-secrets.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const settingsButton = page.locator('[aria-label*="Settings"], [data-testid*="settings"], button:has-text("Settings")').first();
      if (await settingsButton.count() > 0) {
        await settingsButton.click();
        await page.waitForTimeout(500);
        const secretsTab = page.locator('button:has-text("Secrets"), [data-testid*="secrets"]').first();
        if (await secretsTab.count() > 0) {
          await secretsTab.click();
          await page.waitForTimeout(500);
        }
      }
      await saveScreenshot(page, 'settings-api-secrets.png');
    });

    test('Settings Folders', async ({ page }) => {
      test.skip(shouldSkip('settings-folders.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const settingsButton = page.locator('[aria-label*="Settings"], [data-testid*="settings"], button:has-text("Settings")').first();
      if (await settingsButton.count() > 0) {
        await settingsButton.click();
        await page.waitForTimeout(500);
        const foldersTab = page.locator('button:has-text("Folders"), [data-testid*="folders"]').first();
        if (await foldersTab.count() > 0) {
          await foldersTab.click();
          await page.waitForTimeout(500);
        }
      }
      await saveScreenshot(page, 'settings-folders.png');
    });

    test('Settings Auth', async ({ page }) => {
      test.skip(shouldSkip('settings-auth.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const settingsButton = page.locator('[aria-label*="Settings"], [data-testid*="settings"], button:has-text("Settings")').first();
      if (await settingsButton.count() > 0) {
        await settingsButton.click();
        await page.waitForTimeout(500);
        const authTab = page.locator('button:has-text("Auth"), button:has-text("Authentication"), [data-testid*="auth"]').first();
        if (await authTab.count() > 0) {
          await authTab.click();
          await page.waitForTimeout(500);
        }
      }
      await saveScreenshot(page, 'settings-auth.png');
    });

    test('About Menu', async ({ page }) => {
      test.skip(shouldSkip('about-menu.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const settingsButton = page.locator('[aria-label*="Settings"], [data-testid*="settings"], button:has-text("Settings")').first();
      if (await settingsButton.count() > 0) {
        await settingsButton.click();
        await page.waitForTimeout(500);
        const aboutTab = page.locator('button:has-text("About"), [data-testid*="about"]').first();
        if (await aboutTab.count() > 0) {
          await aboutTab.click();
          await page.waitForTimeout(500);
        }
      }
      await saveScreenshot(page, 'about-menu.png');
    });
  });

  // ============================================================================
  // COMMAND MENU AND KEYBOARD SHORTCUTS
  // ============================================================================
  test.describe('Command Menu', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Command Menu', async ({ page }) => {
      test.skip(shouldSkip('command-menu.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'command-menu.png');
    });

    test('Command Menu with Search', async ({ page }) => {
      test.skip(shouldSkip('command-menu-search.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(300);
      await page.keyboard.type('new workflow');
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'command-menu-search.png');
    });
  });

  // ============================================================================
  // DIALOGS AND MODALS
  // ============================================================================
  test.describe('Dialogs and Modals', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Open or Create Dialog', async ({ page }) => {
      test.skip(shouldSkip('open-create-dialog.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Try to open "New Workflow" or similar dialog
      const newButton = page.locator('button:has-text("New"), button:has-text("Create"), [aria-label*="New"]').first();
      if (await newButton.count() > 0) {
        await newButton.click();
        await page.waitForTimeout(500);
      }
      await saveScreenshot(page, 'open-create-dialog.png');
    });

    test('Confirm Dialog', async ({ page }) => {
      test.skip(shouldSkip('confirm-dialog.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      // This would need a specific action that triggers a confirm dialog
      await saveScreenshot(page, 'confirm-dialog.png');
    });

    test('File Browser Dialog', async ({ page }) => {
      test.skip(shouldSkip('file-browser-dialog.png'), 'Screenshot already exists');
      await page.goto('/assets');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'file-browser-dialog.png');
    });
  });

  // ============================================================================
  // ASSETS - Asset management features
  // ============================================================================
  test.describe('Assets', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Asset Preview', async ({ page }) => {
      test.skip(shouldSkip('asset-preview.png'), 'Screenshot already exists');
      await page.goto('/assets');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      // Click on first asset if available
      const assetItem = page.locator('.asset-item, [data-testid*="asset"]').first();
      if (await assetItem.count() > 0) {
        await assetItem.click();
        await page.waitForTimeout(500);
      }
      await saveScreenshot(page, 'asset-preview.png');
    });

    test('Asset Grid Context Menu', async ({ page }) => {
      test.skip(shouldSkip('asset-context-menu.png'), 'Screenshot already exists');
      await page.goto('/assets');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await page.mouse.click(600, 400, { button: 'right' });
      await page.waitForTimeout(500);
      await saveScreenshot(page, 'asset-context-menu.png');
    });

    test('Asset Upload Area', async ({ page }) => {
      test.skip(shouldSkip('asset-upload.png'), 'Screenshot already exists');
      await page.goto('/assets');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'asset-upload.png');
    });
  });

  // ============================================================================
  // MODELS - Model management (Note: May require Ollama for full functionality)
  // ============================================================================
  test.describe('Models Manager', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Models Manager Full', async ({ page }) => {
      test.skip(shouldSkip('models-manager-full.png'), 'Screenshot already exists');
      await page.goto('/models');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'models-manager-full.png');
    });

    test('Models Filters', async ({ page }) => {
      test.skip(shouldSkip('models-filters.png'), 'Screenshot already exists');
      await page.goto('/models');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'models-filters.png');
    });

    test('Model Card Actions', async ({ page }) => {
      test.skip(shouldSkip('model-card-actions.png'), 'Screenshot already exists');
      await page.goto('/models');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      // Hover over first model card to show actions
      const modelCard = page.locator('.model-card, [data-testid*="model"]').first();
      if (await modelCard.count() > 0) {
        await modelCard.hover();
        await page.waitForTimeout(500);
      }
      await saveScreenshot(page, 'model-card-actions.png');
    });

    test('Model Manager Starter', async ({ page }) => {
      test.skip(shouldSkip('model-manager-starter.png'), 'Screenshot already exists');
      await page.goto('/models');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'model-manager-starter.png');
    });
  });

  // ============================================================================
  // WORKFLOW FEATURES - Advanced workflow editor features
  // ============================================================================
  test.describe('Workflow Features', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Smart Connect Menu', async ({ page }) => {
      test.skip(shouldSkip('smart-connect.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'smart-connect.png');
    });

    test('Node Anatomy Annotated', async ({ page }) => {
      test.skip(shouldSkip('node-anatomy-annotated.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'node-anatomy-annotated.png');
    });

    test('Connection Colors', async ({ page }) => {
      test.skip(shouldSkip('connection-colors.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'connection-colors.png');
    });

    test('Workflow Progress', async ({ page }) => {
      test.skip(shouldSkip('workflow-progress.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'workflow-progress.png');
    });

    test('Workflow Streaming Output', async ({ page }) => {
      test.skip(shouldSkip('workflow-streaming-output.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'workflow-streaming-output.png');
    });

    test('Missing Model Indicator', async ({ page }) => {
      test.skip(shouldSkip('missing-model.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'missing-model.png');
    });

    test('Auto Layout Comparison', async ({ page }) => {
      test.skip(shouldSkip('auto-layout-comparison.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'auto-layout-comparison.png');
    });

    test('Node Groups', async ({ page }) => {
      test.skip(shouldSkip('node-groups.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'node-groups.png');
    });

    test('Creative Story Workflow', async ({ page }) => {
      test.skip(shouldSkip('creative-story-workflow.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'creative-story-workflow.png');
    });
  });

  // ============================================================================
  // CHAT FEATURES - Advanced chat features
  // ============================================================================
  test.describe('Chat Features', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Chat Workflow Attached', async ({ page }) => {
      test.skip(shouldSkip('chat-workflow-attached.png'), 'Screenshot already exists');
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'chat-workflow-attached.png');
    });

    test('Agent Planning', async ({ page }) => {
      test.skip(shouldSkip('agent-planning.png'), 'Screenshot already exists');
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'agent-planning.png');
    });

    test('Chat Rich Content', async ({ page }) => {
      test.skip(shouldSkip('chat-rich-content.png'), 'Screenshot already exists');
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'chat-rich-content.png');
    });
  });

  // ============================================================================
  // KEY CONCEPTS - Educational screenshots
  // ============================================================================
  test.describe('Key Concepts', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Node Types Overview', async ({ page }) => {
      test.skip(shouldSkip('node-types-overview.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'node-types-overview.png');
    });

    test('Data Flow Direction', async ({ page }) => {
      test.skip(shouldSkip('data-flow-direction.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'data-flow-direction.png');
    });
  });

  // ============================================================================
  // COOKBOOK EXAMPLES - Example workflow screenshots
  // ============================================================================
  test.describe('Cookbook Examples', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('RAG Workflow', async ({ page }) => {
      test.skip(shouldSkip('cookbook-rag-workflow.png'), 'Screenshot already exists');
      await page.goto('/templates');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'cookbook-rag-workflow.png');
    });

    test('Image Enhancement Pipeline', async ({ page }) => {
      test.skip(shouldSkip('cookbook-image-enhance.png'), 'Screenshot already exists');
      await page.goto('/templates');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'cookbook-image-enhance.png');
    });

    test('Image to Story Workflow', async ({ page }) => {
      test.skip(shouldSkip('cookbook-image-to-story.png'), 'Screenshot already exists');
      await page.goto('/templates');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'cookbook-image-to-story.png');
    });

    test('Realtime Agent Workflow', async ({ page }) => {
      test.skip(shouldSkip('cookbook-realtime-agent.png'), 'Screenshot already exists');
      await page.goto('/templates');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'cookbook-realtime-agent.png');
    });

    test('Data Visualization Pipeline', async ({ page }) => {
      test.skip(shouldSkip('cookbook-data-viz.png'), 'Screenshot already exists');
      await page.goto('/templates');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'cookbook-data-viz.png');
    });
  });

  // ============================================================================
  // RESPONSIVE VIEWS - Different viewport sizes
  // ============================================================================
  test.describe('Responsive Views', () => {
    test('Dashboard Mobile View', async ({ page }) => {
      test.skip(shouldSkip('dashboard-mobile.png'), 'Screenshot already exists');
      await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'dashboard-mobile.png');
    });

    test('Dashboard Tablet View', async ({ page }) => {
      test.skip(shouldSkip('dashboard-tablet.png'), 'Screenshot already exists');
      await page.setViewportSize({ width: 768, height: 1024 }); // iPad
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'dashboard-tablet.png');
    });

    test('Chat Mobile View', async ({ page }) => {
      test.skip(shouldSkip('chat-mobile.png'), 'Screenshot already exists');
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'chat-mobile.png');
    });

    test('Editor Wide View', async ({ page }) => {
      test.skip(shouldSkip('editor-wide.png'), 'Screenshot already exists');
      await page.setViewportSize({ width: 2560, height: 1440 }); // 2K monitor
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'editor-wide.png');
    });
  });

  // ============================================================================
  // PANELS - Different panel states
  // ============================================================================
  test.describe('Panel States', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Panel Left Collapsed', async ({ page }) => {
      test.skip(shouldSkip('panel-left-collapsed.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Look for panel collapse button
      const collapseButton = page.locator('[data-testid*="collapse"], [aria-label*="Collapse"], .panel-toggle').first();
      if (await collapseButton.count() > 0) {
        await collapseButton.click();
        await page.waitForTimeout(500);
      }
      await saveScreenshot(page, 'panel-left-collapsed.png');
    });

    test('Panel Right Expanded', async ({ page }) => {
      test.skip(shouldSkip('panel-right-expanded.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'panel-right-expanded.png');
    });

    test('Log Panel', async ({ page }) => {
      test.skip(shouldSkip('log-panel.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Look for log panel toggle
      const logButton = page.locator('[data-testid*="log"], button:has-text("Logs"), [aria-label*="Log"]').first();
      if (await logButton.count() > 0) {
        await logButton.click();
        await page.waitForTimeout(500);
      }
      await saveScreenshot(page, 'log-panel.png');
    });

    test('System Stats Panel', async ({ page }) => {
      test.skip(shouldSkip('system-stats.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'system-stats.png');
    });
  });

  // ============================================================================
  // WORKFLOW ASSISTANT - AI-powered assistant
  // ============================================================================
  test.describe('Workflow Assistant', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Workflow Assistant Chat', async ({ page }) => {
      test.skip(shouldSkip('workflow-assistant-chat.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // Look for assistant button
      const assistantButton = page.locator('[data-testid*="assistant"], button:has-text("Assistant"), [aria-label*="Assistant"]').first();
      if (await assistantButton.count() > 0) {
        await assistantButton.click();
        await page.waitForTimeout(500);
      }
      await saveScreenshot(page, 'workflow-assistant-chat.png');
    });
  });

  // ============================================================================
  // HUGGING FACE - HuggingFace integration
  // ============================================================================
  test.describe('HuggingFace Integration', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('HuggingFace Browser', async ({ page }) => {
      test.skip(shouldSkip('huggingface-browser.png'), 'Screenshot already exists');
      await page.goto('/models');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      // Look for HuggingFace tab/button
      const hfButton = page.locator('button:has-text("HuggingFace"), button:has-text("Hugging Face"), [data-testid*="hugging"]').first();
      if (await hfButton.count() > 0) {
        await hfButton.click();
        await page.waitForTimeout(1000);
      }
      await saveScreenshot(page, 'huggingface-browser.png');
    });
  });

  // ============================================================================
  // ERROR STATES - Various error conditions
  // ============================================================================
  test.describe('Error States', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('404 Page', async ({ page }) => {
      test.skip(shouldSkip('error-404.png'), 'Screenshot already exists');
      await page.goto('/nonexistent-page-12345');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await saveScreenshot(page, 'error-404.png');
    });

    test('Connection Error State', async ({ page }) => {
      test.skip(shouldSkip('connection-error.png'), 'Screenshot already exists');
      // This would need specific setup to capture
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'connection-error.png');
    });
  });

  // ============================================================================
  // LOADING STATES - Various loading conditions
  // ============================================================================
  test.describe('Loading States', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Dashboard Loading', async ({ page }) => {
      test.skip(shouldSkip('dashboard-loading.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      // Capture early before network idle
      await page.waitForTimeout(200);
      await saveScreenshot(page, 'dashboard-loading.png');
    });

    test('Editor Loading', async ({ page }) => {
      test.skip(shouldSkip('editor-loading.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForTimeout(200);
      await saveScreenshot(page, 'editor-loading.png');
    });
  });

  // ============================================================================
  // THEME VARIATIONS - Light/Dark theme
  // ============================================================================
  test.describe('Theme Variations', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('Dashboard Dark Theme', async ({ page }) => {
      test.skip(shouldSkip('dashboard-dark-theme.png'), 'Screenshot already exists');
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      // This captures the default theme (usually dark)
      await saveScreenshot(page, 'dashboard-dark-theme.png');
    });

    test('Editor Dark Theme', async ({ page }) => {
      test.skip(shouldSkip('editor-dark-theme.png'), 'Screenshot already exists');
      await page.goto('/editor');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await saveScreenshot(page, 'editor-dark-theme.png');
    });
  });
}
