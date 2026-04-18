/**
 * Tool-agent nodes for prompt-driven task execution.
 *
 * Each agent node runs an agent loop: the LLM can call tools (execute_bash,
 * set_output_image, etc.), see results, and iterate until it produces output.
 * Uses runAgentLoop() from agents.ts for the loop mechanics.
 */

import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import type { ToolLike } from "./agents.js";
import { runAgentLoop } from "./agents.js";
import { exec } from "node:child_process";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MessageContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: { data: string; mimeType: string } }
  | { type: "audio"; audio: { data: string; mimeType: string } };

type AssetRef = {
  type: string;
  uri?: string;
  data?: unknown;
  asset_id?: string | null;
};

// ---------------------------------------------------------------------------
// Secret / key resolution helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Asset extraction helpers
// ---------------------------------------------------------------------------

function isAssetRef(v: unknown): v is AssetRef {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  // Match objects with explicit type field (ImageRef from UI properties)
  // OR objects with data/uri but no type (imageRef() output from upstream nodes)
  const hasType = typeof obj.type === "string" && obj.type.length > 0;
  const hasData = obj.data != null;
  const hasUri = typeof obj.uri === "string" && obj.uri.length > 0;
  return (hasType && (hasUri || hasData)) || (!hasType && (hasData || hasUri));
}

/** Infer the asset kind from type field, field name context, uri, or mimeType. */
function inferAssetKind(
  asset: AssetRef,
  fieldHint?: string
): "image" | "audio" | "video" | "unknown" {
  // Check explicit type field
  const t = (asset.type || "").toLowerCase();
  if (t.includes("image")) return "image";
  if (t.includes("audio")) return "audio";
  if (t.includes("video")) return "video";
  // Check mimeType field (set by image nodes)
  const mime = String(
    (asset as Record<string, unknown>).mimeType ?? ""
  ).toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  // Check URI extension
  const uri = (asset.uri ?? "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|tiff?|svg)(\?|$)/.test(uri)) return "image";
  if (/\.(wav|mp3|flac|ogg|aac|m4a)(\?|$)/.test(uri)) return "audio";
  if (/\.(mp4|mov|avi|mkv|webm)(\?|$)/.test(uri)) return "video";
  // Fall back to field name hint
  if (fieldHint) {
    const h = fieldHint.toLowerCase();
    if (h.includes("image")) return "image";
    if (h.includes("audio")) return "audio";
    if (h.includes("video")) return "video";
  }
  return "unknown";
}

function guessMime(asset: AssetRef, fieldHint?: string): string {
  // Use explicit mimeType if present
  const explicit = String(
    (asset as Record<string, unknown>).mimeType ?? ""
  ).trim();
  if (explicit && explicit.includes("/")) return explicit;
  const kind = inferAssetKind(asset, fieldHint);
  if (kind === "image") return "image/png";
  if (kind === "audio") return "audio/wav";
  if (kind === "video") return "video/mp4";
  return "application/octet-stream";
}

/** Read asset bytes from inline data, data: URI, file:// URI, or storage. */
async function getAssetBytes(
  asset: AssetRef,
  context?: ProcessingContext
): Promise<Uint8Array | null> {
  // Inline base64 data (string or Uint8Array)
  if (asset.data) {
    if (asset.data instanceof Uint8Array) return asset.data;
    if (typeof asset.data === "string" && asset.data.length > 0) {
      // Handle data: URI format
      const dataUriMatch = (asset.data as string).match(
        /^data:[^;]*;base64,(.+)$/s
      );
      if (dataUriMatch) {
        return Buffer.from(dataUriMatch[1], "base64");
      }
      // Plain base64 string
      try {
        return Buffer.from(asset.data, "base64");
      } catch {
        /* fall through */
      }
    }
  }
  // Handle data: URIs in the uri field
  if (asset.uri) {
    const uriDataMatch = asset.uri.match(/^data:[^;]*;base64,(.+)$/s);
    if (uriDataMatch) {
      return Buffer.from(uriDataMatch[1], "base64");
    }
    // Handle file:// URIs directly (no storage adapter needed)
    if (asset.uri.startsWith("file://")) {
      try {
        const { readFile } = await import("node:fs/promises");
        const { fileURLToPath } = await import("node:url");
        const filePath = fileURLToPath(asset.uri);
        return await readFile(filePath);
      } catch {
        /* fall through */
      }
    }
    // Handle /api/storage/ paths — resolve to local asset files on disk
    if (asset.uri.startsWith("/api/storage/")) {
      try {
        const { getDefaultAssetsPath } = await import("@nodetool/config");
        const isTemp = asset.uri.startsWith("/api/storage/temp/");
        const key = isTemp
          ? asset.uri.slice("/api/storage/temp/".length)
          : asset.uri.slice("/api/storage/".length);
        const rootDir = isTemp
          ? (process.env.TEMP_STORAGE_PATH ??
            path.join(tmpdir(), "nodetool", "temp"))
          : getDefaultAssetsPath();
        return await readFile(path.join(rootDir, key));
      } catch {
        /* fall through */
      }
    }
    // Fetch from https:// URLs
    if (asset.uri.startsWith("https://")) {
      try {
        const res = await fetch(asset.uri);
        if (res.ok) return new Uint8Array(await res.arrayBuffer());
      } catch {
        /* fall through */
      }
    }
  }
  // Load from storage via URI (if storage adapter available)
  if (asset.uri && context?.storage) {
    try {
      return await context.storage.retrieve(asset.uri);
    } catch {
      /* fall through */
    }
  }
  return null;
}

/**
 * Collect all asset refs from known fields on the node instance.
 */
function collectAssets(self: Record<string, unknown>): AssetRef[] {
  const assets: AssetRef[] = [];
  const assetFields = [
    "image",
    "audio",
    "video",
    "document",
    "images",
    "audios",
    "videos",
    "documents"
  ];
  for (const field of assetFields) {
    const val = self[field];
    if (!val) continue;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (isAssetRef(item)) assets.push(item);
      }
    } else if (isAssetRef(val)) {
      assets.push(val);
    }
  }
  return assets;
}

