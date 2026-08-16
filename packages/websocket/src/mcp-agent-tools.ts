/**
 * Bridges the canonical agent tools (`@nodetool-ai/agents`) onto the MCP server
 * so external agents (Claude Code, ChatGPT, …) get the same surface the in-app
 * chat agent runs on.
 *
 * That surface is CodeAct, not a flat catalog. The mount registers exactly two
 * tools: `execute_code` — built by the very same {@link createChatCodeActSession}
 * the chat runner uses, so the two cannot drift — and `view_image`, which stays
 * direct because pixels cannot ride the sandbox's JSON observation envelope.
 * Every other capability lives inside the sandbox as `tools.<name>()` and the
 * `nodetool.*` object model, found with `nodetool.searchTools()` and catalogued
 * on `nodetool://capabilities` and `nodetool://sandbox`.
 *
 * The bridged set is *derived*, not hand-listed: `getAgentToolbelt()` plus
 * `getAllMcpTools()` plus the Google Workspace tools are exactly what
 * `unified-websocket-runner` assembles for a chat turn, so a tool added to
 * either catalog reaches the sandbox belt with no edit here. Only tools whose
 * constructor needs something the catalogs can't supply (a timeline loader, the
 * lazily probed provider map) are named
 * individually below.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JsonSchema, ProcessingContext } from "@nodetool-ai/runtime";
import {
  DIRECT_TOOL_NAMES,
  ProcessingContext as ProcessingContextImpl,
  SDK_NATIVE_TOOL_REPLACEMENTS,
  zodToJsonSchema
} from "@nodetool-ai/runtime";
import {
  Tool,
  CODEACT_RESIDENT_TOOL_NAMES,
  createChatCodeActSession,
  type ChatCodeActToolCall,
  getAgentToolbelt,
  getAllMcpTools,
  getGoogleWorkspaceTools,
  permissionCategoryFor,
  toolForCapabilityName,
  UNGATED,
  createCapabilityRun,
  type CapabilityRun,
  NODETOOL_API_NAMESPACE_TOOLS,
  MCP_GUEST_CONTRACT,
  MCP_SANDBOX_RESOURCE_URI,
  MCP_SANDBOX_PROMPTS,
  buildMcpSandboxCatalog
} from "@nodetool-ai/agents";
import { FileStorageAdapter } from "@nodetool-ai/runtime";
import type { BaseProvider } from "@nodetool-ai/runtime";
import { uiToolSchemas } from "@nodetool-ai/protocol";
import { mcpToolHostDeps } from "./mcp-tool-deps.js";
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
import { createAssetModelInterface } from "./lib/asset-model-interface.js";
import type { McpServerOptions } from "./mcp-server.js";
import type { FrontendRendererService } from "./frontend-renderer-registry.js";
import {
  isRecord,
  isString
} from "./lib/wire-values.js";

const log = createLogger("nodetool.websocket.mcp-agent-tools");

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
    createAsset: createAssetModelInterface,
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
        values.every((v) => isString(v)) &&
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
  const s = schema;
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
    if (isString(prop["description"])) {
      zt = zt.describe(prop["description"]);
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
  if (!isRecord(result)) return false;
  const r = result as Record<string, unknown>;
  return Boolean(r["error"]) || r["success"] === false;
}

function toToolResponse(result: unknown) {
  const isObject =
    isRecord(result);
  const isError = isErrorResult(result);
  const base = {
    content: [{ type: "text" as const, text: JSON.stringify(result ?? null) }]
  };
  const withError = isError ? { ...base, isError: true as const } : base;
  return isObject && !isError
    ? { ...withError, structuredContent: result as Record<string, unknown> }
    : withError;
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
 * `providers` is the map `find_model` and `list_models` read at call time — it
 * is passed by reference and filled in lazily, so it is empty here.
 */
