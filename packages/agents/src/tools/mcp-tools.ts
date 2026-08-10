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
  ACTIVE_MODEL_CONTEXT_KEY,
  listOfflineModelIds,
  listRegisteredProviderIds,
  type ActiveModelSelection
} from "@nodetool-ai/runtime";
import type { NodeMetadata, NodeRegistry } from "@nodetool-ai/node-sdk";
import { validateTimelineSequence } from "@nodetool-ai/execution/timeline-debug";
import { validateSketchDocument } from "@nodetool-ai/execution/sketch-debug";
import { runApplicationDebug } from "@nodetool-ai/execution/service";
import type { AppDebugRequest } from "@nodetool-ai/execution/service";
import { Asset, Job, Workflow } from "@nodetool-ai/models";
import {
  runApplicationBuild,
  type AppBuildRequest
} from "../app-build/build-service.js";
import { Tool } from "./base-tool.js";
import { LocalListNodesTool } from "./local-list-nodes-tool.js";
import { LocalSearchNodesTool } from "./local-search-nodes-tool.js";
import { LocalGetNodeInfoTool } from "./local-get-node-info-tool.js";
import { FindModelTool } from "./find-model-tool.js";
import { ListModelsTool } from "./list-models-tool.js";
import {
  GenerateImageTool,
  EditImageTool,
  GenerateVideoTool,
  AnimateImageTool,
  GenerateSpeechTool,
  TranscribeAudioTool,
  EmbedTextTool
} from "./media-tools.js";
import { SaveAssetTool, ReadAssetTool } from "./asset-tools.js";
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
  createCapabilityRun,
  toolFromCapability,
  type CapabilityGate,
  type CapabilityRun
} from "../capabilities/index.js";
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
import {
  RUNTIME_MODEL_CATALOGS,
  jobRecord,
  noRegistryError,
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

/**
 * The gate a directly-constructed tool carries. These classes are gated from
 * the outside — `gateTools` wraps them per turn, exactly as before — and the
 * adapter calls the implementation without consulting the run's own gate, so
 * this exists only to satisfy the run's shape. `auto` keeps the two paths
 * equivalent if anything ever reaches `invoke` through one of them.
 */
const UNGATED: CapabilityGate = {
  mode: "auto",
  sessionAllow: new Set<string>(),
  requestApproval: async () => "allow"
};

/** What a host injects into the workflow capabilities. */
interface WorkflowCapabilityDeps {
  registry?: NodeRegistry;
  examples?: ExampleWorkflowCatalog;
  exportDsl?: WorkflowDslExporter;
  workflowEnvironment?: WorkflowEnvironmentProvider;
  modelCatalogs?: ModelCatalogs;
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
    modelCatalogs: deps.modelCatalogs
  });
}

/**
 * An asset row as the tools report it. Deliberately metadata only: the signed
 * download URLs on the HTTP response come from the server's storage adapter,
 * and an agent that wants the bytes calls `read_asset`.
 */
function assetRecord(asset: Asset): Record<string, unknown> {
  const ext = asset.fileExtension;
  return {
    id: asset.id,
    user_id: asset.user_id,
    workflow_id: asset.workflow_id ?? null,
    parent_id: asset.parent_id ?? null,
    name: asset.name,
    content_type: asset.content_type,
    // The canonical reference an agent can paste into a workflow property or
    // pass to media tools.
    uri: ext ? `asset://${asset.id}.${ext}` : `asset://${asset.id}`,
    size: asset.size ?? null,
    duration: asset.duration ?? null,
    created_at: asset.created_at,
    metadata: asset.metadata ?? null
  };
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

export class BuildAppTool extends Tool {
  readonly name = "build_app";
  readonly description =
    "Build a mini app from one sentence of intent and return the build " +
    "report: the pinned spec, what each stage did, the issues repair rounds " +
    "fixed, the simulated run of every interaction, a pass/fail verdict, and " +
    "— only behind a passing verdict — the ApplicationBundle. The bundle is " +
    "offered, not installed: show the user the verdict and install it with " +
    "POST /api/applications/import-bundle once they agree. The build's own " +
    "model calls default to the provider and model YOU are running on — omit " +
    "provider/model to inherit them; pass both only to build with a " +
    "different model. A build takes " +
    "minutes; pass poll=true to get a session id back immediately, then read " +
    "GET /api/debug/sessions/<id> until it settles or cancel it with POST " +
    "/api/debug/sessions/<id>/cancel.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      prompt: {
        type: "string" as const,
        description: "What the app should do, in the user's own terms"
      },
      spec: {
        type: "object" as const,
        description:
          "A pinned BuildSpec to build instead of writing one from the prompt"
      },
      provider: {
        type: "string" as const,
        description:
          "Provider id for the build's own model calls. Defaults to the " +
          "provider of the agent making this call."
      },
      model: {
        type: "string" as const,
        description:
          "Model id the build authors with. Defaults to the model of the " +
          "agent making this call."
      },
      workflow_ids: {
        type: "array" as const,
        items: { type: "string" as const },
        description:
          "Existing workflow ids to pin, in the spec's operation order — " +
          "these are bound instead of planned"
      },
      max_repairs: {
        type: "number" as const,
        description: "Repair rounds allowed after the first pass (default 3)"
      },
      cost_cap_usd: {
        type: "number" as const,
        description: "Ceiling on what the build may spend (default 2)"
      },
      timeout_ms: {
        type: "number" as const,
        description: "Wall clock for the whole build (default 600000)"
      },
      poll: {
        type: "boolean" as const,
        description:
          "Return a session id as soon as the build starts instead of " +
          "waiting for it (default false)"
      }
    },
    required: []
  };

  constructor(private readonly registry?: NodeRegistry) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.registry) return noRegistryError("build an app");
    const inherited = context.get<ActiveModelSelection | undefined>(
      ACTIVE_MODEL_CONTEXT_KEY
    );
    const body = { ...params } as AppBuildRequest;
    if (inherited) {
      body.provider ??= inherited.provider;
      body.model ??= inherited.model;
    }
    try {
      return await runApplicationBuild(userIdOf(context), body, this.registry);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const prompt = params["prompt"];
    return typeof prompt === "string" && prompt.trim()
      ? `Building an app: ${prompt}`
      : "Building an app from the given spec";
  }
}

