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
import {
  listOfflineModelIds,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { Tool } from "./base-tool.js";
import { findModel, listModels } from "../capabilities/models.js";
import {
  animateImage,
  editImage,
  embedText,
  generateImage,
  generateSpeech,
  generateVideo,
  transcribeAudio
} from "../capabilities/media.js";
import {
  WORKFLOW_DOCUMENT_TOOL_NAMES,
  type WorkflowDocumentToolName
} from "@nodetool-ai/node-sdk";
import type { ZodType } from "zod";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun,
  toolFromCapability,
  type CapabilityImpl,
  type CapabilityRun,
  type CapabilitySpec
} from "../capabilities/index.js";
import { validateTimeline } from "../capabilities/timelines.js";
import { validateSketch } from "../capabilities/sketches.js";
import {
  JOB_CAPABILITIES,
  getJob,
  getJobLogs,
  listJobs
} from "../capabilities/jobs.js";
import {
  getAsset,
  listAssets,
  readAsset,
  saveAsset
} from "../capabilities/assets.js";
import { APP_CAPABILITIES, buildApp, debugApp } from "../capabilities/apps.js";
import {
  WORKFLOW_CAPABILITIES,
  createWorkflow,
  debugWorkflow,
  exportWorkflowDigraph,
  getExampleWorkflow,
  getWorkflow,
  listWorkflows,
  resolveWorkflowEscalation,
  runWorkflowCapability,
  startBackgroundJob,
  validateWorkflow
} from "../capabilities/workflows.js";
import { NODE_CAPABILITIES } from "../capabilities/nodes.js";
import {
  workflowDocumentCapability,
  workflowDocumentCore,
  workflowDocumentSchema
} from "../capabilities/ui.js";
import {
  RUNTIME_MODEL_CATALOGS,
  type ExampleWorkflowCatalog,
  type ModelCatalogs,
  type WorkflowEnvironmentProvider
} from "./mcp-tool-support.js";

export type {
  ExampleWorkflowCatalog,
  ModelCatalogs,
  WorkflowEnvironmentProvider
} from "./mcp-tool-support.js";

/** What a host injects into the workflow capabilities. */
interface WorkflowCapabilityDeps {
  registry?: NodeRegistry;
  examples?: ExampleWorkflowCatalog;
  exportDsl?: WorkflowDslExporter;
  workflowEnvironment?: WorkflowEnvironmentProvider;
  modelCatalogs?: ModelCatalogs;
  /** `list_assets` with `source: "package"`. */
  listPackageAssets?: PackageAssetLister;
}

/** A run over one call's context, carrying the injected dependencies. */
function workflowCapabilityRun(
  context: ProcessingContext,
  deps: WorkflowCapabilityDeps
): CapabilityRun {
  return createCapabilityRun({
    context,
    gate: UNGATED,
    nodeRegistry: deps.registry,
    examples: deps.examples,
    exportDsl: deps.exportDsl,
    workflowEnvironment: deps.workflowEnvironment,
    modelCatalogs: deps.modelCatalogs,
    listPackageAssets: deps.listPackageAssets
  });
}

/**
 * @deprecated Ported to the `workflows` capability module
 * (`../capabilities/workflows.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ListWorkflowsTool extends CapabilityTool {
  constructor(examples?: ExampleWorkflowCatalog) {
    super(listWorkflows.spec, listWorkflows.impl, (context) =>
      workflowCapabilityRun(context, { examples })
    );
  }
}

/**
 * @deprecated Ported to the `workflows` capability module
 * (`../capabilities/workflows.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class GetWorkflowTool extends CapabilityTool {
  constructor() {
    super(getWorkflow.spec, getWorkflow.impl, (context) =>
      workflowCapabilityRun(context, {})
    );
  }
}

/**
 * @deprecated Ported to the `ui` capability module
 * (`../capabilities/ui.ts`). Kept as a thin subclass so existing constructors
 * keep working; there is one implementation behind both.
 *
 * The class keeps the Zod schema on `schema` and runs the *unvalidated* core:
 * `Tool.execute` validates once on the way in, exactly where it always did.
 * The capability's own `impl` carries the same check for callers that reach it
 * through `invoke`.
 */
export class WorkflowDocumentTool extends CapabilityTool {
  private readonly documentSchema: ZodType;

  constructor(name: WorkflowDocumentToolName, registry?: NodeRegistry) {
    super(
      workflowDocumentCapability(name).spec,
      workflowDocumentCore(name),
      (context) =>
        createCapabilityRun({
          context,
          gate: UNGATED,
          nodeRegistry: registry
        })
    );
    this.documentSchema = workflowDocumentSchema(name);
  }

  override get schema(): ZodType {
    return this.documentSchema;
  }
}

export function createWorkflowDocumentTools(
  registry?: NodeRegistry
): WorkflowDocumentTool[] {
  return WORKFLOW_DOCUMENT_TOOL_NAMES.map(
    (name) => new WorkflowDocumentTool(name, registry)
  );
}

