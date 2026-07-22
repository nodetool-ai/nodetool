/**
 * Local single-user DB bootstrap for CLI commands that run in-process rather
 * than against a running server. Mirrors the `setupDb` in nodetool.ts (secrets
 * commands) without pulling in the heavy deploy stack.
 */

import { initDb } from "@nodetool-ai/models";
import { initMasterKey } from "@nodetool-ai/security";
import { getDefaultDbPath } from "@nodetool-ai/config";

/** Local single-user id used across the TS stack. */
export const LOCAL_USER_ID = "1";

let ready: Promise<void> | null = null;

/**
 * Initialize the local SQLite DB and unlock the secret store (needed for any
 * provider that resolves API keys, e.g. embeddings). Idempotent.
 */
export function setupLocalDb(): Promise<void> {
  ready ??= (async () => {
    initDb(getDefaultDbPath());
    try {
      await initMasterKey();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `Could not unlock the secret store: ${msg}\n` +
          `Tip: set SECRETS_MASTER_KEY or grant keychain access.\n`
      );
    }
  })();
  return ready;
}
