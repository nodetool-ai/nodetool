/**
 * The exit code to pass on for a child run with `spawnSync`.
 *
 * `result.status` is null when the child was killed by a signal or never
 * started (`result.error`), so `status ?? 0` reported a crashed or missing
 * server as success. A signal maps to the shell's `128 + n`; anything else
 * without a status is a failure.
 */
import { constants } from "node:os";
import type { SpawnSyncReturns } from "node:child_process";

export function childExitCode(
  result: Pick<SpawnSyncReturns<unknown>, "status" | "signal" | "error">
): number {
  if (result.status !== null) return result.status;
  if (result.signal) return 128 + (constants.signals[result.signal] ?? 0);
  return 1;
}
