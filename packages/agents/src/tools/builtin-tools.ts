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

import { BrowserTool, ScreenshotTool } from "./browser-tools.js";
import { DownloadFileTool, HttpRequestTool } from "./http-tools.js";
import {
  WebSearchTool,
  GoogleNewsTool,
  GoogleImagesTool
} from "./search-tools.js";
import {
  SearchEmailTool,
  ArchiveEmailTool,
  AddLabelToEmailTool
} from "./email-tools.js";
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
import { ViewImageTool, ListImagesTool } from "./view-image-tool.js";
import {
  CritiqueImageTool,
  CompareImagesTool,
  ScoreImageAdherenceTool,
  RecordStylePreferenceTool,
  GetStyleProfileTool
} from "./creative-critique-tools.js";
import {
  ThreadMemorySaveTool,
  ThreadMemoryListTool,
  ThreadMemoryUpdateTool,
  ThreadMemoryDeleteTool
} from "./thread-memory-tools.js";
import { AssetSearchTool, AssetListTool } from "./asset-library-tools.js";
import {
  ListScriptsTool,
  GetScriptTool,
  VoiceScriptLinesTool,
  AssembleScriptTimelineTool,
  EditScriptTool
} from "./script-voice-tools.js";
import {
  ListStoryboardsTool,
  GetStoryboardTool,
  RenderStoryboardStillsTool,
  RenderStoryboardClipsTool,
  ReviseStoryboardClipTool,
  AssembleStoryboardTimelineTool,
  EditStoryboardTool
} from "./storyboard-render-tools.js";
import {
  ListSketchesTool,
  ListSketchVersionsTool,
  GetSketchVersionTool,
  CreateSketchVersionTool,
  RestoreSketchVersionTool
} from "./sketch-version-tools.js";
import { EditSketchTool } from "./sketch-edit-tools.js";
import {
  ListTimelinesTool,
  ListTimelineVersionsTool,
  GetTimelineVersionTool,
  CreateTimelineVersionTool,
  RestoreTimelineVersionTool
} from "./timeline-version-tools.js";
import { EditTimelineTool } from "./timeline-edit-tools.js";
import {
  ValidateCodeTool,
  RunCodeTool,
  TestCodeTool
} from "./code-authoring-tools.js";

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

  // Thread-level memory (durable per-conversation notes + asset references)
  ThreadMemorySaveTool,
  ThreadMemoryListTool,
  ThreadMemoryUpdateTool,
  ThreadMemoryDeleteTool,

  // Asset library (discover + reuse generated/uploaded media)
  AssetSearchTool,
  AssetListTool,

  // Script → voiced takes → timeline, without authoring a workflow
  ListScriptsTool,
  GetScriptTool,
  VoiceScriptLinesTool,
  AssembleScriptTimelineTool,
  EditScriptTool,

  // Storyboard → rendered media → timeline, without authoring a workflow
  ListStoryboardsTool,
  GetStoryboardTool,
  RenderStoryboardStillsTool,
  RenderStoryboardClipsTool,
  ReviseStoryboardClipTool,
  AssembleStoryboardTimelineTool,
  EditStoryboardTool,

  // Sketch snapshot history (find a sketch, pin a state, roll one back)
  ListSketchesTool,
  ListSketchVersionsTool,
  GetSketchVersionTool,
  CreateSketchVersionTool,
  RestoreSketchVersionTool,
  EditSketchTool,

  // Timeline snapshot history (find a cut, pin a state, roll one back)
  ListTimelinesTool,
  ListTimelineVersionsTool,
  GetTimelineVersionTool,
  CreateTimelineVersionTool,
  RestoreTimelineVersionTool,
  EditTimelineTool,

  // Code-node authoring harness (validate → run → test a Code body)
  ValidateCodeTool,
  RunCodeTool,
  TestCodeTool,

  // Vision (lazy image loading: handles → pixels on demand)
  ListImagesTool,
  ViewImageTool,

  // Search
  WebSearchTool,
  GoogleNewsTool,
  GoogleImagesTool,

  // Creative critique (VLM judging + taste memory)
  CritiqueImageTool,
  CompareImagesTool,
  ScoreImageAdherenceTool,
  RecordStylePreferenceTool,
  GetStyleProfileTool,

  // Web
  BrowserTool,
  ScreenshotTool,
  DownloadFileTool,
  HttpRequestTool,

  // Email
  SearchEmailTool,
  ArchiveEmailTool,
  AddLabelToEmailTool,

  // Documents
  ExtractPDFTextTool,
  ExtractPDFTablesTool,
  ConvertPDFToMarkdownTool,
  ConvertMarkdownToPDFTool,
  ConvertDocumentTool
];

/**
 * Return one fresh instance per built-in tool class.
 * Useful when constructing a tool list for an agent.
 */
export function getBuiltinTools(): Tool[] {
  return BUILTIN_TOOL_CLASSES.map((Cls) => new Cls());
}

/**
 * The built-ins an agent gets. The nine provider-specific duplicates this set
 * used to subtract are gone: the media four were deleted, and the five search
 * backends became plain functions `web_search` / `google_news` /
 * `google_images` route to host-side. Every host therefore assembles the same
 * belt, and there is nothing left to exclude.
 */
export function getAgentToolbelt(): Tool[] {
  return getBuiltinTools();
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