/**
 * @deprecated Ported to the `workflows` capability module
 * (`../capabilities/workflows.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class CreateWorkflowTool extends CapabilityTool {
  constructor(catalogs: ModelCatalogs = RUNTIME_MODEL_CATALOGS) {
    super(createWorkflow.spec, createWorkflow.impl, (context) =>
      workflowCapabilityRun(context, { modelCatalogs: catalogs })
    );
  }
}

/**
 * @deprecated Ported to the `workflows` capability module
 * (`../capabilities/workflows.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class RunWorkflowTool extends CapabilityTool {
  constructor(
    registry?: NodeRegistry,
    environment?: WorkflowEnvironmentProvider
  ) {
    super(runWorkflowCapability.spec, runWorkflowCapability.impl, (context) =>
      workflowCapabilityRun(context, {
        registry,
        workflowEnvironment: environment
      })
    );
  }
}

/**
 * @deprecated Ported to the `workflows` capability module
 * (`../capabilities/workflows.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class DebugWorkflowTool extends CapabilityTool {
  constructor(
    registry?: NodeRegistry,
    environment?: WorkflowEnvironmentProvider
  ) {
    super(debugWorkflow.spec, debugWorkflow.impl, (context) =>
      workflowCapabilityRun(context, {
        registry,
        workflowEnvironment: environment
      })
    );
  }
}

/**
 * @deprecated Ported to the `workflows` capability module
 * (`../capabilities/workflows.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ResolveWorkflowEscalationTool extends CapabilityTool {
  constructor() {
    super(
      resolveWorkflowEscalation.spec,
      resolveWorkflowEscalation.impl,
      (context) => workflowCapabilityRun(context, {})
    );
  }
}

/**
 * @deprecated Ported to the `apps` capability module
 * (`../capabilities/apps.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class BuildAppTool extends CapabilityTool {
  constructor(registry?: NodeRegistry) {
    super(buildApp.spec, buildApp.impl, (context) =>
      workflowCapabilityRun(context, { registry })
    );
  }
}

/**
 * @deprecated Ported to the `apps` capability module
 * (`../capabilities/apps.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class DebugAppTool extends CapabilityTool {
  constructor(registry?: NodeRegistry) {
    super(debugApp.spec, debugApp.impl, (context) =>
      workflowCapabilityRun(context, { registry })
    );
  }
}

/**
 * @deprecated Ported to the `workflows` capability module
 * (`../capabilities/workflows.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ValidateWorkflowTool extends CapabilityTool {
  constructor(
    registry?: NodeRegistry,
    listProviderIds: () => readonly string[] = () =>
      listRegisteredProviderIds(),
    listModelIds: (
      provider: string,
      modelType: string
    ) => readonly string[] | undefined = listOfflineModelIds
  ) {
    super(validateWorkflow.spec, validateWorkflow.impl, (context) =>
      workflowCapabilityRun(context, {
        registry,
        modelCatalogs: { listProviderIds, listModelIds }
      })
    );
  }
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

/**
 * @deprecated Ported to the `timelines` capability module
 * (`../capabilities/timelines.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both. The
 * loader that was a constructor argument rides on the run.
 */
export class ValidateTimelineTool extends CapabilityTool {
  constructor(loadTimeline?: TimelineLoader) {
    super(validateTimeline.spec, validateTimeline.impl, (context) =>
      createCapabilityRun({
        context,
        gate: UNGATED,
        loaders: { timeline: loadTimeline }
      })
    );
  }
}

/**
 * @deprecated Ported to the `sketches` capability module
 * (`../capabilities/sketches.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both. The
 * loader that was a constructor argument rides on the run.
 */
export class ValidateSketchTool extends CapabilityTool {
  constructor(loadSketch?: SketchLoader) {
    super(validateSketch.spec, validateSketch.impl, (context) =>
      createCapabilityRun({
        context,
        gate: UNGATED,
        loaders: { sketch: loadSketch }
      })
    );
  }
}

