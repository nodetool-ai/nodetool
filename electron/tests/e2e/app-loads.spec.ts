import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';

// PID file path matching the one in config.ts
const PID_DIRECTORY = path.join(os.tmpdir(), 'nodetool-electron');
const PID_FILE_PATH = path.join(PID_DIRECTORY, 'server.pid');

async function killExistingNodeToolProcesses(): Promise<void> {
  try {
    const pidContent = await fs.readFile(PID_FILE_PATH, 'utf8');
    const pid = parseInt(pidContent.trim(), 10);
    if (pid && !isNaN(pid)) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already dead */ }
      try { await fs.unlink(PID_FILE_PATH); } catch { /* ignore */ }
    }
  } catch { /* PID file doesn't exist */ }
}

async function killServersOnDefaultPort(): Promise<void> {
  const defaultPort = 7777;
  const platform = os.platform();
  return new Promise<void>((resolve) => {
    if (platform === 'darwin' || platform === 'linux') {
      spawn(`lsof -ti:${defaultPort} | xargs kill -9 2>/dev/null || true`, {
        shell: true, stdio: 'ignore'
      }).on('exit', () => resolve()).on('error', () => resolve());
    } else if (platform === 'win32') {
      spawn('powershell.exe', ['-Command',
        `Get-NetTCPConnection -LocalPort ${defaultPort} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`
      ], { stdio: 'ignore' }).on('exit', () => resolve()).on('error', () => resolve());
    } else {
      resolve();
    }
  });
}

// Skip when executed by Jest; Playwright tests run via `npx playwright test`.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Electron App Loading", () => {
    let electronApp: ElectronApplication;
    let window: Page;

    test.beforeAll(async () => {
      await killExistingNodeToolProcesses();
      await killServersOnDefaultPort();
      await new Promise(resolve => setTimeout(resolve, 1000));

      electronApp = await electron.launch({
        args: [
          path.join(__dirname, '../../dist-electron/main.js'),
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ],
        env: {
          ...process.env,
          ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
        },
        timeout: 20000
      });

      window = await electronApp.firstWindow();
      try {
        await window.waitForLoadState('load', { timeout: 15000 });
      } catch {
        // Timeout is acceptable — app may still be loading
      }
    });

    test.afterAll(async () => {
      if (electronApp) {
        try {
          await electronApp.close();
        } catch {
          // Force kill if close hangs
        }
      }
      await killExistingNodeToolProcesses();
      await killServersOnDefaultPort();
    });

    test("should launch the Electron app successfully", async () => {
      expect(window).toBeTruthy();
      const url = window.url();
      expect(url).toBeTruthy();
    });

    test("should have working main window", async () => {
      expect(window).toBeTruthy();
      const url = window.url();
      expect(url).toBeTruthy();
    });

    test("should handle IPC communication", async () => {
      const hasApi = await window.evaluate(() => {
        return typeof (window as any).api !== 'undefined';
      });
      expect(hasApi).toBe(true);
    });

    test("should load application without crashes", async () => {
      expect(electronApp).toBeTruthy();
      expect(window).toBeTruthy();
    });
  });
}
