/**
 * Workflows router — migrated from REST `/api/workflows*`.
 *
 * Retained on REST (file downloads):
 *   - GET  /api/workflows/:id/dsl-export   (text/plain file download)
 *   - POST /api/workflows/:id/gradio-export (501 stub, kept for API compat)
 *
 * Everything else is served via tRPC:
 *   - list, names, get, create, update, delete
 *   - run, autosave
 *   - tools, examples (list + search)
 *   - public (list + get) — publicProcedure (no auth required)
 *   - app (metadata for workflow app page)
 *   - generateName
 *   - versions (list, create, get, restore, delete)
 *
 * Auth note:
 *   - `public.*` endpoints use publicProcedure — no auth required, matches
 *     the legacy behaviour (public workflows are browsable without login).
 *   - All other endpoints use protectedProcedure.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import nodePath from "node:path";
import { withCacheBuster } from "../../lib/example-thumbnail.js";
import { graphsEquivalent } from "../../lib/graph-equivalence.js";
import {
  Workflow,
  WorkflowVersion,
  Job
} from "@nodetool-ai/models";
import type {
  Workflow as WorkflowModel,
  WorkflowVersion as WorkflowVersionModel
} from "@nodetool-ai/models";
import { PythonNodeExecutor } from "@nodetool-ai/runtime";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import {
  resolveWorkflowWorkspace,
  buildWorkspaceExecutionContext
} from "../../lib/workflow-workspace.js";
import type { GraphData, NodeDescriptor } from "@nodetool-ai/protocol";
import {
  hydrateGraphNodeFlags,
  loadPythonPackageMetadata
} from "@nodetool-ai/node-sdk";
import { createLogger } from "@nodetool-ai/config";
import {
  loadExampleGraph,
  defaultExamplePackageName,
  deriveExampleAssetsDir
} from "../../example-workflows.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router, publicProcedure } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listInput,
  listOutput,
  namesOutput,
  getInput,
  createInput,
  updateInput,
  deleteInput,
  deleteOutput,
  runInput,
  runOutput,
  autosaveInput,
  autosaveOutput,
  toolsInput,
  toolsOutput,
  examplesInput,
  examplesOutput,
  publicListInput,
  publicListOutput,
  publicGetInput,
  appInput,
  appOutput,
  generateNameInput,
  generateNameOutput,
  versionsListInput,
  versionsListOutput,
  versionCreateInput,
  versionGetInput,
  versionResponse,
  versionRestoreInput,
  versionDeleteInput,
  versionDeleteOutput,
  terminalOutputsInput,
  terminalOutputsOutput,
  workflowResponse,
  graph as graphSchema,
  type WorkflowResponse,
  type VersionResponse
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

const log = createLogger("nodetool.websocket.trpc.workflows");

/**
 * Validate a workflow graph against the wire schema. Returns the graph if it
 * passes, or null if invalid — so list endpoints can still return the rest of
 * the workflow row instead of failing the entire response.
 */
function summarizeGraphIssues(
  issues: ReadonlyArray<{
    readonly code: string;
    readonly path: ReadonlyArray<PropertyKey>;
    readonly message: string;
  }>
): string {
  const [first] = issues;
  if (!first) {
    return "unknown validation error";
  }

  const path =
    first.path.length > 0
      ? first.path.map((segment) => String(segment)).join(".")
      : "<root>";
  const suffix = issues.length > 1 ? ` (+${issues.length - 1} more)` : "";
  return `${path}: ${first.message}${suffix}`;
}

function safeGraph(
  workflowId: string,
  raw: unknown
): WorkflowResponse["graph"] {
  if (raw == null) return null;
  const parsed = graphSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  log.warn(
    `Workflow ${workflowId} has an invalid graph; returning null: ${summarizeGraphIssues(parsed.error.issues)}`
  );
  return null;
}

