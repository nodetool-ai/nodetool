/**
 * Reserved fields the backend injects onto tool-call args. They drive UI
 * state but should never appear in the rendered argument view.
 *
 * Single source of truth — keep mirrored with
 * `packages/agents/src/tools/base-tool.ts` (`USER_MESSAGE_FIELD`) and
 * `packages/agents/src/tools/subtask-fields.ts` (`TOOL_CALL_ID_FIELD`).
 */

/** LLM-authored user-facing status. Surfaced via `tc.message`. */
export const TOOL_USER_MESSAGE_FIELD = "_message";

/** Server-injected tool_call_id. Used by `run_subtask` for nesting. */
export const TOOL_CALL_ID_FIELD = "_tool_call_id";

const RESERVED_FIELDS = [TOOL_USER_MESSAGE_FIELD, TOOL_CALL_ID_FIELD] as const;

/**
 * Strip every reserved field from a tool-call args object. Returns the input
 * unchanged when no reserved field is present (no allocation), and `null`
 * when args is nullish.
 */
export function visibleToolArgs(
  args: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!args) return null;
  let out: Record<string, unknown> | null = null;
  for (const field of RESERVED_FIELDS) {
    if (field in args) {
      out = out ?? { ...args };
      delete out[field];
    }
  }
  return out ?? args;
}
