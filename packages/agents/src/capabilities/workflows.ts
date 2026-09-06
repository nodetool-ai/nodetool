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

import type { GraphValidationReport } from "@nodetool-ai/node-sdk";
import type { Workflow as WorkflowRow } from "@nodetool-ai/models";
import {
  NO_EXAMPLES,
  RUNTIME_MODEL_CATALOGS,
  annotateEscalatedRun,
  jobRecord,
  leftoverWiringHandleError,
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
import {
  planNodeShape,
  planToPlacement,
  parseWorkflowPlan,
  resolveWorkflowPlan,
  WORKFLOW_PLANNER_SYSTEM_PROMPT,
  WORKFLOW_PLAN_TOOL_DESCRIPTION,
  WORKFLOW_PLAN_TOOL_NAME,
  buildWorkflowPlanSchema,
  type PlanNodeLookup
} from "@nodetool-ai/protocol";
import {
  readWorkflowSetup,
  workflowSetupPlan,
  writeWorkflowSetup,
  type WorkflowPlanStep,
  type WorkflowSetup,
  type WorkflowSetupPlan
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
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
  setWorkflowSetupSpec,
  planWorkflowSpec,
  updateWorkflowPlanStepSpec,
  buildWorkflowFromPlanSpec,
  DEFAULT_VERSION_LIMIT,
  MAX_VERSION_LIMIT
} from "./workflows.specs.js";
import { isNumber, isObjectLike, isString } from "../utils/type-guards.js";

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
    const leftoverHandles = leftoverWiringHandleError(graph);
    if (leftoverHandles) return leftoverHandles;
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
      const leftoverHandles = leftoverWiringHandleError(graph);
      if (leftoverHandles) return leftoverHandles;
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
      fields as Parameters<typeof Workflow.updateFieldsIfUnchanged>[2],
      // A whole-graph write names no units, so an open editor falls back to
      // diff-based touching instead of treating the graph as replaced.
      "graph" in fields ? { ops: [{ tool: "update_graph", input: {} }] } : undefined
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
      { graph: version.graph },
      // Whole-graph restore: no unit attribution, diff-based touching.
      { ops: [{ tool: "restore_version", input: {} }] }
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
      { access } as Parameters<typeof Workflow.updateFieldsIfUnchanged>[2],
      { ops: [{ tool: "set_link", input: { access } }] }
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
      interactive: params["interactive"] === true,
      // A run started from a project's agent thread is that project's spend.
      projectId: run.projectId ?? null
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
      interactive: params["interactive"] === true,
      projectId: run.projectId ?? null
    });
    // A run the service refused never started, so there is no report to nest.
    // Nesting it under `run` put the failure where nothing looks: the caller
    // reads a `{workflow_id, run}` record, and the sandbox dispatcher — which
    // throws on a top-level `{error}` so a guest cannot compute with a
    // failure — sees an ordinary object. A 404 came back as a value the guest
    // logged as `Status: 404` and carried on from. `run_workflow` and
    // `start_background_job` already return this at the top level.
    if (outcome.kind !== "payload") {
      return outcomeResult(outcome);
    }
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
      background: true,
      projectId: run.projectId ?? null
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


// ── Guided setup (PRD § 11.6) ────────────────────────────────────────────────
//
// The headless half of the Workflow creation flow: write the setup answers,
// plan the steps, edit one step, build the graph from the plan. The browser
// drives the same four through `ui_workflow_set_setup`, `ui_workflow_plan`,
// `ui_workflow_update_plan_step` and `ui_workflow_build_from_plan`, and both
// halves share the planner contract and the plan→graph builder in
// `@nodetool-ai/protocol`, so a plan built here places the nodes the editor
// would have placed.
//
// Two rules carry the phase and both are asserted:
//
//  - `plan_workflow` places no node (criterion 3). It writes text and nothing
//    else.
//  - `build_workflow_from_plan` refuses a plan that still names an unknown node
//    type (D23), and reports the wiring it could not do rather than reporting a
//    graph that validates and produces nothing (R6).

/** How many candidate node types the planner prompt lists. */
const CANDIDATE_LIMIT = 60;

/**
 * Which model role each provider capability answers. Read to decide whether a
 * step's role is covered — the same question the review step's amber marker
 * asks in the browser (D23).
 */
const ROLE_CAPABILITY: Readonly<Record<string, string>> = {
  language: "generate_message",
  image: "text_to_image",
  video: "text_to_video",
  audio: "text_to_speech"
};

interface OwnedSetup {
  row: WorkflowRow;
  setup: WorkflowSetup | null;
}

