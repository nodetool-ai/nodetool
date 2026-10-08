import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";

/** Transfer already-normalized JSON values without compiling input as source. */
export function gameScriptValue(context: QuickJSContext, value: unknown, defineData: QuickJSHandle, pristine = false): QuickJSHandle {
  if (value === null) { return context.null.dup(); }
  if (value === undefined) { return context.undefined.dup(); }
  if (typeof value === "boolean") { return (value ? context.true : context.false).dup(); }
  if (typeof value === "number") { return context.newNumber(value); }
  if (typeof value === "string") { return context.newString(value); }
  if (typeof value !== "object") { throw new Error("Script transport requires JSON data"); }
  const handle = Array.isArray(value) ? context.newArray() : context.newObject();
  try {
    for (const [key, item] of Object.entries(value)) {
      const child = gameScriptValue(context, item, defineData, pristine);
      try {
        if (!pristine || key === "__proto__") {
          const name = context.newString(key);
          try { scriptHandleResult(context, context.callFunction(defineData, context.undefined, handle, name, child)).dispose(); }
          finally { name.dispose(); }
        } else {
          context.setProp(handle, key, child);
        }
      } finally {
        child.dispose();
      }
    }
    return handle;
  } catch (error) {
    handle.dispose();
    throw error;
  }
}

export function scriptHandleResult(context: QuickJSContext, result: ReturnType<QuickJSContext["callFunction"]>): QuickJSHandle {
  if (result.error) {
    let error: unknown;
    try { error = context.dump(result.error); } finally { result.error.dispose(); }
    const message = error !== null && typeof error === "object" && "message" in error && error.message != null ? String(error.message) : "unknown error";
    throw new Error(`Game script failed: ${message}`);
  }
  return result.value;
}