const OUTPUT_NODE_MEDIA_TYPES: Record<string, "image" | "video" | "audio"> = {
  "nodetool.output.ImageOutput": "image",
  "nodetool.output.VideoOutput": "video",
  "nodetool.output.AudioOutput": "audio"
};

function findTerminalMediaOutputNodes(
  workflow: WorkflowModel
): Array<{ id: string; type: string; data?: Record<string, unknown> }> {
  const graph = safeGraph(workflow.id, workflow.graph);
  const nodes = (graph?.nodes ?? []) as Array<{
    id: string;
    type: string;
    data?: Record<string, unknown>;
  }>;
  const edges = (graph?.edges ?? []) as Array<{ source?: string }>;
  const terminalOutputNodeIds = new Set(
    nodes
      .filter((n) => n.type in OUTPUT_NODE_MEDIA_TYPES)
      .map((n) => n.id)
  );
  for (const edge of edges) {
    const sourceId = edge.source;
    if (sourceId && terminalOutputNodeIds.has(sourceId)) {
      terminalOutputNodeIds.delete(sourceId);
    }
  }
  return nodes.filter((n) => terminalOutputNodeIds.has(n.id));
}

function hasTerminalMediaOutput(workflow: WorkflowModel): boolean {
  return findTerminalMediaOutputNodes(workflow).length > 0;
}

// ── Rate-limit tracking for autosave ───────────────────────────────────────
const lastAutosaveTime = new Map<string, number>();
const AUTOSAVE_RATE_LIMIT_MS = 30_000;

// ── toWorkflowResponse ─────────────────────────────────────────────────────

function toWorkflowResponse(workflow: WorkflowModel): WorkflowResponse {
  return {
    id: workflow.id,
    access: workflow.access,
    created_at: (workflow.created_at as string | undefined) ?? null,
    updated_at: (workflow.updated_at as string | undefined) ?? null,
    name: workflow.name,
    tool_name: workflow.tool_name ?? null,
    description: workflow.description ?? null,
    tags: workflow.tags ?? [],
    thumbnail: workflow.thumbnail ?? null,
    thumbnail_url: workflow.thumbnail_url ?? null,
    graph: safeGraph(workflow.id, workflow.graph),
    input_schema: null,
    output_schema: null,
    settings:
      (workflow.settings as WorkflowResponse["settings"] | null) ?? null,
    package_name: workflow.package_name ?? null,
    path: workflow.path ?? null,
    run_mode: workflow.run_mode ?? null,
    workspace_id: workflow.workspace_id ?? null,
    required_providers: null,
    required_models: null,
    html_app: workflow.html_app ?? null,
    etag: workflow.getEtag() ?? null
  };
}

// ── toVersionResponse ──────────────────────────────────────────────────────

function toVersionResponse(v: WorkflowVersionModel): VersionResponse {
  return {
    id: v.id,
    workflow_id: v.workflow_id,
    user_id: v.user_id,
    name: (v.name as string | null) ?? null,
    description: (v.description as string | null) ?? null,
    graph: v.graph ?? null,
    version: v.version,
    save_type: (v.save_type as string | null) ?? "manual",
    autosave_metadata: (v.autosave_metadata as unknown) ?? null,
    created_at: (v.created_at as string | undefined) ?? null
  };
}

// ── Example workflow helpers ────────────────────────────────────────────────

const EXAMPLES_THUMBNAILS_PREFIX = "/api/workflows/examples/thumbnails/";

interface ExampleMetadata {
  id?: string;
  name: string;
  description?: string;
  tags?: string[];
}

