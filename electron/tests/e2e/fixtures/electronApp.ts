/**
 * Electron Playwright fixture that provides a `page` object
 * backed by an Electron BrowserWindow, matching the same Page API
 * used by web E2E tests.
 */

import { test as base, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
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

type ElectronFixtures = {
  electronApp: ElectronApplication;
  page: Page;
};

export const test = base.extend<ElectronFixtures>({
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    await killExistingNodeToolProcesses();
    await killServersOnDefaultPort();
    await new Promise(resolve => setTimeout(resolve, 1000));

    const app = await electron.launch({
      args: [
        path.join(__dirname, '../../../dist-electron/main.js'),
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

    await use(app);

    try { await app.close(); } catch { /* force kill if close hangs */ }
    await killExistingNodeToolProcesses();
    await killServersOnDefaultPort();
  },

  page: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    try {
      await window.waitForLoadState('load', { timeout: 30000 });
    } catch {
      // Timeout is acceptable - app may still be loading
    }
    await use(window);
  },
});

export { expect };
export type { Page, APIRequestContext } from '@playwright/test';
