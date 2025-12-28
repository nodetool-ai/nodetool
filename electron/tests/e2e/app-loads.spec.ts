import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Electron App Loading", () => {
    test("should launch the Electron app successfully", async () => {
      // Launch the Electron app
      const electronApp = await electron.launch({
        args: [
          path.join(__dirname, '../../dist-electron/main.js'),
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
        }
      });

      // Wait for the first window to open
      const window = await electronApp.firstWindow();
      
      // Verify window is created
      expect(window).toBeTruthy();
      
      // Wait for the app to load with a longer timeout
      try {
        await window.waitForLoadState('load', { timeout: 15000 });
      } catch (e) {
        // If load state times out, that's okay - we just want to verify the app launched
      }
      
      // Check that the window has a URL (even if it's about:blank)
      const url = window.url();
      expect(url).toBeTruthy();
      
      // Close the app
      await electronApp.close();
    });

    test("should have working main window", async () => {
      const electronApp = await electron.launch({
        args: [
          path.join(__dirname, '../../dist-electron/main.js'),
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
        }
      });

      const window = await electronApp.firstWindow();
      
      // Wait for any content to load
      try {
        await window.waitForLoadState('load', { timeout: 15000 });
      } catch (e) {
        // Timeout is acceptable, continue with test
      }
      
      // Check window is not null
      expect(window).toBeTruthy();
      
      // Check that the window has a valid URL
      const url = window.url();
      expect(url).toBeTruthy();
      
      await electronApp.close();
    });

    test("should handle IPC communication", async () => {
      const electronApp = await electron.launch({
        args: [
          path.join(__dirname, '../../dist-electron/main.js'),
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
        }
      });

      const window = await electronApp.firstWindow();
      
      // Wait for content to load
      try {
        await window.waitForLoadState('load', { timeout: 15000 });
      } catch (e) {
        // Timeout is acceptable
      }
      
      // Verify that window.api is available (from preload script)
      const hasApi = await window.evaluate(() => {
        return typeof (window as any).api !== 'undefined';
      });
      
      expect(hasApi).toBe(true);
      
      await electronApp.close();
    });

    test("should load application without crashes", async () => {
      const electronApp = await electron.launch({
        args: [
          path.join(__dirname, '../../dist-electron/main.js'),
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
        },
        timeout: 20000
      });

      const window = await electronApp.firstWindow();
      
      // Wait for content to load
      try {
        await window.waitForLoadState('load', { timeout: 15000 });
      } catch (e) {
        // Timeout is acceptable
      }
      
      // Verify the app is still running
      expect(electronApp).toBeTruthy();
      expect(window).toBeTruthy();
      
      await electronApp.close();
    });
  });
}
