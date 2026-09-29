import { loadQuickJs } from "@sebastianwessel/quickjs";
import { Scope } from "quickjs-emscripten-core";

/** Load an engine with property-handle ownership fixes for quickjs@3.0.1. */
export async function loadSandboxEngine(
  variant: Parameters<typeof loadQuickJs>[0]
): ReturnType<typeof loadQuickJs> {
  const engine = await loadQuickJs(variant);
  const newContext = engine.module.newContext.bind(engine.module);
  engine.module.newContext = (...args) => {
    const context = newContext(...args);
    const getProp = context.getProp.bind(context);
    const symbolDescriptions = new Scope();
    const dispose = context.dispose.bind(context);
    context.dispose = () => {
      symbolDescriptions.dispose();
      dispose();
    };
    // quickjs@3.0.1's handleToNative.setProperties returns early for missing
    // descriptor fields and boolean flags without disposing their handles.
    // Release those allocations here and return the equivalent static handles.
    // StaticLifetime.dispose is a no-op, so callers that do dispose still work.
    // Install before the wrapper bootstraps the context, on both execution paths.
    context.getProp = (object, key) => {
      const handle = getProp(object, key);
      const type = context.typeof(handle);
      if (type === "undefined" || type === "boolean") {
        const value =
          type === "undefined"
            ? context.undefined
            : context.dump(handle) === true
              ? context.true
              : context.false;
        handle.dispose();
        return value;
      }
      // handleToNative also reads Symbol.description without disposing it.
      // Scope skips handles already disposed by a caller and frees the rest
      // while the context is still alive.
      if (key === "description" && context.typeof(object) === "symbol") {
        symbolDescriptions.manage(handle);
      }
      return handle;
    };
    return context;
  };
  return engine;
}
