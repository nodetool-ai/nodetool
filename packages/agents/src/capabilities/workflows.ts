/**
 * The `workflows` capability module — the pilot namespace.
 *
 * Ten capabilities that used to be ten `Tool` subclasses in
 * `../tools/mcp-tools.ts`: the nine the guest reaches as `nodetool.workflows.*`
 * (`NODETOOL_API_NAMESPACE_TOOLS.workflows`) plus `export_workflow_digraph`,
 * which the design's mapping table folds in here rather than leaving it beside
 * the file tools.
 *
 * Wire names, descriptions and schemas are unchanged: `getAllMcpTools` builds
 * these through `toolFromCapability`, so every consumer — runner, MCP, CLI,
 * evals — sees the surface it saw before.
 *
 * What was a constructor argument is now a field on the run: the example
 * catalog, the node registry, the run environment, the DSL exporter, and the
 * model catalogs. Every heavy dependency (`@nodetool-ai/models`, the execution
 * service, the graph validators, the DSL sandbox) is imported inside the
 * implementation that needs it, so loading this module costs nothing.
 *
 * Design: docs/tool-class-retirement-design.md § "Worked example:
 * `nodetool.workflows`".
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type { GraphValidationReport } from "@nodetool-ai/node-sdk";
import type { Workflow as WorkflowRow } from "@nodetool-ai/models";
import {
  NO_EXAMPLES,
  RUNTIME_MODEL_CATALOGS,
  annotateEscalatedRun,
  jobRecord,
  lightWorkflowList,
  modelSelectionError,
  noRegistryError,
  normalizeWorkflowGraph,
  outcomeResult,
  resolveRunEnvironment,
  summarizeWorkflowGraph,
  unsetModelSelectionError,
  userIdOf,
  workflowRecord
} from "../tools/mcp-tool-support.js";
import { declareDynamicOutputsInGraph } from "../dynamic-slots.js";
import { findCapability } from "./registry.js";
import { REQUEST_SECRET_TOOL_NAME } from "./settings.specs.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  listWorkflowsSpec,
  getWorkflowSpec,
  createWorkflowSpec,
  updateWorkflowSpec,
  deleteWorkflowSpec,
  listWorkflowVersionsSpec,
  getWorkflowVersionSpec,
  createWorkflowVersionSpec,
  restoreWorkflowVersionSpec,
  deleteWorkflowVersionSpec,
  setWorkflowAccessSpec,
  runWorkflowCapabilitySpec,
  debugWorkflowSpec,
  resolveWorkflowEscalationSpec,
  validateWorkflowSpec,
  startBackgroundJobSpec,
  getExampleWorkflowSpec,
  exportWorkflowDigraphSpec,
  DEFAULT_VERSION_LIMIT,
  MAX_VERSION_LIMIT,
  LIST_WORKFLOWS_SCHEMA,
  CREATE_WORKFLOW_SCHEMA,
  RUN_WORKFLOW_SCHEMA,
  DEBUG_WORKFLOW_SCHEMA,
  RESOLVE_ESCALATION_SCHEMA,
  VALIDATE_WORKFLOW_SCHEMA
} from "./workflows.specs.js";
import { isObjectLike, isString } from "../utils/type-guards.js";

export {
  LIST_WORKFLOWS_SCHEMA,
  CREATE_WORKFLOW_SCHEMA,
  RUN_WORKFLOW_SCHEMA,
  DEBUG_WORKFLOW_SCHEMA,
  RESOLVE_ESCALATION_SCHEMA,
  VALIDATE_WORKFLOW_SCHEMA
} from "./workflows.specs.js";

/** The run environment this run can execute a workflow in, or null. */
function runEnvironmentOf(run: CapabilityRun) {
  return resolveRunEnvironment(run.workflowEnvironment, run.nodeRegistry);
}

async function listUserWorkflows(
  run: CapabilityRun,
  limit: number
): Promise<unknown> {
  const { Workflow } = await import("@nodetool-ai/models");
  const [workflows, next] = await Workflow.paginate(userIdOf(run.context), {
    limit
  });
  return lightWorkflowList({
    workflows: workflows.map((w) => workflowRecord(w)),
    next: next || null
  });
}

