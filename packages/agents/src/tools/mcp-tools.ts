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
import type { NodeMetadata, NodeRegistry } from "@nodetool-ai/node-sdk";
import { validateTimelineSequence } from "@nodetool-ai/execution/timeline-debug";
import { validateSketchDocument } from "@nodetool-ai/execution/sketch-debug";
import { Workflow } from "@nodetool-ai/models";
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
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { uiToolSchemas } from "@nodetool-ai/protocol";
import { graph as workflowGraphSchema } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import {
  applyWorkflowDocumentTool,
  WORKFLOW_DOCUMENT_TOOL_NAMES,
  type WorkflowDocumentToolName
} from "@nodetool-ai/node-sdk";
import { z } from "zod";
import { GraphPlanner } from "../graph-planner.js";
import { TOOL_CALL_ID_FIELD } from "./subtask-fields.js";
import { forwardSubAgentStream } from "../subagent.js";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun,
  toolFromCapability,
  type CapabilityImpl,
  type CapabilityRun,
  type CapabilitySpec
} from "../capabilities/index.js";
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
  RUNTIME_MODEL_CATALOGS,
  userIdOf,
  workflowRecord,
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

export class WorkflowDocumentTool extends Tool {
  readonly description: string;

  constructor(
    readonly name: WorkflowDocumentToolName,
    private readonly registry?: NodeRegistry
  ) {
    super();
    this.description = uiToolSchemas[name].description;
  }

  override get schema(): z.ZodType {
    return z.object(uiToolSchemas[this.name].parameters);
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const workflowId =
      typeof params["workflow_id"] === "string"
        ? params["workflow_id"]
        : context.workflowId;
    if (!workflowId) {
      return {
        error: "workflow_id_required",
        message: "workflow_id is required when no workflow is active."
      };
    }

    const userId = userIdOf(context);
    const stored = await Workflow.find(userId, workflowId);
    if (!stored) return { error: `Workflow ${workflowId} was not found.` };
    const workflow = workflowRecord(stored);
    const parsedGraph = workflowGraphSchema.safeParse(workflow["graph"]);
    if (!parsedGraph.success) {
      return { error: "Workflow has an invalid graph" };
    }

    const metadataByType = new Map<string, NodeMetadata>();
    const loadMetadata = async (nodeType: string): Promise<void> => {
      const local = this.registry?.resolveMetadata(nodeType);
      if (local) metadataByType.set(nodeType, local);
    };

    if (this.name === "ui_add_node" && typeof params["type"] === "string") {
      await loadMetadata(params["type"]);
    } else if (this.name === "ui_connect_nodes") {
      const sourceId = String(params["source_node_id"]);
      const targetId = String(params["target_node_id"]);
      const source = parsedGraph.data.nodes.find(
        (node) => node.id === sourceId
      );
      const target = parsedGraph.data.nodes.find(
        (node) => node.id === targetId
      );
      await Promise.all(
        [source?.type, target?.type]
          .filter((type): type is string => typeof type === "string")
          .map(loadMetadata)
      );
    }

    const applied = applyWorkflowDocumentTool(
      parsedGraph.data,
      this.name,
      params,
      {
        workflowId,
        resolveMetadata: (nodeType) => metadataByType.get(nodeType)
      }
    );
    if (!applied.changed) return applied.result;

    // The same optimistic-concurrency write the PUT route performs: the read
    // above pinned `updated_at`, so a concurrent editor's save is a conflict
    // rather than a silent clobber.
    const persisted = await Workflow.updateFieldsIfUnchanged(
      workflowId,
      stored.updated_at,
      { graph: applied.graph as unknown as Workflow["graph"] }
    );
    if (!persisted) {
      return {
        error:
          "Workflow was modified since last read (optimistic concurrency " +
          "conflict) — re-read it and retry."
      };
    }
    return {
      ...applied.result,
      updated_at: persisted.updated_at,
      etag: persisted.getEtag()
    };
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

/** A positive finite number from a tool param, or undefined. */
function numberParam(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/** Unwrap a stored document that may still be JSON text. */
function parseStoredDocument(document: unknown): unknown {
  if (typeof document !== "string") return document;
  try {
    return JSON.parse(document);
  } catch {
    return undefined;
  }
}

/** One-line count of what a static validation found. */
function issueSummary(validation: {
  errors: unknown[];
  warnings: unknown[];
}): string {
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;
  if (errors === 0 && warnings === 0) return "No issues found.";
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings > 0)
    parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export class ValidateTimelineTool extends Tool {
  readonly name = "validate_timeline";
  readonly description =
    "Statically validate a timeline sequence WITHOUT rendering or playing it: " +
    "clips on tracks the document lacks, duplicate ids, overlapping clips, " +
    "fades and transitions longer than the clip, in/out points that cannot " +
    "render, unknown animation presets, incomplete bindings, and fields a " +
    "schema round trip would strip. Pass an inline `document` to check one you " +
    "are building, or `timeline_id` to validate a saved sequence. Run it after " +
    "timeline edits and before rendering.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      timeline_id: {
        type: "string" as const,
        description: "The ID of a saved timeline sequence to validate"
      },
      document: {
        type: "object" as const,
        description:
          "Inline TimelineDocument to validate ({ tracks, clips, markers }). " +
          "Takes precedence over timeline_id."
      },
      fps: {
        type: "number" as const,
        description:
          "Frame rate the inline document renders at (default 30). Timing " +
          "checks are frame-based, so a document authored at another fps " +
          "validates against the wrong grid without this. Ignored for timeline_id."
      },
      width: {
        type: "number" as const,
        description:
          "Render width of the inline document. Ignored for timeline_id."
      },
      height: {
        type: "number" as const,
        description:
          "Render height of the inline document. Ignored for timeline_id."
      }
    }
  };

