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
 * base-nodes, sandbox-tools. Reaching a provider at call time is not such a
 * dependency: `runProviderPrediction` is on the context, so the media tools
 * belong here even though `find_model` — which enumerates the injected
 * provider map — does not.
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
import { isBrowserEnabled } from "../browser-gate.js";
import { isBlenderEnabled } from "../blender-gate.js";

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

  // Durable memory (user-scoped notes + asset references, every thread)
  "memory_save",
  "memory_list",
  "memory_search",
  "memory_update",
  "memory_delete",

  // Skills (the user's own instructions: discover, read, author)
  "list_skills",
  "load_skill",
  "create_skill",
  "update_skill",
  "delete_skill",

  // Chat history (past conversations and what was said in them)
  "list_threads",
  "get_thread",
  "get_message",

  // Asset library (discover + reuse generated/uploaded media)
  "asset_search",
  "asset_list",

  // Entities (reusable ingredients — characters, locations, styles, props)
  "list_entities",
  "get_entity",
  "apply_entities",
  "create_entity",
  "update_entity",
  "delete_entity",

  // Timeline compositions (reusable groups: lower thirds, title cards, stings)
  "list_compositions",
  "get_composition",
  "save_composition",
  "delete_composition",

  // Script → voiced takes → timeline, without authoring a workflow
  "list_scripts",
  "create_script",
  "get_script",
  "voice_script_lines",
  "assemble_script_timeline",
  "edit_script",
  "derive_storyboard_from_script",

  // Storyboard → rendered media → timeline, without authoring a workflow
  "list_storyboards",
  "create_storyboard",
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
  "get_sketch",
  "list_sketch_versions",
  "get_sketch_version",
  "create_sketch_version",
  "restore_sketch_version",
  "delete_sketch_version",
  "edit_sketch",
  "validate_sketch",

  // Timeline snapshot history (find a cut, pin a state, roll one back)
  "list_timelines",
  "create_timeline",
  "get_timeline",
  "list_timeline_versions",
  "get_timeline_version",
  "create_timeline_version",
  "restore_timeline_version",
  "delete_timeline_version",
  "edit_timeline",
  "set_timeline_document",
  "validate_timeline",

  // Look at the cut without an editor, a browser or a GPU: the composited
  // frame at a timecode, and the pixel difference between two versions of a
  // sequence. Both composite in-process off `@nodetool-ai/timeline`, so a
  // ProcessingContext is the whole dependency. `render_timeline` is the one
  // that is not here — it runs a workflow and so needs the node registry, and
  // is assembled beside the other run tools in `getAllMcpTools`.
  "preview_timeline_frame",
  "compare_timeline_frames",

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
  "list_js_script_versions",
  "get_js_script_version",
  "create_js_script_version",
  "restore_js_script_version",
  "delete_js_script_version",

  // Vision (lazy image loading: handles → pixels on demand)
  "list_images",
  "view_image",

  // Search
  "web_search",
  "image_search",

  // Creative critique (VLM judging + taste memory)
  "critique_image",
  "compare_images",
  "score_image_adherence",

  // Video understanding (a multimodal chat model reads a whole clip)
  "understand_video",

  // Signal-level media analysis. Where `understand_video` asks a model what a
  // clip is about, these measure what it is: duration and format, the loudness
  // and frequency content of audio, and the motion, colour and cuts of video.
  // Mediabunny decodes, so none of them needs ffmpeg on the host.
  "analyze_audio",
  "analyze_audio_spectrum",
  "detect_audio_events",
  "analyze_video",
  "detect_video_scenes",

  // Media generation. Each reaches a provider through
  // `ProcessingContext.runProviderPrediction` and reads nothing off the run, so
  // a context is the whole dependency — the same one `critique_image` above and
  // `render_storyboard_stills` already run on. They used to be added only
  // beside `find_model`/`list_models`, which do need the injected provider map,
  // so a host that injected none — a Code node, a JS script — got a belt that
  // could judge an image and score its adherence but had no way to make one.
  "generate_image",
  "edit_image",
  "generate_video",
  "animate_image",
  "generate_speech",
  "generate_music",
  "transcribe_audio",
  "embed_text",

  // Web
  "browser",
  "take_screenshot",
  "download_file",
  "http_request",

  // Live browser — one real Chrome page, driven action by action. Either a
  // headless one this process launches or, through the NodeTool Chrome
  // extension, the tab the user is already signed in to. The action loop is
  // `@nodetool-ai/browser`, which this package depends on directly, so every
  // host assembling this belt can serve them.
  //
  // Dropped under the cloud profile — see `availableBuiltinToolNames`.
  "browser_status",
  "browser_view",
  "browser_navigate",
  "browser_restart",
  "browser_click",
  "browser_input_text",
  "browser_move_mouse",
  "browser_press_key",
  "browser_select_option",
  "browser_scroll",
  "browser_console_exec",
  "browser_console_view",
  "browser_capture_media",
  "browser_upload_asset",

  // Host media binaries
  "ffmpeg",
  "ffprobe",
  // Dropped under the cloud profile — see `availableBuiltinToolNames`.
  "yt_dlp",

  // Headless 3D render. Runs Blender through `runBlenderJob` and stores the
  // PNG through `context.createAsset`, so a context is the whole
  // dependency — the same one the media tools above run on.
  // Dropped under the cloud profile — see `availableBuiltinToolNames`.
  "render_model3d",

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

/** The `browser_*` names, which stand or fall together. */
const BROWSER_TOOL_NAMES: readonly string[] = BUILTIN_TOOL_NAMES.filter((name) =>
  name.startsWith("browser_")
);

/**
 * {@link BUILTIN_TOOL_NAMES} minus the ones this deployment does not offer.
 *
 * Both conditions are the cloud profile: it drops `yt_dlp` (see
 * {@link isYtDlpEnabled}), the `browser_*` capabilities (see
 * {@link isBrowserEnabled}) and `render_model3d` (see
 * {@link isBlenderEnabled}), so an agent, a Code node and a JS script all see
 * the same belt as the node catalog — one gate rather than a per-host filter.
 *
 * Dropping a name here is what a model sees; it is not the enforcement. A
 * guest that imports the owning capability module reaches the implementation
 * without a belt, so each gated implementation refuses on its own too.
 */
export function availableBuiltinToolNames(): readonly string[] {
  const dropped = new Set<string>();
  if (!isYtDlpEnabled()) dropped.add("yt_dlp");
  if (!isBrowserEnabled()) for (const name of BROWSER_TOOL_NAMES) dropped.add(name);
  if (!isBlenderEnabled()) dropped.add("render_model3d");
  if (dropped.size === 0) return BUILTIN_TOOL_NAMES;
  return BUILTIN_TOOL_NAMES.filter((name) => !dropped.has(name));
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
