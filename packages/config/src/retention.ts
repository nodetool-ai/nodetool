/**
 * Whether this server expires personal data on its own schedule.
 *
 * A local install keeps its history until the person using the machine asks for
 * a cleanup — that machine is theirs, and silently deleting their run history
 * would surprise them. A hosted deployment is the opposite case: it holds other
 * people's data under a published retention promise, so the sweep has to run
 * without anyone pressing a button.
 *
 * Set `NODETOOL_STORAGE_AUTO_CLEANUP=1` (or `true`) to run the retention sweep
 * automatically. Unset, or `0`/`false`, keeps the manual behaviour.
 */
import { safeProcessEnv } from "./node-import.js";

/** Whether the storage retention sweep should run without being asked. */
export function isAutomaticStorageCleanupEnabled(
  env: Record<string, string | undefined> = safeProcessEnv()
): boolean {
  const value = env["NODETOOL_STORAGE_AUTO_CLEANUP"]?.trim().toLowerCase();
  return value === "1" || value === "true";
}
