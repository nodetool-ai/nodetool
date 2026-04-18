import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";
import { gzipSync } from "node:zlib";
import { mkdir, writeFile, stat, readFile } from "node:fs/promises";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import nodePath from "node:path";
import { createLogger, buildAssetUrl } from "@nodetool/config";
import { workflowToDsl } from "@nodetool/dsl";
import {
  Workflow,
  WorkflowVersion,
  Job,
  Asset
} from "@nodetool/models";
import {
  loadPythonPackageMetadata,
  type NodeMetadata,
  NodeRegistry
} from "@nodetool/node-sdk";
import { registerBaseNodes } from "@nodetool/base-nodes";
import { registerElevenLabsNodes } from "@nodetool/elevenlabs-nodes";
import { registerFalNodes } from "@nodetool/fal-nodes";
import { registerKieNodes } from "@nodetool/kie-nodes";
import { registerReplicateNodes } from "@nodetool/replicate-nodes";
import {
  PythonNodeExecutor,
  PythonStdioBridge,
  type NodeExecutor
} from "@nodetool/runtime";
import { WorkflowRunner } from "@nodetool/kernel";
import { handleOpenAIRequest, type OpenAIApiOptions } from "./openai-api.js";
import { handleOAuthRequest } from "./oauth-api.js";
import {
  createStorageHandler,
  type StorageHandlerOptions
} from "./storage-api.js";
import { handleFileRequest } from "./file-api.js";

const log = createLogger("nodetool.websocket.http");

// ── Content type to file extension mapping ─────────────────────────
// Asset filename + storage-path helpers live in `./lib/asset-paths.ts` so the
// tRPC router can import them without dragging in the full http-api module
// graph. Re-exported here for any remaining REST callers.
import {
  getAssetFileName,
  getAssetStoragePath
} from "./lib/asset-paths.js";
export { getAssetFileName, getAssetStoragePath };

type JsonObject = Record<string, unknown>;

export interface HttpApiOptions {
  metadataRoots?: string[];
  metadataMaxDepth?: number;
  userIdHeader?: string;
  baseUrl?: string;
  openai?: OpenAIApiOptions;
  storage?: StorageHandlerOptions;
  /** NodeRegistry to use for unified metadata. If not provided, Python metadata is used. */
  registry?: NodeRegistry;
  /**
   * Path to a directory of example workflow JSON files (e.g.
   * `packages/base-nodes/nodetool/examples/nodetool-base`).
   * When set, `handleWorkflowExamples` reads these files directly instead of
   * relying on Python package metadata, so no Python installation is needed.
   *
   * The sibling `assets` directory is automatically derived from this path to
   * serve thumbnail images at both:
   *   - `/api/workflows/examples/thumbnails/<name>.jpg` (used by WorkflowTile)
   *   - `/api/assets/packages/<package-name>/<name>.jpg` (used by WorkflowCard)
   */
  examplesDir?: string;
}

// Lazily created storage handler — recreated if options change
let _storageHandler: ((request: Request) => Promise<Response>) | null = null;
let _storageOpts: StorageHandlerOptions | undefined;
let workflowRuntimePromise: Promise<WorkflowRuntimeEnvironment> | null = null;

function getStorageHandler(
  opts?: StorageHandlerOptions
): (request: Request) => Promise<Response> {
  if (!_storageHandler || _storageOpts !== opts) {
    _storageHandler = createStorageHandler(opts);
    _storageOpts = opts;
  }
  return _storageHandler;
}

type WorkflowRuntimeEnvironment = {
  registry: NodeRegistry;
  pythonBridge: PythonStdioBridge;
  ensurePythonBridge: () => Promise<void>;
  resolveExecutor: (node: {
    id: string;
    type: string;
    [key: string]: unknown;
  }) => NodeExecutor;
};

async function getWorkflowRuntimeEnvironment(
  options: HttpApiOptions = {}
): Promise<WorkflowRuntimeEnvironment> {
  if (!workflowRuntimePromise) {
    workflowRuntimePromise = (async () => {
      const registry = options.registry ?? new NodeRegistry();
      if (!options.registry) {
        registry.loadPythonMetadata({
          roots: options.metadataRoots,
          maxDepth: options.metadataMaxDepth ?? 8
        });
        registerBaseNodes(registry);
        registerElevenLabsNodes(registry);
        registerFalNodes(registry);
        registerKieNodes(registry);
        registerReplicateNodes(registry);
      }

      const pythonBridge = new PythonStdioBridge({
        workerArgs: process.env["NODETOOL_WORKER_NAMESPACES"]
          ? ["--namespaces", process.env["NODETOOL_WORKER_NAMESPACES"]]
          : []
      });

      let pythonBridgeReady = false;
      pythonBridge.on("exit", () => {
        pythonBridgeReady = false;
      });

      const ensurePythonBridge = async (): Promise<void> => {
        await pythonBridge.ensureConnected();
        pythonBridgeReady = true;
      };

      const resolveExecutor = (node: {
        id: string;
        type: string;
        [key: string]: unknown;
      }): NodeExecutor => {
        if (registry.has(node.type)) {
          return registry.resolve(node);
        }
        if (pythonBridgeReady && pythonBridge.hasNodeType(node.type)) {
          const meta = pythonBridge
            .getNodeMetadata()
            .find((n) => n.node_type === node.type);
          const props = (node.properties ?? node.data ?? {}) as Record<
            string,
            unknown
          >;
          return new PythonNodeExecutor(
            pythonBridge,
            node.type,
            props,
            Object.fromEntries(
              (meta?.outputs ?? []).map((o) => [o.name, o.type.type])
            ),
            meta?.required_settings ?? []
          );
        }
        if (registry.getMetadata(node.type) && !registry.has(node.type)) {
          throw new Error(
            `Python node "${node.type}" cannot execute: Python worker is not connected.`
          );
        }
        return registry.resolve(node);
      };

      return { registry, pythonBridge, ensurePythonBridge, resolveExecutor };
    })();
  }

  return workflowRuntimePromise;
}