/**
 * @deprecated Ported to the `workflows` capability module
 * (`../capabilities/workflows.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class GetExampleWorkflowTool extends CapabilityTool {
  constructor(examples?: ExampleWorkflowCatalog) {
    super(getExampleWorkflow.spec, getExampleWorkflow.impl, (context) =>
      workflowCapabilityRun(context, { examples })
    );
  }
}

/**
 * @deprecated Ported to the `workflows` capability module
 * (`../capabilities/workflows.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ExportWorkflowDigraphTool extends CapabilityTool {
  constructor(exportDsl?: WorkflowDslExporter) {
    super(exportWorkflowDigraph.spec, exportWorkflowDigraph.impl, (context) =>
      workflowCapabilityRun(context, { exportDsl })
    );
  }
}

// ============================================================================
// Job Tools
// ============================================================================

/**
 * @deprecated Ported to the `jobs` capability module
 * (`../capabilities/jobs.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ListJobsTool extends CapabilityTool {
  constructor() {
    super(listJobs.spec, listJobs.impl, (context) =>
      workflowCapabilityRun(context, {})
    );
  }
}

/**
 * @deprecated Ported to the `jobs` capability module
 * (`../capabilities/jobs.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class GetJobTool extends CapabilityTool {
  constructor() {
    super(getJob.spec, getJob.impl, (context) =>
      workflowCapabilityRun(context, {})
    );
  }
}

/**
 * @deprecated Ported to the `jobs` capability module
 * (`../capabilities/jobs.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class GetJobLogsTool extends CapabilityTool {
  constructor() {
    super(getJobLogs.spec, getJobLogs.impl, (context) =>
      workflowCapabilityRun(context, {})
    );
  }
}

/**
 * @deprecated Ported to the `workflows` capability module
 * (`../capabilities/workflows.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class StartBackgroundJobTool extends CapabilityTool {
  constructor(
    registry?: NodeRegistry,
    environment?: WorkflowEnvironmentProvider
  ) {
    super(startBackgroundJob.spec, startBackgroundJob.impl, (context) =>
      workflowCapabilityRun(context, {
        registry,
        workflowEnvironment: environment
      })
    );
  }
}

// ============================================================================
// Asset Tools
// ============================================================================

/**
 * @deprecated Ported to the `assets` capability module
 * (`../capabilities/assets.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ListAssetsTool extends CapabilityTool {
  constructor(listPackageAssets?: PackageAssetLister) {
    super(listAssets.spec, listAssets.impl, (context) =>
      workflowCapabilityRun(context, { listPackageAssets })
    );
  }
}

/**
 * @deprecated Ported to the `assets` capability module
 * (`../capabilities/assets.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class GetAssetTool extends CapabilityTool {
  constructor() {
    super(getAsset.spec, getAsset.impl, (context) =>
      workflowCapabilityRun(context, {})
    );
  }
}

// ============================================================================
// Helper
// ============================================================================

/** Renders a stored graph as a TypeScript DSL program. */
export type WorkflowDslExporter = (
  graph: unknown,
  options: { workflowName?: string }
) => string;

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
   *   `generate_speech` / `transcribe_audio` / `embed_text` — direct
   *   provider-backed media generation tools usable from any agent loop.
   *
   * Independent of `registry`: the multi-task planner doesn't need a
   * registry but still benefits from these tools.
   */
  providers?: Record<string, BaseProvider>;
}

export function getAllMcpTools(options: GetAllMcpToolsOptions = {}): Tool[] {
  // The workflow namespace is a capability module now: one spec + impl per
  // capability, wrapped as a `Tool` so every consumer — runner, MCP, CLI,
  // evals — keeps the surface it had. The dependencies that used to be
  // constructor arguments ride on the run instead.
  const workflowRun = (context: ProcessingContext): CapabilityRun =>
    workflowCapabilityRun(context, {
      registry: options.registry,
      examples: options.examples,
      exportDsl: options.exportDsl,
      workflowEnvironment: options.workflowEnvironment,
      listPackageAssets: options.listPackageAssets
    });

  const asTool = (entry: {
    spec: CapabilitySpec;
    impl: CapabilityImpl;
  }): Tool => toolFromCapability(entry.spec, entry.impl, workflowRun);

  const tools: Tool[] = [
    ...WORKFLOW_CAPABILITIES.map(asTool),
    ...APP_CAPABILITIES.map(asTool),
    ...JOB_CAPABILITIES.map(asTool),
    asTool(listAssets),
    asTool(getAsset),
    // Asset persistence — used by the agent to surface artifacts (text
    // reports, images, audio) into the chat. Media-generation tools save
    // their outputs as assets automatically; use save_asset for anything
    // else worth keeping.
    asTool(saveAsset),
    asTool(readAsset)
  ];

  // Node discovery reads the registry directly; there is no registry-free
  // variant, because the only other way to answer was an HTTP call to a server
  // that may not be running.
  if (options.registry) {
    const nodeRun = (context: ProcessingContext): CapabilityRun =>
      createCapabilityRun({
        context,
        gate: UNGATED,
        nodeRegistry: options.registry
      });
    tools.push(
      ...NODE_CAPABILITIES.map((entry) =>
        toolFromCapability(entry.spec, entry.impl, nodeRun)
      )
    );
  }
  tools.push(...createWorkflowDocumentTools(options.registry));

  if (options.providers && Object.keys(options.providers).length > 0) {
    // The providers map rides on the run and is read at call time, so a host
    // that fills it lazily still serves what it resolved after construction.
    const providers = options.providers;
    const modelRun = (context: ProcessingContext): CapabilityRun =>
      createCapabilityRun({ context, gate: UNGATED, providers });
    const mediaRun = (context: ProcessingContext): CapabilityRun =>
      createCapabilityRun({ context, gate: UNGATED });
    tools.push(
      toolFromCapability(findModel.spec, findModel.impl, modelRun),
      toolFromCapability(listModels.spec, listModels.impl, modelRun),
      ...[
        generateImage,
        editImage,
        generateVideo,
        animateImage,
        generateSpeech,
        transcribeAudio,
        embedText
      ].map((entry) => toolFromCapability(entry.spec, entry.impl, mediaRun))
    );
  }

  return tools;
}
