/**
 * Execution-mode setting resolution. Precedence: explicit option >
 * `NODETOOL_AGENT_EXECUTION_MODE` (the registered setting; the server mirrors
 * the stored value into the environment at startup) > `"tools"`.
 */

import type { AgentExecutionMode } from "../types.js";

export const AGENT_EXECUTION_MODE_ENV = "NODETOOL_AGENT_EXECUTION_MODE";

export function resolveExecutionMode(
  explicit?: AgentExecutionMode
): AgentExecutionMode {
  if (explicit) return explicit;
  const raw = process.env[AGENT_EXECUTION_MODE_ENV]?.trim().toLowerCase();
  return raw === "codeact" ? "codeact" : "tools";
}