export class DebugAppTool extends Tool {
  readonly name = "debug_app";
  readonly description =
    "Debug a mini APP (not a workflow): validate every widget binding, " +
    "simulate the app the way the web runtime does, execute its operations " +
    "on the kernel, and return each widget's final state plus a pass/fail " +
    "verdict with the issues behind it. Pass `application_id` for a saved " +
    "app or `document` for an unsaved one — exactly one of them. With " +
    "run=false this is a static wiring check that runs in milliseconds and " +
    "costs nothing; use it after every wiring change. A full run executes " +
    "the real workflows and spends real money, so run it to confirm the app " +
    "works, not to explore. Use `interact` to script the user actions to " +
    "simulate. A long run takes minutes; pass poll=true to get a session id " +
    "back immediately, then read GET /api/debug/sessions/<id> until it " +
    "settles.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      application_id: {
        type: "string" as const,
        description:
          "The ID of a saved application to debug. Give this or `document`, not both."
      },
      document: {
        type: "object" as const,
        description:
          "An application document to debug inline, for an app that is not " +
          "saved (or whose draft differs from the saved row). Give this or " +
          "`application_id`, not both."
      },
      params: {
        type: "object" as const,
        description: "Input values keyed by input name, seeded before the run"
      },
      interact: {
        type: "array" as const,
        items: { type: "object" as const },
        description:
          "User actions to simulate, in order. Each step is one of " +
          "{set: {key, value, operationId?}}, {click: <widget>}, " +
          "{change: {…}}, {run: <operationId>}, {cancel: <operationId>}, " +
          "{seedResource: {id, items}}. Widgets are named by component id, " +
          "by a type only one widget has, or by a unique label. Omit this " +
          "to click the app's natural run trigger."
      },
      run: {
        type: "boolean" as const,
        description:
          "Execute the app's operations (default true). false checks the " +
          "wiring only — free and instant."
      },
      timeout_ms: {
        type: "number" as const,
        description: "Wall clock for the whole debug run"
      },
      poll: {
        type: "boolean" as const,
        description:
          "Return a session id as soon as the run starts instead of waiting " +
          "for it (default false)"
      }
    },
    required: []
  };

  constructor(private readonly registry?: NodeRegistry) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.registry) return noRegistryError("debug an app");
    try {
      return await runApplicationDebug(
        userIdOf(context),
        params as AppDebugRequest,
        this.registry
      );
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const target = params["application_id"];
    const label =
      typeof target === "string" && target.trim() ? ` ${target}` : " draft";
    return params["run"] === false
      ? `Checking app${label} wiring`
      : `Debugging app${label}`;
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

export class ListJobsTool extends Tool {
  readonly name = "list_jobs";
  readonly description =
    "List jobs (workflow executions) with optional filtering.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      workflow_id: {
        type: "string" as const,
        description: "Optional workflow ID to filter by"
      },
      limit: {
        type: "number" as const,
        description: "Maximum number of jobs to return",
        default: 100
      }
    },
    required: [] as string[]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const workflowId = params["workflow_id"];
    const [jobs, next] = await Job.paginate(userIdOf(context), {
      limit: Number(params["limit"] ?? 100),
      ...(typeof workflowId === "string" && workflowId ? { workflowId } : {})
    });
    return { jobs: jobs.map(jobRecord), next: next || null };
  }

  userMessage(params: Record<string, unknown>): string {
    const wfId = params["workflow_id"];
    return wfId ? `Listing jobs for workflow ${wfId}` : "Listing jobs";
  }
}

