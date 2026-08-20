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
 *
 * `create_app` and `edit_app` are what make that possible off the browser.
 * The `ui_app_*` tools themselves only exist in a live Puck editor
 * (`web/src/lib/tools/builtin/puck.ts` delegates to a handler the editor
 * registers), so a chat agent, the CLI, or any headless run could debug and
 * delete apps but had no way to author one. `edit_app` drives the same
 * contract through `createAppToolBridge` — the headless twin `buildApp`'s
 * Author stage and the `app-tools` eval already drive — against the saved
 * document, and writes it back once. One implementation, so the browser and
 * the headless path cannot diverge.
 */

import { noRegistryError, userIdOf } from "../tools/mcp-tool-support.js";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import {
  debugAppSpec,
  listAppsSpec,
  getAppSpec,
  createAppSpec,
  editAppSpec,
  deleteAppSpec
} from "./apps.specs.js";
import { isRecord, isString } from "../utils/type-guards.js";
import type {
  ApplicationDocument,
  BindableWorkflow
} from "@nodetool-ai/app-runtime";
import type { AppBridgeDocument } from "../app-build/bridge.js";

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

const createApp: CapabilityExport = {
  spec: createAppSpec,
  impl: async (run, params) => {
    const userId = userIdOf(run.context);
    const name = params["name"];
    if (!isString(name) || !name.trim()) {
      return { error: "name is required and must be a non-empty string." };
    }

    const { Application, Workflow } = await import("@nodetool-ai/models");
    const { createEmptyDocument, parseApplicationDocument } = await import(
      "@nodetool-ai/app-runtime"
    );

    let document: ApplicationDocument;
    const supplied = params["document"];
    if (supplied !== undefined) {
      const parsed = parseApplicationDocument(supplied);
      if (!parsed) {
        return { error: "document is not a valid application document." };
      }
      document = parsed;
    } else {
      document = createEmptyDocument(name.trim());
      const fromWorkflowId = params["from_workflow_id"];
      if (isString(fromWorkflowId) && fromWorkflowId) {
        const workflow = await Workflow.find(userId, fromWorkflowId);
        if (!workflow) {
          return { error: `Workflow ${fromWorkflowId} was not found.` };
        }
        // An app with no operation has nothing to run, so a widget placed
        // against this workflow has somewhere to bind from the first edit.
        document.operations = [
          {
            id: "main",
            name: "Run",
            workflowId: fromWorkflowId,
            inputs: {},
            outputs: {},
            policy: "replace"
          }
        ];
      }
    }

    const description = params["description"];
    const projectId = params["project_id"];
    const app = await Application.createUnique({
      user_id: userId,
      project_id: isString(projectId) && projectId ? projectId : "default",
      name: name.trim(),
      description: isString(description) ? description : "",
      document: JSON.stringify(document)
    });

    return {
      ok: true,
      application_id: app.id,
      name: app.name,
      description: app.description,
      updated_at: app.updated_at,
      operations: document.operations.map((operation) => operation.id)
    };
  }
};

/** One `{tool, input}` entry of an `edit_app` script. */
interface EditStep {
  tool: string;
  input: Record<string, unknown>;
}

function parseSteps(raw: unknown): EditStep[] | { error: string } {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    return { error: "steps must be an array of {tool, input} objects." };
  }
  const steps: EditStep[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry) || !isString(entry.tool) || !entry.tool) {
      return { error: `steps[${index}] needs a \`tool\` name.` };
    }
    const input = entry.input;
    if (input !== undefined && !isRecord(input)) {
      return { error: `steps[${index}].input must be an object.` };
    }
    steps.push({ tool: entry.tool, input: isRecord(input) ? input : {} });
  }
  return steps;
}