export interface WorkflowRequestBody {
  name: string;
  tool_name?: string | null;
  package_name?: string | null;
  path?: string | null;
  tags?: string[] | null;
  description?: string | null;
  thumbnail?: string | null;
  thumbnail_url?: string | null;
  access: string;
  graph?: {
    nodes: Record<string, unknown>[];
    edges: Record<string, unknown>[];
  } | null;
  settings?: Record<string, unknown> | null;
  run_mode?: string | null;
  workspace_id?: string | null;
  html_app?: string | null;
}

// Rate-limit tracking for autosave: maps workflow_id -> last autosave timestamp (ms)
const lastAutosaveTime = new Map<string, number>();
const AUTOSAVE_RATE_LIMIT_MS = 30_000;

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, { status });
}

export function getUserId(request: Request, headerName: string): string {
  return (
    request.headers.get(headerName) ?? request.headers.get("x-user-id") ?? "1"
  );
}

async function parseJsonBody<T>(request: Request): Promise<T | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function toWorkflowResponse(workflow: Workflow): JsonObject {
  return {
    id: workflow.id,
    access: workflow.access,
    created_at: workflow.created_at,
    updated_at: workflow.updated_at,
    name: workflow.name,
    tool_name: workflow.tool_name,
    description: workflow.description,
    tags: workflow.tags,
    thumbnail: workflow.thumbnail,
    thumbnail_url: workflow.thumbnail_url,
    graph: workflow.graph,
    input_schema: null,
    output_schema: null,
    settings: workflow.settings,
    package_name: workflow.package_name,
    path: workflow.path,
    run_mode: workflow.run_mode,
    workspace_id: workflow.workspace_id,
    required_providers: null,
    required_models: null,
    html_app: workflow.html_app,
    etag: workflow.getEtag()
  };
}

export async function handleNodeMetadata(
  request: Request,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  const url = new URL(request.url);
  const nodeType = url.searchParams.get("node_type");
  const namespace = url.searchParams.get("namespace");
  const queryParam = url.searchParams.get("query");
  const fields = url.searchParams.get("fields") ?? "summary";

  let nodes: NodeMetadata[];
  if (options.registry) {
    nodes = options.registry.listMetadata();
  } else {
    const loaded = loadPythonPackageMetadata({
      roots: options.metadataRoots,
      maxDepth: options.metadataMaxDepth
    });
    nodes = [...loaded.nodesByType.values()];
  }
  nodes.sort((a, b) => a.node_type.localeCompare(b.node_type));

  // Exact node_type lookup returns the full metadata for that one node.
  if (nodeType) {
    const match = nodes.find((n) => n.node_type === nodeType);
    if (!match) return errorResponse(404, `Node type not found: ${nodeType}`);
    return jsonResponse(match);
  }

  if (namespace) {
    nodes = nodes.filter((n) => n.namespace?.startsWith(namespace));
  }

  if (queryParam) {
    const terms = queryParam
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
    if (terms.length > 0) {
      const scored = nodes.map((n) => {
        const haystack =
          `${n.title ?? ""} ${n.description ?? ""} ${n.node_type} ${n.namespace ?? ""}`.toLowerCase();
        let score = 0;
        for (const term of terms) if (haystack.includes(term)) score++;
        return { node: n, score };
      });
      nodes = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((s) => s.node);
    }
  }

  const limit = parseLimit(url, 100);
  nodes = nodes.slice(0, limit);

  // Default to slim summary to keep response size bounded. Full metadata is
  // opt-in via `fields=full` or a specific node_type lookup.
  if (fields === "full") return jsonResponse(nodes);
  return jsonResponse(
    nodes.map((n) => ({
      node_type: n.node_type,
      title: n.title,
      description: n.description,
      namespace: n.namespace
    }))
  );
}

export function parseLimit(url: URL, defaultLimit = 100): number {
  const raw = url.searchParams.get("limit");
  if (!raw) return defaultLimit;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(parsed, 500);
}

async function createWorkflow(
  body: WorkflowRequestBody,
  userId: string
): Promise<Workflow> {
  if (!body || typeof body.name !== "string") {
    throw new Error("Invalid workflow");
  }
  if (
    !body.graph ||
    !Array.isArray(body.graph.nodes) ||
    !Array.isArray(body.graph.edges)
  ) {
    throw new Error("graph is required and must have nodes and edges arrays");
  }
  const graph = body.graph;

  return (await Workflow.create({
    user_id: userId,
    name: body.name,
    tool_name: body.tool_name ?? null,
    package_name: body.package_name ?? null,
    path: body.path ?? null,
    tags: body.tags ?? [],
    description: body.description ?? "",
    thumbnail: body.thumbnail ?? null,
    thumbnail_url: body.thumbnail_url ?? null,
    access: body.access === "public" ? "public" : "private",
    graph,
    settings: body.settings ?? null,
    run_mode: body.run_mode ?? "workflow",
    workspace_id: body.workspace_id ?? null,
    html_app: body.html_app ?? null
  })) as Workflow;
}