export class GetJobTool extends Tool {
  readonly name = "get_job";
  readonly description =
    "Get details about a specific job including status, timing, and error info.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      job_id: {
        type: "string" as const,
        description: "The job ID"
      }
    },
    required: ["job_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const jobId = String(params["job_id"]);
    const job = await Job.find(userIdOf(context), jobId);
    if (!job) return { error: `Job ${jobId} was not found.` };
    return { ...jobRecord(job), params: job.params ?? null };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Getting job ${params["job_id"]}`;
  }
}

export class GetJobLogsTool extends Tool {
  readonly name = "get_job_logs";
  readonly description = "Get logs for a job to debug workflow executions.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      job_id: {
        type: "string" as const,
        description: "The job ID"
      },
      limit: {
        type: "number" as const,
        description: "Maximum number of log entries to return",
        default: 200
      }
    },
    required: ["job_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const jobId = String(params["job_id"]);
    const job = await Job.find(userIdOf(context), jobId);
    if (!job) return { error: `Job ${jobId} was not found.` };
    // `limit` keeps the most recent entries — the tail is what explains a
    // failure. Previously it was forwarded to an endpoint that ignored it.
    const limit = Number(params["limit"] ?? 200);
    const logs = job.logs ?? [];
    return {
      job_id: job.id,
      status: job.status,
      error: job.error_message ?? job.error ?? null,
      total_logs: logs.length,
      logs: logs.slice(Math.max(0, logs.length - limit))
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Getting logs for job ${params["job_id"]}`;
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

export class ListAssetsTool extends Tool {
  readonly name = "list_assets";
  readonly description =
    "List or search assets with flexible filtering options.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      source: {
        type: "string" as const,
        enum: ["user", "package"],
        default: "user"
      },
      query: {
        type: "string" as const,
        description: "Search query for asset names (min 2 chars)"
      },
      content_type: {
        type: "string" as const,
        description:
          "Filter by content type (image, video, audio, text, folder)"
      },
      limit: {
        type: "number" as const,
        description: "Maximum number of assets to return",
        default: 100
      }
    },
    required: [] as string[]
  };

  constructor(private readonly listPackageAssets?: PackageAssetLister) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const source = String(params["source"] ?? "user");
    const query = params["query"] as string | undefined;
    const contentType = params["content_type"] as string | undefined;
    const limit = Number(params["limit"] ?? 100);
    const userId = userIdOf(context);

    // Package assets are files shipped with a node package, not database rows;
    // they stay on the REST route that serves them.
    if (source === "package") {
      // Package assets are files inside the installed node packages, served
      // by the server from its own install — there is no row to read.
      return this.listPackageAssets
        ? { assets: await this.listPackageAssets({ limit }), next: null }
        : {
            error:
              "Package assets are not available in this process — they are " +
              "read from the installed node packages by the server."
          };
    }

    if (query) {
      const [assets, next] = await Asset.searchAssetsGlobal(userId, query, {
        ...(contentType ? { contentType } : {}),
        limit
      });
      return { assets: assets.map(assetRecord), next: next || null };
    }

    const [assets, next] = await Asset.paginate(userId, {
      ...(contentType ? { contentType } : {}),
      limit
    });
    return { assets: assets.map(assetRecord), next: next || null };
  }

  userMessage(params: Record<string, unknown>): string {
    const query = params["query"];
    return query ? `Searching assets for '${query}'` : "Listing assets";
  }
}

export class GetAssetTool extends Tool {
  readonly name = "get_asset";
  readonly description = "Get detailed information about a specific asset.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      asset_id: {
        type: "string" as const,
        description: "The ID of the asset"
      }
    },
    required: ["asset_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const assetId = String(params["asset_id"]);
    const asset = await Asset.find(userIdOf(context), assetId);
    return asset
      ? assetRecord(asset)
      : { error: `Asset ${assetId} was not found.` };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Getting asset ${params["asset_id"]}`;
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
      workflowEnvironment: options.workflowEnvironment
    });

  const tools: Tool[] = [
    ...WORKFLOW_CAPABILITIES.map((entry) =>
      toolFromCapability(entry.spec, entry.impl, workflowRun)
    ),
    new BuildAppTool(options.registry),
    new DebugAppTool(options.registry),
    new ListJobsTool(),
    new GetJobTool(),
    new GetJobLogsTool(),
    new ListAssetsTool(options.listPackageAssets),
    new GetAssetTool(),
    // Asset persistence — used by the agent to surface artifacts (text
    // reports, images, audio) into the chat. Media-generation tools save
    // their outputs as assets automatically; use save_asset for anything
    // else worth keeping.
    new SaveAssetTool(),
    new ReadAssetTool()
  ];

  // Node discovery reads the registry directly; there is no registry-free
  // variant, because the only other way to answer was an HTTP call to a server
  // that may not be running.
  if (options.registry) {
    tools.push(
      new LocalListNodesTool(options.registry),
      new LocalSearchNodesTool(options.registry),
      new LocalGetNodeInfoTool(options.registry)
    );
  }
  tools.push(...createWorkflowDocumentTools(options.registry));

  if (options.providers && Object.keys(options.providers).length > 0) {
    tools.push(
      new FindModelTool(options.providers),
      new ListModelsTool(options.providers),
      new GenerateImageTool(),
      new EditImageTool(),
      new GenerateVideoTool(),
      new AnimateImageTool(),
      new GenerateSpeechTool(),
      new TranscribeAudioTool(),
      new EmbedTextTool()
    );
  }

  return tools;
}
