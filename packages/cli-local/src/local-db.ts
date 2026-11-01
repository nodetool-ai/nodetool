/**
 * Local single-user DB bootstrap for CLI commands that run in-process rather
 * than against a running server. Mirrors the `setupDb` in nodetool.ts (secrets
 * commands) without pulling in the heavy deploy stack.
 */

import { initDb, migrateSqliteDb } from "@nodetool-ai/models";
import { initMasterKey, isKeychainBackendMissing } from "@nodetool-ai/security";
import { getDefaultDbPath } from "@nodetool-ai/config";

/** Local single-user id used across the TS stack. */
export const LOCAL_USER_ID = "1";

let ready: Promise<void> | null = null;

/**
 * Initialize the local SQLite DB and best-effort unlock the secret store
 * (needed for any provider that resolves API keys, e.g. embeddings). If the
 * store can't be unlocked it warns to stderr and still resolves — a command
 * that then needs a secret fails at that later point, so the DB stays usable
 * for commands that don't. Idempotent.
 */
export function setupLocalDb(): Promise<void> {
  ready ??= (async () => {
    // initDb applies only the baseline schema. Migrate first, or a command
    // that writes an asset fails on a column added later.
    await migrateSqliteDb(getDefaultDbPath());
    initDb(getDefaultDbPath());
    try {
      await initMasterKey();
    } catch (err) {
      // A missing keychain module matters only when a stored secret is read.
      if (err instanceof Error && isKeychainBackendMissing(err)) return;
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `Could not unlock the secret store: ${msg}\n` +
          `Tip: set SECRETS_MASTER_KEY or grant keychain access.\n`
      );
    }
  })();
  return ready;
}

/** Migrate a standalone command database before unlocking its local credentials. */
export async function setupCliDb(): Promise<void> {
  await setupLocalDb();
}