async function updateWorkflow(
  id: string,
  body: WorkflowRequestBody,
  userId: string
): Promise<Workflow> {
  if (!body || typeof body.name !== "string") {
    throw new Error("Invalid workflow");
  }
  if (
    !body.graph ||
    !Array.isArray(body.graph.nodes) ||
    !Array.isArray(body.graph.edges)
  ) {
    throw new Error("graph is required and must have nodes and edges arrays");
  }
  const graph = body.graph;

  const existing = (await Workflow.get(id)) as Workflow | null;

  if (existing && existing.user_id !== userId) {
    throw new Error("Workflow not found");
  }

  if (existing) {
    existing.name = body.name;
    existing.tool_name = body.tool_name ?? null;
    existing.description = body.description ?? "";
    existing.tags = body.tags ?? [];
    existing.package_name = body.package_name ?? null;
    if (body.thumbnail !== undefined) existing.thumbnail = body.thumbnail;
    existing.access = body.access === "public" ? "public" : "private";
    existing.graph = graph;
    existing.settings = body.settings ?? null;
    if (body.run_mode !== undefined && body.run_mode !== null)
      existing.run_mode = body.run_mode;
    existing.workspace_id = body.workspace_id ?? null;
    existing.html_app = body.html_app ?? null;
    await existing.save();
    return existing;
  }

  // Upsert: create the workflow if it doesn't exist
  return (await Workflow.create({
    id,
    user_id: userId,
    name: body.name,
    tool_name: body.tool_name ?? null,
    package_name: body.package_name ?? null,
    path: body.path ?? null,
    tags: body.tags ?? [],
    description: body.description ?? "",
    thumbnail: body.thumbnail ?? null,
    thumbnail_url: body.thumbnail_url ?? null,
    access: body.access === "public" ? "public" : "private",
    graph: body.graph,
    settings: body.settings ?? null,
    run_mode: body.run_mode ?? "workflow",
    workspace_id: body.workspace_id ?? null,
    html_app: body.html_app ?? null
  })) as Workflow;
}