/** The example-catalog query; `query` only when the caller narrowed it. */
interface ExampleListOptions {
  query?: string;
  limit: number;
}

/** A graph program that would not evaluate, with whatever it logged first. */
interface CodeErrorReport {
  status: string;
  error: string;
  logs?: string[];
}

async function listExampleWorkflows(
  run: CapabilityRun,
  query: string | undefined,
  limit: number
): Promise<unknown> {
  if (!run.examples) return NO_EXAMPLES;
  const listOptions: ExampleListOptions = { limit };
  if (query) listOptions.query = query;
  return lightWorkflowList({
    workflows: await run.examples.list(listOptions),
    next: null
  });
}

const listWorkflows: CapabilityExport = {
  spec: listWorkflowsSpec,
  impl: async (run, params) => {
    const workflowType = String(params["workflow_type"] ?? "user");
    const query = params["query"] as string | undefined;
    const limit = Number(params["limit"] ?? 100);

    if (workflowType === "example") {
      return listExampleWorkflows(run, query, limit);
    }
    if (workflowType === "all") {
      return {
        examples: await listExampleWorkflows(run, query, limit),
        user: await listUserWorkflows(run, limit)
      };
    }
    return listUserWorkflows(run, limit);
  }
};

// ---------------------------------------------------------------------------
// get_workflow
// ---------------------------------------------------------------------------

const getWorkflow: CapabilityExport = {
  spec: getWorkflowSpec,
  impl: async (run, params) => {
    const { Workflow } = await import("@nodetool-ai/models");
    const workflowId = String(params["workflow_id"]);
    const workflow = await Workflow.find(userIdOf(run.context), workflowId);
    if (!workflow) return { error: `Workflow ${workflowId} was not found.` };
    return workflowRecord(workflow);
  }
};

const createWorkflow: CapabilityExport = {
  spec: createWorkflowSpec,
  impl: async (run, params) => {
    const { Workflow } = await import("@nodetool-ai/models");
    // Declare before normalizing, so the handle is on the node the editor,
    // the validator and every later run read. Without a registry this is the
    // identity function and the graph is stored exactly as it arrived.
    const authored = run.nodeRegistry
      ? declareDynamicOutputsInGraph(params["graph"], run.nodeRegistry)
      : params["graph"];
    const graph = normalizeWorkflowGraph(authored);
    const badModels = await modelSelectionError(
      graph,
      run.modelCatalogs ?? RUNTIME_MODEL_CATALOGS
    );
    if (badModels) return badModels;
    if (run.nodeRegistry) {
      const unselected = unsetModelSelectionError(graph, run.nodeRegistry);
      if (unselected) return unselected;
    }

    const created = (await Workflow.create({
      user_id: userIdOf(run.context),
      name: String(params["name"]),
      description:
        isString(params["description"]) ? params["description"] : "",
      tags: Array.isArray(params["tags"]) ? (params["tags"] as string[]) : [],
      access: params["access"] === "public" ? "public" : "private",
      graph: graph as WorkflowRow["graph"],
      run_mode: "workflow"
    })) as WorkflowRow;
    return workflowRecord(created);
  }
};

/**
 * The one ownership test the three lifecycle capabilities share.
 *
 * `Workflow.find` is deliberately not it: that answers for a public workflow
 * and for one shared with the caller as well, so writing a mutation on top of
 * it would let a run rewrite or publish a workflow it can merely read. Missing
 * and not-yours are one answer, so a caller cannot probe for ids.
 */
async function findOwnedWorkflow(
  run: CapabilityRun,
  id: string
): Promise<WorkflowRow | null> {
  const { Workflow } = await import("@nodetool-ai/models");
  const wf = (await Workflow.get(id)) as WorkflowRow | null;
  if (!wf || wf.user_id !== userIdOf(run.context)) return null;
  return wf;
}

function notYours(id: string): { error: string } {
  return { error: `Workflow ${id} was not found, or it is not yours.` };
}

