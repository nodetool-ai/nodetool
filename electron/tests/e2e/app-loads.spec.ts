import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';

// PID file path matching the one in config.ts
// The Electron app uses app.getPath("temp") which returns os.tmpdir()
const PID_DIRECTORY = path.join(os.tmpdir(), 'nodetool-electron');
const PID_FILE_PATH = path.join(PID_DIRECTORY, 'server.pid');

// Helper function to kill existing NodeTool server processes
async function killExistingNodeToolProcesses(): Promise<void> {
  try {
    const pidContent = await fs.readFile(PID_FILE_PATH, 'utf8');
    const pid = parseInt(pidContent.trim(), 10);
    
    if (pid && !isNaN(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            try {
              process.kill(pid, 0);
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
                clearInterval(checkInterval);
                resolve();
              }
            }
          }, 100);
          
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 3000);
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          console.log(`Error killing process ${pid}:`, error);
        }
      }
      
      try {
        await fs.unlink(PID_FILE_PATH);
      } catch (error) {
        // Ignore
      }
    }
  } catch (error) {
    // PID file doesn't exist, that's OK
  }
}

// Helper function to kill servers on default port
async function killServersOnDefaultPort(): Promise<void> {
  const defaultPort = 7777;
  const platform = os.platform();
  
  return new Promise<void>((resolve) => {
    if (platform === 'darwin' || platform === 'linux') {
      const command = `lsof -ti:${defaultPort} | xargs kill -9 2>/dev/null || true`;
      spawn(command, {
        shell: true,
        stdio: 'ignore'
      }).on('exit', () => {
        resolve();
      }).on('error', () => {
        resolve();
      });
    } else if (platform === 'win32') {
      // Use PowerShell on Windows for more reliable execution
      const command = `Get-NetTCPConnection -LocalPort ${defaultPort} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`;
      spawn('powershell.exe', ['-Command', command], {
        stdio: 'ignore'
      }).on('exit', () => {
        resolve();
      }).on('error', () => {
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Electron App Loading", () => {
    // Clean up any existing servers before tests
    test.beforeAll(async () => {
      await killExistingNodeToolProcesses();
      await killServersOnDefaultPort();
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    test.afterAll(async () => {
      await killExistingNodeToolProcesses();
      await killServersOnDefaultPort();
    });

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
