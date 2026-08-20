/**
 * Canonical list of built-in agent tool names.
 *
 * "Built-in" = servable from the capability registry with nothing but a
 * `ProcessingContext` — not tied to a specific NodeRegistry, sandbox,
 * workspace, or vector collection. These are the tools the WebSocket server
 * exposes by name; any name listed here can be selected from the chat / agent
 * frontends and resolved via `resolveTool(name)` without additional context.
 *
 * Capabilities that need something a run must carry (a node registry, a vector
 * collection, a provider map, an example catalog) are NOT listed here; the
 * subsystem that owns the dependency builds them — `getAllMcpTools`,
 * base-nodes, sandbox-tools.
 *
 * In particular the recursive-decomposition primitive (`run_subtask`) and the
 * read-only fan-out search primitive (`run_search`) are intentionally excluded:
 * both need a provider, a model and the parent belt, and are constructed at
 * their call sites (the websocket runner and the cli).
 *
 * The list is names, not classes. Each name resolves to its spec in the
 * registry's eager spec table and becomes a `Tool` whose implementation loads
 * from the owning capability module at first invoke
 * (`capabilities/lazy-tool.ts`) — so a belt is still assembled synchronously,
 * and no implementation is in the entry graph until something calls one.
 */

import type { Tool } from "./base-tool.js";
import { registerTool } from "./tool-registry.js";
import { toolForCapabilityName } from "../capabilities/lazy-tool.js";
import { isYtDlpEnabled } from "../yt-dlp-gate.js";

export const BUILTIN_TOOL_NAMES: readonly string[] = [
  // Filesystem (workspace-relative)
  "read_file",
  "write_file",
  "list_directory",
  "edit_file",
  "glob",
  "grep",

  // Task tracking
  "todo_write",

  // Thread-level memory (durable per-conversation notes + asset references)
  "thread_memory_save",
  "thread_memory_list",
  "thread_memory_update",
  "thread_memory_delete",

  // Chat history (past conversations and what was said in them)
  "list_threads",
  "get_thread",
  "get_message",

  // Asset library (discover + reuse generated/uploaded media)
  "asset_search",
  "asset_list",

  // Script → voiced takes → timeline, without authoring a workflow
  "list_scripts",
  "get_script",
  "voice_script_lines",
  "assemble_script_timeline",
  "edit_script",
  "derive_storyboard_from_script",

  // Storyboard → rendered media → timeline, without authoring a workflow
  "list_storyboards",
  "get_storyboard",
  "render_storyboard_stills",
  "render_storyboard_clips",
  "revise_storyboard_clip",
  "assemble_storyboard_timeline",
  "edit_storyboard",
  "extract_script_from_storyboard",

  // Sketch snapshot history (find a sketch, pin a state, roll one back)
  "list_sketches",
  "create_sketch",
  "list_sketch_versions",
  "get_sketch_version",
  "create_sketch_version",
  "restore_sketch_version",
  "edit_sketch",

  // Timeline snapshot history (find a cut, pin a state, roll one back)
  "list_timelines",
  "list_timeline_versions",
  "get_timeline_version",
  "create_timeline_version",
  "restore_timeline_version",
  "edit_timeline",

  // Code-node authoring harness (validate → run → test a Code body)
  "validate_code",
  "run_code",
  "test_code",

  // JS script documents (list → get → save → validate → run → test)
  "list_js_scripts",
  "get_js_script",
  "save_js_script",
  "validate_js_script",
  "run_js_script",
  "test_js_script",

  // Vision (lazy image loading: handles → pixels on demand)
  "list_images",
  "view_image",

  // Search
  "web_search",

  // Creative critique (VLM judging + taste memory)
  "critique_image",
  "compare_images",
  "score_image_adherence",
  "record_style_preference",
  "get_style_profile",

  // Video understanding (a multimodal chat model reads a whole clip)
  "understand_video",

  // Web
  "browser",
  "take_screenshot",
  "download_file",
  "http_request",

  // Host media binaries
  "ffmpeg",
  "ffprobe",
  // Dropped under the cloud profile — see `availableBuiltinToolNames`.
  "yt_dlp",

  // Email
  "search_email",
  "archive_email",
  "add_label_to_email",

  // Documents
  "extract_pdf_text",
  "extract_pdf_tables",
  "convert_pdf_to_markdown",
  "convert_markdown_to_pdf",
  "convert_document"
];

/**
 * Return one fresh `Tool` per built-in name.
 * Useful when constructing a tool list for an agent.
 */
export function getBuiltinTools(): Tool[] {
  return availableBuiltinToolNames().map((name) => toolForCapabilityName(name));
}

/**
 * {@link BUILTIN_TOOL_NAMES} minus the ones this deployment does not offer.
 *
 * Only `yt_dlp` is conditional today: the cloud profile drops it (see
 * {@link isYtDlpEnabled}), so an agent, a Code node and a JS script all see the
 * same belt as the node catalog — one gate rather than a per-host filter.
 */
export function availableBuiltinToolNames(): readonly string[] {
  if (isYtDlpEnabled()) return BUILTIN_TOOL_NAMES;
  return BUILTIN_TOOL_NAMES.filter((name) => name !== "yt_dlp");
}

/**
 * The built-ins an agent gets. The nine provider-specific duplicates this set
 * used to subtract are gone: the media four were deleted, and the five search
 * backends became plain functions that the single `web_search` capability
 * routes to host-side. Every host therefore assembles the same belt, and the
 * only thing subtracted from it is what the deployment does not offer
 * ({@link availableBuiltinToolNames}).
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
  for (const tool of getBuiltinTools()) {
    registerTool(tool);
    names.push(tool.name);
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
