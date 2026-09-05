/**
 * Permission classification for the `Tool` classes that are not capabilities,
 * plus the gate contract re-exported from `@nodetool-ai/runtime`.
 *
 * The chat agent always carries a fixed toolbelt; a permission *mode* decides
 * whether each tool call runs automatically, asks the user first, or is
 * blocked. The ladder itself lives in `capabilities/invoke.ts` — one
 * implementation, reached either through `CapabilityRun.invoke` or through the
 * `gateTools` wrapper (`capabilities/gate-tools.ts`), which is how a host that
 * still hands out `Tool` instances gets the same gate. The wrapper lives on
 * the capabilities side so this file never imports from `capabilities/` — the
 * reverse edge deadlocked the bundled backend's async module wrappers.
 *
 * Design: docs/superpowers/specs/2026-05-28-chat-permission-model-design.md,
 * docs/tool-class-retirement-design.md § "Where the permission gate lives"
 */

import type { PermissionCategory } from "@nodetool-ai/runtime";

// The gate contract (key, types, decision matrix, headless gate) lives in
// `@nodetool-ai/runtime` so the workflow hosts below `agents` can set a gate
// on the context they build. Re-exported here so every existing import of
// these names keeps resolving through this module.
export {
  decidePermission,
  headlessDenialReason,
  headlessGate
} from "@nodetool-ai/runtime";
export type {
  ApprovalDecision,
  ApprovalRequest,
  PermissionCategory,
  PermissionDecision,
  PermissionGateOptions,
  PermissionMode,
  RequestApproval
} from "@nodetool-ai/runtime";

/**
 * Tool name → category, for the `Tool` classes that are not capabilities.
 *
 * A capability's spec is the authority on its category, and
 * `capabilityCategoryFor` (`capabilities/registry.ts`) reads the spec first
 * and falls back to this map only for a name no spec owns. So this table holds
 * exactly the surviving `Tool` classes: the plan-builder tools, `finish_step`,
 * and `run_node`. An entry for a name that has a spec is a duplicate, and
 * `tests/tool-permissions-spec-drift.test.ts` fails on one. Anything not
 * listed anywhere defaults to `external`, the most conservative class, so a
 * newly-added tool is gated until classified.
 *
 * `read` = no side effects (search, inspect, query, pure compute, internal
 * agent bookkeeping). `write` = mutates local state or produces artifacts /
 * costly media. `execute` = runs arbitrary compute. `external` = third-party
 * side effects.
 */
export const TOOL_PERMISSION_CATEGORIES: Readonly<
  Record<string, PermissionCategory>
> = {
  // Plan-builder bookkeeping: each edits the in-memory plan and nothing else.
  finish_plan: "read",
  add_task: "read",
  remove_task: "read",
  finish_step: "read",
  // Runs one node with whatever that node does.
  run_node: "execute"
};

/** Category for a tool name, defaulting to the conservative `external`. */
export function permissionCategoryFor(name: string): PermissionCategory {
  return TOOL_PERMISSION_CATEGORIES[name] ?? "external";
}