const updateWorkflow: CapabilityExport = {
  spec: updateWorkflowSpec,
  impl: async (run, params) => {
    const { Workflow } = await import("@nodetool-ai/models");
    const id = String(params["workflow_id"]);
    const existing = await findOwnedWorkflow(run, id);
    if (!existing) return notYours(id);

    const fields: Record<string, unknown> = {};
    if (params["graph"] !== undefined) {
      // The same three passes create_workflow runs, in the same order: an
      // update that skipped them could store a graph the create path would
      // have refused.
      const authored = run.nodeRegistry
        ? declareDynamicOutputsInGraph(params["graph"], run.nodeRegistry)
        : params["graph"];
      const graph = normalizeWorkflowGraph(authored);
      const badModels = await modelSelectionError(
        graph,
        run.modelCatalogs ?? RUNTIME_MODEL_CATALOGS
      );
      if (badModels) return badModels;
      if (run.nodeRegistry) {
        const unselected = unsetModelSelectionError(graph, run.nodeRegistry);
        if (unselected) return unselected;
      }
      fields.graph = graph;
    }
    if (isString(params["name"])) fields.name = params["name"];
    if (isString(params["description"])) {
      fields.description = params["description"];
    }
    if (Array.isArray(params["tags"])) fields.tags = params["tags"];
    if (Object.keys(fields).length === 0) {
      return { error: "Nothing to update — pass graph, name, description or tags." };
    }

    // `access` is not in the field set on purpose. Publishing is its own
    // capability because it is its own permission class.
    const expected = isString(params["expected_updated_at"])
      ? params["expected_updated_at"]
      : existing.updated_at;
    const updated = await Workflow.updateFieldsIfUnchanged(
      id,
      expected,
      fields as Parameters<typeof Workflow.updateFieldsIfUnchanged>[2]
    );
    if (!updated) {
      return {
        error:
          `Workflow ${id} changed since you read it — read it again and retry.`
      };
    }
    return workflowRecord(updated as WorkflowRow);
  }
};

const deleteWorkflow: CapabilityExport = {
  spec: deleteWorkflowSpec,
  impl: async (run, params) => {
    const { Workflow } = await import("@nodetool-ai/models");
    const id = String(params["workflow_id"]);
    const deleted = await Workflow.deleteOwned(userIdOf(run.context), id);
    return deleted ? { workflow_id: id, deleted: true } : notYours(id);
  }
};

function versionNumber(value: unknown): number | { error: string } {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return {
      error:
        "version must be a positive integer (use list_workflow_versions to see the available ones)."
    };
  }
  return n;
}

function toVersionListItem(version: {
  id: string;
  version: number;
  name: string | null;
  description: string | null;
  save_type: string;
  created_at: string;
}) {
  return {
    id: version.id,
    version: version.version,
    name: version.name,
    description: version.description,
    save_type: version.save_type,
    created_at: version.created_at
  };
}

const listWorkflowVersions: CapabilityExport = {
  spec: listWorkflowVersionsSpec,
  impl: async (run, params) => {
    const id = String(params["workflow_id"]);
    const existing = await findOwnedWorkflow(run, id);
    if (!existing) return notYours(id);

    const { WorkflowVersion } = await import("@nodetool-ai/models");
    const limit = Math.max(
      1,
      Math.min(
        Number(params["limit"]) || DEFAULT_VERSION_LIMIT,
        MAX_VERSION_LIMIT
      )
    );
    const versions = await WorkflowVersion.listForWorkflow(id, { limit });
    return {
      workflow_id: id,
      name: existing.name,
      versions: versions.map(toVersionListItem)
    };
  }
};

const getWorkflowVersion: CapabilityExport = {
  spec: getWorkflowVersionSpec,
  impl: async (run, params) => {
    const id = String(params["workflow_id"]);
    const existing = await findOwnedWorkflow(run, id);
    if (!existing) return notYours(id);

    const number = versionNumber(params["version"]);
    if (typeof number !== "number") return number;

    const { WorkflowVersion } = await import("@nodetool-ai/models");
    const version = await WorkflowVersion.findByVersion(id, number);
    if (!version) {
      return {
        error: `Workflow ${id} has no version ${number}. Call list_workflow_versions to see the available ones.`
      };
    }
    return {
      workflow_id: id,
      ...toVersionListItem(version),
      graph: version.graph
    };
  }
};