async function loadOwned(
  run: CapabilityRun,
  id: string
): Promise<OwnedSetup | { error: string }> {
  const { Workflow } = await import("@nodetool-ai/models");
  const row = (await Workflow.get(id)) as WorkflowRow | null;
  if (!row || row.user_id !== userIdOf(run.context)) {
    return { error: `Workflow ${id} was not found, or it is not yours.` };
  }
  return { row, setup: readWorkflowSetup(row.settings) };
}

const isError = (value: unknown): value is { error: string } =>
  isObjectLike(value) && isString((value as { error?: unknown }).error);

/** Write a setup patch back onto the row, leaving the rest of `settings` alone. */
async function persistSetup(
  row: WorkflowRow,
  patch: Partial<WorkflowSetup>,
  extra: { graph?: WorkflowRow["graph"] } = {}
): Promise<WorkflowRow | { error: string }> {
  const { Workflow } = await import("@nodetool-ai/models");
  const fields: Parameters<typeof Workflow.updateFieldsIfUnchanged>[2] = {
    settings: writeWorkflowSetup(row.settings, patch)
  };
  if (extra.graph !== undefined) {
    fields.graph = extra.graph;
  }
  const updated = await Workflow.updateFieldsIfUnchanged(
    row.id,
    row.updated_at,
    fields
  );
  if (!updated) {
    return {
      error: `Workflow ${row.id} changed since you read it — read it again and retry.`
    };
  }
  return updated as WorkflowRow;
}

/** The plan on the row, or the reason there is none to act on. */
function requirePlan(
  setup: WorkflowSetup | null
): WorkflowSetupPlan | { error: string } {
  const plan = setup?.plan;
  if (!plan) {
    return {
      error:
        "This workflow has no plan yet. Run plan_workflow first, or store one with plan_workflow's `plan` argument."
    };
  }
  return plan;
}

/** Grade a plan against the live registry and this install's providers. */
async function reviewPlan(
  run: CapabilityRun,
  plan: WorkflowSetupPlan
): Promise<ReturnType<typeof resolveWorkflowPlan>> {
  const registry = run.nodeRegistry;
  const providers = run.providers ?? {};
  const { providerCapabilities } = await import("@nodetool-ai/runtime");
  const capabilities = new Set<string>();
  for (const provider of Object.values(providers)) {
    for (const capability of providerCapabilities(provider)) {
      capabilities.add(capability);
    }
  }
  return resolveWorkflowPlan(plan, {
    // With no registry nothing can be confirmed, so every step reads unknown
    // and the build is blocked — the same answer validate_workflow gives.
    knownNodeType: (type) => registry?.has(type) === true,
    providerConfigured: (role) => {
      const capability = ROLE_CAPABILITY[role];
      // A role nothing maps to is not a provider question; do not block on it.
      if (capability === undefined) return true;
      return capabilities.size === 0 ? false : capabilities.has(capability);
    }
  });
}

/** Shape the review into the marker list the caller renders (D23). */
function reviewReport(resolved: ReturnType<typeof resolveWorkflowPlan>) {
  return {
    can_continue: resolved.canContinue,
    missing_roles: resolved.missingRoles,
    steps: resolved.steps.map((entry) => ({
      id: entry.step.id,
      title: entry.step.title,
      summary: entry.step.summary,
      node_type: entry.step.node_type,
      model_role: entry.step.model_role ?? null,
      unknown_node_type: entry.unknownNodeType,
      missing_provider: entry.missingProvider,
      block: entry.block
    }))
  };
}

/** The registry lookup the builder wires from. */
function registryLookup(registry: NodeRegistry): PlanNodeLookup {
  return (nodeType) => {
    const meta = registry.getMetadata(nodeType);
    return meta ? planNodeShape(meta) : null;
  };
}

// ── set_workflow_setup ──────────────────────────────────────────────────────

const setWorkflowSetup: CapabilityExport = {
  spec: setWorkflowSetupSpec,
  impl: async (run, params) => {
    const id = String(params["workflow_id"]);
    const owned = await loadOwned(run, id);
    if (isError(owned)) return owned;

    const patch: Partial<WorkflowSetup> = {};
    if (isString(params["brief"])) patch.brief = params["brief"];
    if (isString(params["category"])) patch.category = params["category"];
    if (isString(params["run_mode"])) {
      patch.run_mode = params["run_mode"] as WorkflowSetup["run_mode"];
    }
    if (isString(params["stage"])) {
      patch.stage = params["stage"] as WorkflowSetup["stage"];
    }
    if (Object.keys(patch).length === 0) {
      return {
        error: "Nothing to set — pass brief, category, run_mode or stage."
      };
    }

    const saved = await persistSetup(owned.row, patch);
    if (isError(saved)) return saved;
    return { workflow_id: id, setup: readWorkflowSetup(saved.settings) };
  }
};

