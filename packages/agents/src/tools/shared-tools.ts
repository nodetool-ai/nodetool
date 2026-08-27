/**
 * Run-scoped memory tools — progressive-disclosure access to the shared agent
 * memory a run carries at `context.memory`.
 *
 * Earlier versions auto-injected every memory entry into every step's user
 * message. That worked but was wasteful: large upstream results bloated every
 * downstream prompt even when the step only needed one specific entry.
 *
 * The 2026 pattern is **progressive disclosure**: the model receives a tiny
 * "what's available" hint up front and pulls full values on demand:
 *
 *   1. `list_shared` — returns metadata for all entries (key, kind, title,
 *      description, source, byte size). No values. Cheap to call.
 *   2. `read_shared` — returns full values for a list of keys.
 *   3. `share_result` — publishes a value to the `shared:` namespace so other
 *      agents and steps can discover it via `list_shared`.
 *
 * The three live in the `shared` capability module
 * (`../capabilities/shared.ts`); this file keeps only the belt they are mounted
 * from, because mount policy stays with the executor. They are auto-attached to
 * every {@link StepExecutor}; authors of custom executors call
 * `getSharedTools()` and append the result to their tool array.
 */

import { toolForCapabilityName } from "../capabilities/lazy-tool.js";
import type { Tool } from "./base-tool.js";

/** Names of the auto-attached memory tools. Useful for filtering / detection. */
export const SHARED_TOOL_NAMES = [
  "list_shared",
  "read_shared",
  "share_result"
] as const;

/**
 * Returns fresh instances of the three memory tools. Call this once per
 * executor — every executor needs its own instances so they don't share
 * mutable state (none currently exists, but this future-proofs).
 */
export function getSharedTools(): Tool[] {
  return SHARED_TOOL_NAMES.map((name) => toolForCapabilityName(name));
}
