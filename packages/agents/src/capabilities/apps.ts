/**
 * The `apps` capability module — building and debugging mini apps.
 *
 * Two capabilities that used to be two `Tool` subclasses in
 * `../tools/mcp-tools.ts`. The node registry each took as a constructor
 * argument is `run.nodeRegistry` now; without one they answer with the same
 * "no registry in this process" refusal they answered with before.
 *
 * The build harness (`../app-build/build-service.js`) and the app-debug service
 * are imported inside the implementation that needs them — both drag in the
 * execution service, and a host that never builds an app should never pay for
 * it.
 */

import {
  ACTIVE_MODEL_CONTEXT_KEY,
  type ActiveModelSelection,
  type JsonSchema
} from "@nodetool-ai/runtime";
import { noRegistryError, userIdOf } from "../tools/mcp-tool-support.js";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import type { AppBuildRequest } from "../app-build/build-service.js";
import type { AppDebugRequest } from "@nodetool-ai/execution/service";
import {
  buildAppSpec,
  debugAppSpec,
  BUILD_APP_SCHEMA,
  DEBUG_APP_SCHEMA
} from "./apps.specs.js";

export { BUILD_APP_SCHEMA, DEBUG_APP_SCHEMA } from "./apps.specs.js";

const buildApp: CapabilityExport = {
  spec: buildAppSpec,
  impl: async (run, params) => {
    const registry = run.nodeRegistry;
    if (!registry) return noRegistryError("build an app");
    const inherited = run.context.get<ActiveModelSelection | undefined>(
      ACTIVE_MODEL_CONTEXT_KEY
    );
    const body = { ...params } as AppBuildRequest;
    if (inherited) {
      body.provider ??= inherited.provider;
      body.model ??= inherited.model;
    }
    const { runApplicationBuild } =
      await import("../app-build/build-service.js");
    try {
      return await runApplicationBuild(userIdOf(run.context), body, registry);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

const debugApp: CapabilityExport = {
  spec: debugAppSpec,
  impl: async (run, params) => {
    const registry = run.nodeRegistry;
    if (!registry) return noRegistryError("debug an app");
    const { runApplicationDebug } =
      await import("@nodetool-ai/execution/service");
    const { createJsScriptAppRunner } = await import(
      "../js-script-app-runner.js"
    );
    const userId = userIdOf(run.context);
    try {
      return await runApplicationDebug(userId, params as AppDebugRequest, registry, {
        // The run's own secrets: the server's app-debug service and the CLI
        // harness both pass a resolver, and without one a script operation
        // that reads `nodetool.secrets.get(...)` saw undefined here only.
        runScript: createJsScriptAppRunner(userId, {
          secretResolver: (key: string) => run.context.getSecret(key)
        })
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

/** Every app capability, in the order `getAllMcpTools` offered them. */
export const APP_CAPABILITIES: readonly CapabilityExport[] = [
  buildApp,
  debugApp
];

export const module: CapabilityModule = {
  module: "apps",
  exports: APP_CAPABILITIES
};

export { buildApp, debugApp };