const createWorkflowVersion: CapabilityExport = {
  spec: createWorkflowVersionSpec,
  impl: async (run, params) => {
    const id = String(params["workflow_id"]);
    const existing = await findOwnedWorkflow(run, id);
    if (!existing) return notYours(id);

    const { WorkflowVersion } = await import("@nodetool-ai/models");
    const nextVer = await WorkflowVersion.nextVersion(id);
    const version = (await WorkflowVersion.create({
      workflow_id: id,
      user_id: userIdOf(run.context),
      name: isString(params["name"]) ? params["name"] : null,
      description: isString(params["description"])
        ? params["description"]
        : null,
      graph: existing.graph,
      version: nextVer,
      save_type: "manual"
    })) as InstanceType<typeof WorkflowVersion>;
    return {
      ok: true,
      workflow_id: id,
      ...toVersionListItem(version)
    };
  }
};

const restoreWorkflowVersion: CapabilityExport = {
  spec: restoreWorkflowVersionSpec,
  impl: async (run, params) => {
    const id = String(params["workflow_id"]);
    const existing = await findOwnedWorkflow(run, id);
    if (!existing) return notYours(id);

    const number = versionNumber(params["version"]);
    if (typeof number !== "number") return number;

    const { Workflow, WorkflowVersion } = await import("@nodetool-ai/models");
    const version = await WorkflowVersion.findByVersion(id, number);
    if (!version) {
      return {
        error: `Workflow ${id} has no version ${number}. Call list_workflow_versions to see the available ones.`
      };
    }

    const undoVer = await WorkflowVersion.nextVersion(id);
    const undo = (await WorkflowVersion.create({
      workflow_id: id,
      user_id: userIdOf(run.context),
      name: `Before restore to v${number}`,
      description: null,
      graph: existing.graph,
      version: undoVer,
      save_type: "restore"
    })) as InstanceType<typeof WorkflowVersion>;

    const updated = await Workflow.updateFieldsIfUnchanged(
      id,
      existing.updated_at,
      { graph: version.graph }
    );
    if (!updated) {
      return {
        error: `Workflow ${id} changed since you read it — read it again and retry.`,
        undo_version: undo.version
      };
    }
    return {
      ok: true,
      workflow_id: id,
      restored_version: number,
      undo_version: undo.version,
      ...workflowRecord(updated as WorkflowRow)
    };
  }
};

const deleteWorkflowVersion: CapabilityExport = {
  spec: deleteWorkflowVersionSpec,
  impl: async (run, params) => {
    const id = String(params["workflow_id"]);
    const existing = await findOwnedWorkflow(run, id);
    if (!existing) return notYours(id);

    const number = versionNumber(params["version"]);
    if (typeof number !== "number") return number;

    const { WorkflowVersion } = await import("@nodetool-ai/models");
    const version = await WorkflowVersion.findByVersion(id, number);
    if (!version) {
      return {
        error: `Workflow ${id} has no version ${number}. Call list_workflow_versions to see the available ones.`
      };
    }
    await version.delete();
    return {
      ok: true,
      workflow_id: id,
      deleted_version: number
    };
  }
};

const setWorkflowAccess: CapabilityExport = {
  spec: setWorkflowAccessSpec,
  impl: async (run, params) => {
    const { Workflow } = await import("@nodetool-ai/models");
    const id = String(params["workflow_id"]);
    const access = params["access"] === "public" ? "public" : "private";
    const existing = await findOwnedWorkflow(run, id);
    if (!existing) return notYours(id);
    const updated = await Workflow.updateFieldsIfUnchanged(
      id,
      existing.updated_at,
      { access } as Parameters<typeof Workflow.updateFieldsIfUnchanged>[2]
    );
    if (!updated) {
      return {
        error: `Workflow ${id} changed since it was read — retry.`
      };
    }
    return { workflow_id: id, access };
  }
};

const runWorkflowCapability: CapabilityExport = {
  spec: runWorkflowCapabilitySpec,
  impl: async (run, params) => {
    const env = await runEnvironmentOf(run);
    if (!env) return noRegistryError("run a workflow");
    const { runWorkflow } = await import("@nodetool-ai/execution/service");
    const outcome = await runWorkflow({
      workflowId: String(params["workflow_id"]),
      userId: userIdOf(run.context),
      environment: env,
      params: (params["params"] as Record<string, unknown>) ?? {},
      interactive: params["interactive"] === true
    });
    return annotateEscalatedRun(outcomeResult(outcome));
  }
};

