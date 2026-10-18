import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_CONSENT } from "../consent/types.js";
import {
  parseStoredState,
  type AnalyticsStore,
  type StoredAnalyticsState
} from "../core/store.js";

/**
 * The CLI's analytics file: `~/.nodetool/telemetry.json`, next to the CLI's
 * other user settings. It lives outside the installed package, so upgrading
 * or reinstalling NodeTool keeps the user's answer.
 */
export function defaultCliAnalyticsPath(): string {
  return join(homedir(), ".nodetool", "telemetry.json");
}

/**
 * A store kept in one JSON file. Every write rewrites the file through a
 * temporary sibling and a rename, with owner-only permissions. A missing or
 * unreadable file reads as "never asked", which sends nothing.
 */
export function createFileAnalyticsStore(path: string): AnalyticsStore & {
  read(): Promise<StoredAnalyticsState>;
} {
  let writes: Promise<void> = Promise.resolve();

  const read = async (): Promise<StoredAnalyticsState> => {
    try {
      return parseStoredState(JSON.parse(await readFile(path, "utf8")) as unknown);
    } catch {
      return { consent: { ...DEFAULT_CONSENT }, identity: null, queue: [] };
    }
  };

  const update = (
    change: (state: StoredAnalyticsState) => StoredAnalyticsState
  ): Promise<void> => {
    writes = writes
      .then(async () => {
        const next = change(await read());
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        const tmp = `${path}.${process.pid}.tmp`;
        await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, {
          mode: 0o600
        });
        await rename(tmp, path);
      })
      .catch(() => {
        // A read-only home directory must not break the CLI.
      });
    return writes;
  };

  return {
    read,
    loadConsent: async () => (await read()).consent,
    saveConsent: (consent) => update((state) => ({ ...state, consent })),
    loadIdentity: async () => (await read()).identity,
    saveIdentity: (identity) => update((state) => ({ ...state, identity })),
    loadQueue: async () => (await read()).queue,
    saveQueue: (queue) => update((state) => ({ ...state, queue: [...queue] }))
  };
}