  // The timeline API is tRPC-only, so there is no REST route to fall back on:
  // a host that wants the `timeline_id` path injects a loader. Without one the
  // tool still validates inline documents.
  constructor(private readonly loadTimeline?: TimelineLoader) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const inline = params["document"];
    const timelineId = params["timeline_id"] as string | undefined;

    let document = inline;
    // An inline document carries no stored render settings, so the caller
    // supplies them; the timeline_id path overwrites these from the row.
    let meta: { fps?: number; width?: number; height?: number } = {
      fps: numberParam(params["fps"]),
      width: numberParam(params["width"]),
      height: numberParam(params["height"])
    };
    let name: string | undefined;

    if (document === undefined && timelineId) {
      if (!this.loadTimeline) {
        return {
          error:
            "Cannot load a saved timeline in this process: no timeline loader is available. Pass the document inline as `document`, or call this tool from a server-side context.",
          validated: false
        };
      }
      const record = await this.loadTimeline(context, timelineId);
      if (!record) {
        return {
          error: `Timeline ${timelineId} was not found.`,
          validated: false
        };
      }
      document = parseStoredDocument(record.document);
      meta = { fps: record.fps, width: record.width, height: record.height };
      name = record.name;
    }

    if (document === undefined || document === null) {
      return {
        error:
          "No timeline to validate — pass an inline `document` ({tracks, clips, markers}) or a valid `timeline_id`."
      };
    }

    const validation = validateTimelineSequence(document, meta);
    return {
      ...validation,
      ...(timelineId ? { timeline_id: timelineId } : {}),
      ...(name ? { name } : {}),
      summary: issueSummary(validation)
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return params["timeline_id"]
      ? `Validating timeline ${params["timeline_id"]}`
      : "Validating timeline document";
  }
}

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

export class ValidateSketchTool extends Tool {
  readonly name = "validate_sketch";
  readonly description =
    "Statically validate a sketch (image document) WITHOUT rendering it: " +
    "duplicate layer ids, an active or mask layer the stack lacks, unknown " +
    "blend modes, opacities and transforms that cannot render, generation " +
    "bindings pointing at missing layers, unknown binding kinds and statuses, " +
    "canvas settings that disagree with the stored ones, and fields a schema " +
    "round trip would strip. Pass an inline `document` to check one you are " +
    "building, or `image_document_id` to validate a saved sketch. Run it after " +
    "sketch edits and before handing the document back.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      image_document_id: {
        type: "string" as const,
        description: "The ID of a saved sketch (image document) to validate"
      },
      document: {
        type: "object" as const,
        description:
          "Inline ImageDocumentData to validate ({ sketch, layerBindings }). " +
          "Takes precedence over image_document_id."
      },
      width: {
        type: "number" as const,
        description:
          "Canvas width the inline document is stored against. The canvas " +
          "size lives on the row, not in the document, so without it a " +
          "mismatch between the two cannot be reported. Ignored for " +
          "image_document_id."
      },
      height: {
        type: "number" as const,
        description:
          "Canvas height the inline document is stored against. Ignored for image_document_id."
      },
      background_color: {
        type: "string" as const,
        description:
          "Canvas background color the inline document is stored against. Ignored for image_document_id."
      }
    }
  };

  // The sketch API is tRPC-only, so there is no REST route to fall back on:
  // a host that wants the `image_document_id` path injects a loader. Without
  // one the tool still validates inline documents.
  constructor(private readonly loadSketch?: SketchLoader) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const inline = params["document"];
    const sketchId = params["image_document_id"] as string | undefined;

    let document = inline;
    // An inline document carries no stored canvas settings, so the caller
    // supplies them; the image_document_id path overwrites these from the row.
    let meta: {
      width?: number;
      height?: number;
      backgroundColor?: string;
    } = {
      width: numberParam(params["width"]),
      height: numberParam(params["height"]),
      backgroundColor:
        typeof params["background_color"] === "string"
          ? (params["background_color"] as string)
          : undefined
    };
    let name: string | undefined;

    if (document === undefined && sketchId) {
      if (!this.loadSketch) {
        return {
          error:
            "Cannot load a saved sketch in this process: no sketch loader is available. Pass the document inline as `document`, or call this tool from a server-side context.",
          validated: false
        };
      }
      const record = await this.loadSketch(context, sketchId);
      if (!record) {
        return {
          error: `Sketch ${sketchId} was not found.`,
          validated: false
        };
      }
      document = parseStoredDocument(record.document);
      meta = {
        width: record.width,
        height: record.height,
        backgroundColor: record.backgroundColor
      };
      name = record.name;
    }

    if (document === undefined || document === null) {
      return {
        error:
          "No sketch to validate — pass an inline `document` ({sketch, layerBindings}) or a valid `image_document_id`."
      };
    }

    const validation = validateSketchDocument(document, meta);
    return {
      ...validation,
      ...(sketchId ? { image_document_id: sketchId } : {}),
      ...(name ? { name } : {}),
      summary: issueSummary(validation)
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return params["image_document_id"]
      ? `Validating sketch ${params["image_document_id"]}`
      : "Validating sketch document";
  }
}