const debugWorkflow: CapabilityExport = {
  spec: debugWorkflowSpec,
  impl: async (run, params) => {
    const env = await runEnvironmentOf(run);
    if (!env) return noRegistryError("debug a workflow");
    const { Job, Workflow } = await import("@nodetool-ai/models");
    const { runWorkflow } = await import("@nodetool-ai/execution/service");
    const workflowId = String(params["workflow_id"]);
    const userId = userIdOf(run.context);
    const includeGraph = params["include_graph"] !== false;

    const outcome = await runWorkflow({
      workflowId,
      userId,
      debug: true,
      environment: env,
      params: (params["params"] as Record<string, unknown>) ?? {},
      interactive: params["interactive"] === true
    });
    const result = outcomeResult(outcome);

    // An escalated run has produced no report yet — the job is parked on the
    // failing node. Hand the escalation back for a verdict; the final report
    // arrives from resolve_workflow_escalation once the run settles.
    if (
      isObjectLike(result) &&
      (result as Record<string, unknown>)["status"] === "escalated"
    ) {
      return { workflow_id: workflowId, run: annotateEscalatedRun(result) };
    }

    const report: Record<string, unknown> = {
      workflow_id: workflowId,
      run: result
    };

    const jobId = (result as Record<string, unknown>)?.["job_id"];
    if (isString(jobId)) {
      const job = await Job.find(userId, jobId);
      if (job) {
        const logLimit = Number(params["log_limit"] ?? 200);
        const logs = job.logs ?? [];
        report["job"] = {
          ...jobRecord(job),
          logs: logs.slice(Math.max(0, logs.length - logLimit))
        };
      }
    }
    if (includeGraph) {
      const workflow = await Workflow.find(userId, workflowId);
      if (workflow) {
        report["workflow"] = summarizeWorkflowGraph(workflowRecord(workflow));
      }
    }
    return report;
  }
};

const resolveWorkflowEscalation: CapabilityExport = {
  spec: resolveWorkflowEscalationSpec,
  impl: async (run, params) => {
    const { submitEscalationVerdict } =
      await import("@nodetool-ai/execution/service");
    const action = String(params["action"]);
    const verdict: Record<string, unknown> = { action };
    if (action === "substitute" && params["outputs"] !== undefined) {
      verdict["outputs"] = params["outputs"];
    }
    if (action === "fail" && isString(params["reason"])) {
      verdict["reason"] = params["reason"];
    }
    if (
      (action === "skip" || action === "fail") &&
      isString(params["apply_to"])
    ) {
      verdict["applyTo"] = params["apply_to"];
    }
    const outcome = await submitEscalationVerdict(
      String(params["session_id"]),
      userIdOf(run.context),
      String(params["escalation_id"]),
      verdict as Parameters<typeof submitEscalationVerdict>[3]
    );
    return annotateEscalatedRun(outcomeResult(outcome));
  }
};