function collectBridgedTools(
  options: McpServerOptions | undefined,
  providers: Record<string, BaseProvider>
): Tool[] {
  return [
    // The chat agent's built-ins: files, search, browser, PDF, vision,
    // critique, thread memory, asset library, todo. `getAgentToolbelt()`, not
    // `getBuiltinTools()`: the provider-specific media and search duplicates
    // are dropped because `nodetool.media` / `web_search` route across
    // backends, and this surface now has the object model that does it.
    ...getAgentToolbelt(),
    // Workflow / node / job / asset / app tools. The read tools among them
    // (list_workflows, get_asset, …)
    // collide with the native registrations and are skipped by the caller.
    // Thread this mount's own configuration into the host deps — a server
    // configured with a non-default examples dir or metadata roots must not
    // silently fall back to the defaults.
    ...getAllMcpTools({
      registry: options?.registry,
      ...mcpToolHostDeps({
        registry: options?.registry,
        metadataRoots: options?.metadataRoots,
        metadataMaxDepth: options?.metadataMaxDepth,
        examplesDir: options?.examplesDir
      })
    }),
    // Google Workspace runs on the token from the user's Google sign-in, so it
    // only exists on deployments that have a login — same gate the runner uses.
    ...(isGoogleWorkspaceEnabled() ? getGoogleWorkspaceTools() : []),
    // Timelines have no REST route (the API is tRPC-only), so this capability
    // reads a loader off the run instead of fetching, and `getAllMcpTools`
    // cannot build it.
    toolForCapabilityName("validate_timeline", (context) =>
      createCapabilityRun({
        context,
        gate: UNGATED,
        loaders: { timeline: loadTimelineForUser }
      })
    ),
    // Sketches are tRPC-only too, so this one reads a loader for the same
    // reason and `getAllMcpTools` cannot build it either.
    toolForCapabilityName("validate_sketch", (context) =>
      createCapabilityRun({
        context,
        gate: UNGATED,
        loaders: { sketch: loadSketchForUser }
      })
    ),
    // `getAllMcpTools` only offers the media tools when handed a populated
    // provider map. Here they resolve providers from the scoped user's secrets
    // at call time, so offer them unconditionally rather than probing every
    // provider during server construction.
    ...[
      "generate_image",
      "edit_image",
      "generate_video",
      "animate_image",
      "generate_speech",
      "transcribe_audio",
      "embed_text"
    ].map((name) => toolForCapabilityName(name)),
    ...["find_model", "list_models"].map((name) =>
      toolForCapabilityName(name, (context) =>
        createCapabilityRun({ context, gate: UNGATED, providers })
      )
    )
  ];
}

/** URI of the structured capability catalog this mount publishes. */
export const MCP_CAPABILITIES_RESOURCE_URI = "nodetool://capabilities";

/** URI of the guest-JS surface this mount publishes. Re-exported for callers. */
export { MCP_SANDBOX_RESOURCE_URI };

const RENDERER_ID_PROPERTY = {
  type: "string" as const,
  description:
    "Target a specific connected NodeTool editor. Omit to use the " +
    "most-recently-active one. List ids with list_renderers()."
};

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

type RendererResult = { handled: boolean; result?: unknown };

async function executeFrontendTool(
  options: McpServerOptions,
  userId: string,
  name: string,
  args: Record<string, unknown>
): Promise<RendererResult> {
  const registry: FrontendRendererService | undefined =
    options.frontendRendererRegistry;
  if (!registry) return { handled: false };
  const { renderer_id, ...toolArgs } = args;
  return registry.execute({
    userId,
    rendererId: isString(renderer_id) ? renderer_id : undefined,
    toolName: name,
    args: toolArgs
  });
}

/** A `ui_*` request that must be handled by a connected editor. */
class FrontendUiTool extends Tool {
  readonly name: string;
  readonly description: string;
  protected readonly jsonSchema: JsonSchema;

  constructor(
    name: string,
    description: string,
    jsonSchema: JsonSchema,
    private readonly options: McpServerOptions,
    private readonly userId: string
  ) {
    super();
    this.name = name;
    this.description = description;
    this.jsonSchema = jsonSchema;
  }

  // HOLDOUT (anti-slop/no-unknown-returns): a bridged tool's result is
  // whatever the editor or capability answered — the open tool-result domain
  // the base `Tool.process` contract in `@nodetool-ai/agents` declares.
  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const outcome = await executeFrontendTool(
      this.options,
      this.userId,
      this.name,
      params
    );
    if (!outcome.handled) {
      const rendererId = params["renderer_id"];
      throw new Error(
        isString(rendererId)
          ? `No connected NodeTool renderer with id "${rendererId}".`
          : `${this.name} needs a connected NodeTool editor; none is open.`
      );
    }
    return outcome.result;
  }
}

/** Adds the optional renderer selector to a workflow document tool schema. */
class RendererAwareDocumentTool extends Tool {
  readonly name: string;
  readonly description: string;
  protected readonly jsonSchema: JsonSchema;

  constructor(private readonly delegate: Tool) {
    super();
    this.name = delegate.name;
    this.description = delegate.description;
    const schema = delegate.inputSchema;
    this.jsonSchema = {
      ...schema,
      type: "object",
      properties: {
        ...recordValue(schema["properties"]),
        renderer_id: RENDERER_ID_PROPERTY
      }
    };
  }

