/**
 * Registration seam for the browser action layer.
 *
 * The actions themselves live in `@nodetool-ai/automation-nodes` — they need
 * Chrome, CDP, and the `/ws/extension` relay — and that package depends on
 * this one, so the import cannot point the other way. `automation-nodes`
 * registers its runner here at module load; the `browser` capability module
 * resolves it at call time.
 *
 * Same shape and same reason as `setExtensionChannelProvider` one layer down:
 * a process that never loads the node packages (a hermetic eval, a bare CLI)
 * registers nothing, and the capabilities then say so instead of failing on an
 * unresolved module.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";

/** What `browser_status` answers. Mirrors `BrowserStatusOutput`. */
export interface BrowserSessionStatus {
  transport: "local" | "extension";
  session_open: boolean;
  /** `null` when this process does not hold the extension bridge. */
  extension_connected: boolean | null;
  url: string | null;
  title: string | null;
  hint: string | null;
}

/** The one entry point every `browser_*` capability lands on. */
export interface BrowserActionRunner {
  /**
   * Run one action by its key (`view`, `navigate`, …) and return what the
   * agent sees: media already persisted as assets, never raw base64.
   */
  run(
    context: ProcessingContext,
    key: string,
    params: Record<string, unknown>
  ): Promise<unknown>;
  /** Report the session without opening one. */
  status(): Promise<BrowserSessionStatus>;
}

let runner: BrowserActionRunner | null = null;

/** Register the action layer. Called once by `@nodetool-ai/automation-nodes`. */
export function setBrowserActionRunner(next: BrowserActionRunner | null): void {
  runner = next;
}

/** The registered runner, or `null` in a process that loaded no node packages. */
export function getBrowserActionRunner(): BrowserActionRunner | null {
  return runner;
}
