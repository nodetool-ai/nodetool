/**
 * Bridges the canonical agent tools (`@nodetool-ai/agents`) onto the MCP
 * server so external agents (Claude Code, ChatGPT, …) get the same toolbelt
 * the in-app chat agent runs on — not just the read/render tools defined
 * natively in `mcp-server.ts`.
 *
 * The bridged set is *derived*, not hand-listed: `getBuiltinTools()` plus
 * `getAllMcpTools()` plus the Google Workspace tools are exactly what
 * `unified-websocket-runner` assembles for a chat turn, so a tool added to
 * either catalog reaches MCP with no edit here. Only tools whose constructor
 * needs something the catalogs can't supply (a timeline loader, the lazily
 * probed provider map) are named individually below.
 *
 * Each bridged tool reuses its agent `Tool.process()` handler verbatim; this
 * module only adapts the tool's JSON-Schema into the Zod shape the MCP SDK
 * expects and wraps the result in an MCP tool response. Names the native
 * registration already owns (run_workflow, list_workflows, list_nodes, …) are
 * skipped — the native versions render thumbnails and Apps.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JsonSchema, ProcessingContext } from "@nodetool-ai/runtime";
import { ProcessingContext as ProcessingContextImpl } from "@nodetool-ai/runtime";
import {
  Tool,
  ValidateTimelineTool,
  ValidateSketchTool,
  FindModelTool,
  GenerateImageTool,
  EditImageTool,
  GenerateVideoTool,
  AnimateImageTool,
  GenerateSpeechTool,
  TranscribeAudioTool,
  EmbedTextTool,
  getBuiltinTools,
  getAllMcpTools,
  getGoogleWorkspaceTools
} from "@nodetool-ai/agents";
import { FileStorageAdapter } from "@nodetool-ai/runtime";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { SketchLoader, TimelineLoader } from "@nodetool-ai/agents";
import {
  getSecret,
  Asset,
  ImageDocument,
  TimelineSequence
} from "@nodetool-ai/models";
import { WORKFLOW_DOCUMENT_TOOL_NAMES } from "@nodetool-ai/node-sdk";
import {
  createLogger,
  getNodetoolDataDir,
  isGoogleWorkspaceEnabled
} from "@nodetool-ai/config";
import { join } from "node:path";
import { getAssetAdapter } from "./lib/storage.js";
import { storeAssetWithThumbnail } from "./lib/thumbnail.js";
import type { McpServerOptions } from "./mcp-server.js";

export type FrontendDocumentToolExecutor = (
  name: string,
  args: Record<string, unknown>
) => Promise<{ handled: boolean; result?: unknown }>;

const log = createLogger("nodetool.websocket.mcp-agent-tools");

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/html": "html",
  "model/gltf-binary": "glb"
};

/**
 * Per-user workspace directory the bridged file tools (read_file, write_file,
 * glob, grep, …) are rooted at. Kept under the NodeTool data dir rather than a
 * temp dir because an MCP session is long-lived and spans many calls — a file
 * written on one call has to still be there on the next. One directory per
 * user, so a multi-user mount cannot let one caller read another's files.
 */
function mcpWorkspaceDir(userId: string): string {
  // A user id reaches the filesystem as a path segment here, so allow only
  // characters that cannot traverse out of the parent directory.
  const safeUserId = userId.replace(/[^A-Za-z0-9_-]/g, "_") || "default";
  return join(getNodetoolDataDir(), "mcp-workspaces", safeUserId);
}

/** Test-only: expose the workspace path rule for isolation assertions. */
export const __mcpWorkspaceDirForTests = mcpWorkspaceDir;

/**
 * Build the shared ProcessingContext the bridged tools run against. REST-backed
 * tools (create_workflow, list_models, …) read `NODETOOL_API_URL` from the
 * inherited environment; media tools resolve providers via the secret resolver;
 * save/media tools persist artifacts through `createAsset`; file tools read and
 * write under the session's workspace directory.
 */
function buildAgentToolContext(userId: string): ProcessingContext {
  const storage = getAssetAdapter();
  const workspaceDir = mcpWorkspaceDir(userId);
  const context = new ProcessingContextImpl({
    jobId: "mcp-agent-tools",
    userId,
    // Bind secret lookups to the scoped user — never a global default.
    secretResolver: (key: string) => getSecret(key, userId),
    storage,
    workspaceDir,
    workspaceStorage: new FileStorageAdapter(workspaceDir)
  });
  context.setModelInterfaces({
    createAsset: async (args) => {
      const asset = new Asset({
        user_id: args.userId,
        workflow_id: args.workflowId ?? null,
        node_id: args.nodeId ?? null,
        job_id: args.jobId ?? null,
        name: args.name,
        content_type: args.contentType,
        parent_id: args.parentId ?? null
      });
      if (args.content) {
        const ext = MIME_TO_EXT[args.contentType] ?? "bin";
        const key = `${asset.id}.${ext}`;
        await storeAssetWithThumbnail(
          asset.user_id,
          asset.id,
          key,
          args.content,
          args.contentType
        );
        asset.size = args.content.length;
      }
      await asset.save();
      return asset;
    },
    getAssetInfo: async ({ userId, assetId }) => {
      const asset = await Asset.find(userId, assetId);
      if (!asset) return null;
      return {
        id: asset.id,
        content_type: asset.content_type,
        name: asset.name,
        metadata: asset.metadata ?? null
      };
    }
  });
  return context;
}

