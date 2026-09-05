/**
 * Running a mini app's script operation.
 *
 * The app simulator (`@nodetool-ai/execution/app-debug`) knows how to fold a
 * script run into an app's values but cannot execute one: the QuickJS sandbox
 * lives here, above it in the dependency order. This is the runner every host
 * that owns both — the server, the CLI, the agent tools — passes down.
 *
 * Execution is `runCodeBody`, the same core `run_code`, `test_code`,
 * `run_js_script` and the run endpoint use, with the script's own envelope:
 * every installed pack by import, its declared secrets, its timeout capped at
 * `JS_SCRIPT_MAX_TIMEOUT_SECONDS`, and the Code-node toolbelt.
 */
import { getDefaultAssetsPath } from "@nodetool-ai/config";
import type { JsScriptOperationRunner } from "@nodetool-ai/execution/app-debug";
import { JS_SCRIPT_MAX_TIMEOUT_SECONDS } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import { runCodeBody } from "./capabilities/code.js";

/**
 * A runner for one user's app run. The operation's own `timeoutMs`, when the
 * app sets one, only ever narrows the script's declared timeout.
 */
export function createJsScriptAppRunner(
  userId: string,
  options: {
    secretResolver?: (
      key: string,
      userId: string
    ) => Promise<string | null | undefined> | string | null | undefined;
  } = {}
): JsScriptOperationRunner {
  return async (input) => {
    const contextInit: ConstructorParameters<typeof ProcessingContext>[0] = {
      jobId: `js-script-op-${input.scriptId}-${Date.now()}`,
      userId,
      storage: new FileStorageAdapter(getDefaultAssetsPath())
    };
    if (options.secretResolver) {
      contextInit.secretResolver = options.secretResolver;
    }
    const context = new ProcessingContext(contextInit);
    const declared = Math.min(
      input.document.timeoutSeconds,
      JS_SCRIPT_MAX_TIMEOUT_SECONDS
    );
    const bodyParams: Parameters<typeof runCodeBody>[1] = {
      code: input.document.code,
      inputs: input.inputs,
      secrets: input.document.secrets,
      timeoutSeconds:
        input.timeoutMs === undefined
          ? declared
          : Math.min(declared, Math.max(1, Math.round(input.timeoutMs / 1000))),
      withToolbelt: true
    };
    if (input.inputStreams) bodyParams.inputStreams = input.inputStreams;
    return runCodeBody(context, bodyParams);
  };
}
