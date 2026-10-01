/**
 * MCP Tool wrappers for the Agent system.
 *
 * These tools give the agent control over nodetool: workflows, nodes, jobs,
 * assets and models — all **in-process**. Nothing here speaks HTTP. Reads and
 * writes go through `@nodetool-ai/models`, and running/debugging a workflow or
 * an app goes through `@nodetool-ai/execution/service`, the same service layer
 * the REST routes call. An agent therefore needs no server listening on
 * localhost, and a tool's answer cannot differ from the endpoint's because
 * both are one function.
 *
 * The pieces a package below `websocket` cannot construct — the node registry,
 * the example-workflow catalog, the DSL exporter — arrive through
 * {@link GetAllMcpToolsOptions}. A tool handed none of them says so instead of
 * reaching for a network fallback.
 */

import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { WORKFLOW_DOCUMENT_TOOL_NAMES } from "@nodetool-ai/node-sdk";
import type { Tool } from "./base-tool.js";
import {
  UNGATED,
  createCapabilityRun,
  toolFromLazyCapability,
  type AvailableSecretsResolver,
  type CapabilityRun,
  type CapabilitySpec
} from "../capabilities/index.js";
import { capabilitySpec } from "../capabilities/registry.js";
import { workflowDocumentSpec } from "../capabilities/ui.specs.js";
import {
  type ExampleWorkflowCatalog,
  type WorkflowEnvironmentProvider
} from "./mcp-tool-support.js";

export type {
  ExampleWorkflowCatalog,
  ModelCatalogs,
  WorkflowEnvironmentProvider
} from "./mcp-tool-support.js";

/**
 * The eight `ui_*` workflow-document tools, built from the `ui` module's eager
 * specs, as compatibility views for Tool[] consumers. Invocation validates
 * the Zod schema, and the run carries the registry.
 */
export function createWorkflowDocumentTools(registry?: NodeRegistry): Tool[] {
  const runs = new WeakMap<ProcessingContext, CapabilityRun>();
  return WORKFLOW_DOCUMENT_TOOL_NAMES.map((name) =>
    toolFromLazyCapability(workflowDocumentSpec(name), (context) => {
      let run = runs.get(context);
      if (!run) {
        run = createCapabilityRun({
          context,
          gate: UNGATED,
          nodeRegistry: registry
        });
        runs.set(context, run);
      }
      return run;
    })
  );
}

/** What a host must hand back for a saved timeline row. */
export interface TimelineToolRecord {
  /** The stored document — a JSON string or an already-parsed object. */
  document: unknown;
  fps?: number;
  width?: number;
  height?: number;
  name?: string;
}

/** Reads a `timeline_sequences` row for the caller. */
export type TimelineLoader = (
  context: ProcessingContext,
  id: string
) => Promise<TimelineToolRecord | null>;

export interface SketchToolRecord {
  /** The stored document — a JSON string or an already-parsed object. */
  document: unknown;
  width?: number;
  height?: number;
  backgroundColor?: string;
  name?: string;
}

/** Reads an `image_documents` row for the caller. */
export type SketchLoader = (
  context: ProcessingContext,
  id: string
) => Promise<SketchToolRecord | null>;

// ============================================================================
// Helper
// ============================================================================

/** Renders a stored graph as a TypeScript DSL program. */
export type WorkflowDslExporter = (
  graph: unknown,
  options: { workflowName?: string }
) => string;

/**
 * Deletes a project with everything in it, including stored bytes and live
 * runs. `personal` and `not_found` are refusals, and nothing is removed.
 */
export type ProjectDeleter = (
  userId: string,
  projectId: string
) => Promise<"deleted" | "not_found" | "personal">;

/** Lists the assets shipped inside the installed node packages. */
export type PackageAssetLister = (opts: {
  limit?: number;
}) => Promise<unknown[]>;