const validateWorkflow: CapabilityExport = {
  spec: validateWorkflowSpec,
  impl: async (run, params) => {
    let graph = params["graph"] as
      | { nodes?: unknown[]; edges?: unknown[] }
      | undefined;
    const workflowId = params["workflow_id"] as string | undefined;
    const code = isString(params["code"]) ? params["code"] : "";

    // A legacy graph program can be checked in the form it was authored in
    // rather than hand-translated to JSON first.
    if (code.trim()) {
      const { evaluateGraphDsl } = await import("../graph-dsl.js");
      const evaluated = await evaluateGraphDsl(code);
      if (!evaluated.graph) {
        const failure: CodeErrorReport = {
          status: "code_error",
          error: evaluated.error ?? "Program produced no graph."
        };
        if (evaluated.logs?.length) failure.logs = evaluated.logs;
        return failure;
      }
      graph = evaluated.graph;
    }

    if (!graph && workflowId) {
      const { Workflow } = await import("@nodetool-ai/models");
      const workflow = await Workflow.find(userIdOf(run.context), workflowId);
      if (!workflow) return { error: `Workflow ${workflowId} was not found.` };
      graph = workflow.getGraph();
    }

    if (!graph || !Array.isArray(graph.nodes)) {
      return {
        error:
          "No graph to validate — pass a graph program as `code`, an inline `graph` ({nodes, edges}), or a valid `workflow_id`."
      };
    }

    // `edges` reaches `.map()` inside validateGraph — a non-array would throw a
    // raw TypeError past the tool's structured error shape.
    if (graph.edges !== undefined && !Array.isArray(graph.edges)) {
      return {
        error:
          "`graph.edges` must be an array of edges ({source, sourceHandle, target, targetHandle})."
      };
    }

    const registry = run.nodeRegistry;
    if (!registry) {
      // Returning the graph with a note read as a pass to every caller that
      // checks for issues rather than for prose. A validator with no registry
      // cannot validate; say so as an error.
      return {
        error:
          "Cannot validate: no node registry is available in this process. Run `nodetool validate` from the CLI, or call this tool from a server-side context with a registry.",
        validated: false
      };
    }

    // The provider and model catalogs are supplied by the run rather than
    // living on NodeRegistry: the registry also runs in the browser, which has
    // neither to reach. Without them `validateGraph` skips the
    // `unknown_provider` and `unknown_model` checks entirely, so a model
    // naming a provider the runtime cannot construct — or an id that provider
    // does not offer — would pass silently on the agent surface, which is
    // exactly where hallucinated ids come from. This capability always runs
    // server-side, so the runtime's own catalogs are the right default.
    const catalogs = run.modelCatalogs ?? RUNTIME_MODEL_CATALOGS;
    // An outgoing edge declares the source's dynamic output handle. The tool
    // path does this in `GraphBuilder`; a graph the DSL pack authors arrives
    // here as data and has never seen one, so the same rule runs on the JSON.
    const declared = declareDynamicOutputsInGraph(graph, registry) as {
      nodes?: unknown[];
      edges?: unknown[];
    };
    const { collectSecretRequirementSites, validateGraph } = await import(
      "@nodetool-ai/node-sdk"
    );
    const registryView = {
      has: (type: string) => registry.has(type),
      getMetadata: (type: string) => registry.getMetadata(type),
      validateNode: (
        descriptor: Parameters<typeof registry.validateNode>[0],
        connectedHandles: Parameters<typeof registry.validateNode>[1]
      ) => registry.validateNode(descriptor, connectedHandles),
      listProviderIds: () => catalogs.listProviderIds(),
      listModelIds: (provider: string, modelType: string) =>
        catalogs.listModelIds(provider, modelType),
      listRequiredTextInputs: (
        provider: string,
        modelType: string,
        modelId: string
      ) => catalogs.listRequiredTextInputs?.(provider, modelType, modelId)
    };
    const checked = {
      nodes: declared.nodes as never[],
      edges: (declared.edges ?? []) as never[]
    };

    // The credentials the graph's nodes declare are collected first so the
    // host resolves exactly those names — one store round trip per
    // requirement, not one per key it holds. A run with no reachable store
    // carries no resolver and the check is skipped: reporting every declared
    // key as missing because nothing could answer is the false alarm this
    // whole path fails toward silence to avoid.
    let availableSecrets: ReadonlySet<string> | undefined;
    if (run.availableSecrets) {
      const sites = collectSecretRequirementSites(checked, registryView);
      if (sites.length > 0) {
        availableSecrets = await run.availableSecrets(
          sites.map((site) => site.key)
        );
      }
    }

    const report = validateGraph(checked, registryView, { availableSecrets });
    return await withSecretRemediation(run, report);
  }
};

/**
 * Tell the agent what to do about a `missing_secret` warning.
 *
 * The validator says a key is missing; only the run knows how this agent can
 * get one set. Settings → Credentials is always the answer a person can act
 * on; `request_secret` is added only where this run can actually serve it —
 * it needs the capability *and* a host that can raise the dialog, and a
 * headless run has neither, so naming it there sends the agent at a call that
 * fails closed.
 */
