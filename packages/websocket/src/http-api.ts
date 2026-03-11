import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, writeFile, stat, readFile } from "node:fs/promises";
import nodePath from "node:path";
import os from "node:os";
import { createLogger } from "@nodetool/config";
import {
  Workflow,
  WorkflowVersion,
  Job,
  Message,
  Thread,
  Asset,
  Secret,
  MemoryAdapterFactory,
  getGlobalAdapterResolver,
  setGlobalAdapterResolver,
} from "@nodetool/models";
import { loadPythonPackageMetadata, type NodeMetadata, NodeRegistry } from "@nodetool/node-sdk";
import { getSecret } from "@nodetool/security";
import { handleModelsApiRequest } from "./models-api.js";
import { handleOpenAIRequest, type OpenAIApiOptions } from "./openai-api.js";
import { handleOAuthRequest } from "./oauth-api.js";
import { createStorageHandler, type StorageHandlerOptions } from "./storage-api.js";
import { getRegisteredSettings, handleSettingsRequest } from "./settings-api.js";
import { handleWorkspaceRequest } from "./workspace-api.js";
import { handleFileRequest } from "./file-api.js";
import { handleCostRequest } from "./cost-api.js";
import { handleSkillsRequest, handleFontsRequest } from "./skills-api.js";
import { handleUsersRequest } from "./users-api.js";
import { handleCollectionRequest } from "./collection-api.js";
import { handleDebugExportRequest } from "./debug-api.js";

const log = createLogger("nodetool.websocket.http");

// ── Content type to file extension mapping ─────────────────────────
const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
  "image/svg+xml": "svg", "image/webp": "webp", "image/tiff": "tiff", "image/bmp": "bmp",
  "text/plain": "txt", "text/csv": "csv", "text/html": "html",
  "application/json": "json", "application/pdf": "pdf", "application/zip": "zip",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/ogg": "ogg",
  "audio/aac": "aac", "audio/x-wav": "wav", "audio/x-flac": "flac", "audio/x-m4a": "m4a",
  "video/mp4": "mp4", "video/mpeg": "mpeg", "video/quicktime": "mov",
  "video/x-msvideo": "avi", "video/webm": "webm",
};

function getFileExtension(contentType: string): string {
  return CONTENT_TYPE_TO_EXTENSION[contentType] ?? "bin";
}

function getAssetFileName(assetId: string, contentType: string): string {
  return `${assetId}.${getFileExtension(contentType)}`;
}

function getAssetStoragePath(opts?: StorageHandlerOptions): string {
  return process.env.ASSET_FOLDER ?? opts?.storagePath ?? process.env.STORAGE_PATH ??
    nodePath.join(os.homedir(), ".local", "share", "nodetool", "assets");
}

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
}

// Lazily created storage handler — recreated if options change
let _storageHandler: ((request: Request) => Promise<Response>) | null = null;
let _storageOpts: StorageHandlerOptions | undefined;

function getStorageHandler(opts?: StorageHandlerOptions): (request: Request) => Promise<Response> {
  if (!_storageHandler || _storageOpts !== opts) {
    _storageHandler = createStorageHandler(opts);
    _storageOpts = opts;
  }
  return _storageHandler;
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

const defaultMemoryFactory = new MemoryAdapterFactory();
let workflowTableInitialized = false;
let workflowVersionTableInitialized = false;
let messageTableInitialized = false;
let threadTableInitialized = false;
let jobTableInitialized = false;
let assetTableInitialized = false;
let secretTableInitialized = false;

// Rate-limit tracking for autosave: maps workflow_id -> last autosave timestamp (ms)
const lastAutosaveTime = new Map<string, number>();
const AUTOSAVE_RATE_LIMIT_MS = 30_000;

function ensureAdapterResolver(): void {
  if (!getGlobalAdapterResolver()) {
    setGlobalAdapterResolver((schema) => defaultMemoryFactory.getAdapter(schema));
  }
}

async function ensureWorkflowTable(): Promise<void> {
  if (workflowTableInitialized) return;
  ensureAdapterResolver();
  await Workflow.createTable();
  workflowTableInitialized = true;
}

async function ensureWorkflowVersionTable(): Promise<void> {
  if (workflowVersionTableInitialized) return;
  ensureAdapterResolver();
  await WorkflowVersion.createTable();
  workflowVersionTableInitialized = true;
}

async function ensureMessageTable(): Promise<void> {
  if (messageTableInitialized) return;
  ensureAdapterResolver();
  await Message.createTable();
  messageTableInitialized = true;
}

async function ensureThreadTable(): Promise<void> {
  if (threadTableInitialized) return;
  ensureAdapterResolver();
  await Thread.createTable();
  threadTableInitialized = true;
}

async function ensureJobTable(): Promise<void> {
  if (jobTableInitialized) return;
  ensureAdapterResolver();
  await Job.createTable();
  jobTableInitialized = true;
}

async function ensureSecretTable(): Promise<void> {
  if (secretTableInitialized) return;
  ensureAdapterResolver();
  await Secret.createTable();
  secretTableInitialized = true;
}

async function ensureAssetTable(): Promise<void> {
  if (assetTableInitialized) return;
  ensureAdapterResolver();
  await Asset.createTable();
  assetTableInitialized = true;
}

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
      ...(init?.headers ?? {}),
    },
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, { status });
}

function getUserId(request: Request, headerName: string): string {
  return request.headers.get(headerName) ?? request.headers.get("x-user-id") ?? "1";
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

function toWorkflowResponse(workflow: Workflow): JsonObject {
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
    etag: workflow.getEtag(),
  };
}

async function handleNodeMetadata(request: Request, options: HttpApiOptions): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  // If a registry is provided, use unified metadata from TS + Python
  if (options.registry) {
    const nodes = options.registry.listMetadata();
    return jsonResponse(nodes.sort((a, b) => a.node_type.localeCompare(b.node_type)));
  }

  // Fallback: Python-only metadata
  const loaded = loadPythonPackageMetadata({
    roots: options.metadataRoots,
    maxDepth: options.metadataMaxDepth,
  });
  const nodes: NodeMetadata[] = [...loaded.nodesByType.values()].sort((a, b) =>
    a.node_type.localeCompare(b.node_type)
  );
  return jsonResponse(nodes);
}

