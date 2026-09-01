/**
 * Secret resolution for CLI runs.
 *
 * `getSecret(key)` with no user id never reads the encrypted store — the DB
 * lookup inside it is guarded by the caller's user id, so a bare reference
 * resolves from `process.env` alone. Every CLI surface runs as the local user,
 * so it must ask for that user's secrets explicitly, or a key the user stored
 * with `nodetool secrets store` is invisible and the provider answers 401.
 */
import { getSecret } from "@nodetool-ai/models";

import { LOCAL_USER_ID } from "./commands/local-db.js";

/** Resolve a secret for the local user: encrypted store first, then env. */
export function resolveLocalSecret(key: string): Promise<string | null> {
  return getSecret(key, LOCAL_USER_ID);
}