function buildExamplesFromDir(
  examplesDir: string,
  examplesAssetsFallbackDir?: string
): unknown[] {
  if (!existsSync(examplesDir)) return [];
  const assetsDir = deriveExampleAssetsDir(
    examplesDir,
    examplesAssetsFallbackDir
  );
  const now = new Date().toISOString();
  const workflows: unknown[] = [];
  let files: string[];
  try {
    files = readdirSync(examplesDir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
  for (const file of files) {
    try {
      const raw = readFileSync(nodePath.join(examplesDir, file), "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const name =
        typeof parsed.name === "string"
          ? parsed.name
          : file.replace(/\.json$/i, "");
      // Append ?v=<md5-8> via withCacheBuster so the browser invalidates
      // its cached thumbnail whenever the JPG is regenerated on disk.
      const jpgFile = `${name}.jpg`;
      const jpgPath = nodePath.join(assetsDir, jpgFile);
      const thumbnailUrl = existsSync(jpgPath)
        ? withCacheBuster(
            `${EXAMPLES_THUMBNAILS_PREFIX}${encodeURIComponent(jpgFile)}`,
            jpgPath
          )
        : null;
      workflows.push({
        id: file,
        access: "public",
        created_at: now,
        updated_at: now,
        name,
        tool_name: null,
        description:
          typeof parsed.description === "string" ? parsed.description : "",
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.filter((t: unknown) => typeof t === "string")
          : [],
        thumbnail: thumbnailUrl ? jpgFile : null,
        thumbnail_url: thumbnailUrl,
        graph: { nodes: [], edges: [] },
        input_schema: null,
        output_schema: null,
        settings: null,
        package_name:
          typeof parsed.package_name === "string" ? parsed.package_name : null,
        path: null,
        run_mode: null,
        workspace_id: null,
        required_providers: null,
        required_models: null,
        html_app: null,
        etag: null
      });
    } catch {
      // skip invalid files
    }
  }
  return workflows;
}

function buildExampleWorkflows(
  apiOptions: {
    examplesDir?: string;
    examplesAssetsFallbackDir?: string;
    metadataRoots?: string[];
    metadataMaxDepth?: number;
  }
): unknown[] {
  if (apiOptions.examplesDir) {
    return buildExamplesFromDir(
      apiOptions.examplesDir,
      apiOptions.examplesAssetsFallbackDir
    );
  }
  const loaded = loadPythonPackageMetadata({
    roots: apiOptions.metadataRoots,
    maxDepth: apiOptions.metadataMaxDepth
  });
  const now = new Date().toISOString();
  const workflows: unknown[] = [];
  for (const pkg of loaded.packages) {
    if (!pkg.examples || pkg.examples.length === 0) continue;
    for (const ex of pkg.examples) {
      const meta = ex as ExampleMetadata;
      workflows.push({
        id: meta.id ?? "",
        access: "public",
        created_at: now,
        updated_at: now,
        name: meta.name,
        tool_name: null,
        description: meta.description ?? "",
        tags: meta.tags ?? [],
        thumbnail: null,
        thumbnail_url: null,
        graph: { nodes: [], edges: [] },
        input_schema: null,
        output_schema: null,
        settings: null,
        package_name: pkg.name,
        path: null,
        run_mode: null,
        workspace_id: null,
        required_providers: null,
        required_models: null,
        html_app: null,
        etag: null
      });
    }
  }
  return workflows;
}


// ── deriveWorkflowName ─────────────────────────────────────────────────────

function deriveWorkflowName(workflow: WorkflowModel): string {
  const graph = workflow.graph as { nodes?: Array<{ type?: unknown }> } | null;
  const nodes: Array<{ type?: unknown }> = graph?.nodes ?? [];
  if (nodes.length === 0) {
    return workflow.name || "Untitled Workflow";
  }
  const categories = new Set<string>();
  for (const n of nodes) {
    if (typeof n.type === "string") {
      const parts = n.type.split(".");
      if (parts.length >= 2 && parts[1]) {
        categories.add(parts[1]);
      }
    }
  }
  const segments = Array.from(categories).slice(0, 3);
  if (segments.length === 0) {
    return workflow.name || "Untitled Workflow";
  }
  const label = segments
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" + ");
  return `${label} Workflow`;
}

// ── Router ─────────────────────────────────────────────────────────────────

export const workflowsRouter = router({
  // ── list (GET /api/workflows) ─────────────────────────────────────────────
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      const [workflows, cursor] = await Workflow.paginate(ctx.userId, {
        limit: input.limit,
        runMode: input.run_mode,
        tag: input.tag
      });
      let filtered = workflows;
      if (input.mediaOutput) {
        filtered = filtered.filter((w) => hasTerminalMediaOutput(w));
      }
      return {
        workflows: filtered.map((w) => toWorkflowResponse(w)),
        // mediaOutput filtering happens in memory after DB pagination, so cursor
        // pagination is intentionally disabled for this mode.
        next: input.mediaOutput ? null : cursor || null
      };
    }),

  // ── names (GET /api/workflows/names) ─────────────────────────────────────
  names: protectedProcedure
    .output(namesOutput)
    .query(async ({ ctx }) => {
      const [workflows] = await Workflow.paginate(ctx.userId, { limit: 1000 });
      const names: Record<string, string> = {};
      for (const wf of workflows) names[wf.id] = wf.name;
      return names;
    }),

  // ── get (GET /api/workflows/:id) ─────────────────────────────────────────
  get: protectedProcedure
    .input(getInput)
    .output(workflowResponse)
    .query(async ({ ctx, input }) => {
      const workflow = (await Workflow.get(input.id)) as WorkflowModel | null;
      if (!workflow) throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
      if (workflow.access !== "public" && workflow.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
      }
      return toWorkflowResponse(workflow);
    }),

  // ── create (POST /api/workflows) ─────────────────────────────────────────
  create: protectedProcedure
    .input(createInput)
    .output(workflowResponse)
    .mutation(async ({ ctx, input }) => {
      if (!input.graph || !Array.isArray(input.graph.nodes) || !Array.isArray(input.graph.edges)) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "graph is required and must have nodes and edges arrays");
      }
      let graph = input.graph;

      // Optionally seed from example
      if (input.from_example_name && (!graph || graph.nodes?.length === 0)) {
        const examplePackage =
          input.from_example_package ??
          defaultExamplePackageName(ctx.apiOptions) ??
          "nodetool-base";
        const example = loadExampleGraph(
          examplePackage,
          input.from_example_name,
          ctx.apiOptions
        );
        if (example?.graph) {
          graph = example.graph as typeof graph;
        }
      }

      const workflow = (await Workflow.create({
        user_id: ctx.userId,
        name: input.name,
        tool_name: input.tool_name ?? null,
        package_name: input.package_name ?? null,
        path: input.path ?? null,
        tags: input.tags ?? [],
        description: input.description ?? "",
        thumbnail: input.thumbnail ?? null,
        thumbnail_url: input.thumbnail_url ?? null,
        access: input.access === "public" ? "public" : "private",
        graph,
        settings: input.settings ?? null,
        run_mode: input.run_mode ?? "workflow",
        workspace_id: input.workspace_id ?? null,
        html_app: input.html_app ?? null
      })) as WorkflowModel;

      return toWorkflowResponse(workflow);
    }),

  // ── update (PUT /api/workflows/:id) ──────────────────────────────────────
  update: protectedProcedure
    .input(updateInput)
    .output(workflowResponse)
    .mutation(async ({ ctx, input }) => {
      if (!input.graph || !Array.isArray(input.graph.nodes) || !Array.isArray(input.graph.edges)) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "graph is required and must have nodes and edges arrays");
      }
      const graph = input.graph;
      const existing = (await Workflow.get(input.id)) as WorkflowModel | null;

      if (existing && existing.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
      }

      if (existing) {
        existing.name = input.name;
        existing.tool_name = input.tool_name ?? null;
        existing.description = input.description ?? "";
        existing.tags = input.tags ?? [];
        existing.package_name = input.package_name ?? null;
        if (input.thumbnail !== undefined) existing.thumbnail = input.thumbnail;
        existing.access = input.access === "public" ? "public" : "private";
        existing.graph = graph;
        existing.settings = input.settings ?? null;
        if (input.run_mode !== undefined && input.run_mode !== null)
          existing.run_mode = input.run_mode;
        existing.workspace_id = input.workspace_id ?? null;
        existing.html_app = input.html_app ?? null;
        await existing.save();
        return toWorkflowResponse(existing);
      }

      // Upsert: create if doesn't exist
      const workflow = (await Workflow.create({
        id: input.id,
        user_id: ctx.userId,
        name: input.name,
        tool_name: input.tool_name ?? null,
        package_name: input.package_name ?? null,
        path: input.path ?? null,
        tags: input.tags ?? [],
        description: input.description ?? "",
        thumbnail: input.thumbnail ?? null,
        thumbnail_url: input.thumbnail_url ?? null,
        access: input.access === "public" ? "public" : "private",
        graph,
        settings: input.settings ?? null,
        run_mode: input.run_mode ?? "workflow",
        workspace_id: input.workspace_id ?? null,
        html_app: input.html_app ?? null
      })) as WorkflowModel;

      return toWorkflowResponse(workflow);
    }),

  // ── delete (DELETE /api/workflows/:id) ───────────────────────────────────
  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
    .mutation(async ({ ctx, input }) => {
      const workflow = (await Workflow.get(input.id)) as WorkflowModel | null;
      if (!workflow) throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
      if (workflow.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
      }
      await workflow.delete();
      return { ok: true as const };
    }),

  // ── run (POST /api/workflows/:id/run) ────────────────────────────────────
  run: protectedProcedure
    .input(runInput)
    .output(runOutput)
    .mutation(async ({ ctx, input }) => {
      const workflow = await Workflow.find(ctx.userId, input.id);
      if (!workflow) throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");

      const runMode = workflow.run_mode ?? "workflow";
      if (runMode !== "workflow") {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          `Workflow run mode "${runMode}" is not supported by the standalone backend`
        );
      }

      const params = input.params ?? {};
      const graph = workflow.getGraph();

      const runnableGraph: {
        nodes: Array<{ id: string; type: string; [key: string]: unknown }>;
        edges: Array<{
          id?: string | null;
          source: string;
          target: string;
          sourceHandle: string;
          targetHandle: string;
          edge_type?: "data" | "control";
          [key: string]: unknown;
        }>;
      } = {
        nodes: graph.nodes.map((node) => {
          const record = node as Record<string, unknown>;
          return {
            ...record,
            id: String(record.id ?? ""),
            type: String(record.type ?? ""),
            properties: (record.properties ?? record.data ?? {}) as Record<
              string,
              unknown
            >
          };
        }),
        edges: graph.edges.map((edge) => {
          const record = edge as Record<string, unknown>;
          return {
            ...record,
            id:
              typeof record.id === "string" || record.id == null
                ? (record.id as string | null | undefined)
                : String(record.id),
            source: String(record.source ?? ""),
            target: String(record.target ?? ""),
            sourceHandle: String(record.sourceHandle ?? ""),
            targetHandle: String(record.targetHandle ?? ""),
            edge_type: record.edge_type === "control" ? "control" : "data"
          };
        })
      };

      const registry = ctx.registry;
      const pythonBridge = ctx.pythonBridge;
      const getPythonBridgeReady = ctx.getPythonBridgeReady;

      const hasPythonNode = runnableGraph.nodes.some((node) => {
        const nodeType = typeof node.type === "string" ? node.type : "";
        return (
          nodeType !== "" &&
          Boolean(registry.getMetadata(nodeType)) &&
          !registry.has(nodeType)
        );
      });
      if (hasPythonNode) {
        if (!getPythonBridgeReady()) {
          await pythonBridge.ensureConnected();
        }
      }

      const resolveExecutor = (node: NodeDescriptor) => {
        if (registry.has(node.type)) {
          return registry.resolve(node as Parameters<typeof registry.resolve>[0]);
        }
        if (getPythonBridgeReady() && pythonBridge.hasNodeType(node.type)) {
          const meta = pythonBridge
            .getNodeMetadata()
            .find((n) => n.node_type === node.type);
          const props = (node.properties ?? {}) as Record<string, unknown>;
          return new PythonNodeExecutor(
            pythonBridge,
            node.type,
            props,
            Object.fromEntries(
              (meta?.outputs ?? []).map((o) => [o.name, o.type.type])
            ),
            meta?.required_settings ?? [],
            node.id
          );
        }
        return registry.resolve(node as Parameters<typeof registry.resolve>[0]);
      };

      const job = await Job.create({
        workflow_id: input.id,
        user_id: ctx.userId,
        status: "running",
        params,
        graph: runnableGraph
      });

      const workspaceDir = await resolveWorkflowWorkspace(input.id, ctx.userId);
      const runner = new WorkflowRunner(job.id, {
        resolveExecutor,
        executionContext: buildWorkspaceExecutionContext({
          jobId: job.id,
          workflowId: input.id,
          userId: ctx.userId,
          workspaceDir
        })
      });
      const result = await runner.run(
        { job_id: job.id, workflow_id: input.id, params },
        hydrateGraphNodeFlags(runnableGraph as unknown as GraphData, registry)
      );

      if (result.status === "completed") {
        job.markCompleted();
      } else if (result.status === "cancelled") {
        job.markCancelled();
      } else {
        job.markFailed(result.error ?? "Workflow run failed");
      }
      await job.save();

      return {
        job_id: job.id,
        workflow_id: input.id,
        status: result.status,
        outputs: result.outputs ?? null,
        error: result.error ?? null,
        message_count: result.messages.length,
        background: input.background ?? false
      };
    }),

  // ── autosave (POST/PUT /api/workflows/:id/autosave) ───────────────────────
  autosave: protectedProcedure
    .input(autosaveInput)
    .output(autosaveOutput)
    .mutation(async ({ ctx, input }) => {
      const workflow = (await Workflow.get(input.id)) as WorkflowModel | null;
      if (!workflow) throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
      if (workflow.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
      }

      const force = input.force === true;
      const maxVersions = typeof input.max_versions === "number" ? input.max_versions : 10;

      // Rate-limit
      if (!force) {
        const last = lastAutosaveTime.get(input.id);
        if (last !== undefined && Date.now() - last < AUTOSAVE_RATE_LIMIT_MS) {
          return {
            version: null,
            message: "Autosave skipped (rate limited)",
            skipped: true,
            persisted: false
          };
        }
      }

      workflow.graph = input.graph;
      if (input.name !== undefined) workflow.name = input.name;
      if (input.description !== undefined)
        workflow.description = input.description;
      if (input.access === "public" || input.access === "private")
        workflow.access = input.access;
      await workflow.save();
      lastAutosaveTime.set(input.id, Date.now());

      // Skip creating a redundant version when the graph is unchanged since the
      // latest snapshot. Interval autosave keeps firing while the client's dirty
      // flag is set, so without this it produces a stream of identical versions.
      // Forced saves (checkpoints, before-run, before-close) still snapshot.
      if (!force) {
        try {
          const [latest] = await WorkflowVersion.listForWorkflow(input.id, {
            limit: 1
          });
          if (latest && graphsEquivalent(latest.graph, input.graph)) {
            return {
              version: null,
              message: "Autosave skipped (no changes)",
              skipped: true,
              persisted: true
            };
          }
        } catch {
          // non-fatal — fall through and snapshot if the version lookup fails
        }
      }

      let version: {
        id: string;
        version: number;
        workflow_id: string;
        save_type: string;
        created_at?: string | null;
      } | null = null;

      try {
        const nextVer = await WorkflowVersion.nextVersion(input.id);
        const wv = new WorkflowVersion({
          workflow_id: input.id,
          user_id: ctx.userId,
          graph: input.graph,
          version: nextVer,
          save_type: "autosave",
          name: workflow.name,
          description: workflow.description
        });
        await wv.save();
        version = {
          id: wv.id,
          version: wv.version,
          workflow_id: wv.workflow_id,
          save_type: wv.save_type ?? "autosave",
          created_at: (wv.created_at as string | undefined) ?? null
        };
        await WorkflowVersion.pruneOldVersions(input.id, maxVersions);
      } catch {
        // non-fatal — version table may not exist
      }

      return {
        version,
        message: "Autosaved successfully",
        skipped: false,
        persisted: true
      };
    }),

  // ── tools (GET /api/workflows/tools) ─────────────────────────────────────
  tools: protectedProcedure
    .input(toolsInput)
    .output(toolsOutput)
    .query(async ({ ctx, input }) => {
      const [workflows] = await Workflow.paginateTools(ctx.userId, {
        limit: input.limit
      });
      return {
        workflows: workflows.map((w) => ({
          name: w.name,
          tool_name: w.tool_name ?? null,
          description: w.description ?? null
        })),
        next: null
      };
    }),

  // ── examples (GET /api/workflows/examples) ────────────────────────────────
  examples: protectedProcedure
    .input(examplesInput)
    .output(examplesOutput)
    .query(async ({ ctx, input }) => {
      const workflows = buildExampleWorkflows(ctx.apiOptions);
      const query = (input.query ?? "").toLowerCase().trim();
      const filtered = query
        ? workflows.filter((w) => {
            const wf = w as Record<string, unknown>;
            const name = String(wf.name ?? "").toLowerCase();
            const desc = String(wf.description ?? "").toLowerCase();
            const tags = (wf.tags as string[] | undefined) ?? [];
            return (
              name.includes(query) ||
              desc.includes(query) ||
              tags.some((t) => t.toLowerCase().includes(query))
            );
          })
        : workflows;
      return { workflows: filtered, next: null };
    }),

  // ── public workflows ──────────────────────────────────────────────────────
  public: router({
    list: publicProcedure
      .input(publicListInput)
      .output(publicListOutput)
      .query(async ({ input }) => {
        const [workflows] = await Workflow.paginatePublic({ limit: input.limit });
        return {
          workflows: workflows.map((w) => toWorkflowResponse(w)),
          next: null
        };
      }),

    get: publicProcedure
      .input(publicGetInput)
      .output(workflowResponse)
      .query(async ({ input }) => {
        const workflow = (await Workflow.get(input.id)) as WorkflowModel | null;
        if (!workflow || workflow.access !== "public") {
          throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
        }
        return toWorkflowResponse(workflow);
      })
  }),

  // ── app (GET /api/workflows/:id/app) ─────────────────────────────────────
  app: protectedProcedure
    .input(appInput)
    .output(appOutput)
    .query(async ({ ctx, input }) => {
      const baseUrl = input.baseUrl ?? ctx.apiOptions.baseUrl ?? "http://127.0.0.1:7777";
      return {
        workflow_id: input.id,
        api_url: baseUrl
      };
    }),

  // ── generateName (POST /api/workflows/:id/generate-name) ─────────────────
  generateName: protectedProcedure
    .input(generateNameInput)
    .output(generateNameOutput)
    .mutation(async ({ ctx, input }) => {
      const workflow = (await Workflow.get(input.id)) as WorkflowModel | null;
      if (!workflow) throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
      if (workflow.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
      }
      const name = deriveWorkflowName(workflow);
      return { name };
    }),

  // ── terminalOutputs (GET /api/workflows/:id/terminal-outputs) ─────────────
  // Returns the terminal media-output nodes of a workflow for the multi-output
  // selection prompt in AddClipMenu.
  terminalOutputs: protectedProcedure
    .input(terminalOutputsInput)
    .output(terminalOutputsOutput)
    .query(async ({ ctx, input }) => {
      const workflow = (await Workflow.get(input.id)) as WorkflowModel | null;
      if (!workflow) throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
      if (workflow.access !== "public" && workflow.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
      }

      const outputs = findTerminalMediaOutputNodes(workflow)
        .map((n) => ({
          id: n.id,
          type: n.type,
          mediaType: OUTPUT_NODE_MEDIA_TYPES[n.type] as "image" | "video" | "audio",
          name: (n.data?.name as string | undefined) ?? ""
        }));

      return { outputs };
    }),

  // ── versions ──────────────────────────────────────────────────────────────
  versions: router({
    // GET /api/workflows/:id/versions
    list: protectedProcedure
      .input(versionsListInput)
      .output(versionsListOutput)
      .query(async ({ ctx, input }) => {
        // Check ownership via the parent workflow
        const workflow = (await Workflow.get(input.id)) as WorkflowModel | null;
        if (!workflow || workflow.user_id !== ctx.userId) {
          throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
        }
        const versions = await WorkflowVersion.listForWorkflow(input.id, {
          limit: input.limit
        });
        return { versions: versions.map(toVersionResponse) };
      }),

    // POST /api/workflows/:id/versions
    create: protectedProcedure
      .input(versionCreateInput)
      .output(versionResponse)
      .mutation(async ({ ctx, input }) => {
        const workflow = (await Workflow.get(input.id)) as WorkflowModel | null;
        if (!workflow) throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
        if (workflow.user_id !== ctx.userId) {
          throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
        }
        const nextVer = await WorkflowVersion.nextVersion(input.id);
        const version = (await WorkflowVersion.create({
          workflow_id: input.id,
          user_id: ctx.userId,
          name: input.name ?? null,
          description: input.description ?? null,
          graph: workflow.graph,
          version: nextVer
        })) as WorkflowVersionModel;
        return toVersionResponse(version);
      }),

    // GET /api/workflows/:id/versions/:version
    get: protectedProcedure
      .input(versionGetInput)
      .output(versionResponse)
      .query(async ({ ctx, input }) => {
        const workflow = (await Workflow.get(input.id)) as WorkflowModel | null;
        if (!workflow || workflow.user_id !== ctx.userId) {
          throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
        }
        const version = await WorkflowVersion.findByVersion(
          input.id,
          input.version
        );
        if (!version) throwApiError(ApiErrorCode.NOT_FOUND, "Version not found");
        return toVersionResponse(version);
      }),

    // POST /api/workflows/:id/versions/:version/restore
    restore: protectedProcedure
      .input(versionRestoreInput)
      .output(workflowResponse)
      .mutation(async ({ ctx, input }) => {
        const workflow = (await Workflow.get(input.id)) as WorkflowModel | null;
        if (!workflow || workflow.user_id !== ctx.userId) {
          throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
        }
        const version = await WorkflowVersion.findByVersion(
          input.id,
          input.version
        );
        if (!version) throwApiError(ApiErrorCode.NOT_FOUND, "Version not found");
        workflow.graph = version.graph;
        await workflow.save();
        return toWorkflowResponse(workflow);
      }),

    // DELETE /api/workflows/:id/versions/:versionId
    delete: protectedProcedure
      .input(versionDeleteInput)
      .output(versionDeleteOutput)
      .mutation(async ({ ctx, input }) => {
        const version = (await WorkflowVersion.get(
          input.version_id
        )) as WorkflowVersionModel | null;
        if (!version) throwApiError(ApiErrorCode.NOT_FOUND, "Version not found");
        if (version.user_id !== ctx.userId) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Version not found");
        }
        await version.delete();
        return { ok: true as const };
      })
  })
});