async function withSecretRemediation(
  run: CapabilityRun,
  report: GraphValidationReport
): Promise<GraphValidationReport> {
  if (!report.issues.some((issue) => issue.code === "missing_secret")) {
    return report;
  }
  const canAsk =
    run.secretPrompt !== undefined &&
    (await findCapability(REQUEST_SECRET_TOOL_NAME)) !== undefined;
  const remediation = canAsk
    ? "Ask the user to set it in Settings → Credentials, or call " +
      `\`${REQUEST_SECRET_TOOL_NAME}\` to have them enter it now.`
    : "Ask the user to set it in Settings → Credentials.";
  return {
    ...report,
    issues: report.issues.map((issue) =>
      issue.code === "missing_secret"
        ? { ...issue, message: `${issue.message} ${remediation}` }
        : issue
    )
  };
}

// ---------------------------------------------------------------------------
// start_background_job
// ---------------------------------------------------------------------------

const startBackgroundJob: CapabilityExport = {
  spec: startBackgroundJobSpec,
  impl: async (run, params) => {
    const env = await runEnvironmentOf(run);
    if (!env) return noRegistryError("start a background job");
    const { runWorkflow } = await import("@nodetool-ai/execution/service");
    const outcome = await runWorkflow({
      workflowId: String(params["workflow_id"]),
      userId: userIdOf(run.context),
      environment: env,
      params: (params["params"] as Record<string, unknown>) ?? {},
      background: true
    });
    return outcomeResult(outcome);
  }
};

// ---------------------------------------------------------------------------
// get_example_workflow
// ---------------------------------------------------------------------------

const getExampleWorkflow: CapabilityExport = {
  spec: getExampleWorkflowSpec,
  impl: async (run, params) => {
    if (!run.examples) return NO_EXAMPLES;
    const packageName = String(params["package_name"]);
    const exampleName = String(params["example_name"]);
    const example = await run.examples.get(packageName, exampleName);
    return (
      example ?? {
        error: `No example named "${exampleName}" in package "${packageName}".`
      }
    );
  }
};

// ---------------------------------------------------------------------------
// export_workflow_digraph
// ---------------------------------------------------------------------------

const exportWorkflowDigraph: CapabilityExport = {
  spec: exportWorkflowDigraphSpec,
  // `workflowToDsl` lives in `@nodetool-ai/dsl`, which sits above this package
  // in the dependency order, so the exporter rides on the run rather than
  // being imported.
  impl: async (run, params) => {
    const exportDsl = run.exportDsl;
    if (!exportDsl) {
      return {
        error:
          "Cannot export: no DSL exporter is available in this process. Run " +
          "`nodetool workflows export-dsl` from the CLI instead."
      };
    }
    const { Workflow } = await import("@nodetool-ai/models");
    const workflowId = String(params["workflow_id"]);
    const workflow = await Workflow.find(userIdOf(run.context), workflowId);
    if (!workflow) return { error: `Workflow ${workflowId} was not found.` };
    if (!workflow.graph) return { error: "Workflow has no graph to export." };
    try {
      return {
        workflow_id: workflowId,
        source: exportDsl(workflow.graph, { workflowName: workflow.name })
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

/** Every workflow capability, in the order `getAllMcpTools` offered them. */
export const WORKFLOW_CAPABILITIES: readonly CapabilityExport[] = [
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  listWorkflowVersions,
  getWorkflowVersion,
  createWorkflowVersion,
  restoreWorkflowVersion,
  deleteWorkflowVersion,
  setWorkflowAccess,
  runWorkflowCapability,
  debugWorkflow,
  resolveWorkflowEscalation,
  validateWorkflow,
  getExampleWorkflow,
  exportWorkflowDigraph,
  startBackgroundJob
];

export const module: CapabilityModule = {
  module: "workflows",
  exports: [...WORKFLOW_CAPABILITIES]
};

export {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  listWorkflowVersions,
  getWorkflowVersion,
  createWorkflowVersion,
  restoreWorkflowVersion,
  deleteWorkflowVersion,
  setWorkflowAccess,
  runWorkflowCapability,
  debugWorkflow,
  resolveWorkflowEscalation,
  validateWorkflow,
  getExampleWorkflow,
  exportWorkflowDigraph,
  startBackgroundJob
};