export async function handleWorkflowRun(
  request: Request,
  workflowId: string,
  options: HttpApiOptions = {}
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  const workflow = await Workflow.find(userId, workflowId);
  if (!workflow) {
    return errorResponse(404, "Workflow not found");
  }

  const runMode = workflow.run_mode ?? "workflow";
  if (runMode !== "workflow") {
    return errorResponse(
      400,
      `Workflow run mode "${runMode}" is not supported by the standalone backend`
    );
  }

  const body = await parseJsonBody<{
    params?: Record<string, unknown>;
    background?: boolean;
  }>(request);
  const params = body?.params ?? {};

  const graph = workflow.getGraph();
  const runnableGraph: {
    nodes: Array<{
      id: string;
      type: string;
      [key: string]: unknown;
    }>;
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

  const runtime = await getWorkflowRuntimeEnvironment(options);
  const hasPythonNode = runnableGraph.nodes.some((node) => {
    const nodeType = typeof node.type === "string" ? node.type : "";
    return (
      nodeType !== "" &&
      Boolean(runtime.registry.getMetadata(nodeType)) &&
      !runtime.registry.has(nodeType)
    );
  });
  if (hasPythonNode) {
    await runtime.ensurePythonBridge();
  }

  const job = await Job.create({
    workflow_id: workflowId,
    user_id: userId,
    status: "running",
    params,
    graph: runnableGraph
  });

  const runner = new WorkflowRunner(job.id, {
    resolveExecutor: (node) =>
      runtime.resolveExecutor(
        node as { id: string; type: string; [key: string]: unknown }
      )
  });
  const result = await runner.run(
    { job_id: job.id, workflow_id: workflowId, params },
    runnableGraph
  );

  if (result.status === "completed") {
    job.markCompleted();
  } else if (result.status === "cancelled") {
    job.markCancelled();
  } else {
    job.markFailed(result.error ?? "Workflow run failed");
  }
  await job.save();

  return jsonResponse({
    job_id: job.id,
    workflow_id: workflowId,
    status: result.status,
    outputs: result.outputs,
    error: result.error ?? null,
    message_count: result.messages.length,
    background: body?.background ?? false
  });
}

// ── Autosave ──────────────────────────────────────────────────────────

interface AutosaveBody {
  name?: string;
  access?: string;
  save_type?: string;
  description?: string;
  graph?: {
    nodes: Record<string, unknown>[];
    edges: Record<string, unknown>[];
  };
  client_id?: string;
  force?: boolean;
  max_versions?: number;
}

export async function handleWorkflowAutosave(
  request: Request,
  workflowId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "POST" && request.method !== "PUT") {
    return errorResponse(405, "Method not allowed");
  }
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");

  const workflow = (await Workflow.get(workflowId)) as Workflow | null;
  if (!workflow) return errorResponse(404, "Workflow not found");
  if (workflow.user_id !== userId)
    return errorResponse(404, "Workflow not found");

  const body = await parseJsonBody<AutosaveBody>(request);
  if (!body || !body.graph) {
    return errorResponse(400, "Invalid body: graph is required");
  }
  const graph = body.graph;
  const force = body?.force === true;
  const maxVersions =
    typeof body?.max_versions === "number" ? body.max_versions : 10;

  // Rate-limit: skip if last autosave < 30s ago and force is false
  if (!force) {
    const last = lastAutosaveTime.get(workflowId);
    if (last !== undefined && Date.now() - last < AUTOSAVE_RATE_LIMIT_MS) {
      return jsonResponse({
        version: null,
        message: "Autosave skipped (rate limited)",
        skipped: true
      });
    }
  }

  workflow.graph = graph;
  if (body.name !== undefined) workflow.name = body.name;
  if (body.description !== undefined) workflow.description = body.description;
  if (body.access === "public" || body.access === "private")
    workflow.access = body.access;
  await workflow.save();
  lastAutosaveTime.set(workflowId, Date.now());

  // Create a version and prune old ones if WorkflowVersion table is available
  let version: JsonObject | null = null;
  try {
    const nextVer = await WorkflowVersion.nextVersion(workflowId);
    const wv = new WorkflowVersion({
      workflow_id: workflowId,
      user_id: userId,
      graph,
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
      save_type: wv.save_type,
      created_at: wv.created_at
    } as JsonObject;
    await WorkflowVersion.pruneOldVersions(workflowId, maxVersions);
  } catch {
    // non-fatal — version table may not exist
  }

  return jsonResponse({
    version,
    message: "Autosaved successfully",
    skipped: false
  });
}

// ── Workflow tools ─────────────────────────────────────────────────────

export async function handleWorkflowTools(
  request: Request,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  const url = new URL(request.url);
  const limit = parseLimit(url, 100);
  const [workflows] = await Workflow.paginateTools(userId, { limit });
  return jsonResponse({
    workflows: workflows.map((w) => ({
      name: w.name,
      tool_name: w.tool_name ?? null,
      description: w.description ?? null
    })),
    next: null
  });
}

// ── Workflow examples ──────────────────────────────────────────────────

/** URL prefix for example workflow thumbnail images served by this API. */
const EXAMPLES_THUMBNAILS_PREFIX = "/api/workflows/examples/thumbnails/";

interface ExampleMetadata {
  id?: string;
  name: string;
  description?: string;
  tags?: string[];
}

/**
 * Given an `examplesDir` (e.g. `.../nodetool/examples/nodetool-base`), return
 * the sibling assets directory (`.../nodetool/assets/nodetool-base`).
 */
function deriveAssetsDir(examplesDir: string): string {
  return nodePath.join(
    nodePath.dirname(nodePath.dirname(examplesDir)),
    "assets",
    nodePath.basename(examplesDir)
  );
}

/**
 * Read example workflow metadata from a directory of JSON files.
 * Returns lightweight objects (no graph data) suitable for the /examples list.
 *
 * When the sibling `assets` directory exists (e.g.
 * `packages/base-nodes/nodetool/assets/nodetool-base`), a `thumbnail_url`
 * pointing to `/api/workflows/examples/thumbnails/<name>` is set so the
 * frontend can display the pre-generated JPG thumbnails.
 */
function buildExamplesFromDir(examplesDir: string): unknown[] {
  if (!existsSync(examplesDir)) return [];
  // Derive the assets directory from the examples directory.
  const assetsDir = deriveAssetsDir(examplesDir);
  const now = new Date().toISOString();
  const workflows: unknown[] = [];
  let files: string[];
  try {
    files = readdirSync(examplesDir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    log.warn(`Failed to read examples directory ${examplesDir}: ${err}`);
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
      // Point thumbnail_url to the served JPG when the file exists in assets.
      const jpgFile = `${name}.jpg`;
      const thumbnailUrl =
        existsSync(nodePath.join(assetsDir, jpgFile))
          ? `${EXAMPLES_THUMBNAILS_PREFIX}${encodeURIComponent(jpgFile)}`
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
    } catch (err) {
      log.debug(`Skipping invalid example workflow file ${file}: ${err}`);
    }
  }
  return workflows;
}

function buildExampleWorkflows(options: HttpApiOptions): unknown[] {
  // If a static examples directory is configured, use it directly — no Python needed.
  if (options.examplesDir) {
    return buildExamplesFromDir(options.examplesDir);
  }
  const loaded = loadPythonPackageMetadata({
    roots: options.metadataRoots,
    maxDepth: options.metadataMaxDepth
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

function loadExampleGraph(
  packageName: string,
  exampleName: string,
  options: HttpApiOptions
): Record<string, unknown> | null {
  const loaded = loadPythonPackageMetadata({
    roots: options.metadataRoots,
    maxDepth: options.metadataMaxDepth
  });
  const pkg = loaded.packages.find((p) => p.name === packageName);
  if (!pkg?.sourceFolder) return null;
  const examplePath = nodePath.join(
    pkg.sourceFolder,
    "nodetool",
    "examples",
    packageName,
    `${exampleName}.json`
  );
  try {
    const raw = readFileSync(examplePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function handleWorkflowExamples(
  request: Request,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  const workflows = buildExampleWorkflows(options);
  return jsonResponse({ workflows, next: null });
}

export async function handleWorkflowExamplesSearch(
  request: Request,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").toLowerCase().trim();
  const workflows = buildExampleWorkflows(options);
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
  return jsonResponse({ workflows: filtered, next: null });
}

/**
 * Serve a thumbnail JPG from the examples assets directory.
 * URL: /api/workflows/examples/thumbnails/<encoded-filename>
 */
export async function handleWorkflowExamplesThumbnail(
  request: Request,
  filename: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  if (!options.examplesDir) {
    return errorResponse(404, "Examples not configured");
  }
  // Derive the assets directory from the examples directory.
  const assetsDir = deriveAssetsDir(options.examplesDir);
  // Prevent path traversal — only allow a plain filename (no slashes).
  const safe = nodePath.basename(filename);
  const safeLower = safe.toLowerCase();
  if (!safeLower.endsWith(".jpg") && !safeLower.endsWith(".png")) {
    return errorResponse(400, "Only .jpg and .png thumbnails are supported");
  }
  const filePath = nodePath.join(assetsDir, safe);
  if (!existsSync(filePath)) {
    return errorResponse(404, "Thumbnail not found");
  }
  const { createReadStream, statSync } = await import("node:fs");
  let stat: { size: number };
  try {
    stat = statSync(filePath);
  } catch {
    return errorResponse(404, "Thumbnail not found");
  }
  const contentType = safeLower.endsWith(".png") ? "image/png" : "image/jpeg";
  const stream = createReadStream(filePath);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    }
  });
  return new Response(webStream, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-length": String(stat.size),
      "cache-control": "public, max-age=86400"
    }
  });
}

// ── Workflow app page ──────────────────────────────────────────────────

export async function handleWorkflowApp(
  request: Request,
  workflowId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  const baseUrl = options.baseUrl ?? "http://127.0.0.1:7777";
  const html = `<!DOCTYPE html><html><head><title>Workflow App</title>
<script>window.WORKFLOW_ID=${JSON.stringify(workflowId)};window.API_URL=${JSON.stringify(baseUrl)};</script>
</head><body><div id="app"></div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html" }
  });
}

// ── Workflow generate-name ─────────────────────────────────────────────

/**
 * Generate a descriptive name for a workflow based on its node types.
 * The Python backend uses an LLM for this; the TS standalone mode derives
 * a name from the workflow graph's node types instead.
 *
 * Node types follow the pattern `<root>.<category>[.<subcategory>...]`,
 * e.g. `nodetool.text.Generate`. We collect unique category segments
 * (parts[1]) to form a human-readable label.
 */
function deriveWorkflowName(workflow: Workflow): string {
  const graph = workflow.graph as { nodes?: Array<{ type?: unknown }> } | null;
  const nodes: Array<{ type?: unknown }> = graph?.nodes ?? [];
  if (nodes.length === 0) {
    return workflow.name || "Untitled Workflow";
  }
  // Collect unique category segments from node types (second dotted segment).
  const categories = new Set<string>();
  for (const n of nodes) {
    if (typeof n.type === "string") {
      const parts = n.type.split(".");
      // Require at least root.category format.
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

export async function handleWorkflowGenerateName(
  request: Request,
  workflowId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  const workflow = (await Workflow.get(workflowId)) as Workflow | null;
  if (!workflow) return errorResponse(404, "Workflow not found");
  if (workflow.user_id !== userId)
    return errorResponse(404, "Workflow not found");
  const name = deriveWorkflowName(workflow);
  return jsonResponse({ name });
}

// ── Workflow DSL export (stub) ─────────────────────────────────────────

export async function handleWorkflowDslExport(
  request: Request,
  workflowId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");

  const workflow = (await Workflow.get(workflowId)) as Workflow | null;
  if (!workflow) {
    return errorResponse(404, "Workflow not found");
  }
  if (workflow.access !== "public" && workflow.user_id !== userId) {
    return errorResponse(404, "Workflow not found");
  }

  if (!workflow.graph) {
    return errorResponse(400, "Workflow has no graph to export");
  }

  try {
    const source = workflowToDsl(workflow.graph, {
      workflowName: workflow.name
    });
    return new Response(source, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to export workflow as DSL";
    return errorResponse(400, message);
  }
}

// ── Workflow Gradio export (stub) ──────────────────────────────────────

export async function handleWorkflowGradioExport(
  request: Request,
  workflowId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  const workflow = (await Workflow.get(workflowId)) as Workflow | null;
  if (!workflow) return errorResponse(404, "Workflow not found");
  if (workflow.user_id !== userId) {
    return errorResponse(404, "Workflow not found");
  }
  // Gradio export requires the Python Gradio library; return 501 in standalone TS mode.
  return errorResponse(
    501,
    "Workflow Gradio export is not available in standalone mode"
  );
}

// ── Workflow versions ──────────────────────────────────────────────────

function toVersionResponse(v: WorkflowVersion): JsonObject {
  return {
    id: v.id,
    workflow_id: v.workflow_id,
    user_id: v.user_id,
    name: v.name,
    description: v.description,
    graph: v.graph,
    version: v.version,
    save_type: v.save_type ?? "manual",
    autosave_metadata: v.autosave_metadata ?? null,
    created_at: v.created_at
  };
}

interface VersionCreateBody {
  name?: string;
  description?: string;
}

export async function handleWorkflowVersions(
  request: Request,
  workflowId: string,
  options: HttpApiOptions
): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");

  if (request.method === "POST") {
    const workflow = (await Workflow.get(workflowId)) as Workflow | null;
    if (!workflow) return errorResponse(404, "Workflow not found");
    if (workflow.user_id !== userId)
      return errorResponse(404, "Workflow not found");

    const body = await parseJsonBody<VersionCreateBody>(request);
    const nextVer = await WorkflowVersion.nextVersion(workflowId);
    const version = (await WorkflowVersion.create({
      workflow_id: workflowId,
      user_id: userId,
      name: body?.name ?? null,
      description: body?.description ?? null,
      graph: workflow.graph,
      version: nextVer
    })) as WorkflowVersion;
    return jsonResponse(toVersionResponse(version));
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const limit = parseLimit(url, 100);
    const versions = await WorkflowVersion.listForWorkflow(workflowId, {
      limit
    });
    return jsonResponse({ versions: versions.map(toVersionResponse) });
  }

  return errorResponse(405, "Method not allowed");
}

export async function handleWorkflowVersionByNumber(
  request: Request,
  workflowId: string,
  versionNumber: number,
  options: HttpApiOptions
): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");

  if (request.method === "GET") {
    const version = await WorkflowVersion.findByVersion(
      workflowId,
      versionNumber
    );
    if (!version) return errorResponse(404, "Version not found");
    const workflow = (await Workflow.get(workflowId)) as Workflow | null;
    if (!workflow) return errorResponse(404, "Workflow not found");
    if (workflow.user_id !== userId)
      return errorResponse(404, "Workflow not found");
    return jsonResponse(toVersionResponse(version));
  }

  if (request.method === "POST") {
    // restore: copy version graph back to workflow
    const version = await WorkflowVersion.findByVersion(
      workflowId,
      versionNumber
    );
    if (!version) return errorResponse(404, "Version not found");
    const workflow = (await Workflow.get(workflowId)) as Workflow | null;
    if (!workflow) return errorResponse(404, "Workflow not found");
    if (workflow.user_id !== userId)
      return errorResponse(404, "Workflow not found");
    workflow.graph = version.graph;
    await workflow.save();
    return jsonResponse(toWorkflowResponse(workflow));
  }

  return errorResponse(405, "Method not allowed");
}

export async function handleWorkflowVersionDeleteById(
  request: Request,
  _workflowId: string,
  versionId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "DELETE") {
    return errorResponse(405, "Method not allowed");
  }
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  const version = (await WorkflowVersion.get(
    versionId
  )) as WorkflowVersion | null;
  if (!version) return errorResponse(404, "Version not found");
  if (version.user_id !== userId)
    return errorResponse(404, "Version not found");
  await version.delete();
  return new Response(null, { status: 204 });
}

export async function handleWorkflowsRoot(
  request: Request,
  options: HttpApiOptions
): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  const url = new URL(request.url);

  if (request.method === "GET") {
    const limit = parseLimit(url, 100);
    const runMode = url.searchParams.get("run_mode")?.trim() ?? undefined;
    // cursor and columns params accepted for Python parity (cursor ignored in memory adapter)
    // columns param is Python-specific (column selection) — ignored here
    const [workflows, cursor] = await Workflow.paginate(userId, {
      limit,
      runMode
    });
    return jsonResponse({
      workflows: workflows.map((w) => toWorkflowResponse(w)),
      next: cursor || null
    });
  }

  if (request.method === "POST") {
    const body = await parseJsonBody<WorkflowRequestBody>(request);
    if (!body) return errorResponse(400, "Invalid JSON body");
    try {
      const fromPkg =
        url.searchParams.get("from_example_package")?.trim() ?? undefined;
      const fromName =
        url.searchParams.get("from_example_name")?.trim() ?? undefined;
      if (
        fromPkg &&
        fromName &&
        (!body.graph || body.graph.nodes?.length === 0)
      ) {
        const example = loadExampleGraph(fromPkg, fromName, options);
        if (example?.graph) {
          body.graph = example.graph as WorkflowRequestBody["graph"];
        }
      }
      const workflow = await createWorkflow(body, userId);
      return jsonResponse(toWorkflowResponse(workflow));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid workflow";
      return errorResponse(400, message);
    }
  }

  return errorResponse(405, "Method not allowed");
}

export async function handlePublicWorkflows(
  request: Request
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  const url = new URL(request.url);
  const limit = parseLimit(url, 100);
  const [workflows] = await Workflow.paginatePublic({ limit });
  return jsonResponse({
    workflows: workflows.map((w) => toWorkflowResponse(w)),
    next: null
  });
}

export async function handlePublicWorkflowById(
  request: Request,
  workflowId: string
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  const workflow = (await Workflow.get(workflowId)) as Workflow | null;
  if (!workflow || workflow.access !== "public") {
    return errorResponse(404, "Workflow not found");
  }
  return jsonResponse(toWorkflowResponse(workflow));
}

export async function handleWorkflowById(
  request: Request,
  workflowId: string,
  options: HttpApiOptions
): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");

  if (request.method === "GET") {
    const workflow = (await Workflow.get(workflowId)) as Workflow | null;
    if (!workflow) return errorResponse(404, "Workflow not found");
    if (workflow.access !== "public" && workflow.user_id !== userId) {
      return errorResponse(404, "Workflow not found");
    }
    return jsonResponse(toWorkflowResponse(workflow));
  }

  if (request.method === "PUT") {
    const body = await parseJsonBody<WorkflowRequestBody>(request);
    if (!body) return errorResponse(400, "Invalid JSON body");
    try {
      const workflow = await updateWorkflow(workflowId, body, userId);
      return jsonResponse(toWorkflowResponse(workflow));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid workflow";
      if (message === "Workflow not found") return errorResponse(404, message);
      return errorResponse(400, message);
    }
  }

  if (request.method === "DELETE") {
    const workflow = (await Workflow.get(workflowId)) as Workflow | null;
    if (!workflow) return errorResponse(404, "Workflow not found");
    if (workflow.user_id !== userId)
      return errorResponse(404, "Workflow not found");
    await workflow.delete();
    return new Response(null, { status: 204 });
  }

  return errorResponse(405, "Method not allowed");
}

// ── Job types & helpers ───────────────────────────────────────────

/**
 * Full job response — still exported here because `mcp-server.ts` consumes it
 * when serving job metadata over MCP. Consider relocating if MCP also migrates.
 */
export function toJobResponse(job: Job): JsonObject {
  return {
    id: job.id,
    user_id: job.user_id,
    job_type: "workflow",
    status: job.status,
    workflow_id: job.workflow_id,
    started_at: job.started_at ?? null,
    finished_at: job.finished_at ?? null,
    error: job.error ?? null,
    cost: null
  };
}

// ── Trigger job stubs ─────────────────────────────────────────────

export async function handleTriggersRunning(
  request: Request
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  return jsonResponse({ workflows: [] });
}

export async function handleTriggerStart(
  request: Request,
  _workflowId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }
  return errorResponse(
    501,
    "Trigger workflows not available in standalone mode"
  );
}

export async function handleTriggerStop(
  request: Request,
  _workflowId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }
  return errorResponse(
    501,
    "Trigger workflows not available in standalone mode"
  );
}

// ── Nodes dummy ───────────────────────────────────────────────────

export async function handleNodesDummy(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  return jsonResponse({
    type: "asset",
    uri: "",
    asset_id: null,
    data: null,
    metadata: null
  });
}

// ── Asset types & helpers ──────────────────────────────────────────

interface AssetCreateBody {
  name: string;
  content_type: string;
  parent_id: string;
  workflow_id?: string | null;
  node_id?: string | null;
  job_id?: string | null;
  metadata?: Record<string, unknown> | null;
  size?: number | null;
}

export function toAssetResponse(asset: Asset): JsonObject {
  const isFolder = asset.content_type === "folder";
  const fileName = isFolder
    ? null
    : getAssetFileName(asset.id, asset.content_type);
  const getUrl = fileName ? buildAssetUrl(fileName) : null;

  const hasThumbnail =
    asset.content_type.startsWith("image/") ||
    asset.content_type.startsWith("video/");
  const updatedTs = asset.updated_at
    ? Math.floor(new Date(asset.updated_at).getTime() / 1000)
    : 0;
  const thumbUrl = hasThumbnail
    ? `/api/assets/${asset.id}/thumbnail?t=${updatedTs}`
    : null;

  return {
    id: asset.id,
    user_id: asset.user_id,
    workflow_id: asset.workflow_id ?? null,
    parent_id: asset.parent_id ?? null,
    name: asset.name,
    content_type: asset.content_type,
    size: asset.size ?? null,
    metadata: asset.metadata ?? null,
    created_at: asset.created_at,
    get_url: getUrl,
    thumb_url: thumbUrl,
    duration: asset.duration ?? null,
    node_id: asset.node_id ?? null,
    job_id: asset.job_id ?? null
  };
}

/**
 * Handle multipart file upload at POST /api/assets. JSON-only creation has
 * moved to the tRPC `assets.create` procedure.
 */
export async function handleAssetsRoot(
  request: Request,
  options: HttpApiOptions
): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");

  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    let body: AssetCreateBody | null = null;
    let fileBuffer: Buffer | null = null;
    let fileSize: number | null = null;

    if (contentType.toLowerCase().includes("multipart/form-data")) {
      try {
        const fd = await request.formData();
        const file = fd.get("file") as File | null;
        // Frontend sends metadata as "json" field
        const assetJson = fd.get("json") ?? fd.get("asset");
        if (assetJson && typeof assetJson === "string") {
          body = JSON.parse(assetJson) as AssetCreateBody;
        }
        if (file) {
          const arrayBuffer = await file.arrayBuffer();
          fileBuffer = Buffer.from(arrayBuffer);
          fileSize = fileBuffer.byteLength;
          // Use file metadata if not supplied in the asset JSON field
          if (!body) {
            body = {
              name: file.name,
              content_type: file.type || "application/octet-stream",
              parent_id: userId
            };
          } else {
            body.name = body.name || file.name;
            body.content_type =
              body.content_type || file.type || "application/octet-stream";
            body.parent_id = body.parent_id || userId;
          }
        }
      } catch {
        return errorResponse(400, "Invalid multipart form data");
      }
    } else {
      body = await parseJsonBody<AssetCreateBody>(request);
    }

    if (
      !body ||
      typeof body.name !== "string" ||
      typeof body.content_type !== "string" ||
      typeof body.parent_id !== "string"
    ) {
      return errorResponse(
        400,
        "Invalid JSON body: name, content_type, and parent_id are required"
      );
    }

    const metadata: Record<string, unknown> = body.metadata ?? {};

    const asset = (await Asset.create({
      user_id: userId,
      name: body.name,
      content_type: body.content_type,
      parent_id: body.parent_id,
      workflow_id: body.workflow_id ?? null,
      node_id: body.node_id ?? null,
      job_id: body.job_id ?? null,
      metadata:
        Object.keys(metadata).length > 0 ? metadata : (body.metadata ?? null),
      size: fileSize ?? body.size ?? null
    })) as Asset;

    // Write file to storage directory so it's accessible via /api/storage/
    if (fileBuffer) {
      const storagePath = getAssetStoragePath(options.storage);
      const fileName = getAssetFileName(asset.id, asset.content_type);
      const filePath = nodePath.join(storagePath, fileName);
      await mkdir(storagePath, { recursive: true });
      await writeFile(filePath, fileBuffer);
    }

    return jsonResponse(toAssetResponse(asset));
  }

  return errorResponse(405, "Method not allowed");
}

export async function handleAssetThumbnail(
  request: Request,
  assetId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method === "POST") {
    return errorResponse(501, "Thumbnail generation not available");
  }
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");

  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  const asset = await Asset.find(userId, assetId);
  if (!asset) return errorResponse(404, "Asset not found");

  if (!asset.hasThumbnail) {
    return errorResponse(
      400,
      `Asset type '${asset.content_type}' does not support thumbnails`
    );
  }

  const storagePath = getAssetStoragePath(options.storage);

  // Try to serve a pre-generated thumbnail ({id}_thumb.jpg)
  const thumbFileName = `${asset.id}_thumb.jpg`;
  const thumbFilePath = nodePath.join(storagePath, thumbFileName);
  try {
    const thumbStat = await stat(thumbFilePath);
    const data = await readFile(thumbFilePath);
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(thumbStat.size),
        "Cache-Control": "no-cache",
        "Last-Modified": thumbStat.mtime.toUTCString()
      }
    });
  } catch {
    // No pre-generated thumbnail, fall through
  }

  // Fall back to serving the original file (for images)
  if (asset.content_type.startsWith("image/")) {
    const fileName = getAssetFileName(asset.id, asset.content_type);
    const filePath = nodePath.join(storagePath, fileName);
    try {
      const fileStat = await stat(filePath);
      const data = await readFile(filePath);
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": asset.content_type,
          "Content-Length": String(fileStat.size),
          "Cache-Control": "no-cache",
          "Last-Modified": fileStat.mtime.toUTCString()
        }
      });
    } catch {
      // File not found on disk
    }
  }

  return errorResponse(404, "No thumbnail available");
}

export async function handleApiRequest(
  request: Request,
  options: HttpApiOptions = {}
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = normalizePath(url.pathname);

  if (pathname.startsWith("/v1/")) {
    const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
    const response = await handleOpenAIRequest(
      request,
      pathname,
      userId,
      options.openai
    );
    if (response) return response;
  }

  if (pathname.startsWith("/api/oauth/")) {
    const response = await handleOAuthRequest(request, pathname, () =>
      getUserId(request, options.userIdHeader ?? "x-user-id")
    );
    if (response) return response;
  }

  if (pathname === "/api/users/validate_username") {
    if (request.method !== "GET")
      return errorResponse(405, "Method not allowed");
    const url = new URL(request.url);
    const username = url.searchParams.get("username")?.trim() ?? null;
    if (username === null)
      return errorResponse(400, "username parameter is required");
    if (!username) return errorResponse(400, "username cannot be empty");
    const valid = /^[a-zA-Z0-9_-]{3,32}$/.test(username);
    return jsonResponse({ valid, available: true });
  }

  if (pathname === "/api/nodes/dummy") {
    return handleNodesDummy(request);
  }

  if (pathname === "/api/nodes/metadata" || pathname === "/api/node/metadata") {
    return handleNodeMetadata(request, options);
  }

  if (pathname === "/api/workflows") {
    return handleWorkflowsRoot(request, options);
  }

  if (pathname === "/api/workflows/names") {
    if (request.method !== "GET")
      return errorResponse(405, "Method not allowed");
    const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
    const [workflows] = await Workflow.paginate(userId, { limit: 1000 });
    const names: Record<string, string> = {};
    for (const wf of workflows) names[wf.id] = wf.name;
    return jsonResponse(names);
  }

  if (pathname === "/api/workflows/tools") {
    return handleWorkflowTools(request, options);
  }

  if (pathname === "/api/workflows/examples") {
    return handleWorkflowExamples(request, options);
  }

  if (pathname === "/api/workflows/examples/search") {
    return handleWorkflowExamplesSearch(request, options);
  }

  if (pathname.startsWith("/api/workflows/examples/thumbnails/")) {
    const filename = decodeURIComponent(
      pathname.slice("/api/workflows/examples/thumbnails/".length)
    );
    return handleWorkflowExamplesThumbnail(request, filename, options);
  }

  if (pathname.startsWith("/api/workflows/examples/")) {
    return errorResponse(404, "Examples not available in standalone mode");
  }

  if (pathname === "/api/workflows/public") {
    return handlePublicWorkflows(request);
  }

  if (pathname.startsWith("/api/workflows/public/")) {
    const workflowId = decodeURIComponent(
      pathname.slice("/api/workflows/public/".length)
    );
    if (!workflowId) return errorResponse(404, "Not found");
    return handlePublicWorkflowById(request, workflowId);
  }

  // ── Workflow sub-resource routes ───────────────────────────────────
  // Pattern: /api/workflows/{id}/...
  {
    const wfSubMatch = pathname.match(/^\/api\/workflows\/([^/]+)\/(.+)$/);
    if (wfSubMatch) {
      const workflowId = decodeURIComponent(wfSubMatch[1]);
      const subPath = wfSubMatch[2];

      if (subPath === "run") {
        return handleWorkflowRun(request, workflowId, options);
      }
      if (subPath === "autosave") {
        return handleWorkflowAutosave(request, workflowId, options);
      }
      if (subPath === "app") {
        return handleWorkflowApp(request, workflowId, options);
      }
      if (subPath === "generate-name") {
        return handleWorkflowGenerateName(request, workflowId, options);
      }
      if (subPath === "dsl-export") {
        return handleWorkflowDslExport(request, workflowId, options);
      }
      if (subPath === "gradio-export") {
        return handleWorkflowGradioExport(request, workflowId, options);
      }
      if (subPath === "versions") {
        return handleWorkflowVersions(request, workflowId, options);
      }
      // /api/workflows/{id}/versions/{version}/restore
      const versionRestoreMatch = subPath.match(/^versions\/(\d+)\/restore$/);
      if (versionRestoreMatch) {
        const versionNum = Number.parseInt(versionRestoreMatch[1], 10);
        return handleWorkflowVersionByNumber(
          request,
          workflowId,
          versionNum,
          options
        );
      }
      // /api/workflows/{id}/versions/{version} (GET by version number)
      const versionNumMatch = subPath.match(/^versions\/(\d+)$/);
      if (versionNumMatch) {
        const versionNum = Number.parseInt(versionNumMatch[1], 10);
        return handleWorkflowVersionByNumber(
          request,
          workflowId,
          versionNum,
          options
        );
      }
      // /api/workflows/{id}/versions/{version_id} (DELETE by id — version_id is not numeric)
      const versionIdMatch = subPath.match(/^versions\/([^/]+)$/);
      if (versionIdMatch) {
        const versionId = decodeURIComponent(versionIdMatch[1]);
        return handleWorkflowVersionDeleteById(
          request,
          workflowId,
          versionId,
          options
        );
      }
    }
  }

  if (pathname.startsWith("/api/workflows/")) {
    const workflowId = decodeURIComponent(
      pathname.slice("/api/workflows/".length)
    );
    if (!workflowId) return errorResponse(404, "Not found");
    return handleWorkflowById(request, workflowId, options);
  }

  if (pathname.startsWith("/api/storage/")) {
    return getStorageHandler(options.storage)(request);
  }

  if (pathname === "/api/files" || pathname.startsWith("/api/files/")) {
    return handleFileRequest(request);
  }

  if (pathname === "/admin/secrets/import") {
    if (request.method !== "POST")
      return errorResponse(405, "Method not allowed");
    return errorResponse(
      501,
      "Secrets import not available in standalone mode"
    );
  }

  return errorResponse(404, "Not found");
}

async function readNodeRequestBody(
  request: IncomingMessage
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    if (chunk instanceof Uint8Array) {
      chunks.push(chunk);
    } else {
      chunks.push(Buffer.from(String(chunk)));
    }
  }
  const size = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export async function handleNodeHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: HttpApiOptions = {}
): Promise<void> {
  const method = req.method ?? "GET";
  const baseUrl = options.baseUrl ?? "http://127.0.0.1:7777";
  const url = new URL(req.url ?? "/", baseUrl);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const hasBody = method !== "GET" && method !== "HEAD";
  const rawBody = hasBody ? await readNodeRequestBody(req) : undefined;
  const request = new Request(url.toString(), {
    method,
    headers,
    body:
      rawBody && rawBody.byteLength > 0 ? new Uint8Array(rawBody) : undefined
  });

  const response = await handleApiRequest(request, options);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const bodyBuffer = Buffer.from(await response.arrayBuffer());

  // Gzip-compress large JSON responses for performance (e.g. /api/nodes/metadata
  // is ~5 MB uncompressed, ~550 KB compressed).
  const GZIP_THRESHOLD = 256 * 1024;
  const acceptEncoding = req.headers["accept-encoding"] ?? "";
  if (bodyBuffer.length > GZIP_THRESHOLD && acceptEncoding.includes("gzip")) {
    const compressed = gzipSync(bodyBuffer);
    res.setHeader("content-encoding", "gzip");
    res.setHeader("content-length", compressed.length);
    res.end(compressed);
    return;
  }

  res.end(bodyBuffer);
}

export function createHttpApiServer(options: HttpApiOptions = {}): Server {
  return createServer((req, res) => {
    void handleNodeHttpRequest(req, res, options).catch((error) => {
      log.error(
        "Request failed",
        error instanceof Error ? error : new Error(String(error))
      );
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      const detail = error instanceof Error ? error.message : String(error);
      res.end(JSON.stringify({ detail }));
    });
  });
}