/**
 * Read a `timeline_sequences` row for `validate_timeline`. There is no REST
 * route for timelines (the API is tRPC-only), so the tool takes this loader
 * instead of fetching. Ownership is checked the same way the tRPC router's
 * `loadOwned` does — a row belonging to another user reads as not found.
 */
const loadTimelineForUser: TimelineLoader = async (context, id) => {
  const row = await TimelineSequence.findById(id);
  if (!row || row.user_id !== context.userId) return null;
  return {
    document: row.document,
    fps: row.fps,
    width: row.width,
    height: row.height,
    name: row.name
  };
};

/**
 * Read an `image_documents` row for `validate_sketch`. There is no REST route
 * for sketches (the API is tRPC-only), so the tool takes this loader instead of
 * fetching. Ownership is checked the same way the tRPC router's `loadOwned`
 * does — a row belonging to another user reads as not found.
 */
const loadSketchForUser: SketchLoader = async (context, id) => {
  const row = await ImageDocument.findById(id);
  if (!row || row.user_id !== context.userId) return null;
  return {
    document: row.document,
    width: row.width,
    height: row.height,
    backgroundColor: row.background_color,
    name: row.name
  };
};

/** Test-only: expose the per-user context construction for scope assertions. */
export const __buildAgentToolContextForTests = (
  userId: string
): ProcessingContext => buildAgentToolContext(userId);

/** Load every configured provider, keyed by id, into `into` (mirrors the runner). */
async function loadConfiguredProviders(
  into: Record<string, BaseProvider>,
  userId: string
): Promise<void> {
  const providersMod = await import("@nodetool-ai/runtime");
  const getSecretFor = (key: string) =>
    getSecret(key, userId).then((v) => v ?? undefined);
  const ids = providersMod.listRegisteredProviderIds();
  await Promise.all(
    ids.map(async (id) => {
      try {
        if (await providersMod.isProviderConfigured(id, getSecretFor)) {
          into[id] = await providersMod.getProvider(id, getSecretFor);
        }
      } catch (err) {
        log.debug("Skipping unconfigured provider for MCP find_model", {
          provider: id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    })
  );
}

// ── JSON Schema → Zod shape ─────────────────────────────────────────
//
// The agent tools declare plain JSON-Schema; the MCP SDK's `server.tool`
// wants a Zod raw shape. These converters cover the property kinds the tools
// actually use (string/number/boolean/array/object, enums, defaults).

function jsonSchemaPropToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  const type = prop["type"];
  switch (type) {
    case "string": {
      const values = prop["enum"];
      if (
        Array.isArray(values) &&
        values.every((v) => typeof v === "string") &&
        values.length > 0
      ) {
        return z.enum(values as [string, ...string[]]);
      }
      return z.string();
    }
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array": {
      const items = prop["items"] as Record<string, unknown> | undefined;
      return z.array(items ? jsonSchemaPropToZod(items) : z.unknown());
    }
    case "object":
      return z.record(z.string(), z.unknown());
    default:
      return z.unknown();
  }
}

function jsonSchemaToZodShape(schema: JsonSchema | undefined): z.ZodRawShape {
  const shape: Record<string, z.ZodTypeAny> = {};
  const s = schema as Record<string, unknown> | undefined;
  if (!s || s["type"] !== "object") return shape;
  const properties = s["properties"] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!properties) return shape;
  const required = new Set(
    Array.isArray(s["required"]) ? (s["required"] as string[]) : []
  );
  for (const [key, prop] of Object.entries(properties)) {
    let zt = jsonSchemaPropToZod(prop);
    if (typeof prop["description"] === "string") {
      zt = zt.describe(prop["description"] as string);
    }
    if ("default" in prop) {
      zt = zt.default(prop["default"]);
    } else if (!required.has(key)) {
      zt = zt.optional();
    }
    shape[key] = zt;
  }
  return shape;
}

// ── MCP response helpers ────────────────────────────────────────────

function isErrorResult(result: unknown): boolean {
  if (!result || typeof result !== "object" || Array.isArray(result))
    return false;
  const r = result as Record<string, unknown>;
  return Boolean(r["error"]) || r["success"] === false;
}

function toToolResponse(result: unknown) {
  const isObject =
    result !== null && typeof result === "object" && !Array.isArray(result);
  const isError = isErrorResult(result);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result ?? null) }],
    ...(isError ? { isError: true as const } : {}),
    ...(isObject && !isError
      ? { structuredContent: result as Record<string, unknown> }
      : {})
  };
}