/** Build multimodal content parts from assets. */
async function buildAssetContentParts(
  assets: AssetRef[],
  context?: ProcessingContext,
  fieldHint?: string
): Promise<MessageContentPart[]> {
  const parts: MessageContentPart[] = [];
  for (const asset of assets) {
    const bytes = await getAssetBytes(asset, context);
    if (!bytes || bytes.length === 0) continue;
    const kind = inferAssetKind(asset, fieldHint);
    const mime = guessMime(asset, fieldHint);
    const base64 = Buffer.from(bytes).toString("base64");
    if (kind === "image" || kind === "unknown") {
      // Default unknown assets to image (most common multimodal case)
      parts.push({
        type: "image",
        image: {
          data: base64,
          mimeType: mime === "application/octet-stream" ? "image/png" : mime
        }
      });
    } else if (kind === "audio") {
      parts.push({ type: "audio", audio: { data: base64, mimeType: mime } });
    }
    // Video and document are described in text rather than sent as content
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Tool factories for skill agent loop
// ---------------------------------------------------------------------------

export function makeExecuteBashTool(
  workspaceDir: string,
  timeoutMs = 120_000
): ToolLike {
  return {
    name: "execute_bash",
    description: "Execute a bash command in the workspace directory.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Bash command to execute" }
      },
      required: ["command"]
    },
    process: async (_context, params) => {
      const command = String(params.command ?? "");
      if (!command) return { success: false, error: "No command provided" };
      return new Promise((resolve) => {
        exec(
          command,
          {
            cwd: workspaceDir,
            timeout: timeoutMs,
            maxBuffer: 10 * 1024 * 1024
          },
          (error, stdout, stderr) => {
            resolve({
              success: !error,
              stdout: stdout ?? "",
              stderr: stderr ?? "",
              ...(error ? { error: error.message } : {})
            });
          }
        );
      });
    }
  };
}

export function makeSetOutputTool(
  toolName: string,
  description: string,
  outputSink: string[],
  workspaceDir: string
): ToolLike {
  return {
    name: toolName,
    description,
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative path to the output file."
        }
      },
      required: ["path"]
    },
    process: async (_context, params) => {
      const relPath = String(params.path ?? "");
      if (!relPath) return { success: false, error: "No path provided" };
      const absPath = path.resolve(workspaceDir, relPath);
      if (
        !absPath.startsWith(path.resolve(workspaceDir) + path.sep) &&
        absPath !== path.resolve(workspaceDir)
      ) {
        return { success: false, error: "Path is outside workspace directory" };
      }
      try {
        await access(absPath);
      } catch {
        return { success: false, error: `File not found: ${relPath}` };
      }
      outputSink.push(relPath);
      return { success: true, path: relPath };
    }
  };
}

// ---------------------------------------------------------------------------
// Base tool-agent node
// ---------------------------------------------------------------------------

class ToolAgentNode extends BaseNode {
  static readonly description: string =
    "Base tool-agent node (not directly usable).";

  /** Override in subclasses with the skill-specific system prompt. */
  static readonly _systemPrompt: string =
    "You are a helpful assistant. Complete the task described by the user.";

  /** Override in subclasses to declare output sinks. Keys are output handle names, values are tool names. */
  static readonly _outputSinkConfig: Record<string, string> = {};

  /** Transient storage for output paths set during agent loop. */
  private _outputSinks: Record<string, string[]> = {};

  /** Build tools for the agent loop. Includes execute_bash + any output sink tools. */
  getTools(workspaceDir: string): ToolLike[] {
    const tools: ToolLike[] = [
      makeExecuteBashTool(
        workspaceDir,
        ((this as any).timeout_seconds ?? 120) * 1000
      )
    ];
    const config = (this.constructor as typeof ToolAgentNode)._outputSinkConfig;
    this._outputSinks = {};
    for (const [outputName, toolName] of Object.entries(config)) {
      const sink: string[] = [];
      this._outputSinks[outputName] = sink;
      tools.push(
        makeSetOutputTool(
          toolName,
          `Set the ${outputName} output file path.`,
          sink,
          workspaceDir
        )
      );
    }
    return tools;
  }

