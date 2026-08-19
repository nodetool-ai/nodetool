/**
 * Scripting helpers for tests that drive a CodeAct step loop.
 *
 * Every step executor is a `CodeActExecutor`, so a fake provider completes a
 * step by emitting one `execute_code` tool call whose program calls
 * `finish(...)` (schema'd steps) — or by emitting a plain assistant message
 * with no tool call (prose steps).
 */

import { EXECUTE_CODE_TOOL_NAME } from "../../src/codeact/codeact-executor.js";

let seq = 0;

/** An `execute_code` provider tool call running `code` in the sandbox. */
export function codeAction(
  code: string,
  title = "Running a code action"
): { id: string; name: string; args: { title: string; code: string } } {
  seq += 1;
  return {
    id: `codeact_call_${seq}`,
    name: EXECUTE_CODE_TOOL_NAME,
    args: { title, code }
  };
}

/** A code action whose only statement finishes the step with `result`. */
export function finishAction(result: unknown, title?: string) {
  return codeAction(`await finish(${JSON.stringify(result)});`, title);
}
