/**
 * Mini apps as MCP Apps (the `io.modelcontextprotocol/ui` extension).
 *
 * `open_app` names the `ui://` resource below in its `_meta.ui.resourceUri`.
 * A host that supports MCP Apps reads that resource, a self-contained HTML
 * renderer built in `@nodetool-ai/app-export`, mounts it in a sandboxed
 * iframe, and hands it the `open_app` result: the app instance's frozen
 * bundle. The renderer draws the widgets and runs operations by calling the
 * two app-only tools here through the host:
 *
 *   run_app_operation  start one operation and wait a bounded time for it
 *   poll_app_run       read the messages a run produced since a cursor
 *
 * A run is the same durable app run the Run view records: the default
 * working instance of the app (`application:<id>`, the one the web opens),
 * `executeAppOperation` with its budget reservation and cost ledger, origin
 * `agent`. A host without MCP Apps still gets `open_app`'s text result.
 *
 * The run registry is per process. A poll that reaches another replica, or a
 * restarted one, is told the run is gone; the run itself still settles and
 * stays in the app's run history.
 */

import { randomBytes } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MCP_APP_RENDERER_HTML } from "@nodetool-ai/app-export/mcp-app";
import {
  APPLICATION_BUNDLE_SCHEMA_VERSION,
  operationTarget,
  parseApplicationDocument,
  parseBinding,
  type ApplicationBundle,
  type BundledJsScript,
  type BundledWorkflow
} from "@nodetool-ai/app-runtime";
import { createJsScriptAppRunner } from "@nodetool-ai/agents";
import { createLogger, loadAssetStorageConfig } from "@nodetool-ai/config";
import type {
  AppServerRunInput,
  AppServerRunOutcome
} from "@nodetool-ai/execution";
import {
  createAppServerRunner,
  executeAppOperation
} from "@nodetool-ai/execution/service";
import {
  Application,
  Asset,
  getSecret,
  resolveAppInstanceApplicationId
} from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  appRunSnapshot,
  type AppRunSnapshot
} from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import {
  detectImageMime,
  loadMediaRefBytes,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import {
  createOwnedAppInstance,
  getOwnedAppInstance
} from "./lib/app-instances-service.js";
import { releasedApplicationDocument } from "./lib/applications-service.js";
import { isRecord, isString } from "./lib/wire-values.js";
import { resolveMediaRefUrl } from "./resolve-media-urls.js";

const log = createLogger("nodetool.websocket.mcp-apps");

export const MINI_APP_RESOURCE_URI = "ui://nodetool/mini-app.html";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export const MINI_APP_TOOL_NAMES = [
  "open_app",
  "run_app_operation",
  "poll_app_run"
] as const;

/** How long a poll waits for new messages before it answers empty. */
const RUN_WAIT_MS = 20_000;
/**
 * How long the starting call waits for the run to finish. A quick operation
 * settles in one round trip; a slow one shows progress from the first poll.
 */
const FIRST_CALL_WAIT_MS = 8_000;
/** After the first new message, wait this long for more to batch them. */
const BATCH_WINDOW_MS = 250;
const MAX_MESSAGES_PER_SLICE = 500;
/** Settled runs stay readable this long, for a late or repeated poll. */
const SETTLED_RUN_TTL_MS = 10 * 60_000;
/** Media at or under this size is inlined as a `data:` URL. */
const INLINE_MEDIA_LIMIT_BYTES = 8 * 1024 * 1024;
/** Inlined bytes one slice may carry before larger refs fall back to URLs. */
const INLINE_SLICE_LIMIT_BYTES = 24 * 1024 * 1024;

const MEDIA_KINDS = new Set(["image", "audio", "video", "document", "model_3d"]);

/** Message types the app runtime folds; everything else stays on the server. */
const FOLDED_MESSAGE_TYPES = new Set([
  "output_update",
  "chunk",
  "node_progress",
  "node_update",
  "error",
  "tool_call_update",
  "planning_update",
  "task_update",
  "tool_result_update",
  "job_update"
]);

export interface MiniAppToolDeps {
  readonly userId: string;
  /** The session's tool context: secrets, asset storage, model interfaces. */
  readonly context: ProcessingContext;
  /** The node registry, built lazily on the first run. */
  readonly registry: () => Promise<NodeRegistry>;
  /** Override for tests: how long the starting call and a poll wait. */
  readonly waits?: { readonly firstCallMs?: number; readonly pollMs?: number };
  /** Override for tests: execute one workflow operation. */
  readonly runWorkflow?: (
    context: ProcessingContext,
    input: AppServerRunInput
  ) => Promise<AppServerRunOutcome>;
}

interface RunEntry {
  readonly userId: string;
  readonly messages: Array<Record<string, unknown>>;
  readonly controller: AbortController;
  readonly listeners: Set<() => void>;
  done: boolean;
  settledAt: number | null;
}

const runs = new Map<string, RunEntry>();

function sweepSettledRuns(now = Date.now()): void {
  for (const [id, entry] of runs) {
    if (entry.settledAt !== null && now - entry.settledAt > SETTLED_RUN_TTL_MS) {
      runs.delete(id);
    }
  }
}

function wake(entry: RunEntry): void {
  for (const listener of [...entry.listeners]) listener();
}

/** Resolve when the run has messages past `cursor` or has ended, or after `waitMs`. */
function waitForMessages(entry: RunEntry, cursor: number, waitMs: number): Promise<void> {
  if (entry.done || entry.messages.length > cursor) return Promise.resolve();
  return new Promise((resolve) => {
    let batchTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = (): void => {
      clearTimeout(deadline);
      if (batchTimer) clearTimeout(batchTimer);
      entry.listeners.delete(listener);
      resolve();
    };
    const listener = (): void => {
      if (entry.done) {
        finish();
      } else if (!batchTimer) {
        batchTimer = setTimeout(finish, BATCH_WINDOW_MS);
      }
    };
    const deadline = setTimeout(finish, waitMs);
    entry.listeners.add(listener);
  });
}

/**
 * A message as the renderer folds it: only the fields its fold reads, so a
 * node's full result or a tool's raw payload never crosses the host.
 */
export function foldableMessage(message: unknown): Record<string, unknown> | null {
  if (!isRecord(message) || !isString(message["type"])) return null;
  const type = message["type"];
  if (!FOLDED_MESSAGE_TYPES.has(type)) return null;
  if (type === "chunk" && message["content_type"] && message["content_type"] !== "text") {
    return null;
  }
  if (type === "node_update") {
    return pick(message, ["type", "node_id", "node_name", "status", "error"]);
  }
  if (type === "job_update") {
    return pick(message, ["type", "status", "error"]);
  }
  return message;
}

function pick(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) out[key] = record[key];
  }
  return out;
}