  /** Read output sinks and load files as asset refs. */
  protected async readOutputSinks(
    workspaceDir: string
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [outputName, sink] of Object.entries(this._outputSinks)) {
      if (sink.length === 0) continue;
      const absPath = path.resolve(workspaceDir, sink[0]);
      try {
        const bytes = await readFile(absPath);
        const base64 = Buffer.from(bytes).toString("base64");
        result[outputName] = {
          type: outputName,
          data: base64,
          uri: pathToFileURL(absPath).toString()
        };
      } catch {
        // File doesn't exist or can't be read — skip
      }
    }
    return result;
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const prompt = String((this as any).prompt ?? "").trim();
    if (!prompt) throw new Error("Prompt is required");

    const model = ((this as any).model ?? {}) as Record<string, unknown>;
    const providerId = String(model.provider || "").toLowerCase();
    const modelId = String(model.id || "");
    if (!providerId || !modelId) {
      throw new Error("Select a model for this skill.");
    }
    if (!context || typeof context.getProvider !== "function") {
      throw new Error("Processing context with provider access is required");
    }

    // Determine workspace directory
    const workspaceDir =
      (context as any).workspaceDir ??
      path.join(tmpdir(), `nodetool-skill-${Date.now()}`);
    await mkdir(workspaceDir, { recursive: true });

    // Collect multimodal asset inputs
    const self = this as unknown as Record<string, unknown>;
    const assets = collectAssets(self);
    const assetParts = await buildAssetContentParts(assets, context, "image");

    // Copy asset files into workspace so the agent can access them via bash
    const { writeFile: writeFileAsync } = await import("node:fs/promises");
    const workspaceFiles: string[] = [];
    for (let i = 0; i < assets.length; i++) {
      const bytes = await getAssetBytes(assets[i], context);
      if (!bytes || bytes.length === 0) continue;
      const kind = inferAssetKind(assets[i], "image");
      const mime = guessMime(assets[i], "image");
      const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
      const fileName = `input_${kind}_${i}.${ext}`;
      await writeFileAsync(path.join(workspaceDir, fileName), bytes);
      workspaceFiles.push(fileName);
    }

    // Build tools
    const tools = this.getTools(workspaceDir);

    // Convert skills-local MessageContentPart[] to runtime MessageContent[] format
    const contentParts = assetParts.map((part) => {
      if (part.type === "image") {
        return {
          type: "image_url" as const,
          image: { data: part.image.data, mimeType: part.image.mimeType }
        };
      }
      if (part.type === "audio") {
        return {
          type: "audio" as const,
          audio: { data: part.audio.data, mimeType: part.audio.mimeType }
        };
      }
      return { type: "text" as const, text: (part as any).text ?? "" };
    });

    // Augment prompt with workspace file info
    let augmentedPrompt = prompt;
    if (workspaceFiles.length > 0) {
      augmentedPrompt += `\n\nInput files available in the workspace directory:\n${workspaceFiles.map((f) => `- ${f}`).join("\n")}`;
    }

    const systemPrompt = (this.constructor as typeof ToolAgentNode)
      ._systemPrompt;
    const { text } = await runAgentLoop({
      context,
      providerId,
      modelId,
      systemPrompt,
      prompt: augmentedPrompt,
      tools,
      contentParts: contentParts.length > 0 ? contentParts : undefined,
      maxTokens: 4096,
      maxIterations: 10
    });

    return { text, ...(await this.readOutputSinks(workspaceDir)) };
  }
}

// ---------------------------------------------------------------------------
// ShellAgentSkill
// ---------------------------------------------------------------------------

export class ShellAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.ShellAgent";
  static readonly title = "Shell Agent";
  static readonly description =
    "Reusable prompt-driven skill backed by execute_bash.";
  static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a bounded workspace agent. Use execute_bash for concrete actions. " +
    "Ground all claims in command output and keep results concise.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for task planning and execution reasoning."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing the requested task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 180,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 200000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// BrowserSkill
// ---------------------------------------------------------------------------

export class BrowserAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.BrowserAgent";
  static readonly title = "Browser Agent";
  static readonly description =
    "Prompt-driven browser skill with bounded tool validation and schema outputs.\n    Supports extraction and browser automation workflows.\n    skills, browser, scrape, extraction, automation";
  static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a browser automation and extraction agent using Playwright-backed browser tools. " +
    "Use `browser` to fetch page content and metadata, `take_screenshot` for screenshots, " +
    "and DOM tools (`dom_examine`, `dom_search`, `dom_extract`) for structured inspection. " +
    "The `browser` tool returns JSON fields like `success`, `url`, `content`, `metadata`, or `error`. " +
    "Do not browse search engine result pages directly; explain that direct SERP browsing is disabled.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for free-form browsing tasks."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt for browser navigation/extraction."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 150,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 180000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// SQLiteSkill
// ---------------------------------------------------------------------------

export class SQLiteAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.SQLiteAgent";
  static readonly title = "SQLite Agent";
  static readonly description =
    "Prompt-driven SQLite skill with guarded query execution.\n    skills, data, sqlite, query";
  static readonly metadataOutputTypes = {
    text: "str",
    json: "dict[str, any]",
    dataframe: "dataframe"
  };
  static readonly _systemPrompt =
    "You are a data analysis skill. Use tools to run queries and ground every " +
    "answer in tool outputs. Keep answers concise and factual.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for optional agent reasoning over query results."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt for data query/transform task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 120,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 200000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;

  @prop({
    type: "str",
    default: "memory.db",
    title: "Db Path",
    description: "Path to SQLite database relative to workspace."
  })
  declare db_path: any;

  @prop({
    type: "bool",
    default: false,
    title: "Allow Mutation",
    description: "Allow INSERT/UPDATE/DELETE/DDL statements when enabled."
  })
  declare allow_mutation: any;
}