// ── plan_workflow ───────────────────────────────────────────────────────────

/** Candidate node types for the planner prompt, ranked against the brief. */
function candidateLines(registry: NodeRegistry, terms: string[]): string[] {
  const ranked = registry.searchMetadata(terms).slice(0, CANDIDATE_LIMIT);
  return ranked.map(
    (entry) =>
      `- ${entry.meta.node_type}: ${entry.meta.title} — ${entry.meta.description.split("\n")[0]}`
  );
}

const planWorkflow: CapabilityExport = {
  spec: planWorkflowSpec,
  impl: async (run, params) => {
    const id = String(params["workflow_id"]);
    const owned = await loadOwned(run, id);
    if (isError(owned)) return owned;

    const brief = owned.setup?.brief?.trim() ?? "";
    const supplied = params["plan"];

    let plan: WorkflowSetupPlan | null = null;
    if (supplied !== undefined) {
      // A plan handed in replaces the model call outright: it is how a harness
      // case and a replay reach the builder with no provider at all.
      const parsed = workflowSetupPlan.safeParse(
        parseWorkflowPlan(supplied) ?? supplied
      );
      if (!parsed.success) {
        return { error: "`plan` is not a plan ({inputs, steps, outputs})." };
      }
      plan = parsed.data;
    } else {
      if (brief.length === 0) {
        return {
          error:
            "This workflow has no brief, so there is nothing to plan. Write one with set_workflow_setup first."
        };
      }
      const registry = run.nodeRegistry;
      if (!registry) {
        return {
          error:
            "Cannot plan: no node registry is available in this process, so no step could name a node type that exists."
        };
      }
      const provider = isString(params["provider"]) ? params["provider"] : "";
      const model = isString(params["model"]) ? params["model"] : "";
      if (provider.length === 0 || model.length === 0) {
        return {
          error:
            "Pass provider and model to plan, or pass a `plan` to store without calling one."
        };
      }
      const { generateStructured } = await import("@nodetool-ai/runtime");
      const category = owned.setup?.category ?? "";
      const terms = brief
        .split(/\s+/)
        .filter((term: string) => term.length > 2);
      const candidates = candidateLines(registry, terms);
      const raw = await generateStructured(
        await run.context.getProvider(provider),
        {
          model,
          maxTokens: 4096,
          messages: [
            { role: "system", content: WORKFLOW_PLANNER_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                `Task: ${brief}`,
                category ? `Kind of workflow: ${category}` : "",
                "",
                "Candidate node types:",
                ...candidates
              ]
                .filter((line) => line !== "")
                .join("\n")
            }
          ],
          toolName: WORKFLOW_PLAN_TOOL_NAME,
          toolDescription: WORKFLOW_PLAN_TOOL_DESCRIPTION,
          schema: buildWorkflowPlanSchema()
        }
      );
      plan = parseWorkflowPlan(raw);
      if (!plan) {
        return { error: "The planner did not return a plan." };
      }
    }

    // Nothing below places a node — criterion 3. The plan is text on the row.
    const saved = await persistSetup(owned.row, { plan, stage: "review" });
    if (isError(saved)) return saved;
    const resolved = await reviewPlan(run, plan);
    return {
      workflow_id: id,
      stage: "review",
      plan,
      review: reviewReport(resolved),
      nodes_placed: 0
    };
  }
};

// ── update_workflow_plan_step ───────────────────────────────────────────────