export interface PlanWorkflowGraphToolOptions {
  provider: BaseProvider;
  model: string;
  registry: NodeRegistry;
  /** Configured providers by id — enables the planner's `find_model` tool. */
  providers?: Record<string, BaseProvider>;
  /**
   * Forwards planner progress events (planning_update, tool_call_update,
   * chunk) to the client. Events arrive tagged with `parent_tool_call_id`
   * so the UI can nest them under this tool's call card.
   */
  forwardMessage?: (msg: ProcessingMessage) => Promise<void> | void;
  /**
   * Resolves the abort signal for the *current* chat turn. Read lazily on each
   * call: the tool outlives a single turn, and each turn installs a fresh
   * controller, so a captured signal would go stale after the first Stop.
   */
  signal?: () => AbortSignal | undefined;
}

export class PlanWorkflowGraphTool extends Tool {
  readonly name = "plan_workflow_graph";
  readonly needsToolCallId = true;
  readonly description =
    "Build a complete workflow graph ({nodes, edges}) from a natural-language " +
    "objective using the backend GraphPlanner: it searches the node registry, " +
    "inspects node metadata, and wires a validated DAG node-by-node. Returns " +
    "the graph without saving or running it — pass the result to " +
    "`create_workflow` to save, then `run_workflow` to execute.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      objective: {
        type: "string" as const,
        description:
          "Natural-language description of what the workflow should do."
      },
      inputs: {
        type: "object" as const,
        description:
          "Runtime parameters the workflow should accept, keyed by input " +
          "name with example values. Each becomes an input node in the graph."
      }
    },
    required: ["objective"]
  };

  constructor(private readonly opts: PlanWorkflowGraphToolOptions) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const objective =
      typeof params["objective"] === "string" ? params["objective"].trim() : "";
    if (!objective) {
      return {
        error: "`objective` is required and must be a non-empty string."
      };
    }
    const parentToolCallId =
      typeof params[TOOL_CALL_ID_FIELD] === "string"
        ? (params[TOOL_CALL_ID_FIELD] as string)
        : null;

    const signal = this.opts.signal?.();
    if (signal?.aborted) {
      return { error: "Graph planning was cancelled." };
    }

    const planner = new GraphPlanner({
      provider: this.opts.provider,
      model: this.opts.model,
      registry: this.opts.registry,
      tools: [],
      inputs: (params["inputs"] as Record<string, unknown>) ?? {},
      providers: this.opts.providers,
      signal
    });

    // The planner is not a CodeAct loop, but it IS a sub-agent in the core's
    // sense — an async generator of ProcessingMessages with a settled return
    // value — so the shared stream pipe drives it: tagging for UI nesting,
    // forward-failure tolerance, and the between-rounds abort check (the
    // planner's own abort stops its LLM loop, but a tool call already in
    // flight still resolves — stop driving the generator so a Stop ends the
    // turn promptly instead of after the current round).
    const { aborted, value: graph } = await forwardSubAgentStream(
      planner.plan(objective, context),
      {
        forward: this.opts.forwardMessage,
        parentToolCallId,
        signal,
        label: this.name
      }
    );
    if (aborted) {
      return { error: "Graph planning was cancelled." };
    }
    if (!graph) {
      return {
        error:
          "GraphPlanner failed to build a graph after multiple attempts. " +
          "Refine the objective (name concrete inputs/outputs) and retry."
      };
    }

    return {
      graph,
      node_count: graph.nodes.length,
      edge_count: graph.edges.length
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const objective =
      typeof params["objective"] === "string"
        ? params["objective"].slice(0, 80)
        : "workflow";
    return `Planning workflow graph: ${objective}`;
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

  const asTool = (entry: { spec: CapabilitySpec; impl: CapabilityImpl }): Tool =>
    toolFromCapability(entry.spec, entry.impl, workflowRun);

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
