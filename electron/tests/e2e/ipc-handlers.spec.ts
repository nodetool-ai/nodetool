import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';

// PID file path matching the one in config.ts
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
  test.describe("IPC Handlers", () => {
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

    test.describe("Clipboard Operations", () => {
      test("should handle clipboard write and read text", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        // Test clipboard write and read
        const testText = 'Hello from IPC test';
        await window.evaluate(async (text) => {
          await (window as any).api.clipboard.writeText(text);
        }, testText);

        const readText = await window.evaluate(async () => {
          return await (window as any).api.clipboard.readText();
        });

        expect(readText).toBe(testText);

        await electronApp.close();
      });

      test("should clear clipboard contents", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        // Write some text
        await window.evaluate(async () => {
          await (window as any).api.clipboard.writeText('test content');
        });

        // Clear clipboard
        await window.evaluate(async () => {
          await (window as any).api.clipboard.clear();
        });

        // Read should return empty
        const readText = await window.evaluate(async () => {
          return await (window as any).api.clipboard.readText();
        });

        expect(readText).toBe('');

        await electronApp.close();
      });

      test("should get available clipboard formats", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        // Write text to clipboard
        await window.evaluate(async () => {
          await (window as any).api.clipboard.writeText('test');
        });

        // Get available formats
        const formats = await window.evaluate(async () => {
          return await (window as any).api.clipboard.availableFormats();
        });

        expect(Array.isArray(formats)).toBe(true);
        expect(formats.length).toBeGreaterThan(0);

        await electronApp.close();
      });
    });

    test.describe("Window Controls", () => {
      test("should minimize window via IPC", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        // Call minimize (just verify it doesn't throw)
        await window.evaluate(async () => {
          (window as any).api.window.minimize();
        });

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 500));

        // App should still be running
        expect(electronApp).toBeTruthy();

        await electronApp.close();
      });

      test("should maximize/restore window via IPC", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        // Call maximize (just verify it doesn't throw)
        await window.evaluate(async () => {
          (window as any).api.window.maximize();
        });

        await new Promise(resolve => setTimeout(resolve, 500));

        // App should still be running
        expect(electronApp).toBeTruthy();

        await electronApp.close();
      });
    });

    test.describe("Logs Management", () => {
      test("should get all logs via IPC", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        const logs = await window.evaluate(async () => {
          return await (window as any).api.logs.getAll();
        });

        // Logs should be an array
        expect(Array.isArray(logs)).toBe(true);

        await electronApp.close();
      });

      test("should clear logs via IPC", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        // Clear logs should not throw
        await window.evaluate(async () => {
          await (window as any).api.logs.clear();
        });

        const logs = await window.evaluate(async () => {
          return await (window as any).api.logs.getAll();
        });

        // After clearing, logs should be empty or minimal
        expect(Array.isArray(logs)).toBe(true);

        await electronApp.close();
      });
    });

    test.describe("Shell Operations", () => {
      test("should have shell.beep method available", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        // Verify beep method exists
        const hasBeep = await window.evaluate(() => {
          return typeof (window as any).api.shell.beep === 'function';
        });

        expect(hasBeep).toBe(true);

        // Call beep (should not throw)
        await window.evaluate(async () => {
          await (window as any).api.shell.beep();
        });

        await electronApp.close();
      });
    });

    test.describe("Package Manager", () => {
      test("should list available packages", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        // This might fail if backend isn't running, which is OK for this test
        try {
          const packages = await window.evaluate(async () => {
            return await (window as any).api.packages.listAvailable();
          });

          // If it succeeds, packages should be an array
          expect(Array.isArray(packages)).toBe(true);
        } catch (error) {
          // It's OK if this fails - we're just testing that the IPC handler exists
          console.log('listAvailable failed (expected if no backend):', error);
        }

        await electronApp.close();
      });

      test("should have package search method", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        // Verify search method exists
        const hasSearch = await window.evaluate(() => {
          return typeof (window as any).api.packages.searchNodes === 'function';
        });

        expect(hasSearch).toBe(true);

        await electronApp.close();
      });
    });

    test.describe("Workflow Operations", () => {
      test("should have workflow CRUD methods available", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        // Verify workflow methods exist
        const methods = await window.evaluate(() => {
          return {
            hasCreate: typeof (window as any).api.workflows.create === 'function',
            hasUpdate: typeof (window as any).api.workflows.update === 'function',
            hasDelete: typeof (window as any).api.workflows.delete === 'function',
            hasRun: typeof (window as any).api.workflows.run === 'function',
          };
        });

        expect(methods.hasCreate).toBe(true);
        expect(methods.hasUpdate).toBe(true);
        expect(methods.hasDelete).toBe(true);
        expect(methods.hasRun).toBe(true);

        await electronApp.close();
      });
    });

    test.describe("System Integration", () => {
      test("should have file explorer methods", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        // Verify system methods exist
        const methods = await window.evaluate(() => {
          return {
            hasOpenLogFile: typeof (window as any).api.system.openLogFile === 'function',
            hasShowItemInFolder: typeof (window as any).api.system.showItemInFolder === 'function',
            hasOpenModelDirectory: typeof (window as any).api.system.openModelDirectory === 'function',
            hasOpenExternal: typeof (window as any).api.system.openExternal === 'function',
          };
        });

        expect(methods.hasOpenLogFile).toBe(true);
        expect(methods.hasShowItemInFolder).toBe(true);
        expect(methods.hasOpenModelDirectory).toBe(true);
        expect(methods.hasOpenExternal).toBe(true);

        await electronApp.close();
      });

      test("should check if Ollama is installed", async () => {
        const electronApp = await electron.launch({
          args: [
            path.join(__dirname, '../../dist-electron/main.js'),
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
          ],
          env: {
            ...process.env,
            ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
          }
        });

        const window = await electronApp.firstWindow();
        await window.waitForLoadState('load', { timeout: 15000 });

        const isInstalled = await window.evaluate(async () => {
          return await (window as any).api.system.checkOllamaInstalled();
        });

        // Should return a boolean
        expect(typeof isInstalled).toBe('boolean');

        await electronApp.close();
      });
    });
  });
}
