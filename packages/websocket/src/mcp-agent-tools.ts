/**
 * Bridges the canonical agent tools (`@nodetool-ai/agents`) onto the MCP
 * server so external agents (Claude Code, ChatGPT, …) get the full
 * workflow-building and creative toolset — not just the read/render tools
 * defined natively in `mcp-server.ts`.
 *
 * Each bridged tool reuses its agent `Tool.process()` handler verbatim; this
 * module only adapts the tool's JSON-Schema into the Zod shape the MCP SDK
 * expects and wraps the result in an MCP tool response. Names already owned by
 * the native registration (run_workflow, list_workflows, list_nodes, …) are
 * intentionally not bridged — the native versions render thumbnails and Apps.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JsonSchema, ProcessingContext } from "@nodetool-ai/runtime";
import { ProcessingContext as ProcessingContextImpl } from "@nodetool-ai/runtime";
import {
  Tool,
  CreateWorkflowTool,
  DebugWorkflowTool,
  ValidateWorkflowTool,
  GetExampleWorkflowTool,
  ExportWorkflowDigraphTool,
  GetJobLogsTool,
  StartBackgroundJobTool,
  ListModelsTool,
  SaveAssetTool,
  ReadAssetTool,
  FindModelTool,
  GenerateImageTool,
  EditImageTool,
  GenerateVideoTool,
  AnimateImageTool,
  GenerateSpeechTool,
  TranscribeAudioTool,
  EmbedTextTool
} from "@nodetool-ai/agents";
import type { BaseProvider } from "@nodetool-ai/runtime";
import { getSecret, Asset } from "@nodetool-ai/models";
import { createLogger } from "@nodetool-ai/config";
import { getAssetAdapter } from "./lib/storage.js";
import { storeAssetWithThumbnail } from "./lib/thumbnail.js";
import type { McpServerOptions } from "./mcp-server.js";

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
 * Build the shared ProcessingContext the bridged tools run against. REST-backed
 * tools (create_workflow, list_models, …) read `NODETOOL_API_URL` from the
 * inherited environment; media tools resolve providers via the secret resolver;
 * save/media tools persist artifacts through `createAsset`.
 */
function buildAgentToolContext(): ProcessingContext {
  const storage = getAssetAdapter();
  const context = new ProcessingContextImpl({
    jobId: "mcp-agent-tools",
    userId: "1",
    secretResolver: getSecret,
    storage,
    workspaceStorage: storage
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
        await storeAssetWithThumbnail(asset.id, key, args.content, args.contentType);
        asset.size = args.content.length;
      }
      await asset.save();
      return asset;
    }
  });
  return context;
}

/** Load every configured provider, keyed by id, into `into` (mirrors the runner). */
async function loadConfiguredProviders(
  into: Record<string, BaseProvider>
): Promise<void> {
  const providersMod = await import("@nodetool-ai/runtime");
  const getSecretFor = (key: string) =>
    getSecret(key, "1").then((v) => v ?? undefined);
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
      if (Array.isArray(values) && values.every((v) => typeof v === "string") && values.length > 0) {
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
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
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
 * Register the workflow-building and creative agent tools on `server`.
 * Called from `createMcpServer` after the native tools are registered, so a
 * name collision would surface as an SDK error rather than silently shadowing.
 */
export function registerAgentMcpTools(
  server: McpServer,
  options?: McpServerOptions
): void {
  const context = buildAgentToolContext();

  // Populated lazily on first `find_model` call — provider probing hits the
  // secret store and network, so it's deferred out of server construction.
  const sharedProviders: Record<string, BaseProvider> = {};
  let providersPromise: Promise<void> | null = null;
  const ensureProviders = (): Promise<void> => {
    if (!providersPromise) providersPromise = loadConfiguredProviders(sharedProviders);
    return providersPromise;
  };

  const register = (tool: Tool, before?: () => Promise<void>): void => {
    server.tool(
      tool.name,
      tool.description,
      jsonSchemaToZodShape(tool.inputSchema),
      async (args) => {
        try {
          if (before) await before();
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

  const bridged: Tool[] = [
    new CreateWorkflowTool(),
    new DebugWorkflowTool(),
    new ValidateWorkflowTool(options?.registry),
    new GetExampleWorkflowTool(),
    new ExportWorkflowDigraphTool(),
    new GetJobLogsTool(),
    new StartBackgroundJobTool(),
    new ListModelsTool(),
    new SaveAssetTool(),
    new ReadAssetTool(),
    new GenerateImageTool(),
    new EditImageTool(),
    new GenerateVideoTool(),
    new AnimateImageTool(),
    new GenerateSpeechTool(),
    new TranscribeAudioTool(),
    new EmbedTextTool()
  ];
  for (const tool of bridged) register(tool);

  // find_model reads the configured-providers map at call time, so populate it
  // before the handler runs.
  register(new FindModelTool(sharedProviders), ensureProviders);
}