const updateWorkflowPlanStep: CapabilityExport = {
  spec: updateWorkflowPlanStepSpec,
  impl: async (run, params) => {
    const id = String(params["workflow_id"]);
    const owned = await loadOwned(run, id);
    if (isError(owned)) return owned;
    const plan = requirePlan(owned.setup);
    if (isError(plan)) return plan;

    const op = isString(params["op"]) ? params["op"] : "update";
    const stepId = isString(params["step_id"]) ? params["step_id"] : null;
    const steps = [...plan.steps];
    const at = stepId === null ? -1 : steps.findIndex((s) => s.id === stepId);
    if (op !== "add" && at === -1) {
      return {
        error: `No plan step "${stepId ?? ""}". The step ids are: ${steps
          .map((step) => step.id)
          .join(", ")}.`
      };
    }

    const fields: Partial<WorkflowPlanStep> = {};
    if (isString(params["title"])) fields.title = params["title"];
    if (isString(params["summary"])) fields.summary = params["summary"];
    if (params["node_type"] !== undefined) {
      fields.node_type = isString(params["node_type"])
        ? params["node_type"]
        : null;
    }
    if (isString(params["model_role"])) {
      fields.model_role = params["model_role"];
    }

    if (op === "remove") {
      steps.splice(at, 1);
    } else if (op === "move") {
      if (!isNumber(params["index"])) {
        return { error: "op 'move' needs an `index`." };
      }
      const [moved] = steps.splice(at, 1);
      steps.splice(Math.max(0, Math.min(steps.length, params["index"])), 0, moved);
    } else if (op === "add") {
      const added: WorkflowPlanStep = {
        id: stepId ?? `step-${steps.length + 1}`,
        title: fields.title ?? "New step",
        summary: fields.summary ?? "",
        node_type: fields.node_type ?? null
      };
      if (fields.model_role !== undefined) {
        added.model_role = fields.model_role;
      }
      steps.splice(
        isNumber(params["index"])
          ? Math.max(0, Math.min(steps.length, params["index"]))
          : steps.length,
        0,
        added
      );
    } else {
      steps[at] = { ...steps[at], ...fields };
    }

    const next = workflowSetupPlan.parse({ ...plan, steps });
    const saved = await persistSetup(owned.row, { plan: next });
    if (isError(saved)) return saved;
    const resolved = await reviewPlan(run, next);
    return { workflow_id: id, plan: next, review: reviewReport(resolved) };
  }
};

// ── build_workflow_from_plan ────────────────────────────────────────────────

const buildWorkflowFromPlan: CapabilityExport = {
  spec: buildWorkflowFromPlanSpec,
  impl: async (run, params) => {
    const id = String(params["workflow_id"]);
    const owned = await loadOwned(run, id);
    if (isError(owned)) return owned;
    const plan = requirePlan(owned.setup);
    if (isError(plan)) return plan;

    const registry = run.nodeRegistry;
    if (!registry) {
      return {
        error:
          "Cannot build: no node registry is available in this process, so no node type could be resolved."
      };
    }

    // D23: an unknown type blocks the build, and names itself.
    const resolved = await reviewPlan(run, plan);
    const unknown = resolved.steps.filter((entry) => entry.unknownNodeType);
    if (unknown.length > 0) {
      return {
        error:
          "Every step must name a node type the registry has before the graph is built. " +
          `Unresolved: ${unknown
            .map((entry) => `${entry.step.id} (${entry.step.node_type ?? "no type"})`)
            .join(", ")}. Fix them with update_workflow_plan_step.`,
        review: reviewReport(resolved)
      };
    }

    const placement = planToPlacement(plan, registryLookup(registry));
    const graph = {
      nodes: placement.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        data: node.properties,
        ui_properties: { position: node.position, setup_step_id: node.setupStepId },
        dynamic_properties: node.dynamicProperties ?? {},
        dynamic_outputs: {}
      })),
      edges: placement.edges.map((edge, index) => ({
        id: `e${index + 1}`,
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
        targetHandle: edge.targetHandle
      }))
    };

    const validation = await validateBuiltGraph(run, graph);
    const save = params["save"] !== false;
    let savedRow: WorkflowRow | null = null;
    if (save) {
      const written = await persistSetup(
        owned.row,
        { stage: "done" },
        { graph: graph as unknown as WorkflowRow["graph"] }
      );
      if (isError(written)) return written;
      savedRow = written;
    }

    return {
      workflow_id: id,
      saved: savedRow !== null,
      stage: save ? "done" : owned.setup?.stage ?? "setup",
      graph,
      /** Plan input name → the sample a test run should send. */
      sample_inputs: Object.fromEntries(
        plan.inputs.map((input: WorkflowSetupPlan["inputs"][number]) => [
          input.name,
          input.sample ?? ""
        ])
      ),
      /**
       * What the builder could not wire. Empty is the only value that means the
       * graph does what the plan described — a validated graph with issues here
       * is exactly the R6 failure: it runs and produces nothing.
       */
      issues: placement.issues,
      validation
    };
  }
};

/** Run the same static checks `validate_workflow` runs, on a built graph. */
async function validateBuiltGraph(
  run: CapabilityRun,
  graph: { nodes: unknown[]; edges: unknown[] }
): Promise<unknown> {
  return validateWorkflow.impl(run, { graph });
}

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
  startBackgroundJob,
  setWorkflowSetup,
  planWorkflow,
  updateWorkflowPlanStep,
  buildWorkflowFromPlan
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
  startBackgroundJob,
  setWorkflowSetup,
  planWorkflow,
  updateWorkflowPlanStep,
  buildWorkflowFromPlan,
  registryLookup
};