// ---------------------------------------------------------------------------
// SupabaseSkill
// ---------------------------------------------------------------------------

export class SupabaseAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.SupabaseAgent";
  static readonly title = "Supabase Agent";
  static readonly description =
    "Prompt-driven Supabase skill with guarded SELECT execution.\n    skills, data, supabase, query";
  static readonly metadataOutputTypes = {
    text: "str",
    json: "dict[str, any]",
    dataframe: "dataframe"
  };
  static readonly _systemPrompt =
    "You are a data analysis skill. Use tools to run queries and ground every " +
    "answer in tool outputs. Keep answers concise and factual.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for optional agent reasoning over query results."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt for data query/transform task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 120,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 200000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// DocumentSkill
// ---------------------------------------------------------------------------

export class DocumentAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.DocumentAgent";
  static readonly title = "Document Agent";
  static readonly description =
    "Prompt-driven document skill for model-based document analysis.\n    skills, document, extraction, conversion, markdown";
  static readonly metadataOutputTypes = {
    text: "str",
    document: "document"
  };
  static readonly _outputSinkConfig = { document: "set_output_document" };
  static readonly _systemPrompt =
    "You are a document skill. Use attached document/text inputs and return concise results.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for free-form document tasks."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing the document task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 120,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 150000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// DocxSkill
// ---------------------------------------------------------------------------

export class DocxAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.DocxAgent";
  static readonly title = "DOCX Agent";
  static readonly description =
    "Prompt-driven DOCX creation skill.\n    skills, docx, word, document creation, docx-js";
  static readonly metadataOutputTypes = {
    document: "document",
    text: "str"
  };
  static readonly _outputSinkConfig = { document: "set_output_document" };
  static readonly _systemPrompt =
    "You are a DOCX creation specialist. This skill is creation-only.\n\n" +
    "Scope:\n" +
    "- Create new .docx files (reports, memos, letters, templates, styled docs).\n" +
    "- Use docx-js (npm package `docx`) for document generation.\n" +
    "- Do not perform editing/analysis of existing DOCX files in this skill.\n\n" +
    "Execution policy:\n" +
    "1) Use execute_bash for shell and Node.js commands.\n" +
    "2) Keep outputs workspace-relative.\n" +
    "3) Validate generated DOCX when feasible.\n" +
    "4) Final step is mandatory: call set_output_document with output .docx path.\n\n" +
    "Critical docx-js creation rules:\n" +
    "- Set page size explicitly (docx-js defaults to A4).\n" +
    "  US Letter: width 12240, height 15840 DXA with 1-inch margins (1440 DXA).\n" +
    "- For landscape, pass portrait dimensions and set orientation LANDSCAPE (library swaps).\n" +
    "- Override built-in heading style IDs exactly ('Heading1', 'Heading2', ...).\n" +
    "- Include outlineLevel on heading paragraph styles for TOC support.\n" +
    "- Never use '\\n' for line breaks; use separate Paragraph elements.\n" +
    "- Never use unicode bullet characters directly; use numbering with LevelFormat.BULLET.\n" +
    "- PageBreak must be inside a Paragraph.\n" +
    "- ImageRun requires explicit type (png/jpg/jpeg/gif/bmp/svg).\n" +
    "- Prefer WidthType.DXA for tables; do not use WidthType.PERCENTAGE.\n" +
    "- Tables need dual widths: table columnWidths and matching cell widths.\n" +
    "- Table width must equal sum(columnWidths).\n" +
    "- Use ShadingType.CLEAR for table shading (not SOLID).\n" +
    "- For TOC, headings should use HeadingLevel and headingStyleRange.\n" +
    "- Use headers/footers and PageNumber for professional layouts.\n\n" +
    "Recommended workflow:\n" +
    "- Create JS script (for example scripts/build_docx.js) with `docx` imports.\n" +
    "- Build Document with sections/styles/numbering/tables/images as requested.\n" +
    "- Write output .docx to workspace path (for example out/document.docx).\n" +
    "- Optionally validate with available validator command.\n" +
    "- Call set_output_document with final .docx path.\n\n" +
    "Output rules:\n" +
    "- Keep response concise and include output path.\n" +
    "- If no DOCX was produced, clearly explain why.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for DOCX creation planning and execution."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing what DOCX to create."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 300,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 220000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// EmailSkill
// ---------------------------------------------------------------------------

export class EmailAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.EmailAgent";
  static readonly title = "Email Agent";
  static readonly description =
    "Prompt-driven email skill for IMAP/SMTP and message processing tasks.\n    skills, email, imap, smtp, messaging";
  static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are an email automation specialist. Use execute_bash for mailbox tasks " +
    "(parse RFC822/EML, summarize threads, draft content, IMAP/SMTP workflows). " +
    "Protect sensitive data and redact secrets or private message content unless requested. " +
    "For outbound actions, clearly state recipients, subject, and intent before execution.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for task planning and execution reasoning."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing the requested task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 180,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 200000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// FfmpegSkill
// ---------------------------------------------------------------------------