const editApp: CapabilityExport = {
  spec: editAppSpec,
  impl: async (run, params) => {
    const userId = userIdOf(run.context);
    const id = String(params["application_id"]);
    const app = await findOwnedApp(userId, id);
    if (!app) return { error: `App ${id} was not found, or it is not yours.` };

    const steps = parseSteps(params["steps"]);
    if (!Array.isArray(steps)) return steps;

    const expected = params["base_updated_at"];
    if (isString(expected) && expected && expected !== app.updated_at) {
      return {
        error:
          `App ${app.id} was modified since it was read (optimistic ` +
          "concurrency conflict); nothing was saved. Re-read it with " +
          "get_app and retry."
      };
    }

    const document = app.toDocument();
    const { createAppToolBridge } = await import("../app-build/bridge.js");
    const { zodToJsonSchema } = await import("@nodetool-ai/runtime");

    const workflows = await bindableWorkflows(userId, document, params);
    // The bridge needs one workflow to answer binding targets against; the
    // rest are reachable through `workflows`. The first operation's is the
    // one an app with a single operation binds everything to.
    const hostWorkflowId =
      document.operations.find((operation) => operation.workflowId)
        ?.workflowId ?? "wf-app";

    const bridge = createAppToolBridge({
      workflowId: hostWorkflowId,
      workflow: workflows[hostWorkflowId],
      workflows
    });
    bridge.loadDocument(bridgeDocumentOf(document));

    const byName = new Map(bridge.tools.map((tool) => [tool.name, tool]));
    const results: Record<string, unknown>[] = [];
    let failed = false;
    for (const [index, step] of steps.entries()) {
      const name = step.tool.startsWith("ui_app_")
        ? step.tool
        : `ui_app_${step.tool}`;
      const tool = byName.get(name);
      if (!tool) {
        results.push({
          step: index,
          tool: step.tool,
          ok: false,
          error: `No such App Builder tool: ${step.tool}.`
        });
        failed = true;
        continue;
      }
      try {
        const result = await tool.execute({
          application_id: app.id,
          ...step.input
        });
        results.push({ step: index, tool: name, ok: true, result });
      } catch (error) {
        results.push({
          step: index,
          tool: name,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
        failed = true;
      }
    }

    const edited = bridge.document();
    const rootProps = { ...document.ui.root.props };
    if (edited.title !== null) {
      rootProps.title = edited.title;
    }
    const next: ApplicationDocument = {
      ...document,
      ui: {
        ...document.ui,
        root: {
          ...document.ui.root,
          props: rootProps
        },
        content: edited.content
      },
      operations: edited.meta.operations,
      resources: edited.meta.resources,
      variables: edited.meta.variables
    };

    const changes: {
      document: string;
      name?: string;
      description?: string;
    } = { document: JSON.stringify(next) };
    const name = params["name"];
    if (isString(name) && name.trim()) changes.name = name.trim();
    const description = params["description"];
    if (isString(description)) changes.description = description;

    const { Application } = await import("@nodetool-ai/models");
    const updated = await Application.updateFieldsIfUnchanged(
      app.id,
      app.updated_at,
      changes
    );
    if (!updated) {
      return {
        error:
          `App ${app.id} was modified while this edit ran (optimistic ` +
          "concurrency conflict); nothing was saved. Re-read it with " +
          "get_app and retry.",
        steps: results
      };
    }

    const state = bridge.finalState();
    return {
      ok: !failed,
      application_id: updated.id,
      name: updated.name,
      updated_at: updated.updated_at,
      saved: true,
      steps: results,
      components: state.components,
      operations: state.operations,
      variables: state.variables,
      resources: state.resources,
      // With no steps this is the whole answer: what the editor offers, so a
      // caller can write its next batch without guessing an argument.
      tools:
        steps.length === 0
          ? bridge.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              parameters: zodToJsonSchema(tool.parameters)
            }))
          : undefined
    };
  }
};

/** The document as the bridge holds it: title, widget tree, and the meta half. */
function bridgeDocumentOf(document: ApplicationDocument): AppBridgeDocument {
  const title = document.ui.root.props?.title;
  return {
    title: isString(title) ? title : null,
    content: document.ui.content as AppBridgeDocument["content"],
    meta: {
      operations: document.operations,
      variables: document.variables,
      resources: document.resources
    }
  };
}

/**
 * The bindable surface of every workflow this edit can reach: the ones the
 * app's operations already name, plus any the caller names to bind something
 * new. A workflow that does not resolve is left out rather than failing the
 * edit — its binding targets are simply empty, which is what the editor shows
 * for a workflow it could not load.
 */
async function bindableWorkflows(
  userId: string,
  document: ApplicationDocument,
  params: Record<string, unknown>
): Promise<Record<string, BindableWorkflow>> {
  const { Workflow } = await import("@nodetool-ai/models");
  const { extractAppIO, debugGraphOf } = await import(
    "@nodetool-ai/execution/app-debug"
  );

  const ids = new Set<string>();
  for (const operation of document.operations) {
    if (operation.workflowId) ids.add(operation.workflowId);
  }
  const extra = params["workflow_ids"];
  if (Array.isArray(extra)) {
    for (const value of extra) {
      if (isString(value) && value) ids.add(value);
    }
  }

  const bindable: Record<string, BindableWorkflow> = {};
  for (const id of ids) {
    const workflow = await Workflow.find(userId, id);
    const graph = debugGraphOf(workflow?.graph);
    if (!graph) continue;
    const io = extractAppIO(graph);
    bindable[id] = {
      inputs: io.inputs.map((input) => ({
        nodeId: input.nodeId,
        name: input.name,
        label: input.name
      })),
      outputs: io.outputs.map((output) => ({
        nodeId: output.nodeId,
        name: output.name,
        label: output.name
      })),
      variables: io.variables
    };
  }
  return bindable;
}

/** Every app capability, in the order `getAllMcpTools` offered them. */
export const APP_CAPABILITIES: readonly CapabilityExport[] = [
  debugApp,
  listApps,
  getApp,
  createApp,
  editApp,
  deleteApp
];

export const module: CapabilityModule = {
  module: "apps",
  exports: APP_CAPABILITIES
};

export { debugApp, listApps, getApp, createApp, editApp, deleteApp };
