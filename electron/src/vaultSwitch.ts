import { logMessage } from "./logger";
import { setActiveVaultId } from "./vaults";
import { initializeBackendServer, stopServer } from "./server";
import { setupWorkflowShortcuts } from "./shortcuts";
import { reloadMainWindow } from "./window";

/**
 * Switch the active vault and apply it end-to-end:
 *
 *  1. Persist the new active vault id.
 *  2. Gracefully stop the backend (releases the SQLite database handle).
 *  3. Restart the backend, which now opens the new vault's database.
 *  4. Re-register workflow global shortcuts (they live in the database).
 *  5. Reload the main window so the UI reconnects to the restarted backend.
 *
 * Restarting the process is deliberate: the backend holds its Drizzle/SQLite
 * connection in a module-level singleton that many subsystems capture, so a
 * clean restart is far more robust than trying to swap the connection live.
 *
 * Menu refresh (so the active-vault checkmark updates) is left to the caller,
 * which avoids a circular dependency with the menu module.
 */
export async function applyVaultSwitch(id: string): Promise<void> {
  setActiveVaultId(id);
  logMessage(`Switching active vault to ${id}; restarting backend`);

  // stopServer() handles and logs its own shutdown errors and does not throw.
  await stopServer();

  // Small delay so the OS releases the port and database file lock before
  // the backend restarts (mirrors the manual server-restart path).
  await new Promise((resolve) => setTimeout(resolve, 300));

  await initializeBackendServer();
  await setupWorkflowShortcuts();
  reloadMainWindow();
}