export class FfmpegAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.FfmpegAgent";
  static readonly requiredRuntimes = ["ffmpeg"];
  static readonly title = "FFmpeg Agent";
  static readonly description =
    "Prompt-driven FFmpeg skill for audio/video editing, conversion, and packaging.\n    skills, ffmpeg, media, video, audio, transcode, remux";
  static readonly metadataOutputTypes = {
    video: "video",
    audio: "audio",
    text: "str"
  };
  static readonly _outputSinkConfig = {
    audio: "set_output_audio",
    video: "set_output_video"
  };
  static readonly _systemPrompt =
    "You are an FFmpeg specialist skill for audio/video processing. " +
    "Use attached media inputs when provided and return concise results.\n\n" +
    "Execution rules:\n" +
    "1) Use execute_bash for ffmpeg/ffprobe commands.\n" +
    "2) Keep generated files under workspace-relative paths.\n" +
    "3) Publish final outputs using set_output_audio and/or set_output_video.\n" +
    "4) Explain failures clearly and include the exact command that failed.\n\n" +
    "FFmpeg reference (https://ffmpeg.org/ffmpeg.html):\n" +
    "- Canonical form: ffmpeg [global_options] {input_opts -i input}... {output_opts output}...\n" +
    "- Option order matters; input options apply to next -i, output options to next output file.\n" +
    "- Use explicit stream mapping for deterministic results: -map 0:v:0 -map 0:a:0.\n" +
    "- Streamcopy/remux: -c copy for fast container changes with no re-encode.\n" +
    "- Transcoding baseline: -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 192k.\n" +
    "- Video filters: -vf scale=1280:-2,fps=30,crop=...,pad=....\n" +
    "- Audio filters: -af loudnorm,highpass=80,aresample=48000.\n" +
    "- Multi-input graphs: use -filter_complex for concat, overlays, mixdown, subtitles burn-in.\n" +
    "- Trimming: use -ss before -i for fast seek; use -ss/-to after -i for precise cut.\n" +
    "- Subtitle handling: map subtitle streams when possible; burn in with subtitles=... when needed.\n" +
    "- Metadata/chapters: -map_metadata, -map_chapters, -metadata key=value.\n" +
    "- Overwrite behavior: -y overwrite, -n never overwrite.\n" +
    "- Diagnostics: -hide_banner with -loglevel info|warning|error and optional -stats.\n\n" +
    "Common recipes:\n" +
    "- Remux: ffmpeg -i in.mkv -map 0 -c copy out.mp4\n" +
    "- Normalize playback: ffmpeg -i in.ext -map 0:v:0 -map 0:a:0 -c:v libx264 -crf 23 -c:a aac -b:a 192k out.mp4\n" +
    "- 720p derivative: ffmpeg -i in.ext -vf scale=1280:-2 -c:v libx264 -crf 23 -c:a copy out_720p.mp4\n" +
    "- Clip segment: ffmpeg -ss 00:00:30 -to 00:01:00 -i in.ext -c copy clip.ext\n" +
    "- Extract MP3: ffmpeg -i in.ext -vn -c:a libmp3lame -b:a 192k out.mp3\n" +
    "- Burn subtitles: ffmpeg -i in.ext -vf subtitles=subs.srt -c:v libx264 -c:a copy out_subbed.mp4";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for media prompts."
  })
  declare model: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Optional audio input for media reasoning tasks."
  })
  declare audio: any;

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "Optional video input for media reasoning tasks."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt for media task execution."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 180,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 200000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// FilesystemSkill
// ---------------------------------------------------------------------------

export class FilesystemAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.FilesystemAgent";
  static readonly title = "Filesystem Agent";
  static readonly description =
    "Prompt-driven filesystem skill for file inspection and transformations.\n    skills, filesystem, files, directories, io";
  static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a filesystem operations specialist constrained to the workspace. " +
    "Use execute_bash for listing, searching, creating, moving, copying, and deleting files. " +
    "Prefer reversible actions and confirm paths before mutating data. " +
    "When changing files, summarize what changed and where.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for task planning and execution reasoning."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing the requested task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 180,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 200000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// GitSkill
// ---------------------------------------------------------------------------

export class GitAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.GitAgent";
  static readonly title = "Git Agent";
  static readonly description =
    "Prompt-driven Git skill for repository inspection and change management.\n    skills, git, repository, version-control";
  static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a Git workflow specialist. Use execute_bash for all repository actions. " +
    "Prefer non-destructive commands (status, diff, log, branch, add, commit, fetch, pull). " +
    "Do not run destructive history-rewriting commands unless explicitly requested. " +
    "Report exact files, commit IDs, and branch names from command output.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for task planning and execution reasoning."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing the requested task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 180,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 200000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// HtmlSkill
// ---------------------------------------------------------------------------

