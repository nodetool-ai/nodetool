/**
 * The `apps` capability module — debugging mini apps.
 *
 * A capability that used to be a `Tool` subclass in `../tools/mcp-tools.ts`.
 * The node registry it took as a constructor argument is `run.nodeRegistry`
 * now; without one it answers with the same "no registry in this process"
 * refusal it answered with before.
 *
 * The app-debug service is imported inside the implementation — it drags in
 * the execution service, and a host that never debugs an app should never pay
 * for it.
 *
 * Building a whole app is not a capability. `buildApp`
 * (`../app-build/build.js`) stays the CLI harness and the
 * `POST /api/applications/build` route; an agent builds an app by driving the
 * `ui_app_*` editor tools and checking its work with `debug_app`, rather than
 * by handing the job to a second agent it cannot see into.
 */

import { noRegistryError, userIdOf } from "../tools/mcp-tool-support.js";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import {
  debugAppSpec,
  listAppsSpec,
  getAppSpec,
  deleteAppSpec
} from "./apps.specs.js";

export { DEBUG_APP_SCHEMA } from "./apps.specs.js";

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
      return await runApplicationDebug(userId, params, registry, {
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

/**
 * An app the caller owns, or null.
 *
 * `Application.findById` is not user-scoped — it resolves any id — so the
 * ownership test belongs at every call site that acts on the answer. Missing
 * and not-yours are the same answer, matching what the tRPC route returns.
 */
async function findOwnedApp(userId: string, id: string) {
  const { Application } = await import("@nodetool-ai/models");
  const app = await Application.findById(id);
  if (!app || app.user_id !== userId) return null;
  return app;
}

const listApps: CapabilityExport = {
  spec: listAppsSpec,
  impl: async (run, params) => {
    const { Application } = await import("@nodetool-ai/models");
    const limit = Math.max(1, Math.min(Number(params["limit"]) || 50, 100));
    const apps = await Application.listByUser(userIdOf(run.context), limit);
    return {
      apps: apps.map((app) => {
        const document = app.toDocument();
        return {
          id: app.id,
          name: app.name,
          description: app.description ?? "",
          operations: document.operations.map((operation) => operation.id),
          updated_at: app.updated_at
        };
      })
    };
  }
};

const getApp: CapabilityExport = {
  spec: getAppSpec,
  impl: async (run, params) => {
    const id = String(params["application_id"]);
    const app = await findOwnedApp(userIdOf(run.context), id);
    if (!app) return { error: `App ${id} was not found, or it is not yours.` };
    return {
      id: app.id,
      name: app.name,
      description: app.description ?? "",
      updated_at: app.updated_at,
      document: app.toDocument()
    };
  }
};

const deleteApp: CapabilityExport = {
  spec: deleteAppSpec,
  impl: async (run, params) => {
    const id = String(params["application_id"]);
    const app = await findOwnedApp(userIdOf(run.context), id);
    if (!app) return { error: `App ${id} was not found, or it is not yours.` };
    await app.delete();
    return { application_id: id, deleted: true };
  }
};

/** Every app capability, in the order `getAllMcpTools` offered them. */
export const APP_CAPABILITIES: readonly CapabilityExport[] = [
  debugApp,
  listApps,
  getApp,
  deleteApp
];

export const module: CapabilityModule = {
  module: "apps",
  exports: APP_CAPABILITIES
};

export { debugApp, listApps, getApp, deleteApp };
