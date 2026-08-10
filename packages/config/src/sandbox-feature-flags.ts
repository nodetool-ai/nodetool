/**
 * Feature flags for the sandbox package system.
 *
 * `NODETOOL_SANDBOX_MODULES_V1` is the M1 parity flag. Guest module imports
 * work on the server and in the CLI but not yet in the browser runner, so the
 * whole path is off unless a host opts in exactly. It lives here — not in
 * `websocket` — because the server, the CLI, the Code node, the graph
 * validator and CodeAct all have to read the same answer, and `config` is the
 * one package below all of them.
 *
 * The browser cannot read a server environment variable; the browser runner
 * refuses `packages` unconditionally (M2 delivers modules there and removes
 * both the flag and the refusal).
 */
import { safeProcessEnv } from "./node-import.js";

export const SANDBOX_MODULES_V1_FLAG = "NODETOOL_SANDBOX_MODULES_V1";

/** What a Code node, CodeAct action, or validator says while the flag is off. */
export const SANDBOX_MODULES_DISABLED_MESSAGE =
  "Sandbox package imports are not enabled on this server " +
  `(set ${SANDBOX_MODULES_V1_FLAG}=1).`;

/** What every surface says about the browser gap while M1 is the state of play. */
export const SANDBOX_MODULES_BROWSER_PARITY_MESSAGE =
  "Sandbox package imports are unavailable in the browser runner until " +
  "module delivery is enabled.";

/** Exact opt-in: any value other than `"1"` leaves the flag off. */
export function isSandboxModulesV1Enabled(
  environment: Record<string, string | undefined> = safeProcessEnv()
): boolean {
  return environment[SANDBOX_MODULES_V1_FLAG] === "1";
}

export interface SandboxFeatureFlagSnapshot {
  modulesV1: boolean;
}

/** Inventory of sandbox flags, so the disabled baseline stays complete. */
export function getSandboxFeatureFlagSnapshot(
  environment: Record<string, string | undefined> = safeProcessEnv()
): SandboxFeatureFlagSnapshot {
  return { modulesV1: isSandboxModulesV1Enabled(environment) };
}
