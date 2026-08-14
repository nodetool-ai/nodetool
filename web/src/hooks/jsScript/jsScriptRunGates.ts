/**
 * Fail-closed checks for ui_jsscript_run / ui_jsscript_test. The agent used
 * to treat `{ok:true, outputs:{}}` and `{passed:0, failed:0, cases:[]}` as
 * success. These helpers are shared by the live handler and its unit tests.
 */

export const JS_SCRIPT_NO_TESTS_ERROR =
  "The script has no saved test cases. Add some with ui_jsscript_set_tests first.";

/** Declared output port names that do not appear in the run bag. */
export function missingDeclaredOutputs(
  ports: readonly { name: string }[],
  outputs: Record<string, unknown> | undefined
): string[] {
  const bag = outputs ?? {};
  return ports
    .map((port) => port.name)
    .filter((name) => !Object.hasOwn(bag, name));
}

export function assertJsScriptTestsPresent(
  tests: readonly unknown[]
): void {
  if (tests.length === 0) {
    throw new Error(JS_SCRIPT_NO_TESTS_ERROR);
  }
}

export function emptyDeclaredOutputsError(missing: string[]): string {
  return (
    `The script declares output ports (${missing.join(", ")}) ` +
    "but the run produced none of them. " +
    "Leave values with await output / emit; do not return them."
  );
}

export function jsScriptFlushFailedError(
  action: "run" | "test",
  error: string
): string {
  return `The script could not be saved before ${action}: ${error}`;
}
