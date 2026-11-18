/**
 * Named pause points for crash and race tests
 * (docs/plans/native-cloud-sync/technical-design.md, "Harnesses", WP2.6).
 *
 * Code that must survive a process kill between two steps calls
 * `await pausePoint("<step>")` there. Outside tests it returns at once.
 *
 * - A test in the same process installs a handler with
 *   {@link setPauseHandler} and holds callers at a step, for races.
 * - A test that kills a process starts it with `NODETOOL_PAUSE_AT=<step>`.
 *   On reaching the step the process writes `NODETOOL_PAUSED <step>` to
 *   stderr and the calling flow blocks until the harness kills the process.
 *   A thrown exception is not used, because it runs rollback and cleanup code
 *   that a killed process never runs.
 *
 * `NODETOOL_PAUSE_AT` is ignored when `NODE_ENV` is `production`, so a stray
 * variable cannot stall a deployed server.
 */
import { writeSync } from "node:fs";

/** The line a paused process writes to stderr, followed by the step name. */
export const PAUSED_MARKER = "NODETOOL_PAUSED";

/** Called at every pause point while installed. Resolving lets the caller go on. */
export type PauseHandler = (name: string) => Promise<void> | void;

let handler: PauseHandler | null = null;

/** Installs the in-process handler, or removes it with null. */
export function setPauseHandler(next: PauseHandler | null): void {
  handler = next;
}

function pausedByEnvironment(name: string): boolean {
  const names = process.env["NODETOOL_PAUSE_AT"];
  if (!names || process.env["NODE_ENV"] === "production") return false;
  return names.split(",").some((entry) => entry.trim() === name);
}

/**
 * Marks a named step. Returns at once unless a test holds the step: through
 * the installed handler, or through `NODETOOL_PAUSE_AT` in a process the
 * harness will kill.
 */
export async function pausePoint(name: string): Promise<void> {
  if (handler) {
    await handler(name);
    return;
  }
  if (!pausedByEnvironment(name)) return;
  // Synchronous, so the line is out before the harness sends the kill.
  writeSync(2, `${PAUSED_MARKER} ${name}\n`);
  // Blocks this flow. The harness ends the process with a kill.
  await new Promise<never>(() => {});
}