export interface GetAllMcpToolsOptions {
  /**
   * In-process NodeRegistry. Node discovery (`list_nodes`, `search_nodes`,
   * `get_node_info`) needs it, and so does anything that executes: running or
   * debugging a workflow, building or debugging an app. Without it those tools
   * are still offered but answer with a "no registry in this process" error
   * rather than reaching for a network fallback.
   */
  registry?: NodeRegistry;
  /**
   * The shipped example workflows. They live as JSON inside the installed node
   * packages, which only the server walks, so a host that has them injects the
   * catalog; without it the example paths say so.
   */
  examples?: ExampleWorkflowCatalog;
  /**
   * `workflowToDsl`. `@nodetool-ai/dsl` sits above this package in the
   * dependency order, so `export_workflow_digraph` takes it by injection.
   */
  exportDsl?: WorkflowDslExporter;
  /** Package assets for `list_assets` with `source: "package"`. */
  listPackageAssets?: PackageAssetLister;
  /**
   * The full project delete. Asset storage, workspace files and the live run
   * registries live in the server, so `delete_project` takes it by injection
   * and refuses without it.
   */
  deleteProject?: ProjectDeleter;
  /**
   * The full workflow-run environment (Python bridge, executor resolution),
   * resolved lazily. The server injects this so an agent-run workflow executes
   * exactly like an HTTP-run one; without it the run tools fall back to
   * registry-only resolution and Python nodes report they cannot execute.
   */
  workflowEnvironment?: WorkflowEnvironmentProvider;
  /**
   * Configured BaseProvider instances by id. When supplied, the agent gets:
   * - `find_model` — pick a `{provider, model_id}` for any capability.
   * - `list_models` — browse everything the configured providers offer.
   * - `generate_image` / `edit_image` / `generate_video` / `animate_image` /
   *   `generate_video_from_references` / `generate_speech` /
   *   `transcribe_audio` / `embed_text` — direct provider-backed media
   *   generation tools usable from any agent loop.
   *
   * Independent of `registry`: the multi-task planner doesn't need a
   * registry but still benefits from these tools.
   */
  providers?: Record<string, BaseProvider>;
  /**
   * Builds the run's `availableSecrets` callback from its context — pass
   * `contextSecretAvailability` where a real secret store backs the run. It is
   * a factory rather than a callback because the belt is assembled once and
   * every call brings its own `ProcessingContext`.
   *
   * Without it `validate_workflow` skips the `missing_secret` check, which is
   * what a hermetic host wants: nothing can answer, and reporting every
   * declared credential as absent would be a false alarm on every graph.
   */
  secretAvailability?: SecretAvailabilityFactory;
}

/** See {@link GetAllMcpToolsOptions.secretAvailability}. */
export type SecretAvailabilityFactory = (
  context: ProcessingContext
) => AvailableSecretsResolver | undefined;

/** Compatibility catalog for consumers that still require Tool[]. */
export function getAllMcpTools(options: GetAllMcpToolsOptions = {}): Tool[] {
  const runs = new WeakMap<ProcessingContext, CapabilityRun>();
  const runFor = (context: ProcessingContext): CapabilityRun => {
    let run = runs.get(context);
    if (!run) {
      run = createCapabilityRun({
        context,
        gate: UNGATED,
        availableSecrets: options.secretAvailability?.(context),
        nodeRegistry: options.registry,
        examples: options.examples,
        exportDsl: options.exportDsl,
        workflowEnvironment: options.workflowEnvironment,
        listPackageAssets: options.listPackageAssets,
        deleteProject: options.deleteProject,
        providers: options.providers
      });
      runs.set(context, run);
    }
    return run;
  };
  return getAllMcpCapabilitySpecs(options).map((spec) =>
    toolFromLazyCapability(spec, runFor)
  );
}

/** Metadata for native hosts. Dependencies belong to their CapabilityRun. */
export function getAllMcpCapabilitySpecs(
  options: GetAllMcpToolsOptions = {}
): CapabilitySpec[] {
  const names = [
    // workflows
    "list_workflows",
    "get_workflow",
    "create_workflow",
    "list_workflow_versions",
    "get_workflow_version",
    "create_workflow_version",
    "restore_workflow_version",
    "delete_workflow_version",
    "run_workflow",
    "debug_workflow",
    "resolve_workflow_escalation",
    "validate_workflow",
    "get_example_workflow",
    "export_workflow_digraph",
    "start_background_job",
    // The render runs as a workflow, so it needs the same environment the run
    // tools do. Every other timeline capability is a built-in; this one cannot
    // be, and a belt without it leaves the model authoring cuts it can never
    // export.
    "render_timeline",
    // Same reason: the subject cutout runs the provider through a node, so it
    // needs the registry the built-in timeline capabilities do without.
    "isolate_subject",
    // apps — unlike the `ui_app_*` tools, these also work when the App
    // Builder is not already open in the browser. Keep the whole headless
    // app lifecycle on the chat belt so `nodetool.apps.*` never advertises a
    // method whose backing capability is absent.
    "list_apps",
    "get_app",
    "create_app",
    "edit_app",
    "debug_app",
    "delete_app",
    // projects. `delete_project` reads the host's injected deleter off the run.
    "list_projects",
    "search_projects",
    "update_project",
    "delete_project",
    // jobs
    "list_jobs",
    "get_job",
    "get_job_logs",
    // assets. `save_asset` is how the agent surfaces an artifact (a text
    // report, an image, audio) into the chat; media generation saves its own
    // output already.
    "list_assets",
    "get_asset",
    "save_asset",
    "read_asset"
  ];
  if (options.registry) {
    names.push("list_nodes", "search_nodes", "get_node_info");
  }
  names.push(...WORKFLOW_DOCUMENT_TOOL_NAMES);
  if (options.providers && Object.keys(options.providers).length > 0) {
    names.push("find_model", "list_models");
  }
  return names.map((name) => {
    const spec = capabilitySpec(name);
    if (!spec) {
      throw new Error(`no capability is registered for "${name}"`);
    }
    return spec;
  });
}