  // HOLDOUT (anti-slop/no-unknown-returns): the result is the delegate's, and
  // `Tool.process` in `@nodetool-ai/agents` declares `Promise<unknown>`.
  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const { renderer_id: _rendererId, ...serverArgs } = params;
    return this.delegate.process(context, serverArgs);
  }
}

/** `list_renderers` as a belt tool: which editors a `ui_*` call could target. */
class ListRenderersTool extends Tool {
  readonly name = "list_renderers";
  readonly description =
    "List connected NodeTool editor renderers that can run ui_* tools. Pass a " +
    "returned renderer_id to a ui_* tool to target that editor; omit it to use " +
    "the active one.";
  protected readonly jsonSchema: JsonSchema = {
    type: "object",
    properties: {}
  };

  constructor(
    private readonly options: McpServerOptions,
    private readonly userId: string
  ) {
    super();
  }

  async process(): Promise<{
    renderers: Array<{ renderer_id: string; active: boolean }>;
  }> {
    const renderers = this.options.frontendRendererRegistry
      ? this.options.frontendRendererRegistry
          .list(this.userId)
          .map((renderer, index) => ({
            renderer_id: renderer.renderer_id,
            active: index === 0
          }))
      : [];
    return { renderers };
  }
}

/**
 * The `ui_*` schemas that steer a connected editor rather than edit a
 * persisted workflow document, plus `list_renderers`.
 */
function editorSteeringTools(
  options: McpServerOptions,
  userId: string
): Tool[] {
  const documentToolNames = new Set<string>(WORKFLOW_DOCUMENT_TOOL_NAMES);
  const tools: Tool[] = [new ListRenderersTool(options, userId)];
  for (const [name, schema] of Object.entries(uiToolSchemas)) {
    if (documentToolNames.has(name)) continue;
    const params = zodToJsonSchema(z.object(schema.parameters));
    const properties = {
      ...recordValue(params["properties"]),
      renderer_id: RENDERER_ID_PROPERTY
    };
    tools.push(
      new FrontendUiTool(
        name,
        schema.description,
        { ...params, type: "object", properties },
        options,
        userId
      )
    );
  }
  return tools;
}

/** First sentence of a tool description, for the capabilities catalog. */
function oneLine(description: string): string {
  const flat = description.replace(/\s+/g, " ").trim();
  const stop = flat.indexOf(". ");
  const line = stop > 0 ? flat.slice(0, stop + 1) : flat;
  return line.length > 200 ? `${line.slice(0, 197)}…` : line;
}

/**
 * The machine-readable form of what this session can do, served as the
 * `nodetool://capabilities` resource. A client that lists two tools learns the
 * contract from the `execute_code` description, which is right for a model and
 * poor for tooling; this is the same catalog with structure, and costs nothing
 * at list time.
 */