function errorResponse(err: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: err instanceof Error ? err.message : String(err)
        })
      }
    ],
    isError: true as const
  };
}

/**
 * Every agent tool the bridge offers, in registration order. Derived from the
 * same catalogs `unified-websocket-runner` assembles a chat toolbelt from, so
 * the two surfaces cannot drift.
 *
 * `providers` is the map `find_model` reads at call time — it is passed by
 * reference and filled in lazily, so it is empty here.
 */
function collectBridgedTools(
  options: McpServerOptions | undefined,
  providers: Record<string, BaseProvider>
): Tool[] {
  return [
    // The chat agent's built-ins: files, search, browser, code, PDF, math,
    // vision, critique, thread memory, asset library, todo.
    ...getBuiltinTools(),
    // Workflow / node / job / asset / app tools, plus the ui_* workflow
    // document tools. The read tools among them (list_workflows, get_asset, …)
    // collide with the native registrations and are skipped by the caller.
    ...getAllMcpTools({ registry: options?.registry }),
    // Google Workspace runs on the token from the user's Google sign-in, so it
    // only exists on deployments that have a login — same gate the runner uses.
    ...(isGoogleWorkspaceEnabled() ? getGoogleWorkspaceTools() : []),
    // Timelines have no REST route (the API is tRPC-only), so this tool takes a
    // loader instead of fetching, and `getAllMcpTools` cannot construct it.
    new ValidateTimelineTool(loadTimelineForUser),
    // Sketches are tRPC-only too, so this one takes a loader for the same
    // reason and `getAllMcpTools` cannot construct it either.
    new ValidateSketchTool(loadSketchForUser),
    // `getAllMcpTools` only offers the media tools when handed a populated
    // provider map. Here they resolve providers from the scoped user's secrets
    // at call time, so offer them unconditionally rather than probing every
    // provider during server construction.
    new GenerateImageTool(),
    new EditImageTool(),
    new GenerateVideoTool(),
    new AnimateImageTool(),
    new GenerateSpeechTool(),
    new TranscribeAudioTool(),
    new EmbedTextTool(),
    new FindModelTool(providers)
  ];
}

/**
 * Register the agent toolbelt on `server`.
 *
 * Called from `createMcpServer` after the native tools are registered.
 * `reservedNames` carries the names those registrations took; a bridged tool
 * whose name is already spoken for is skipped rather than shadowing the native
 * version (which renders thumbnails and Apps).
 */
export function registerAgentMcpTools(
  server: McpServer,
  options?: McpServerOptions,
  executeFrontendDocumentTool?: FrontendDocumentToolExecutor,
  reservedNames?: ReadonlySet<string>
): void {
  // Every bridged tool runs against one user's secrets and assets, so a
  // session without an explicit user binding gets no bridged tools at all —
  // a default user here would cross the tenant boundary on any mount that
  // serves more than one caller.
  const scope = options?.agentToolsScope;
  if (!scope) {
    log.info(
      "Agent MCP tools not registered: no agentToolsScope on this session"
    );
    return;
  }
  const context = buildAgentToolContext(scope.userId);

  // Populated lazily on first `find_model` call — provider probing hits the
  // secret store and network, so it's deferred out of server construction.
  const sharedProviders: Record<string, BaseProvider> = {};
  let providersPromise: Promise<void> | null = null;
  const ensureProviders = (): Promise<void> => {
    if (!providersPromise)
      providersPromise = loadConfiguredProviders(sharedProviders, scope.userId);
    return providersPromise;
  };

  const workflowDocumentToolNames = new Set<string>(
    WORKFLOW_DOCUMENT_TOOL_NAMES
  );
  const register = (tool: Tool, before?: () => Promise<void>): void => {
    server.tool(
      tool.name,
      tool.description,
      jsonSchemaToZodShape(tool.inputSchema),
      async (args) => {
        try {
          if (before) await before();
          if (
            executeFrontendDocumentTool &&
            workflowDocumentToolNames.has(tool.name)
          ) {
            const frontend = await executeFrontendDocumentTool(
              tool.name,
              (args ?? {}) as Record<string, unknown>
            );
            if (frontend.handled) return toToolResponse(frontend.result);
          }
          const result = await tool.process(
            context,
            (args ?? {}) as Record<string, unknown>
          );
          return toToolResponse(result);
        } catch (err) {
          return errorResponse(err);
        }
      }
    );
  };

  const taken = new Set<string>(reservedNames ?? []);
  const skipped: string[] = [];
  let registered = 0;
  for (const tool of collectBridgedTools(options, sharedProviders)) {
    if (taken.has(tool.name)) {
      skipped.push(tool.name);
      continue;
    }
    taken.add(tool.name);
    // find_model reads the configured-providers map at call time, so populate
    // it before the handler runs.
    register(tool, tool instanceof FindModelTool ? ensureProviders : undefined);
    registered += 1;
  }
  log.info("Registered agent MCP tools", {
    userId: scope.userId,
    source: scope.source,
    registered,
    skipped
  });
}