export class HtmlAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.HtmlAgent";
  static readonly title = "HTML Agent";
  static readonly description =
    "Prompt-driven HTML creation skill.\n    skills, html, web, template, static-site";
  static readonly metadataOutputTypes = {
    html: "html",
    text: "str"
  };
  static readonly _outputSinkConfig = { html: "set_output_html" };
  static readonly _systemPrompt =
    "You are an HTML creation specialist.\n\n" +
    "Scope:\n" +
    "- Create or generate HTML files and related inline CSS/JS when requested.\n" +
    "- Use execute_bash for shell/file operations.\n" +
    "- Keep output paths workspace-relative.\n" +
    "- Final step is mandatory: call set_output_html with the final HTML file path.\n\n" +
    "Authoring rules:\n" +
    "- Produce valid UTF-8 HTML5 documents (`<!doctype html>`).\n" +
    "- Include semantic structure (header/main/section/footer) when appropriate.\n" +
    "- Prefer accessible markup (labels, alt text, heading hierarchy).\n" +
    "- Keep JS/CSS straightforward unless the user asks for complexity.\n" +
    "- If external dependencies are needed, explain them briefly.\n\n" +
    "Output rules:\n" +
    "- Keep response concise and include final save path.\n" +
    "- If no HTML file was produced, clearly explain why.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for HTML generation planning/execution."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing HTML to create."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 180,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 180000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// HttpApiSkill
// ---------------------------------------------------------------------------

export class HttpApiAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.HttpApiAgent";
  static readonly title = "HTTP API Agent";
  static readonly description =
    "Prompt-driven HTTP API skill for calling REST/GraphQL endpoints.\n    skills, http, api, rest, graphql";
  static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are an HTTP API integration specialist. " +
    "You can use exactly one tool: `http_request`. " +
    "Do not use shell commands or any non-HTTP tooling. " +
    "Plan requests explicitly (method, URL, headers, query, body), " +
    "call `http_request`, and ground conclusions in returned status/body. " +
    "Treat secrets as sensitive and never echo tokens verbatim. " +
    "If a request fails, explain the failure and propose the next request. " +
    "Always return a final user-facing answer, not just tool dumps. " +
    "Final response format: " +
    "1) Direct answer in 1-3 sentences. " +
    "2) Evidence: status code(s) and key response fields used. " +
    "3) If unresolved, the exact missing data needed.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for API planning and response interpretation."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing the HTTP API task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 180,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 200000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// ImageSkill
// ---------------------------------------------------------------------------

export class ImageAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.ImageAgent";
  static readonly title = "Image Agent";
  static readonly description =
    "Prompt-driven image skill for model-based image reasoning.\n    skills, image, agent, transform, extraction";
  static readonly metadataOutputTypes = {
    image: "image",
    text: "str"
  };
  static readonly _outputSinkConfig = { image: "set_output_image" };
  static readonly _systemPrompt =
    "You are an image skill. Use attached inputs and return concise results. " +
    "Use execute_bash when shell-based processing is needed. " +
    "When you create a final output image file, call set_output_image with that path.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for image prompts."
  })
  declare model: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Optional image input for image reasoning tasks."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing the image task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 90,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 120000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// MediaSkill
// ---------------------------------------------------------------------------

export class MediaAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.MediaAgent";
  static readonly title = "Media Agent";
  static readonly description =
    "Prompt-driven media skill for model-based audio/video reasoning.\n    skills, media, audio, video, agent";
  static readonly metadataOutputTypes = {
    video: "video",
    audio: "audio",
    text: "str"
  };
  static readonly _outputSinkConfig = {
    audio: "set_output_audio",
    video: "set_output_video"
  };
  static readonly _systemPrompt =
    "You are a media skill for audio/video tasks. " +
    "Use attached media inputs when provided and return concise results. " +
    "Use execute_bash for shell-based operations. " +
    "When you create final media files, call set_output_audio and/or " +
    "set_output_video using workspace-relative paths.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for media prompts."
  })
  declare model: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Optional audio input for media reasoning tasks."
  })
  declare audio: any;

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "Optional video input for media reasoning tasks."
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt for media task execution."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 180,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 200000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// PdfLibSkill
// ---------------------------------------------------------------------------

