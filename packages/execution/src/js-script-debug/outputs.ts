/**
 * Runtime contract for a JS-script run: a document that declares output
 * ports cannot succeed with an empty output bag.
 *
 * Shared by the HTTP run route and the eval headless bridge so both
 * surfaces fail the same `{ok: true, outputs: {}}` hole.
 */

/**
 * Declared output names that a successful run left out of the bag.
 *
 * Returns every declared name only when none of them appear — the empty-bag
 * false success. If any declared name is present, returns [] and leaves a
 * partial bag to other checks. No declared ports is never a miss.
 */
export function missingDeclaredJsScriptOutputs(
  declared: readonly { name: string }[],
  outputs: Record<string, unknown> | undefined
): string[] {
  if (declared.length === 0) return [];
  const bag = outputs ?? {};
  const missing = declared.map((port) => port.name).filter((name) => !(name in bag));
  if (missing.length !== declared.length) return [];
  return missing;
}

/** Error text when {@link missingDeclaredJsScriptOutputs} is non-empty. */
export function emptyDeclaredJsScriptOutputsError(
  missing: readonly string[]
): string {
  return (
    `The run produced none of the declared outputs: ${missing.join(", ")}. ` +
    "Leave values with `await output(name, value)` or `await emit(name, value)` — " +
    "an empty output bag is not success."
  );
}