function buildCapabilityCatalog(
  belt: Tool[],
  directToolNames: string[]
) {
  const available = new Set(belt.map((tool) => tool.name));
  const modules = Object.entries(NODETOOL_API_NAMESPACE_TOOLS)
    .map(([namespace, names]) => ({
      namespace,
      import: `nodetool.${namespace}`,
      exports: names.filter((name) => available.has(name))
    }))
    .filter((entry) => entry.exports.length > 0);
  return {
    server: "nodetool",
    direct_tools: directToolNames,
    modules,
    tools: belt
      .map((tool) => ({
        name: tool.name,
        description: oneLine(tool.description),
        permission_category: permissionCategoryFor(tool.name)
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

/**
 * Register the agent surface on `server`: one `execute_code` action tool and
 * `view_image`.
 *
 * Everything else the catalogs offer becomes the sandbox belt instead of an MCP
 * tool. It stays fully reachable — `tools.<name>()`, the `nodetool.*` object
 * model, `await nodetool.searchTools("query")` — and the `execute_code` description
 * carries the same contract and catalog the chat runner puts in its system
 * prompt, because MCP has no system prompt to put it in.
 */
export function registerAgentMcpTools(
  server: McpServer,
  options: McpServerOptions
): CapabilityRun {
  // Every bridged tool runs against one user's secrets and assets, so a session
  // without an explicit user binding has no surface at all — a default user
  // here would cross the tenant boundary on any mount serving more than one
  // caller. `createMcpServer` refuses such a session before reaching here.
  const scope = options.agentToolsScope;
  if (!scope) {
    throw new Error(
      "registerAgentMcpTools requires options.agentToolsScope: an MCP session " +
        "must be bound to a user id."
    );
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

  // MCP runs every call in `auto`: an MCP session has no approval UI to prompt
  // through, so a gate that could ask would only deadlock. What bounds this
  // surface is the session's user binding above, not a per-call question.
  // The codeact session mounts it, so an action can import
  // `@nodetool-ai/sandbox-nodetool/<namespace>` and land on `run.invoke`; the
  // belt remains what `tools.<name>()` calls, past the same gate.
  const capabilityRun = createCapabilityRun({
    context,
    gate: {
      mode: "auto",
      sessionAllow: new Set<string>(),
      requestApproval: async () => "allow"
    },
    nodeRegistry: options.registry,
    ...mcpToolHostDeps({
      registry: options.registry,
      metadataRoots: options.metadataRoots,
      metadataMaxDepth: options.metadataMaxDepth,
      examplesDir: options.examplesDir
    }),
    providers: sharedProviders,
    loaders: { timeline: loadTimelineForUser, sketch: loadSketchForUser }
  });

  const workflowDocumentToolNames = new Set<string>(
    WORKFLOW_DOCUMENT_TOOL_NAMES
  );

  /**
   * Run one bridged tool. The single execution path for both surfaces — a
   * direct MCP call and a `tools.<name>()` call inside an action — so a
   * capability cannot behave differently depending on how it was reached.
   */
  // HOLDOUT (anti-slop/no-unknown-returns): one path for every bridged tool,
  // so the result is the open tool-result domain `Tool.process` declares.
  const runBridgedTool = async (
    tool: Tool,
    args: Record<string, unknown>
  ): Promise<unknown> => {
    // find_model and list_models read the configured-providers map at call
    // time, so populate it before either handler runs.
    if (tool.name === "find_model" || tool.name === "list_models") {
      await ensureProviders();
    }
    const isWorkflowDocumentTool = workflowDocumentToolNames.has(tool.name);
    const isFrontendTool = tool.name.startsWith("ui_");
    if (isWorkflowDocumentTool || isFrontendTool) {
      const live = await executeFrontendTool(
        options,
        scope.userId,
        tool.name,
        args
      );
      if (live.handled) return live.result;

      const rendererId = args["renderer_id"];
      if (isString(rendererId)) {
        throw new Error(
          `No connected NodeTool renderer with id "${rendererId}".`
        );
      }

      // Workflow document tools have a server-side implementation and use the
      // live editor when one is available. Other editor tools only exist in a
      // connected renderer, so report the missing target clearly.
      if (isFrontendTool && !isWorkflowDocumentTool) {
        throw new Error(
          `${tool.name} needs a connected NodeTool editor; none is open.`
        );
      }
    }
    const { renderer_id: _rendererId, ...serverArgs } = args;
    return tool.process(context, serverArgs);
  };

  const register = (tool: Tool): void => {
    server.tool(
      tool.name,
      tool.description,
      jsonSchemaToZodShape(tool.inputSchema),
      async (args) => {
        try {
          return toToolResponse(
            await runBridgedTool(tool, (args ?? {}))
          );
        } catch (err) {
          return errorResponse(err);
        }
      }
    );
  };

  // The belt the sandbox sees. Deduped by name, because the two catalogs
  // overlap and a session must not offer one tool under two instances.
  const belt: Tool[] = [];
  const beltNames = new Set<string>();
  for (const originalTool of [
    ...collectBridgedTools(options, sharedProviders),
    ...editorSteeringTools(options, scope.userId)
  ]) {
    const tool = workflowDocumentToolNames.has(originalTool.name)
      ? new RendererAwareDocumentTool(originalTool)
      : originalTool;
    if (beltNames.has(tool.name)) continue;
    beltNames.add(tool.name);
    belt.push(tool);
  }
  const byName = new Map(belt.map((tool) => [tool.name, tool]));

  // `view_image` is the one channel that puts pixels into a caller's context,
  // and pixels cannot ride the sandbox's JSON observation envelope — so it is a
  // direct tool and is kept off the belt, exactly as the chat runner does.
  const beltForSandbox = belt.filter((tool) => tool.name !== "view_image");

  // The direct set, derived the way the CLI turn and the websocket runner
  // derive theirs — minus the tools an MCP *client* already serves natively.
  //
  // `DIRECT_TOOL_NAMES` goes top level everywhere else because those are the
  // shapes models are trained on, so a sandbox round trip whose only job is to
  // forward one buys nothing. That argument holds here too. What does not hold
  // is the file/search half: `SDK_NATIVE_TOOL_REPLACEMENTS` already names the
  // tools a host agent covers with its own — and an MCP client (Claude Code,
  // ChatGPT) is that host. Offering NodeTool's workspace-scoped `read_file`
  // beside the client's own would put two tools of one name and two different
  // roots in front of the same model.
  //
  // What is left has no host equivalent: discovery (which providers, models
  // and node types this install has — a guess there is a hallucinated id that
  // fails at generation time, after the run was paid for), the server-side
  // reach that runs behind NodeTool's own SSRF guard and secrets, and
  // `run_subtask`, whose child gets the NodeTool belt rather than the client's.
  //
  // Derived from both tables rather than hand-listed, so a tool added to
  // either reaches this mount with no edit here.
  const promotedDirect = belt.filter(
    (tool) =>
      DIRECT_TOOL_NAMES.has(tool.name) &&
      !SDK_NATIVE_TOOL_REPLACEMENTS.has(tool.name)
  );
  // They stay on the belt: an action still calls them from code. Listing them
  // as direct only moves where the prompt documents them.
  const directToolNames = [
    "view_image",
    ...promotedDirect.map((tool) => tool.name)
  ];

  const session = createChatCodeActSession({
    tools: beltForSandbox.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    })),
    directToolNames,
    residentToolNames: CODEACT_RESIDENT_TOOL_NAMES,
    executeTool: async (call: ChatCodeActToolCall) => {
      const tool = byName.get(call.name);
      if (!tool) throw new Error(`Unknown tool: ${call.name}`);
      return runBridgedTool(tool, call.args);
    },
    capabilityRun
  });

  // The action tool. MCP has no system prompt, so the guest contract, the
  // catalog and the sandbox summary ride in the description — the only field
  // every MCP client is guaranteed to show the model. The short contract
  // leads: many clients truncate a long description.
  // `title` is a display label for NodeTool's own chat UI, and the action path
  // never reads it — `executeAction` takes `code` and discards the rest. On the
  // provider tool it is required because a system prompt teaches the contract
  // and the label is what the user watches. MCP has neither: a client whose
  // model skipped a field this server does not use had its whole action
  // rejected on validation. It stays in the schema — described, and the
  // contract in the description still asks for one — but is optional here.
  const actionSchema = session.providerTool.inputSchema;
  const actionShape = jsonSchemaToZodShape({
    ...actionSchema,
    required: (Array.isArray(actionSchema["required"])
      ? (actionSchema["required"] as string[])
      : []
    ).filter((name) => name !== "title")
  });

  server.tool(
    session.providerTool.name,
    `${MCP_GUEST_CONTRACT}\n\n${session.providerTool.description}\n\n${session.systemPromptSection}`,
    actionShape,
    async (args) => {
      try {
        // The session already returns the observation envelope as JSON text.
        // Passing it through `toToolResponse` would encode it a second time
        // and hand the caller a quoted string instead of an object.
        const observation = await session.executeAction(
          (args ?? {})
        );
        return {
          content: [{ type: "text" as const, text: observation }]
        };
      } catch (err) {
        return errorResponse(err);
      }
    }
  );

  // `view_image` carries image content, which an action's observation envelope
  // cannot, so it is direct for a reason no other tool shares.
  const viewImage = byName.get("view_image");
  if (viewImage) register(viewImage);

  // The rest of the direct set, for parity with every other entrance.
  for (const tool of promotedDirect) register(tool);

  // The structured catalog, for clients that want more than a description.
  const catalog = buildCapabilityCatalog(belt, [
    session.providerTool.name,
    ...directToolNames
  ]);
  server.registerResource(
    "NodeTool Capabilities",
    MCP_CAPABILITIES_RESOURCE_URI,
    {
      description:
        "What this NodeTool session can do: the nodetool.* modules mounted for " +
        "it, every tool an execute_code action can call, and each tool's " +
        "permission category.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(catalog, null, 2)
        }
      ]
    })
  );

  const sandbox = buildMcpSandboxCatalog();
  server.registerResource(
    "NodeTool Sandbox",
    MCP_SANDBOX_RESOURCE_URI,
    {
      description:
        "How to write execute_code: the guest contract, blocked globals, " +
        "bridges this chat session cannot use, and two worked examples.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(sandbox, null, 2)
        }
      ]
    })
  );

  for (const prompt of MCP_SANDBOX_PROMPTS) {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description
      },
      async () => ({
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: prompt.snippet }
          }
        ]
      })
    );
  }

  log.info("Registered agent MCP tools", {
    userId: scope.userId,
    source: scope.source,
    registered: [
      session.providerTool.name,
      ...(viewImage ? ["view_image"] : [])
    ],
    beltSize: belt.length
  });

  return capabilityRun;
}
