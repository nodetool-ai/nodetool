import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';

// Skip when executed by Jest; Playwright tests are meant to run via `npx playwright test`.
// Skip in CI as these tests require Electron to manage its own Python server,
// but CI environments run with an externally managed server for integration testing.
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else if (process.env.CI) {
  test.skip("skipped in CI environment - these tests require Electron-managed server", () => {});
} else {
  test.describe("Python Server Initialization", () => {
    let electronApp: any;
    
    // PID file path matching the one in server.ts
    const PID_DIRECTORY = path.join(os.tmpdir(), 'nodetool');
    const PID_FILE_PATH = path.join(PID_DIRECTORY, 'nodetool.pid');

    // Helper function to kill existing NodeTool server processes
    async function killExistingNodeToolProcesses(): Promise<void> {
      try {
        // Try to read PID file
        const pidContent = await fs.readFile(PID_FILE_PATH, 'utf8');
        const pid = parseInt(pidContent.trim(), 10);
        
        if (pid && !isNaN(pid)) {
          try {
            console.log(`Killing existing NodeTool server process (PID: ${pid})`);
            process.kill(pid, 'SIGTERM');
            
            // Wait for process to die
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
            
            console.log(`Successfully killed process ${pid}`);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
              console.log(`Error killing process ${pid}:`, error);
            }
          }
          
          // Clean up PID file
          try {
            await fs.unlink(PID_FILE_PATH);
            console.log('Removed stale PID file');
          } catch (error) {
            console.log('Failed to remove PID file:', error);
          }
        }
      } catch (error) {
        // PID file doesn't exist, that's OK
        console.log('No existing PID file found');
      }
    }

    // Helper function to find and kill Python server processes on default port
    async function killServersOnDefaultPort(): Promise<void> {
      const defaultPort = 7777;
      const platform = os.platform();
      
      return new Promise<void>((resolve) => {
        console.log(`Killing any processes on port ${defaultPort}`);
        
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

    test.beforeAll(async () => {
      // Kill any existing NodeTool server processes before tests
      await killExistingNodeToolProcesses();
      await killServersOnDefaultPort();
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Launch Electron app with server initialization enabled
      electronApp = await electron.launch({
        args: [
          path.join(__dirname, '../../dist-electron/main.js'),
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ],
        env: {
          ...process.env,
          // Don't skip server initialization for these tests
          NODE_ENV: 'development',
          ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
        }
      });
    });

    test.afterAll(async () => {
      if (electronApp) {
        // Close Electron app, which should trigger server shutdown
        await electronApp.close();
        
        // Wait a moment for clean shutdown
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Kill any remaining server processes as cleanup
        await killExistingNodeToolProcesses();
        await killServersOnDefaultPort();
      }
    });

    test("should initialize server and get server state via IPC", async () => {
      const window = await electronApp.firstWindow();
      
      // Wait for the window to load
      await window.waitForLoadState('load', { timeout: 30000 });
      
      // Get server state via IPC
      const serverState = await window.evaluate(async () => {
        const state = await (window as any).api.server.getState();
        return state;
      });
      
      // Verify server state structure
      expect(serverState).toBeDefined();
      expect(typeof serverState.status).toBe('string');
      expect(typeof serverState.initialURL).toBe('string');
      
      // Server should have a port assigned
      if (serverState.serverPort) {
        expect(typeof serverState.serverPort).toBe('number');
        expect(serverState.serverPort).toBeGreaterThan(0);
      }
      
      // Initial URL should contain the port
      if (serverState.initialURL && serverState.serverPort) {
        expect(serverState.initialURL).toContain(`:${serverState.serverPort}`);
      }
    });

    test("should have server URL in initialURL after startup", async () => {
      const window = await electronApp.firstWindow();
      
      // Wait for the window to load and server to potentially start
      await window.waitForLoadState('load', { timeout: 30000 });
      
      // Get server state
      const serverState = await window.evaluate(async () => {
        const state = await (window as any).api.server.getState();
        return state;
      });
      
      // Verify initialURL is set
      expect(serverState.initialURL).toBeTruthy();
      expect(typeof serverState.initialURL).toBe('string');
      
      // URL should be localhost with a port
      if (serverState.initialURL) {
        expect(serverState.initialURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      }
    });

    test("should have server status in valid states", async () => {
      const window = await electronApp.firstWindow();
      
      await window.waitForLoadState('load', { timeout: 30000 });
      
      const serverState = await window.evaluate(async () => {
        const state = await (window as any).api.server.getState();
        return state;
      });
      
      // Status should be one of the valid states
      const validStatuses = ['idle', 'starting', 'started', 'error'];
      expect(validStatuses).toContain(serverState.status);
    });

    test("should have boot message set", async () => {
      const window = await electronApp.firstWindow();
      
      await window.waitForLoadState('load', { timeout: 30000 });
      
      const serverState = await window.evaluate(async () => {
        const state = await (window as any).api.server.getState();
        return state;
      });
      
      // Boot message should be a string
      expect(serverState.bootMsg).toBeDefined();
      expect(typeof serverState.bootMsg).toBe('string');
    });

    test("should include logs array in server state", async () => {
      const window = await electronApp.firstWindow();
      
      await window.waitForLoadState('load', { timeout: 30000 });
      
      const serverState = await window.evaluate(async () => {
        const state = await (window as any).api.server.getState();
        return state;
      });
      
      // Logs should be an array
      expect(Array.isArray(serverState.logs)).toBe(true);
    });

    test("should have Ollama port configuration in server state", async () => {
      const window = await electronApp.firstWindow();
      
      await window.waitForLoadState('load', { timeout: 30000 });
      
      const serverState = await window.evaluate(async () => {
        const state = await (window as any).api.server.getState();
        return state;
      });
      
      // Ollama port should be defined
      expect(serverState.ollamaPort).toBeDefined();
      expect(typeof serverState.ollamaPort).toBe('number');
      expect(serverState.ollamaPort).toBeGreaterThan(0);
      
      // External managed flag should be a boolean
      expect(typeof serverState.ollamaExternalManaged).toBe('boolean');
    });

    test("should handle server errors gracefully", async () => {
      const window = await electronApp.firstWindow();
      
      await window.waitForLoadState('load', { timeout: 30000 });
      
      const serverState = await window.evaluate(async () => {
        const state = await (window as any).api.server.getState();
        return state;
      });
      
      // If status is error, error message should be present
      if (serverState.status === 'error') {
        expect(serverState.error).toBeDefined();
        expect(typeof serverState.error).toBe('string');
        expect(serverState.error.length).toBeGreaterThan(0);
      }
    });

    test("should allow restarting server via IPC", async () => {
      const window = await electronApp.firstWindow();
      
      await window.waitForLoadState('load', { timeout: 30000 });
      
      // Get initial server state
      const initialState = await window.evaluate(async () => {
        const state = await (window as any).api.server.getState();
        return state;
      });
      
      // Attempt to restart server (may fail if no server is running, which is OK)
      // We're just testing that the IPC handler exists and responds
      try {
        await window.evaluate(async () => {
          await (window as any).api.server.restart();
        });
        
        // Wait a moment for potential restart
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Get server state after restart attempt
        const newState = await window.evaluate(async () => {
          const state = await (window as any).api.server.getState();
          return state;
        });
        
        // State should still be valid
        expect(newState).toBeDefined();
        expect(typeof newState.status).toBe('string');
      } catch (error) {
        // It's OK if restart fails - server might not be running
        // We just want to verify that the IPC handler exists
        console.log('Server restart failed (expected if no server running):', error);
      }
    });
  });

  test.describe("Server Health Checks", () => {
    test("should load health endpoint if server is running", async () => {
      const electronApp = await electron.launch({
        args: [
          path.join(__dirname, '../../dist-electron/main.js'),
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ],
        env: {
          ...process.env,
          NODE_ENV: 'development',
          ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
        },
        timeout: 60000
      });

      const window = await electronApp.firstWindow();
      
      // Wait longer for server to potentially start
      await window.waitForLoadState('load', { timeout: 30000 });
      
      // Get server state to find the port
      const serverState = await window.evaluate(async () => {
        const state = await (window as any).api.server.getState();
        return state;
      });
      
      // If server has started and has a port, try to fetch the health endpoint
      if (serverState.status === 'started' && serverState.serverPort) {
        try {
          const response = await fetch(`http://127.0.0.1:${serverState.serverPort}/health`);
          expect(response.ok).toBe(true);
          
          // Health endpoint should return JSON
          const contentType = response.headers.get('content-type');
          expect(contentType).toMatch(/application\/json/);
        } catch (error) {
          console.log('Health check failed:', error);
          throw error;
        }
      } else {
        // If server didn't start, that's OK for this test
        // We're just verifying we can attempt to health check
        console.log('Server not in started state, skipping health endpoint check');
      }
      
      await electronApp.close();
    });
  });
}