function parseLimit(url: URL, defaultLimit = 100): number {
  const raw = url.searchParams.get("limit");
  if (!raw) return defaultLimit;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(parsed, 500);
}

async function createWorkflow(body: WorkflowRequestBody, userId: string): Promise<Workflow> {
  if (!body || typeof body.name !== "string" || typeof body.access !== "string") {
    throw new Error("Invalid workflow");
  }
  if (!body.graph || !Array.isArray(body.graph.nodes) || !Array.isArray(body.graph.edges)) {
    throw new Error("Invalid workflow");
  }

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
    graph: body.graph,
    settings: body.settings ?? null,
    run_mode: body.run_mode ?? "workflow",
    workspace_id: body.workspace_id ?? null,
    html_app: body.html_app ?? null,
  })) as Workflow;
}

async function updateWorkflow(
  id: string,
  body: WorkflowRequestBody,
  userId: string
): Promise<Workflow> {
  if (!body || typeof body.name !== "string" || typeof body.access !== "string") {
    throw new Error("Invalid workflow");
  }
  if (!body.graph || !Array.isArray(body.graph.nodes) || !Array.isArray(body.graph.edges)) {
    throw new Error("Invalid workflow");
  }

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
    existing.graph = body.graph;
    existing.settings = body.settings ?? null;
    if (body.run_mode !== undefined && body.run_mode !== null) existing.run_mode = body.run_mode;
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
    html_app: body.html_app ?? null,
  })) as Workflow;
}

// ── Autosave ──────────────────────────────────────────────────────────

interface AutosaveBody {
  name?: string;
  access?: string;
  save_type?: string;
  description?: string;
  graph?: { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };
  client_id?: string;
  force?: boolean;
  max_versions?: number;
}

async function handleWorkflowAutosave(
  request: Request,
  workflowId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "POST" && request.method !== "PUT") {
    return errorResponse(405, "Method not allowed");
  }
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureWorkflowTable();

  const workflow = (await Workflow.get(workflowId)) as Workflow | null;
  if (!workflow) return errorResponse(404, "Workflow not found");
  if (workflow.user_id !== userId) return errorResponse(404, "Workflow not found");

  const body = await parseJsonBody<AutosaveBody>(request);
  if (!body || !body.graph) {
    return errorResponse(400, "Invalid body: graph is required");
  }
  const graph = body.graph;
  const force = body?.force === true;
  const maxVersions = typeof body?.max_versions === "number" ? body.max_versions : 10;

  // Rate-limit: skip if last autosave < 30s ago and force is false
  if (!force) {
    const last = lastAutosaveTime.get(workflowId);
    if (last !== undefined && Date.now() - last < AUTOSAVE_RATE_LIMIT_MS) {
      return jsonResponse({ version: null, message: "Autosave skipped (rate limited)", skipped: true });
    }
  }

  workflow.graph = graph;
  if (body.name !== undefined) workflow.name = body.name;
  if (body.description !== undefined) workflow.description = body.description;
  if (body.access === "public" || body.access === "private") workflow.access = body.access;
  await workflow.save();
  lastAutosaveTime.set(workflowId, Date.now());

  // Create a version and prune old ones if WorkflowVersion table is available
  const version: JsonObject | null = null;
  try {
    await ensureWorkflowVersionTable();
    await WorkflowVersion.pruneOldVersions(workflowId, maxVersions);
  } catch {
    // non-fatal
  }

  return jsonResponse({ version, message: "Autosaved successfully", skipped: false });
}

// ── Workflow tools ─────────────────────────────────────────────────────

async function handleWorkflowTools(request: Request, options: HttpApiOptions): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureWorkflowTable();
  const url = new URL(request.url);
  const limit = parseLimit(url, 100);
  const [workflows] = await Workflow.paginateTools(userId, { limit });
  return jsonResponse({
    workflows: workflows.map((w) => ({
      name: w.name,
      tool_name: w.tool_name ?? null,
      description: w.description ?? null,
    })),
    next: null,
  });
}

// ── Workflow examples ──────────────────────────────────────────────────

interface ExampleMetadata {
  id?: string;
  name: string;
  description?: string;
  tags?: string[];
}

function buildExampleWorkflows(options: HttpApiOptions): unknown[] {
  const loaded = loadPythonPackageMetadata({
    roots: options.metadataRoots,
    maxDepth: options.metadataMaxDepth,
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
        etag: null,
      });
    }
  }
  return workflows;
}

async function handleWorkflowExamples(request: Request, options: HttpApiOptions): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  const workflows = buildExampleWorkflows(options);
  return jsonResponse({ workflows, next: null });
}

async function handleWorkflowExamplesSearch(request: Request, options: HttpApiOptions): Promise<Response> {
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
        return name.includes(query) || desc.includes(query) || tags.some((t) => t.toLowerCase().includes(query));
      })
    : workflows;
  return jsonResponse({ workflows: filtered, next: null });
}

// ── Workflow app page ──────────────────────────────────────────────────

