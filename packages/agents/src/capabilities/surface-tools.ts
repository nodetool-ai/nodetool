/**
 * Server tools a chat surface may use, when the surface limits them.
 *
 * The native timeline editor (`timeline_assistant`) edits, inspects and
 * renders its timeline in C++ through its own `ui_timeline_*` client tools,
 * and it starts generation through its `ui_timeline_generate_clip` client tool. Its server tools are
 * limited to ones that do not load the media libraries (FFmpeg, WebGPU,
 * Skia canvas, libvips, Web Audio, PDFium) and that do not edit the saved
 * timeline behind the open editor. A package that ships only the server for
 * this editor can then leave those libraries out.
 */

const TIMELINE_ASSISTANT_SERVER_TOOLS: ReadonlySet<string> = new Set([
  // Workspace files and the web.
  "read_file",
  "write_file",
  "edit_file",
  "list_directory",
  "glob",
  "grep",
  "web_search",
  "http_request",
  "todo_write",
  // Providers and models.
  "list_providers",
  "find_model",
  "list_models",
  "list_provider_models",
  // Delegation and plans. A child loop gets the same limited tools.
  "run_subtask",
  "start_subtask",
  "wait_subtasks",
  "run_search",
  "create_plan",
  "execute_plan",
  // Memory, skills and threads.
  "memory_save",
  "memory_list",
  "memory_search",
  "memory_update",
  "memory_delete",
  "list_skills",
  "load_skill",
  "list_threads",
  "get_thread",
  "get_message",
  // Asset lookup, without decoding.
  "asset_search",
  "asset_list",
  "list_assets",
  "get_asset",
  // Cast, scripts and projects that the timeline links to.
  "list_entities",
  "get_entity",
  "create_entity",
  "update_entity",
  "delete_entity",
  "list_scripts",
  "get_script",
  "create_script",
  "edit_script",
  "list_projects",
  "search_projects",
  // Text generation and the state of media generations.
  "generate_text",
  "list_generations",
  "get_generation",
  "await_generation",
  "cancel_generation"
]);

const SURFACE_SERVER_TOOLS: Readonly<Record<string, ReadonlySet<string>>> = {
  timeline_assistant: TIMELINE_ASSISTANT_SERVER_TOOLS
};

/**
 * The server tools a chat source may use, or null when the source does not
 * limit them.
 */
export function surfaceServerTools(
  source: string | null | undefined
): ReadonlySet<string> | null {
  if (!source || !Object.hasOwn(SURFACE_SERVER_TOOLS, source)) return null;
  return SURFACE_SERVER_TOOLS[source];
}