function isMediaRef(value: Record<string, unknown>): boolean {
  return (
    isString(value["type"]) &&
    MEDIA_KINDS.has(value["type"]) &&
    (isString(value["uri"]) ||
      isString(value["asset_id"]) ||
      value["data"] !== undefined)
  );
}

function mediaMime(value: Record<string, unknown>, bytes: Uint8Array): string {
  const declared =
    value["content_type"] ?? value["mime_type"] ?? value["mimeType"];
  if (isString(declared) && declared.includes("/")) return declared;
  switch (value["type"]) {
    case "image":
      return detectImageMime(bytes);
    case "audio":
      return "audio/mpeg";
    case "video":
      return "video/mp4";
    case "document":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

function assetIdOf(value: Record<string, unknown>): string | null {
  if (isString(value["asset_id"]) && value["asset_id"]) return value["asset_id"];
  const uri = value["uri"];
  if (isString(uri) && uri.startsWith("asset://")) {
    const id = uri.slice("asset://".length).split(/[./?#]/)[0];
    return id || null;
  }
  return null;
}

interface InlineBudget {
  remaining: number;
}

/**
 * Make one media ref loadable inside the host's sandbox: a `data:` URL while
 * the bytes fit, else a signed storage URL whose origin the resource's CSP
 * lists. A ref neither way can serve keeps its URI and renders empty.
 */
async function sandboxMediaRef(
  value: Record<string, unknown>,
  deps: MiniAppToolDeps,
  budget: InlineBudget
): Promise<Record<string, unknown>> {
  const { data: _bytes, ...rest } = value;
  const uri = value["uri"];
  if (isString(uri) && uri.startsWith("data:")) return rest;
  try {
    const bytes = await loadMediaRefBytes(value, deps.context, {
      allowLocalFile: false
    });
    if (
      bytes &&
      bytes.length <= INLINE_MEDIA_LIMIT_BYTES &&
      bytes.length <= budget.remaining
    ) {
      budget.remaining -= bytes.length;
      const mime = mediaMime(value, bytes);
      return {
        ...rest,
        content_type: mime,
        uri: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`
      };
    }
  } catch (error) {
    log.debug("Could not inline a mini app media value", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  const assetId = assetIdOf(value);
  if (assetId) {
    const asset = await Asset.find(deps.userId, assetId).catch(() => null);
    if (asset) {
      const resolved = await resolveMediaRefUrl(
        { asset_id: asset.id, content_type: asset.content_type },
        deps.userId
      );
      if (isString(resolved["uri"]) && resolved["uri"].startsWith("https:")) {
        return { ...rest, uri: resolved["uri"], content_type: asset.content_type };
      }
    }
  }
  return rest;
}

async function sandboxValue(
  value: unknown,
  deps: MiniAppToolDeps,
  budget: InlineBudget,
  depth = 0
): Promise<unknown> {
  if (depth > 6) return value;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) out.push(await sandboxValue(item, deps, budget, depth + 1));
    return out;
  }
  if (!isRecord(value)) return value;
  if (isMediaRef(value)) return sandboxMediaRef(value, deps, budget);
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = await sandboxValue(entry, deps, budget, depth + 1);
  }
  return out;
}

async function sandboxMessages(
  messages: ReadonlyArray<Record<string, unknown>>,
  deps: MiniAppToolDeps
): Promise<Array<Record<string, unknown>>> {
  const budget: InlineBudget = { remaining: INLINE_SLICE_LIMIT_BYTES };
  const out: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    out.push(
      message["type"] === "output_update"
        ? { ...message, value: await sandboxValue(message["value"], deps, budget) }
        : message
    );
  }
  return out;
}

/** The instance's frozen snapshot as the bundle the renderer reads. */
export function bundleFromSnapshot(
  name: string,
  description: string,
  snapshot: AppRunSnapshot
): ApplicationBundle {
  const document = parseApplicationDocument(snapshot.document);
  if (!document) throw new Error("The app instance holds an invalid app document");
  const workflows = new Map<string, BundledWorkflow>();
  const scripts = new Map<string, BundledJsScript>();
  for (const operation of document.operations) {
    const target = operationTarget(operation);
    if (target.kind === "script") {
      const document =
        snapshot.script_documents[`${target.scriptId}@${target.scriptVersion}`] ??
        snapshot.script_documents[target.scriptId];
      if (document && !scripts.has(target.scriptId)) {
        scripts.set(target.scriptId, {
          key: target.scriptId,
          name: operation.name ?? target.scriptId,
          document,
          version: target.scriptVersion
        });
      }
      continue;
    }
    const graph =
      snapshot.workflow_graphs[`${target.workflowId}@${target.workflowVersion ?? "latest"}`] ??
      snapshot.workflow_graphs[target.workflowId];
    if (graph && !workflows.has(target.workflowId)) {
      workflows.set(target.workflowId, {
        key: target.workflowId,
        name: operation.name ?? target.workflowId,
        graph,
        version: target.workflowVersion ?? null
      });
    }
  }
  return {
    schemaVersion: APPLICATION_BUNDLE_SCHEMA_VERSION,
    name,
    description,
    app: document,
    workflows: [...workflows.values()],
    scripts: [...scripts.values()]
  };
}

/**
 * Apply the node-property values the page sends, keyed `nodeId#property`.
 * Only properties a widget of this operation binds may change, so a page
 * cannot rewrite the rest of the graph.
 */
export function applyPropertyOverrides(
  snapshot: AppRunSnapshot,
  operationId: string,
  graph: AppServerRunInput["graph"],
  overrides: Record<string, unknown>
): AppServerRunInput["graph"] {
  const entries = Object.entries(overrides);
  if (entries.length === 0) return graph;
  const allowed = new Set<string>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 64) return;
    if (isString(value)) {
      const ref = parseBinding(value);
      if (
        ref?.kind === "nodeProperty" &&
        (ref.operationId === operationId || ref.operationId === "")
      ) {
        allowed.add(`${ref.nodeId}#${ref.property}`);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
    } else if (isRecord(value)) {
      for (const item of Object.values(value)) visit(item, depth + 1);
    }
  };
  visit(snapshot.document.ui, 0);
  const byNode = new Map<string, Record<string, unknown>>();
  for (const [key, override] of entries) {
    if (
      !allowed.has(key) ||
      !isRecord(override) ||
      Object.keys(override).length !== 1 ||
      !Object.hasOwn(override, "value")
    ) {
      throw new Error(`Property ${key} is not exposed by this app`);
    }
    const separator = key.lastIndexOf("#");
    const nodeId = key.slice(0, separator);
    byNode.set(nodeId, {
      ...byNode.get(nodeId),
      [key.slice(separator + 1)]: override["value"]
    });
  }
  return {
    ...graph,
    nodes: graph.nodes.map((node: AppServerRunInput["graph"]["nodes"][number]) => {
      const changes = isString(node.id) ? byNode.get(node.id) : undefined;
      if (!changes) return node;
      const properties = isRecord(node.properties) ? node.properties : {};
      return { ...node, properties: { ...properties, ...changes } };
    })
  };
}

/** Origins the renderer may load signed media from, for the resource CSP. */
export function storageResourceDomains(): string[] {
  try {
    const config = loadAssetStorageConfig();
    if (config.kind === "supabase") return [new URL(config.url).origin];
    if (config.kind === "s3") {
      if (config.endpoint) return [new URL(config.endpoint).origin];
      const region = config.region ?? "us-east-1";
      return [
        `https://${config.bucket}.s3.${region}.amazonaws.com`,
        `https://${config.bucket}.s3.amazonaws.com`
      ];
    }
  } catch (error) {
    log.warn("Asset storage config unreadable; mini app media stays inline", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  return [];
}

function jsonResult(payload: Record<string, unknown>, text?: string) {
  return {
    content: [{ type: "text" as const, text: text ?? JSON.stringify(payload) }],
    structuredContent: payload
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true as const
  };
}

async function slice(
  entry: RunEntry,
  runId: string,
  cursor: number,
  deps: MiniAppToolDeps
): Promise<Record<string, unknown>> {
  const start = Math.max(0, Math.min(cursor, entry.messages.length));
  const end = Math.min(entry.messages.length, start + MAX_MESSAGES_PER_SLICE);
  const messages = await sandboxMessages(entry.messages.slice(start, end), deps);
  return {
    run_id: runId,
    cursor: end,
    messages,
    done: entry.done && end === entry.messages.length
  };
}

/** Register the mini app resource and its three tools on one MCP session. */
export function registerMiniAppMcpTools(server: McpServer, deps: MiniAppToolDeps): void {
  const { userId } = deps;
  const firstCallWaitMs = deps.waits?.firstCallMs ?? FIRST_CALL_WAIT_MS;
  const pollWaitMs = deps.waits?.pollMs ?? RUN_WAIT_MS;

  server.registerResource(
    "NodeTool mini app",
    MINI_APP_RESOURCE_URI,
    {
      description:
        "Renders a NodeTool mini app inside an MCP Apps host. Opened by the open_app tool.",
      mimeType: MCP_APP_MIME_TYPE
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: MCP_APP_MIME_TYPE,
          text: MCP_APP_RENDERER_HTML,
          _meta: {
            ui: {
              csp: {
                connectDomains: [],
                resourceDomains: storageResourceDomains(),
                frameDomains: [],
                baseUriDomains: []
              },
              prefersBorder: true
            }
          }
        }
      ]
    })
  );

  server.registerTool(
    "open_app",
    {
      title: "Open a mini app",
      description:
        "Open one of the user's NodeTool mini apps. In a host that supports MCP " +
        "Apps the app's screen appears in the conversation and the user runs it " +
        "there. Opens the released version when the app has one, otherwise the " +
        "draft. Find app ids with nodetool.apps.list in execute_code.",
      inputSchema: {
        application_id: z
          .string()
          .describe("The app's id, or its 12-character short id.")
      },
      _meta: { ui: { resourceUri: MINI_APP_RESOURCE_URI } }
    },
    async ({ application_id }) => {
      try {
        const applicationId = await resolveAppInstanceApplicationId(userId, application_id);
        const app = await Application.findById(applicationId);
        if (!app) throw new Error("Application not found");
        const release = await releasedApplicationDocument(userId, applicationId);
        const document = appRunSnapshot.shape.document.parse(
          release?.document ?? app.toDocument()
        );
        // The default working instance the web's Run view opens, so a run here
        // lands in the same history and keeps the same variables.
        const instance = await createOwnedAppInstance(
          userId,
          {
            application_id: applicationId,
            source_id: `application:${applicationId}`,
            version: release?.version ?? null,
            snapshot: { document, workflow_graphs: {}, script_documents: {} }
          },
          true
        );
        const bundle = bundleFromSnapshot(app.name, app.description ?? "", instance.snapshot);
        const operations = bundle.app.operations.map((operation) => operation.id);
        const summary =
          `Opened "${app.name}"` +
          (instance.version != null ? ` (version ${instance.version})` : " (draft)") +
          `. Operations: ${operations.join(", ") || "none"}. ` +
          "The app is shown to the user, who fills its fields and runs it there.";
        return jsonResult(
          {
            application_id: applicationId,
            instance_id: instance.id,
            name: app.name,
            version: instance.version ?? null,
            operations,
            bundle
          },
          summary
        );
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "run_app_operation",
    {
      title: "Run a mini app operation",
      description:
        "Used by the open_app screen: run one operation of an opened app instance " +
        "and return its first messages. Continue with poll_app_run.",
      inputSchema: {
        instance_id: z.string().describe("instance_id from open_app."),
        operation_id: z.string().describe("The operation to run."),
        params: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Workflow input values by input name."),
        property_overrides: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Bound node properties, keyed nodeId#property, each { value }.")
      },
      _meta: { ui: { resourceUri: MINI_APP_RESOURCE_URI, visibility: ["app"] } }
    },
    async ({ instance_id, operation_id, params, property_overrides }) => {
      try {
        const instance = await getOwnedAppInstance(userId, instance_id);
        const snapshot = instance.snapshot;
        const operation = snapshot.document.operations.find((op) => op.id === operation_id);
        if (!operation) throw new Error(`This app has no operation "${operation_id}"`);
        const overrides = property_overrides ?? {};
        // Refuse a bad override before anything is reserved or billed.
        const target = operationTarget(operation);
        if (Object.keys(overrides).length > 0 && target.kind !== "workflow") {
          throw new Error("Property overrides apply to workflow operations only");
        }
        applyPropertyOverrides(snapshot, operation_id, { nodes: [], edges: [] }, overrides);

        sweepSettledRuns();
        const runId = randomBytes(16).toString("hex");
        const controller = new AbortController();
        const entry: RunEntry = {
          userId,
          messages: [],
          controller,
          listeners: new Set(),
          done: false,
          settledAt: null
        };
        runs.set(runId, entry);
        const push = (message: Record<string, unknown>): void => {
          entry.messages.push(message);
          wake(entry);
        };
        const settle = (status: string, error: string | null): void => {
          const terminal: Record<string, unknown> = { type: "job_update", status };
          if (error) terminal["error"] = error;
          push(terminal);
          entry.done = true;
          entry.settledAt = Date.now();
          wake(entry);
        };

        const runContext = deps.context.copy({ jobId: runId, inheritMessageListeners: false });
        runContext.signal = controller.signal;
        runContext.addMessageListener((message) => {
          const folded = foldableMessage(message);
          if (folded) push(folded);
        });
        const inputs = params ?? {};
        void (async () => {
          const registry = await deps.registry();
          const runWorkflow =
            deps.runWorkflow ??
            ((context: ProcessingContext, input: AppServerRunInput) =>
              createAppServerRunner(userId, registry, { context })(input));
          const outcome = await executeAppOperation({
            userId,
            instanceId: instance.id,
            operationId: operation_id,
            invocationId: runId,
            origin: "agent",
            context: runContext,
            registry,
            resolvedInputs: inputs,
            inputSnapshot:
              Object.keys(overrides).length > 0
                ? { parameters: inputs, node_properties: overrides }
                : inputs,
            workflowRunner: (context, input) =>
              runWorkflow(context, {
                ...input,
                graph: applyPropertyOverrides(snapshot, operation_id, input.graph, overrides)
              }),
            scriptRunner: (context, input) =>
              createJsScriptAppRunner(userId, { context, secretResolver: getSecret })(input)
          });
          settle(outcome.run.status === "running" ? "failed" : outcome.run.status, outcome.run.error);
        })().catch((error: unknown) => {
          settle("failed", error instanceof Error ? error.message : String(error));
        });

        await waitUntilDone(entry, firstCallWaitMs);
        return jsonResult(await slice(entry, runId, 0, deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    "poll_app_run",
    {
      title: "Read a mini app run",
      description:
        "Used by the open_app screen: return the messages a run produced after " +
        "cursor, waiting briefly for new ones, or cancel the run.",
      inputSchema: {
        run_id: z.string().describe("run_id from run_app_operation."),
        cursor: z.number().int().min(0).optional().describe("cursor from the previous call."),
        cancel: z.boolean().optional().describe("Cancel the run instead of reading it.")
      },
      _meta: { ui: { resourceUri: MINI_APP_RESOURCE_URI, visibility: ["app"] } }
    },
    async ({ run_id, cursor, cancel }) => {
      try {
        const entry = runs.get(run_id);
        if (!entry || entry.userId !== userId) {
          throw new Error(
            "This run is no longer on this server. It still finishes, and its " +
              "result appears in the app's run history in NodeTool."
          );
        }
        if (cancel) {
          entry.controller.abort();
          return jsonResult({ run_id, cancelled: true });
        }
        const from = cursor ?? 0;
        await waitForMessages(entry, from, pollWaitMs);
        return jsonResult(await slice(entry, run_id, from, deps));
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}

/**
 * Keep the first call open while the run is short, so a quick operation
 * settles in one round trip. Returns early when the run ends.
 */
function waitUntilDone(entry: RunEntry, waitMs: number): Promise<void> {
  if (entry.done) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(deadline);
      entry.listeners.delete(listener);
      resolve();
    };
    const listener = (): void => {
      if (entry.done) finish();
    };
    const deadline = setTimeout(finish, waitMs);
    entry.listeners.add(listener);
  });
}

/** Test-only: drop every tracked run. */
export function __resetMiniAppRunsForTests(): void {
  runs.clear();
}