async function handleWorkflowApp(
  request: Request,
  workflowId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  const baseUrl = options.baseUrl ?? "http://127.0.0.1:7777";
  const html = `<!DOCTYPE html><html><head><title>Workflow App</title>
<script>window.WORKFLOW_ID="${workflowId}";window.API_URL="${baseUrl}";</script>
</head><body><div id="app"></div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

// ── Workflow generate-name (stub) ──────────────────────────────────────

async function handleWorkflowGenerateName(
  request: Request,
  _workflowId: string,
  _options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }
  return jsonResponse({ message: "Name generation not available" }, { status: 501 });
}

// ── Workflow DSL export (stub) ─────────────────────────────────────────

async function handleWorkflowDslExport(
  request: Request,
  _workflowId: string,
  _options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  return new Response("# DSL export not available in standalone mode", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

// ── Workflow Gradio export (stub) ──────────────────────────────────────

async function handleWorkflowGradioExport(
  request: Request,
  _workflowId: string,
  _options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }
  return new Response("# Gradio export not available in standalone mode", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
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
    created_at: v.created_at,
  };
}

interface VersionCreateBody {
  name?: string;
  description?: string;
}

async function handleWorkflowVersions(
  request: Request,
  workflowId: string,
  options: HttpApiOptions
): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureWorkflowTable();
  await ensureWorkflowVersionTable();

  if (request.method === "POST") {
    const workflow = (await Workflow.get(workflowId)) as Workflow | null;
    if (!workflow) return errorResponse(404, "Workflow not found");
    if (workflow.user_id !== userId) return errorResponse(404, "Workflow not found");

    const body = await parseJsonBody<VersionCreateBody>(request);
    const nextVer = await WorkflowVersion.nextVersion(workflowId);
    const version = (await WorkflowVersion.create({
      workflow_id: workflowId,
      user_id: userId,
      name: body?.name ?? null,
      description: body?.description ?? null,
      graph: workflow.graph,
      version: nextVer,
    })) as WorkflowVersion;
    return jsonResponse(toVersionResponse(version));
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const limit = parseLimit(url, 100);
    const versions = await WorkflowVersion.listForWorkflow(workflowId, { limit });
    return jsonResponse({ versions: versions.map(toVersionResponse) });
  }

  return errorResponse(405, "Method not allowed");
}

async function handleWorkflowVersionByNumber(
  request: Request,
  workflowId: string,
  versionNumber: number,
  options: HttpApiOptions
): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureWorkflowTable();
  await ensureWorkflowVersionTable();

  if (request.method === "GET") {
    const version = await WorkflowVersion.findByVersion(workflowId, versionNumber);
    if (!version) return errorResponse(404, "Version not found");
    const workflow = (await Workflow.get(workflowId)) as Workflow | null;
    if (!workflow) return errorResponse(404, "Workflow not found");
    if (workflow.user_id !== userId) return errorResponse(404, "Workflow not found");
    return jsonResponse(toVersionResponse(version));
  }

  if (request.method === "POST") {
    // restore: copy version graph back to workflow
    const version = await WorkflowVersion.findByVersion(workflowId, versionNumber);
    if (!version) return errorResponse(404, "Version not found");
    const workflow = (await Workflow.get(workflowId)) as Workflow | null;
    if (!workflow) return errorResponse(404, "Workflow not found");
    if (workflow.user_id !== userId) return errorResponse(404, "Workflow not found");
    workflow.graph = version.graph;
    await workflow.save();
    return jsonResponse(toWorkflowResponse(workflow));
  }

  return errorResponse(405, "Method not allowed");
}

async function handleWorkflowVersionDeleteById(
  request: Request,
  _workflowId: string,
  versionId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "DELETE") {
    return errorResponse(405, "Method not allowed");
  }
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureWorkflowVersionTable();
  const version = (await WorkflowVersion.get(versionId)) as WorkflowVersion | null;
  if (!version) return errorResponse(404, "Version not found");
  if (version.user_id !== userId) return errorResponse(404, "Version not found");
  await version.delete();
  return new Response(null, { status: 204 });
}

async function handleWorkflowsRoot(request: Request, options: HttpApiOptions): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  const url = new URL(request.url);

  if (request.method === "GET") {
    await ensureWorkflowTable();
    const limit = parseLimit(url, 100);
    const runMode = url.searchParams.get("run_mode") ?? undefined;
    // cursor and columns params accepted for Python parity (cursor ignored in memory adapter)
    // columns param is Python-specific (column selection) — ignored here
    const [workflows, cursor] = await Workflow.paginate(userId, { limit, runMode });
    return jsonResponse({
      workflows: workflows.map((w) => toWorkflowResponse(w)),
      next: cursor || null,
    });
  }

  if (request.method === "POST") {
    await ensureWorkflowTable();
    const body = await parseJsonBody<WorkflowRequestBody>(request);
    if (!body) return errorResponse(400, "Invalid JSON body");
    try {
      const workflow = await createWorkflow(body, userId);
      return jsonResponse(toWorkflowResponse(workflow));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid workflow";
      return errorResponse(400, message);
    }
  }

  return errorResponse(405, "Method not allowed");
}

async function handlePublicWorkflows(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  await ensureWorkflowTable();
  const url = new URL(request.url);
  const limit = parseLimit(url, 100);
  const [workflows] = await Workflow.paginatePublic({ limit });
  return jsonResponse({
    workflows: workflows.map((w) => toWorkflowResponse(w)),
    next: null,
  });
}

async function handlePublicWorkflowById(request: Request, workflowId: string): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  await ensureWorkflowTable();
  const workflow = (await Workflow.get(workflowId)) as Workflow | null;
  if (!workflow || workflow.access !== "public") {
    return errorResponse(404, "Workflow not found");
  }
  return jsonResponse(toWorkflowResponse(workflow));
}

async function handleWorkflowById(
  request: Request,
  workflowId: string,
  options: HttpApiOptions
): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureWorkflowTable();

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
      const message = error instanceof Error ? error.message : "Invalid workflow";
      if (message === "Workflow not found") return errorResponse(404, message);
      return errorResponse(400, message);
    }
  }

  if (request.method === "DELETE") {
    const workflow = (await Workflow.get(workflowId)) as Workflow | null;
    if (!workflow) return errorResponse(404, "Workflow not found");
    if (workflow.user_id !== userId) return errorResponse(404, "Workflow not found");
    await workflow.delete();
    return new Response(null, { status: 204 });
  }

  return errorResponse(405, "Method not allowed");
}

// ── Message types & helpers ────────────────────────────────────────

interface MessageCreateBody {
  thread_id?: string | null;
  role: string;
  name?: string | null;
  content: string | unknown[] | Record<string, unknown> | null;
  tool_call_id?: string | null;
  tool_calls?: unknown[] | null;
}

function toMessageResponse(msg: Message): JsonObject {
  return {
    type: "message",
    id: msg.id,
    user_id: msg.user_id,
    thread_id: msg.thread_id,
    role: msg.role,
    name: msg.name ?? null,
    content: msg.content,
    tool_calls: msg.tool_calls,
    tool_call_id: (msg as unknown as Record<string, unknown>).tool_call_id ?? null,
    created_at: msg.created_at,
    updated_at: msg.updated_at,
  };
}

async function handleMessagesRoot(request: Request, options: HttpApiOptions): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");

  if (request.method === "POST") {
    await ensureThreadTable();
    await ensureMessageTable();
    const body = await parseJsonBody<MessageCreateBody>(request);
    if (!body || typeof body.role !== "string" || body.content === undefined) {
      return errorResponse(400, "Invalid JSON body");
    }
    let threadId = body.thread_id;
    if (!threadId) {
      const thread = (await Thread.create({
        user_id: userId,
        title: "New Thread",
      })) as Thread;
      threadId = thread.id;
    }
    const contentStr = typeof body.content === "string"
      ? body.content
      : JSON.stringify(body.content ?? null);
    const msg = (await Message.create({
      user_id: userId,
      thread_id: threadId,
      role: body.role,
      name: body.name ?? null,
      content: contentStr,
      tool_calls: body.tool_calls ?? null,
    })) as Message;
    return jsonResponse(toMessageResponse(msg));
  }

  if (request.method === "GET") {
    await ensureMessageTable();
    const url = new URL(request.url);
    const threadId = url.searchParams.get("thread_id");
    if (!threadId) {
      return errorResponse(400, "thread_id is required");
    }
    const limit = parseLimit(url, 100);
    const cursorParam = url.searchParams.get("cursor") ?? undefined;
    const reverseParam = url.searchParams.get("reverse");
    const reverse = reverseParam === "true" ? true : reverseParam === "false" ? false : undefined;
    const [messages, cursor] = await Message.paginate(threadId, { limit, startKey: cursorParam, reverse });
    // Verify user ownership
    for (const msg of messages) {
      if (msg.user_id !== userId) {
        return errorResponse(404, "Message not found");
      }
    }
    return jsonResponse({
      messages: messages.map((m) => toMessageResponse(m)),
      next: cursor || null,
    });
  }

  return errorResponse(405, "Method not allowed");
}

async function handleMessageById(
  request: Request,
  messageId: string,
  options: HttpApiOptions
): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureMessageTable();
  const msg = (await Message.get(messageId)) as Message | null;
  if (!msg || msg.user_id !== userId) {
    return errorResponse(404, "Message not found");
  }

  if (request.method === "GET") {
    return jsonResponse(toMessageResponse(msg));
  }

  if (request.method === "DELETE") {
    await msg.delete();
    return new Response(null, { status: 204 });
  }

  return errorResponse(405, "Method not allowed");
}

// ── Thread types & helpers ────────────────────────────────────────

interface ThreadCreateBody {
  title?: string | null;
}

interface ThreadUpdateBody {
  title: string;
}

function toThreadResponse(thread: Thread): JsonObject {
  return {
    id: thread.id,
    user_id: thread.user_id,
    title: thread.title,
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    etag: thread.getEtag(),
  };
}

async function handleThreadsRoot(request: Request, options: HttpApiOptions): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");

  if (request.method === "POST") {
    await ensureThreadTable();
    const body = await parseJsonBody<ThreadCreateBody>(request);
    const title = body?.title ?? "New Thread";
    const thread = (await Thread.create({
      user_id: userId,
      title,
    })) as Thread;
    return jsonResponse(toThreadResponse(thread));
  }

  if (request.method === "GET") {
    await ensureThreadTable();
    const url = new URL(request.url);
    const limit = parseLimit(url, 10);
    const cursorParam = url.searchParams.get("cursor") ?? undefined;
    const reverseParam = url.searchParams.get("reverse");
    const reverse = reverseParam === "true" ? true : reverseParam === "false" ? false : undefined;
    const [threads, nextCursor] = await Thread.paginate(userId, { limit, startKey: cursorParam, reverse });
    return jsonResponse({
      threads: threads.map((t) => toThreadResponse(t)),
      next: nextCursor || null,
    });
  }

  return errorResponse(405, "Method not allowed");
}

async function handleThreadById(
  request: Request,
  threadId: string,
  options: HttpApiOptions
): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureThreadTable();

  if (request.method === "GET") {
    const thread = await Thread.find(userId, threadId);
    if (!thread) return errorResponse(404, "Thread not found");
    return jsonResponse(toThreadResponse(thread));
  }

  if (request.method === "PUT") {
    const body = await parseJsonBody<ThreadUpdateBody>(request);
    if (!body || typeof body.title !== "string") {
      return errorResponse(400, "Invalid JSON body");
    }
    const thread = await Thread.find(userId, threadId);
    if (!thread) return errorResponse(404, "Thread not found");
    thread.title = body.title;
    await thread.save();
    return jsonResponse(toThreadResponse(thread));
  }

  if (request.method === "DELETE") {
    const thread = await Thread.find(userId, threadId);
    if (!thread) return errorResponse(404, "Thread not found");
    // Delete all messages in the thread
    await ensureMessageTable();
    while (true) {
      const [messages] = await Message.paginate(threadId, { limit: 100 });
      if (!messages.length) break;
      for (const msg of messages) {
        if (msg.user_id === userId) {
          await msg.delete();
        }
      }
      if (messages.length < 100) break;
    }
    await thread.delete();
    return new Response(null, { status: 204 });
  }

  return errorResponse(405, "Method not allowed");
}

// ── Thread summarize stub ─────────────────────────────────────────

async function handleThreadSummarize(
  request: Request,
  threadId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureThreadTable();
  const thread = await Thread.find(userId, threadId);
  if (!thread) return errorResponse(404, "Thread not found");
  return errorResponse(501, "Thread summarization not available in standalone mode");
}

// ── Job types & helpers ───────────────────────────────────────────

function toJobResponse(job: Job): JsonObject {
  return {
    id: job.id,
    user_id: job.user_id,
    job_type: "workflow",
    status: job.status,
    workflow_id: job.workflow_id,
    started_at: job.started_at ?? null,
    finished_at: job.finished_at ?? null,
    error: job.error ?? null,
    cost: null,
  };
}

function toBackgroundJobResponse(job: Job): JsonObject {
  return {
    job_id: job.id,
    status: job.status,
    workflow_id: job.workflow_id,
    created_at: job.started_at ?? null,
    is_running: job.status === "running" || job.status === "scheduled",
    is_completed: job.status === "completed" || job.status === "failed" || job.status === "cancelled",
  };
}

async function handleJobsRoot(request: Request, options: HttpApiOptions): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureJobTable();

  const url = new URL(request.url);
  const limit = parseLimit(url, 100);
  const workflowId = url.searchParams.get("workflow_id") ?? undefined;

  const [jobs, nextStartKey] = await Job.paginate(userId, { limit, workflowId });

  return jsonResponse({
    jobs: jobs.map((j) => toJobResponse(j)),
    next_start_key: nextStartKey || null,
  });
}

async function handleJobById(
  request: Request,
  jobId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "DELETE") {
    return errorResponse(405, "Method not allowed");
  }

  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureJobTable();

  const job = (await Job.get(jobId)) as Job | null;
  if (!job || job.user_id !== userId) {
    return errorResponse(404, "Job not found");
  }

  if (request.method === "GET") {
    return jsonResponse(toJobResponse(job));
  }

  // DELETE
  await job.delete();
  return new Response(null, { status: 204 });
}

async function handleJobCancel(
  request: Request,
  jobId: string,
  options: HttpApiOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureJobTable();

  const job = (await Job.get(jobId)) as Job | null;
  if (!job || job.user_id !== userId) {
    return errorResponse(404, "Job not found");
  }

  job.markCancelled();
  await job.save();

  return jsonResponse(toBackgroundJobResponse(job));
}

// ── Trigger job stubs ─────────────────────────────────────────────

async function handleTriggersRunning(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  return jsonResponse({ workflows: [] });
}

async function handleTriggerStart(
  request: Request,
  _workflowId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }
  return errorResponse(501, "Trigger workflows not available in standalone mode");
}

async function handleTriggerStop(
  request: Request,
  _workflowId: string
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }
  return errorResponse(501, "Trigger workflows not available in standalone mode");
}

// ── Nodes dummy ───────────────────────────────────────────────────

async function handleNodesDummy(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  return jsonResponse({
    type: "asset",
    uri: "",
    asset_id: null,
    data: null,
    metadata: null,
  });
}

// ── Secrets types & helpers ────────────────────────────────────────

interface SecretUpdateBody {
  value: string;
  description?: string;
}

function toSecretResponse(secret: Secret): JsonObject {
  return {
    ...secret.toSafeObject(),
    is_configured: true,
  };
}

async function handleSecretsRoot(request: Request, options: HttpApiOptions): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureSecretTable();

  const [configuredSecrets] = await Secret.listForUser(userId, 1000);
  const configuredMap = new Map(configuredSecrets.map((s) => [s.key, s]));

  // Return all registry secrets with is_configured flag
  const registrySecrets = getRegisteredSettings().filter((d) => d.isSecret);
  const result = registrySecrets.map((def) => {
    const configured = configuredMap.get(def.envVar);
    if (configured) {
      return toSecretResponse(configured);
    }
    return {
      key: def.envVar,
      user_id: userId,
      description: def.description ?? "",
      is_configured: false,
    };
  });

  // Also include any DB secrets not in the registry
  for (const s of configuredSecrets) {
    if (!registrySecrets.some((d) => d.envVar === s.key)) {
      result.push(toSecretResponse(s));
    }
  }

  return jsonResponse({
    secrets: result,
    next_key: null,
  });
}

async function handleSecretByKey(
  request: Request,
  key: string,
  options: HttpApiOptions
): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureSecretTable();

  if (request.method === "GET") {
    const secret = await Secret.find(userId, key);
    if (!secret) return errorResponse(404, "Secret not found");

    const response = toSecretResponse(secret) as Record<string, unknown>;
    const url = new URL(request.url);
    if (url.searchParams.get("decrypt") === "true") {
      try {
        response.value = await secret.getDecryptedValue();
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Failed to decrypt secret";
        return errorResponse(500, detail);
      }
    }
    return jsonResponse(response);
  }

  if (request.method === "PUT") {
    const body = await parseJsonBody<SecretUpdateBody>(request);
    if (!body || typeof body.value !== "string") {
      return errorResponse(400, "Invalid JSON body");
    }
    try {
      const secret = await Secret.upsert({
        userId,
        key,
        value: body.value,
        description: body.description,
      });
      return jsonResponse(toSecretResponse(secret));
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to update secret";
      return errorResponse(500, detail);
    }
  }

  if (request.method === "DELETE") {
    const deleted = await Secret.deleteSecret(userId, key);
    if (!deleted) return errorResponse(404, "Secret not found");
    return jsonResponse({ message: "Secret deleted successfully" });
  }

  return errorResponse(405, "Method not allowed");
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

interface AssetUpdateBody {
  name?: string;
  content_type?: string;
  parent_id?: string;
  metadata?: Record<string, unknown>;
  size?: number;
  data?: string | null;
  data_encoding?: string | null;
}

function toAssetResponse(asset: Asset): JsonObject {
  const isFolder = asset.content_type === "folder";
  const fileName = isFolder ? null : getAssetFileName(asset.id, asset.content_type);
  const getUrl = fileName ? `/api/storage/${fileName}` : null;

  const hasThumbnail = asset.content_type.startsWith("image/") || asset.content_type.startsWith("video/");
  const updatedTs = asset.updated_at ? Math.floor(new Date(asset.updated_at).getTime() / 1000) : 0;
  const thumbUrl = hasThumbnail ? `/api/assets/${asset.id}/thumbnail?t=${updatedTs}` : null;

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
    job_id: asset.job_id ?? null,
  };
}

async function deleteFolderRecursive(userId: string, folderId: string): Promise<string[]> {
  const deletedIds: string[] = [];
  const children = await Asset.getChildren(userId, folderId, 10000);
  for (const child of children) {
    if (child.content_type === "folder") {
      const subDeleted = await deleteFolderRecursive(userId, child.id);
      deletedIds.push(...subDeleted);
    } else {
      await child.delete();
      deletedIds.push(child.id);
    }
  }
  const folder = await Asset.find(userId, folderId);
  if (folder) {
    await folder.delete();
    deletedIds.push(folderId);
  }
  return deletedIds;
}

async function getAllAssetsRecursive(userId: string, folderId: string): Promise<Asset[]> {
  const collected: Asset[] = [];
  const children = await Asset.getChildren(userId, folderId, 10000);
  for (const child of children) {
    collected.push(child);
    if (child.content_type === "folder") {
      const subAssets = await getAllAssetsRecursive(userId, child.id);
      collected.push(...subAssets);
    }
  }
  return collected;
}

async function handleAssetsRoot(request: Request, options: HttpApiOptions): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureAssetTable();

  if (request.method === "GET") {
    const url = new URL(request.url);
    const parentId = url.searchParams.get("parent_id") ?? undefined;
    const contentType = url.searchParams.get("content_type") ?? undefined;
    const workflowId = url.searchParams.get("workflow_id") ?? undefined;
    const nodeId = url.searchParams.get("node_id") ?? undefined;
    const jobId = url.searchParams.get("job_id") ?? undefined;
    const pageSizeRaw = url.searchParams.get("page_size");
    const pageSize = pageSizeRaw
      ? Math.min(Math.max(Number.parseInt(pageSizeRaw, 10) || 10000, 1), 10000)
      : 10000;

    // Default to home folder if no filters specified
    const effectiveParentId =
      parentId === undefined && !contentType && !workflowId && !nodeId && !jobId
        ? userId
        : parentId;

    const [assets, cursor] = await Asset.paginate(userId, {
      parentId: effectiveParentId,
      contentType,
      workflowId,
      nodeId,
      jobId,
      limit: pageSize,
    });

    return jsonResponse({
      assets: assets.map((a) => toAssetResponse(a)),
      next: cursor || null,
    });
  }

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
              parent_id: userId,
            };
          } else {
            body.name = body.name || file.name;
            body.content_type = body.content_type || file.type || "application/octet-stream";
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
      return errorResponse(400, "Invalid JSON body: name, content_type, and parent_id are required");
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
      metadata: Object.keys(metadata).length > 0 ? metadata : (body.metadata ?? null),
      size: fileSize ?? body.size ?? null,
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

async function handleAssetById(
  request: Request,
  assetId: string,
  options: HttpApiOptions
): Promise<Response> {
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureAssetTable();

  if (request.method === "GET") {
    // Special case: home folder
    if (assetId === userId) {
      return jsonResponse({
        id: userId,
        user_id: userId,
        workflow_id: null,
        parent_id: "",
        name: "Home",
        content_type: "folder",
        size: null,
        metadata: null,
        created_at: "",
        get_url: null,
        thumb_url: null,
        duration: null,
        node_id: null,
        job_id: null,
      });
    }

    const asset = await Asset.find(userId, assetId);
    if (!asset) return errorResponse(404, "Asset not found");
    return jsonResponse(toAssetResponse(asset));
  }

  if (request.method === "PUT") {
    const asset = await Asset.find(userId, assetId);
    if (!asset) return errorResponse(404, "Asset not found");

    const body = await parseJsonBody<AssetUpdateBody>(request);
    if (!body) return errorResponse(400, "Invalid JSON body");

    if (body.name !== undefined) asset.name = body.name;
    if (body.content_type !== undefined) asset.content_type = body.content_type;
    if (body.parent_id !== undefined) asset.parent_id = body.parent_id;
    if (body.metadata !== undefined) asset.metadata = body.metadata;
    if (body.size !== undefined) asset.size = body.size;

    if (body.data != null) {
      let buf: Buffer;
      if (body.data_encoding === "base64") {
        buf = Buffer.from(body.data, "base64");
      } else {
        buf = Buffer.from(body.data, "utf-8");
      }
      asset.size = buf.byteLength;

      // Write data to storage directory
      const storagePath = getAssetStoragePath(options.storage);
      const fileName = getAssetFileName(asset.id, asset.content_type);
      const filePath = nodePath.join(storagePath, fileName);
      await mkdir(storagePath, { recursive: true });
      await writeFile(filePath, buf);
    }

    await asset.save();
    return jsonResponse(toAssetResponse(asset));
  }

  if (request.method === "DELETE") {
    const asset = await Asset.find(userId, assetId);
    if (!asset) return errorResponse(404, "Asset not found");

    let deletedAssetIds: string[];
    if (asset.content_type === "folder") {
      deletedAssetIds = await deleteFolderRecursive(userId, assetId);
    } else {
      await asset.delete();
      deletedAssetIds = [assetId];
    }
    return jsonResponse({ deleted_asset_ids: deletedAssetIds });
  }

  return errorResponse(405, "Method not allowed");
}

async function handleAssetsSearch(request: Request, options: HttpApiOptions): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureAssetTable();
  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? "";
  if (query.length < 2) {
    return errorResponse(400, "Query must be at least 2 characters");
  }
  const pageSizeRaw = url.searchParams.get("page_size");
  const pageSize = pageSizeRaw
    ? Math.min(Math.max(Number.parseInt(pageSizeRaw, 10) || 200, 1), 10000)
    : 200;
  const cursor = url.searchParams.get("cursor") ?? undefined;

  // Search by name using a broad paginate and filter client-side (no FTS in memory adapter)
  const [allAssets, nextCursor] = await Asset.paginate(userId, { limit: pageSize });
  const lowerQuery = query.toLowerCase();
  const matched = allAssets.filter((a) => a.name.toLowerCase().includes(lowerQuery));
  void cursor; // cursor not yet wired into paginate for search
  return jsonResponse({
    assets: matched.map((a) => toAssetResponse(a)),
    next_cursor: nextCursor || null,
    total_count: matched.length,
    is_global_search: !url.searchParams.has("workflow_id"),
  });
}

async function handleAssetRecursive(
  request: Request,
  folderId: string,
  options: HttpApiOptions,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureAssetTable();
  const assets = await getAllAssetsRecursive(userId, folderId);
  return jsonResponse({ assets: assets.map((a) => toAssetResponse(a)) });
}

async function handleAssetByFilename(
  request: Request,
  filename: string,
  options: HttpApiOptions,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");
  if (!filename) return errorResponse(400, "filename is required");
  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureAssetTable();
  const [assets] = await Asset.paginate(userId, { limit: 10000 });
  const asset = assets.find((a) => a.name === filename) ?? null;
  if (!asset) return errorResponse(404, "Asset not found");
  return jsonResponse(toAssetResponse(asset));
}

async function handleAssetThumbnail(
  request: Request,
  assetId: string,
  options: HttpApiOptions,
): Promise<Response> {
  if (request.method === "POST") {
    return errorResponse(501, "Thumbnail generation not available");
  }
  if (request.method !== "GET") return errorResponse(405, "Method not allowed");

  const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
  await ensureAssetTable();
  const asset = await Asset.find(userId, assetId);
  if (!asset) return errorResponse(404, "Asset not found");

  if (!asset.hasThumbnail) {
    return errorResponse(400, `Asset type '${asset.content_type}' does not support thumbnails`);
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
        "Cache-Control": "public, max-age=86400",
        "Last-Modified": thumbStat.mtime.toUTCString(),
      },
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
          "Cache-Control": "public, max-age=86400",
          "Last-Modified": fileStat.mtime.toUTCString(),
        },
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
    const response = await handleOpenAIRequest(request, pathname, userId, options.openai);
    if (response) return response;
  }

  if (pathname.startsWith("/api/oauth/")) {
    const response = await handleOAuthRequest(request, pathname, () => getUserId(request, options.userIdHeader ?? "x-user-id"));
    if (response) return response;
  }

  if (pathname === "/api/models" || pathname.startsWith("/api/models/")) {
    const response = await handleModelsApiRequest(request);
    if (response) return response;
  }

  if (pathname === "/api/nodes/replicate_status") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    const replicateKey = process.env.REPLICATE_API_TOKEN ?? await getSecret("REPLICATE_API_TOKEN", "1");
    const configured = Boolean(replicateKey);
    return jsonResponse({ configured });
  }

  if (pathname === "/api/users/validate_username") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    const url = new URL(request.url);
    const username = url.searchParams.get("username");
    if (username === null) return errorResponse(400, "username parameter is required");
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

  if (pathname === "/api/settings") {
    const res = await handleSettingsRequest(request, pathname, options);
    if (res) return res;
  }

  if (pathname === "/api/settings/secrets") {
    return handleSecretsRoot(request, options);
  }

  if (pathname.startsWith("/api/settings/secrets/")) {
    const secretKey = decodeURIComponent(pathname.slice("/api/settings/secrets/".length));
    if (!secretKey) return errorResponse(404, "Not found");
    return handleSecretByKey(request, secretKey, options);
  }

  if (pathname === "/api/assets") {
    return handleAssetsRoot(request, options);
  }

  // Asset sub-routes — must be matched before the generic /{id} catch-all
  if (pathname === "/api/assets/search") {
    return handleAssetsSearch(request, options);
  }

  if (pathname === "/api/assets/packages") {
    return jsonResponse({ assets: [], next: null });
  }

  if (pathname === "/api/assets/download") {
    if (request.method !== "POST") return errorResponse(405, "Method not allowed");
    return errorResponse(501, "ZIP download not available in standalone mode");
  }

  if (pathname === "/api/assets/by-filename" || pathname.startsWith("/api/assets/by-filename/")) {
    const filename = decodeURIComponent(pathname.slice("/api/assets/by-filename/".length));
    return handleAssetByFilename(request, filename, options);
  }

  if (pathname.startsWith("/api/assets/packages/")) {
    // /api/assets/packages/{package_name} or /api/assets/packages/{package_name}/{asset_name}
    const rest = pathname.slice("/api/assets/packages/".length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx !== -1) {
      // Serve a specific package asset file
      const packageName = decodeURIComponent(rest.slice(0, slashIdx));
      const assetName = decodeURIComponent(rest.slice(slashIdx + 1));
      if (!packageName || !assetName) return errorResponse(404, "Not found");
      const loaded = loadPythonPackageMetadata({
        roots: options.metadataRoots,
        maxDepth: options.metadataMaxDepth,
      });
      const pkg = loaded.packages.find((p) => p.name === packageName);
      if (!pkg || !pkg.sourceFolder) return errorResponse(404, `Package '${packageName}' not found`);
      const { createReadStream, statSync } = await import("node:fs");
      const { extname } = await import("node:path");
      const mimeTypes: Record<string, string> = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
        ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".webm": "video/webm",
        ".json": "application/json", ".txt": "text/plain",
      };
      const assetPath = `${pkg.sourceFolder}/nodetool/assets/${packageName}/${assetName}`;
      let stat: { size: number };
      try {
        stat = statSync(assetPath);
      } catch {
        return errorResponse(404, `Asset '${assetName}' not found in package '${packageName}'`);
      }
      const contentType = mimeTypes[extname(assetName).toLowerCase()] ?? "application/octet-stream";
      const stream = createReadStream(assetPath);
      // Convert Node.js stream to Web ReadableStream
      const webStream = new ReadableStream({
        start(controller) {
          stream.on("data", (chunk) => controller.enqueue(chunk));
          stream.on("end", () => controller.close());
          stream.on("error", (err) => controller.error(err));
        },
        cancel() { stream.destroy(); },
      });
      return new Response(webStream, {
        status: 200,
        headers: {
          "content-type": contentType,
          "content-length": String(stat.size),
          "cache-control": "public, max-age=31536000, immutable",
          "etag": `"${packageName}-${assetName}"`,
        },
      });
    }
    return jsonResponse({ assets: [], next: null });
  }

  if (pathname.startsWith("/api/assets/") && pathname.endsWith("/children")) {
    const inner = pathname.slice("/api/assets/".length, pathname.length - "/children".length);
    if (inner && !inner.includes("/")) {
      if (request.method !== "GET") return errorResponse(405, "Method not allowed");
      const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
      await ensureAssetTable();
      const url = new URL(request.url);
      const limit = parseLimit(url, 100);
      const [assets] = await Asset.paginate(userId, { parentId: decodeURIComponent(inner), limit });
      return jsonResponse({ assets: assets.map((a) => toAssetResponse(a)), next: null });
    }
  }

  if (pathname.startsWith("/api/assets/") && pathname.endsWith("/recursive")) {
    // /api/assets/{id}/recursive
    const inner = pathname.slice("/api/assets/".length, pathname.length - "/recursive".length);
    if (inner && !inner.includes("/")) {
      return handleAssetRecursive(request, decodeURIComponent(inner), options);
    }
  }

  if (pathname.startsWith("/api/assets/") && pathname.endsWith("/thumbnail")) {
    const inner = pathname.slice("/api/assets/".length, pathname.length - "/thumbnail".length);
    if (inner && !inner.includes("/")) {
      return handleAssetThumbnail(request, decodeURIComponent(inner), options);
    }
  }

  if (pathname.startsWith("/api/assets/")) {
    const assetId = decodeURIComponent(pathname.slice("/api/assets/".length));
    if (!assetId) return errorResponse(404, "Not found");
    return handleAssetById(request, assetId, options);
  }

  if (pathname === "/api/jobs") {
    return handleJobsRoot(request, options);
  }

  if (pathname === "/api/jobs/running/all") {
    await ensureJobTable();
    const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
    const [jobs] = await Job.paginate(userId, { limit: 500 });
    const running = jobs.filter((j) => j.status === "running" || j.status === "scheduled");
    return jsonResponse(running.map((j) => toBackgroundJobResponse(j)));
  }

  if (pathname === "/api/jobs/triggers/running") {
    return handleTriggersRunning(request);
  }

  if (pathname.match(/^\/api\/jobs\/triggers\/[^/]+\/start$/)) {
    const workflowId = decodeURIComponent(
      pathname.slice("/api/jobs/triggers/".length, pathname.length - "/start".length)
    );
    return handleTriggerStart(request, workflowId);
  }

  if (pathname.match(/^\/api\/jobs\/triggers\/[^/]+\/stop$/)) {
    const workflowId = decodeURIComponent(
      pathname.slice("/api/jobs/triggers/".length, pathname.length - "/stop".length)
    );
    return handleTriggerStop(request, workflowId);
  }

  if (pathname.match(/^\/api\/jobs\/[^/]+\/cancel$/)) {
    const jobId = decodeURIComponent(pathname.slice("/api/jobs/".length, pathname.length - "/cancel".length));
    if (!jobId) return errorResponse(404, "Not found");
    return handleJobCancel(request, jobId, options);
  }

  if (pathname.startsWith("/api/jobs/")) {
    const jobId = decodeURIComponent(pathname.slice("/api/jobs/".length));
    if (!jobId) return errorResponse(404, "Not found");
    return handleJobById(request, jobId, options);
  }

  if (pathname === "/api/messages") {
    return handleMessagesRoot(request, options);
  }

  if (pathname.startsWith("/api/messages/")) {
    const messageId = decodeURIComponent(pathname.slice("/api/messages/".length));
    if (!messageId) return errorResponse(404, "Not found");
    return handleMessageById(request, messageId, options);
  }

  if (pathname === "/api/threads") {
    return handleThreadsRoot(request, options);
  }

  if (pathname.match(/^\/api\/threads\/[^/]+\/summarize$/)) {
    const threadId = decodeURIComponent(
      pathname.slice("/api/threads/".length, pathname.length - "/summarize".length)
    );
    return handleThreadSummarize(request, threadId, options);
  }

  if (pathname.startsWith("/api/threads/")) {
    const threadId = decodeURIComponent(pathname.slice("/api/threads/".length));
    if (!threadId) return errorResponse(404, "Not found");
    return handleThreadById(request, threadId, options);
  }

  if (pathname === "/api/workflows") {
    return handleWorkflowsRoot(request, options);
  }

  if (pathname === "/api/workflows/names") {
    if (request.method !== "GET") return errorResponse(405, "Method not allowed");
    const userId = getUserId(request, options.userIdHeader ?? "x-user-id");
    await ensureWorkflowTable();
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

  if (pathname.startsWith("/api/workflows/examples/")) {
    return errorResponse(404, "Examples not available in standalone mode");
  }

  if (pathname === "/api/workflows/public") {
    return handlePublicWorkflows(request);
  }

  if (pathname.startsWith("/api/workflows/public/")) {
    const workflowId = decodeURIComponent(pathname.slice("/api/workflows/public/".length));
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
        if (request.method !== "POST") return errorResponse(405, "Method not allowed");
        return errorResponse(501, "Workflow execution not available in standalone mode");
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
        return handleWorkflowVersionByNumber(request, workflowId, versionNum, options);
      }
      // /api/workflows/{id}/versions/{version} (GET by version number)
      const versionNumMatch = subPath.match(/^versions\/(\d+)$/);
      if (versionNumMatch) {
        const versionNum = Number.parseInt(versionNumMatch[1], 10);
        return handleWorkflowVersionByNumber(request, workflowId, versionNum, options);
      }
      // /api/workflows/{id}/versions/{version_id} (DELETE by id — version_id is not numeric)
      const versionIdMatch = subPath.match(/^versions\/([^/]+)$/);
      if (versionIdMatch) {
        const versionId = decodeURIComponent(versionIdMatch[1]);
        return handleWorkflowVersionDeleteById(request, workflowId, versionId, options);
      }
    }
  }

  if (pathname.startsWith("/api/workflows/")) {
    const workflowId = decodeURIComponent(pathname.slice("/api/workflows/".length));
    if (!workflowId) return errorResponse(404, "Not found");
    return handleWorkflowById(request, workflowId, options);
  }

  if (pathname.startsWith("/api/storage/")) {
    return getStorageHandler(options.storage)(request);
  }

  if (pathname === "/api/workspaces" || pathname.startsWith("/api/workspaces/")) {
    const res = await handleWorkspaceRequest(request, options);
    if (res) return res;
  }

  if (pathname === "/api/files" || pathname.startsWith("/api/files/")) {
    return handleFileRequest(request);
  }

  if (pathname === "/api/costs" || pathname.startsWith("/api/costs/")) {
    const res = await handleCostRequest(request, options);
    if (res) return res;
  }

  if (pathname === "/api/skills" || pathname.startsWith("/api/skills/")) {
    return handleSkillsRequest(request);
  }

  if (pathname === "/api/fonts" || pathname.startsWith("/api/fonts/")) {
    return handleFontsRequest(request);
  }

  if (pathname === "/api/users" || pathname.startsWith("/api/users/")) {
    const res = await handleUsersRequest(request, pathname, options);
    if (res) return res;
  }

  if (pathname === "/api/collections" || pathname.startsWith("/api/collections/")) {
    const res = await handleCollectionRequest(request, pathname, options);
    if (res) return res;
  }

  if (pathname === "/api/debug/export") {
    return handleDebugExportRequest(request);
  }

  if (pathname === "/admin/secrets/import") {
    if (request.method !== "POST") return errorResponse(405, "Method not allowed");
    return errorResponse(501, "Secrets import not available in standalone mode");
  }

  return errorResponse(404, "Not found");
}

async function readNodeRequestBody(request: IncomingMessage): Promise<Uint8Array> {
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
    body: rawBody && rawBody.byteLength > 0 ? (rawBody as unknown as BodyInit) : undefined,
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
  res.end(bodyBuffer);
}

export function createHttpApiServer(options: HttpApiOptions = {}): Server {
  return createServer((req, res) => {
    void handleNodeHttpRequest(req, res, options).catch((error) => {
      log.error("Request failed", error instanceof Error ? error : new Error(String(error)));
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      const detail = error instanceof Error ? error.message : String(error);
      res.end(JSON.stringify({ detail }));
    });
  });
}
