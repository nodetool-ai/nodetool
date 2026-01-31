# Electron E2E Test Suite Documentation

This directory contains end-to-end tests for the NodeTool Electron desktop application using Playwright.

## Test Organization

### 1. app-loads.spec.ts
**Tests: 4**
- Launch Electron app successfully
- Working main window creation
- IPC communication via preload script (window.api)
- Application loads without crashes

### 2. python-server.spec.ts
**Tests: 9**
- Initialize server and get server state via IPC
- Server URL in initialURL after startup
- Server status in valid states (idle, starting, started, error)
- Boot message set
- Logs array in server state
- Ollama port configuration
- Server error handling
- Server restart via IPC
- Health endpoint loading if server is running

### 3. ipc-handlers.spec.ts (New)
**Tests: 20**
- **Clipboard Operations:**
  - Write and read text
  - Clear clipboard contents
  - Get available clipboard formats
- **Window Controls:**
  - Minimize window via IPC
  - Maximize/restore window via IPC
- **Logs Management:**
  - Get all logs via IPC
  - Clear logs via IPC
- **Shell Operations:**
  - Shell.beep method availability
- **Package Manager:**
  - List available packages
  - Package search method
- **Workflow Operations:**
  - Workflow CRUD methods availability (create, update, delete, run)
- **System Integration:**
  - File explorer methods
  - Check if Ollama is installed

### 4. window-management.spec.ts (New)
**Tests: 8**
- Create and manage main window
- Handle window minimize
- Handle window maximize/restore
- Valid window title
- Support multiple windows
- Handle window events
- Maintain window state across operations
- Handle rapid window operations

## Total Test Coverage

- **Total Files:** 4
- **Total Tests:** 41 (13 original + 28 new)
- **Original Tests:** 13 (4 + 9 from existing files)
- **New Tests in this PR:** 28 (20 + 8)

## Test Coverage Areas

### Core Features Tested
- ✅ Electron app launching and initialization
- ✅ Main window creation and management
- ✅ IPC communication (window.api exposed via preload)
- ✅ Python server initialization and management
- ✅ Server state tracking (status, port, logs, errors)
- ✅ Server health checks
- ✅ Server restart functionality
- ✅ Ollama integration
- ✅ **NEW: Comprehensive IPC handlers** (clipboard, window controls, logs, shell, packages, workflows, system)
- ✅ **NEW: Window management operations** (minimize, maximize, state preservation)

### Test Patterns Used

1. **App Lifecycle Testing**
   - Launch with proper args and environment
   - Window creation and loading
   - Clean shutdown and cleanup

2. **IPC Communication Testing**
   - Handler method availability
   - Request/response patterns
   - Error handling

3. **State Management**
   - Server state tracking
   - Window state preservation
   - Log accumulation

4. **Error Handling**
   - Process cleanup on failure
   - Port conflict resolution
   - Invalid state recovery

5. **Cross-Platform Support**
   - Platform-specific cleanup (Windows, macOS, Linux)
   - Port killing strategies per OS
   - PID file management

## Running the Tests

### All Tests
```bash
cd electron
npm run test:e2e
```

### Specific Test File
```bash
cd electron
npx playwright test app-loads.spec.ts
npx playwright test python-server.spec.ts
npx playwright test ipc-handlers.spec.ts      # NEW
npx playwright test window-management.spec.ts # NEW
```

### With UI Mode (Recommended for Development)
```bash
cd electron
npm run test:e2e:ui
```

### In Headed Mode (See Electron Window)
```bash
cd electron
npm run test:e2e:headed
```

### Debug Mode
```bash
cd electron
npx playwright test --debug
```

## Test Structure

Each test file follows this pattern:

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Feature Name", () => {
    test("should do something", async () => {
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
      
      // Test implementation
      
      await electronApp.close();
    });
  });
}
```

## Best Practices Followed

1. **Independent Tests**: Each test can run independently
2. **Proper Cleanup**: Server processes and PID files are cleaned up before/after tests
3. **Timeout Handling**: Appropriate timeouts for app launch and window loading
4. **Error Detection**: Checking for process errors and state validity
5. **Cross-Platform**: Tests work on Windows, macOS, and Linux
6. **Resource Management**: Proper shutdown of Electron app and server processes
7. **Clean Code**: Following TypeScript and Playwright best practices

## CI/CD Integration

These tests run automatically in GitHub Actions:
- On push to `main` branch (when electron files change)
- On pull requests to `main` branch (when electron files change)

The CI workflow:
- Builds the Electron app (vite:build + tsc)
- Installs Playwright browsers
- Runs all e2e tests
- Uploads artifacts on failure

See `.github/workflows/electron-e2e.yml` for CI configuration.

## Future Enhancements

Potential areas for additional tests:
- File system dialog operations (open file, save file)
- Native menu testing (application menu, context menu)
- Keyboard shortcuts in Electron context
- Multiple window management
- Auto-updater functionality
- Tray icon operations
- Native notifications
- Protocol handling
- Deep linking
- Installer/uninstaller testing