export class PdfLibAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.PdfLibAgent";
  static readonly title = "PDF-lib Agent";
  static readonly description =
    "Prompt-driven PDF processing skill with pdf-lib and complementary tooling.\n    skills, pdf, pdf-lib, qpdf, poppler, pdfjs, pypdfium2";
  static readonly metadataOutputTypes = {
    document: "document",
    text: "str"
  };
  static readonly _outputSinkConfig = { document: "set_output_document" };
  static readonly _systemPrompt =
    "You are a PDF processing specialist. Focus on robust, reproducible PDF workflows.\n\n" +
    "Primary scope:\n" +
    "- JavaScript pdf-lib for creating/modifying/splitting/merging PDFs.\n" +
    "- Python ecosystem for extraction/analysis: pypdf, pdfplumber, pypdfium2, reportlab.\n" +
    "- CLI tooling for performance/repair: poppler-utils (pdftotext/pdftoppm/pdfimages), qpdf.\n\n" +
    "Execution policy:\n" +
    "1) Use execute_bash for shell commands and script execution.\n" +
    "2) Before running any Node script that imports pdf-lib, bootstrap dependency availability with:\n" +
    "   npm -s ls pdf-lib >/dev/null 2>&1 || npm install --no-save pdf-lib\n" +
    "   Then verify with: node -e \"require.resolve('pdf-lib')\".\n" +
    "3) Keep all outputs workspace-relative.\n" +
    "4) If you produce a final PDF file, call set_output_document with its path.\n" +
    "5) For extraction-only requests, return concise text and artifact locations.\n" +
    "6) Include exact commands/scripts used when reporting.\n\n" +
    "Advanced PDF reference:\n" +
    "- pypdfium2: fast rendering/text extraction.\n" +
    "  Example render: page.render(scale=2.0).to_pil().save('page_1.png').\n" +
    "  Example text: page.get_text().\n" +
    "- pdf-lib (JS): PDFDocument.load/create, copyPages, addPage, drawText, drawRectangle, save.\n" +
    "  Use Node scripts for merge/split/edit and form-safe updates.\n" +
    "- pdfjs-dist (JS): getDocument, getPage, getTextContent, getAnnotations for browser pipelines.\n" +
    "- poppler-utils:\n" +
    "  pdftotext -bbox-layout for coordinates;\n" +
    "  pdftoppm for rasterization;\n" +
    "  pdfimages -all for embedded image extraction.\n" +
    "- qpdf:\n" +
    "  --split-pages, --pages for page selection/merge;\n" +
    "  --linearize and --optimize-level for optimization;\n" +
    "  --check for validation and structure diagnostics.\n" +
    "- pdfplumber: coordinate-aware extraction and table extraction tuning.\n" +
    "- reportlab: structured PDF generation and styled tables.\n\n" +
    "Performance and reliability guidelines:\n" +
    "- For large PDFs, process pages/chunks instead of loading everything at once.\n" +
    "- Prefer pdfimages for image extraction speed, pdftotext for plain text speed.\n" +
    "- Use OCR fallback only for scanned/image PDFs.\n" +
    "- Validate encrypted/corrupt files with qpdf before deep processing.\n\n" +
    "Common command examples:\n" +
    "- Text with coordinates: pdftotext -bbox-layout document.pdf output.xml\n" +
    "- Render 300 DPI pages: pdftoppm -png -r 300 document.pdf out\n" +
    "- Extract embedded images: pdfimages -all document.pdf images/img\n" +
    "- Merge selected pages: qpdf --empty --pages a.pdf 1-3 b.pdf 2,4 -- merged.pdf\n" +
    "- Linearize for web: qpdf --linearize input.pdf optimized.pdf\n" +
    "- Check integrity: qpdf --check input.pdf\n\n" +
    "Output rules:\n" +
    "- Keep responses concise.\n" +
    "- If a final PDF was produced, publish it with set_output_document.\n" +
    "- If no PDF was produced, clearly explain why.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for PDF task planning and execution reasoning."
  })
  declare model: any;

  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Document",
    description: "Optional PDF/document input for transformation or analysis."
  })
  declare document: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing the PDF processing task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 300,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 220000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// PptxSkill
// ---------------------------------------------------------------------------

export class PptxAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.PptxAgent";
  static readonly title = "PPTX Agent";
  static readonly description =
    "Prompt-driven PowerPoint generation skill with PptxGenJS.\n    skills, pptx, powerpoint, pptxgenjs, slides";
  static readonly metadataOutputTypes = {
    document: "document",
    text: "str"
  };
  static readonly _outputSinkConfig = { document: "set_output_document" };
  static readonly _systemPrompt =
    "You are a PptxGenJS specialist for creating and editing .pptx presentations.\n\n" +
    "Execution policy:\n" +
    "1) Use execute_bash to run Node.js scripts and shell commands.\n" +
    "2) Keep outputs workspace-relative.\n" +
    "3) If you produce a final PPTX, call set_output_document with its path.\n" +
    "4) Return concise status and key file paths.\n\n" +
    "PptxGenJS fundamentals:\n" +
    "- Use fresh pptxgen() instance per presentation.\n" +
    "- Common layouts: LAYOUT_16x9 (10x5.625), LAYOUT_16x10, LAYOUT_4x3, LAYOUT_WIDE.\n" +
    "- Coordinates are inches.\n" +
    "- Text supports rich runs, bullets, breakLine, align/valign, font styling.\n" +
    "- Use charSpacing (not letterSpacing).\n" +
    "- Use margin: 0 when precise alignment with shapes/icons is required.\n" +
    "- Bullets: use bullet: true; never insert unicode bullet characters manually.\n" +
    "- For multi-line runs in arrays, set breakLine: true between lines.\n" +
    "- Avoid lineSpacing with bullets; prefer paraSpaceAfter.\n" +
    "- Shapes/charts/tables/images are supported, including shadows and transparency.\n" +
    "- Image sources: path/url/base64; use sizing contain/cover/crop patterns.\n" +
    "- For crisp icons, render high-res SVG->PNG then place with addImage.\n" +
    "- Slide masters can define reusable placeholders/background objects.\n\n" +
    "Critical pitfalls to avoid:\n" +
    "- NEVER include '#' in hex colors. Use 'FF0000', not '#FF0000'.\n" +
    "- NEVER use 8-char hex for opacity in colors (e.g. 00000020). Use opacity field.\n" +
    "- Shadow offset must be non-negative.\n" +
    "- Do not reuse option objects across calls because PptxGenJS may mutate them.\n" +
    "- Do not rely on RECTANGLE overlays to hide rounded corners on ROUNDED_RECTANGLE.\n\n" +
    "Example baseline workflow:\n" +
    "- Create script file (e.g. scripts/build_pptx.js) using pptxgenjs.\n" +
    "- Add slides/text/shapes/tables/charts/images as requested.\n" +
    "- pres.writeFile({ fileName: 'out/deck.pptx' }).\n" +
    "- Call set_output_document with out/deck.pptx.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for PPTX planning and generation reasoning."
  })
  declare model: any;

  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Document",
    description: "Optional source PPTX/document input."
  })
  declare document: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing PPTX task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 300,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 220000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// SpreadsheetSkill
