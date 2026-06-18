/**
 * Canonical list of built-in agent tool classes.
 *
 * "Built-in" = constructable with `new ToolClass()` (no required args), and
 * not tied to a specific NodeRegistry, sandbox, workspace, or vector
 * collection. These are the tools the WebSocket server exposes by name —
 * any tool listed here can be selected from the chat / agent frontends and
 * resolved via `resolveTool(name)` without additional context.
 *
 * Tools that need constructor args (workspace path, vector collection,
 * NodeRegistry, ProcessingContext, sandbox client, …) are NOT included
 * here; they are wired up by their owning subsystem (e.g. base-nodes,
 * sandbox-tools, mcp-tools).
 *
 * In particular the recursive-decomposition primitive (`run_subtask`) and the
 * read-only fan-out search primitive (`run_search`) are intentionally excluded:
 * both take constructor args (provider, model, parentTools, forwardMessage) and
 * are instantiated at their call sites (the websocket runner and the cli), not
 * resolved by name from this zero-arg array.
 */

import type { Tool } from "./base-tool.js";
import { registerTool } from "./tool-registry.js";

import { CalculatorTool } from "./calculator-tool.js";
import { RunCodeTool } from "./code-tools.js";
import { MiniJSAgentTool } from "./js-code-tool.js";
import { BrowserTool, ScreenshotTool } from "./browser-tools.js";
import { DownloadFileTool, HttpRequestTool } from "./http-tools.js";
import {
  OpenAIWebSearchTool,
  OpenAIImageGenerationTool,
  OpenAITextToSpeechTool
} from "./openai-tools.js";
import {
  GoogleGroundedSearchTool,
  GoogleImageGenerationTool
} from "./google-tools.js";
import {
  DataForSEOSearchTool,
  DataForSEONewsTool,
  DataForSEOImagesTool
} from "./dataseo-tools.js";
import {
  GoogleSearchTool,
  GoogleNewsTool,
  GoogleImagesTool
} from "./search-tools.js";
import {
  SearchEmailTool,
  ArchiveEmailTool,
  AddLabelToEmailTool
} from "./email-tools.js";
import {
  StatisticsTool,
  GeometryTool,
  TrigonometryTool,
  ConversionTool
} from "./math-tools.js";
import {
  ExtractPDFTextTool,
  ExtractPDFTablesTool,
  ConvertPDFToMarkdownTool,
  ConvertMarkdownToPDFTool,
  ConvertDocumentTool
} from "./pdf-tools.js";
import {
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool
} from "./filesystem-tools.js";
import {
  EditFileTool,
  GlobTool,
  GrepTool
} from "./edit-search-tools.js";
import { TodoWriteTool } from "./todo-tools.js";

export const BUILTIN_TOOL_CLASSES: ReadonlyArray<new () => Tool> = [
  // Filesystem (workspace-relative)
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool,
  EditFileTool,
  GlobTool,
  GrepTool,

  // Task tracking
  TodoWriteTool,

  // Search
  // GoogleSearchTool,
  // GoogleNewsTool,
  // GoogleImagesTool,
  // GoogleGroundedSearchTool,
  // OpenAIWebSearchTool,
  // DataForSEOSearchTool,
  // DataForSEONewsTool,
  // DataForSEOImagesTool,

  // Generation
  // GoogleImageGenerationTool,
  // OpenAIImageGenerationTool,
  // OpenAITextToSpeechTool,

  // Web
  // BrowserTool,
  // ScreenshotTool,
  // DownloadFileTool,
  // HttpRequestTool,

  // Email
  // SearchEmailTool,
  // ArchiveEmailTool,
  // AddLabelToEmailTool,

  // Compute
  // CalculatorTool,
  // RunCodeTool,
  // MiniJSAgentTool,
  // StatisticsTool,
  // GeometryTool,
  // TrigonometryTool,
  // ConversionTool,

  // Documents
  // ExtractPDFTextTool,
  // ExtractPDFTablesTool,
  // ConvertPDFToMarkdownTool,
  // ConvertMarkdownToPDFTool,
  // ConvertDocumentTool
];

/**
 * Return one fresh instance per built-in tool class.
 * Useful when constructing a tool list for an agent.
 */
export function getBuiltinTools(): Tool[] {
  return BUILTIN_TOOL_CLASSES.map((Cls) => new Cls());
}

let registeredNames: string[] | null = null;

/**
 * Register all built-in tools in the global tool registry, so that
 * `resolveTool(name)` returns a usable instance for any built-in by name.
 *
 * Truly idempotent: only the first call instantiates and registers; later
 * calls return the cached list of names without touching the registry.
 * Returns the array of registered tool names.
 */
export function registerBuiltinTools(): string[] {
  if (registeredNames) return registeredNames;
  const names: string[] = [];
  for (const Cls of BUILTIN_TOOL_CLASSES) {
    const instance = new Cls();
    registerTool(instance);
    names.push(instance.name);
  }
  registeredNames = names;
  return names;
}

/**
 * Reset the one-time registration guard. Test-only — production code
 * should never call this.
 */
export function resetBuiltinToolsRegistration(): void {
  registeredNames = null;
}