// ---------------------------------------------------------------------------

export class SpreadsheetAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.SpreadsheetAgent";
  static readonly title = "Spreadsheet Agent";
  static readonly description =
    "Prompt-driven spreadsheet skill for CSV/XLSX processing.\n    skills, spreadsheet, csv, xlsx, tabular";
  static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a spreadsheet and tabular data specialist. Use execute_bash for transformations " +
    "using tools like Python/pandas, csvkit, or shell utilities. Preserve data fidelity and " +
    "call out schema/column assumptions before applying formulas or joins. " +
    "Return concise summaries plus output file paths for generated tables.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for task planning and execution reasoning."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing the requested task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 180,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 200000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// VectorStoreSkill
// ---------------------------------------------------------------------------

export class VectorStoreAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.VectorStoreAgent";
  static readonly title = "Vector Store Agent";
  static readonly description =
    "Prompt-driven vector store skill for indexing and similarity search workflows.\n    skills, vectorstore, embeddings, rag, retrieval";
  static readonly metadataOutputTypes = {
    text: "str"
  };
  static readonly _systemPrompt =
    "You are a vector retrieval specialist. Use execute_bash to run embedding/indexing/search " +
    "operations with local or remote vector stores. Be explicit about embedding model, chunking, " +
    "distance metric, and top-k parameters. Ground retrieval quality claims in measurable outputs.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for task planning and execution reasoning."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing the requested task."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 180,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 200000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// YtDlpDownloaderSkill
// ---------------------------------------------------------------------------

export class YtDlpDownloaderAgentNode extends ToolAgentNode {
  static readonly nodeType = "nodetool.agents.YtDlpDownloaderAgent";
  static readonly title = "yt-dlp Downloader Agent";
  static readonly description =
    "Download videos from YouTube/Bilibili/Twitter and other sites via yt-dlp.\n    skills, media, yt-dlp, downloader, youtube, bilibili, twitter";
  static readonly metadataOutputTypes = {
    video: "video",
    text: "str"
  };
  static readonly requiredRuntimes = ["yt-dlp", "ffmpeg"];
  static readonly _outputSinkConfig = { video: "set_output_video" };
  static readonly _systemPrompt =
    "You are yt-dlp-downloader.\n" +
    "Goal: download web videos with yt-dlp and publish the resulting video file path.\n\n" +
    "Workflow:\n" +
    "1) Verify prerequisites with shell commands:\n" +
    "   - which yt-dlp || echo 'yt-dlp not installed. Install with: pip install yt-dlp'\n" +
    "   - which ffmpeg || echo 'ffmpeg not installed. Install with: brew install ffmpeg'\n" +
    "2) If URL is YouTube, prefer --cookies-from-browser chrome to avoid 403.\n" +
    "3) Build yt-dlp command matching request (download/extract/subtitles/quality).\n" +
    "4) Use execute_bash for all commands.\n" +
    "5) Handle failures:\n" +
    "   - 403: retry with --cookies-from-browser chrome\n" +
    "   - unavailable format: use -F, then choose a format id\n" +
    "6) Final step is mandatory: call set_output_video with the final video file path.\n\n" +
    "Scope boundary:\n" +
    "- This skill is for yt-dlp downloading tasks only.\n" +
    "- For standalone ffmpeg editing/transcoding workflows, use the dedicated FFmpeg Skill.\n\n" +
    "Output rules:\n" +
    "- Keep response concise and include final save location.\n" +
    "- Always save outputs under workspace-relative output_dir.\n" +
    "- If no video file is produced, clearly explain why.";
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model used for yt-dlp planning and execution reasoning."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Prompt describing what to download."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Url",
    description: "Optional explicit video URL to download."
  })
  declare url: any;

  @prop({
    type: "str",
    default: "downloads/yt-dlp",
    title: "Output Dir",
    description: "Workspace-relative output directory for downloads."
  })
  declare output_dir: any;

  @prop({
    type: "int",
    default: 300,
    title: "Timeout Seconds",
    description: "Maximum runtime for agent execution.",
    min: 1,
    max: 3600
  })
  declare timeout_seconds: any;

  @prop({
    type: "int",
    default: 220000,
    title: "Max Output Chars",
    description: "Maximum serialized output chars before truncation.",
    min: 1000,
    max: 2000000
  })
  declare max_output_chars: any;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const TOOL_AGENT_NODES: readonly NodeClass[] = [
  ShellAgentNode,
  BrowserAgentNode,
  SQLiteAgentNode,
  SupabaseAgentNode,
  DocumentAgentNode,
  DocxAgentNode,
  EmailAgentNode,
  FfmpegAgentNode,
  FilesystemAgentNode,
  GitAgentNode,
  HtmlAgentNode,
  HttpApiAgentNode,
  ImageAgentNode,
  MediaAgentNode,
  PdfLibAgentNode,
  PptxAgentNode,
  SpreadsheetAgentNode,
  VectorStoreAgentNode,
  YtDlpDownloaderAgentNode
];
