/**
 * Permission classification and the gate's options.
 *
 * The chat agent always carries a fixed toolbelt; a permission *mode* decides
 * whether each tool call runs automatically, asks the user first, or is
 * blocked. The ladder itself lives in `capabilities/invoke.ts` — one
 * implementation, reached either through `CapabilityRun.invoke` or through the
 * `gateTools` wrapper (`capabilities/gate-tools.ts`), which is how a host that
 * still hands out `Tool` instances gets the same gate. The wrapper lives on
 * the capabilities side so this file never imports from `capabilities/` — the
 * reverse edge deadlocked the bundled backend's async module wrappers.
 *
 * Design: docs/superpowers/specs/2026-05-28-chat-permission-model-design.md,
 * docs/tool-class-retirement-design.md § "Where the permission gate lives"
 */

// Type-only imports: keep tool-permissions.ts free of provider/LLM runtime
// deps and avoid any value-level import cycle with security-monitor.ts and
// the sandbox.
import type { SecurityVerdict, PendingAction } from "../security-monitor.js";
import type { SandboxClock } from "../js-sandbox.js";

/** How risky a tool is, independent of the active mode. */
export type PermissionCategory = "read" | "write" | "execute" | "external";

/** The user-selected permission mode for a chat turn. */
export type PermissionMode = "plan" | "default" | "auto";

/** What the gate decides to do with a single call before any user prompt. */
export type PermissionDecision = "allow" | "ask" | "block";

/** The user's answer to an approval prompt. */
export type ApprovalDecision = "allow" | "allow_for_chat" | "deny";

/**
 * Tool name → category. Anything not listed defaults to `external`, the most
 * conservative class, so a newly-added tool is gated until classified.
 *
 * `read` = no side effects (search, inspect, query, pure compute, internal
 * agent bookkeeping). `write` = mutates local state or produces artifacts /
 * costly media. `execute` = runs arbitrary compute. `external` = third-party
 * side effects.
 */
export const TOOL_PERMISSION_CATEGORIES: Readonly<
  Record<string, PermissionCategory>
> = {
  // --- read: filesystem / workspace reads ---
  read_file: "read",
  list_directory: "read",
  glob: "read",
  grep: "read",
  // --- read: web & document reads ---
  web_search: "read",
  image_search: "read",
  // Apify inspection. Reading the store, an actor record, an input schema, or
  // a dataset a run already produced has no side effect and spends nothing —
  // only `run_apify_actor` and `abort_apify_run` act, and those are left
  // unlisted so the gate classes them `external`.
  search_apify_actors: "read",
  get_apify_actor: "read",
  get_apify_actor_schema: "read",
  get_apify_run: "read",
  get_apify_dataset_items: "read",
  get_apify_key_value_record: "read",
  // SerpAPI. Every one of these reads: listing engines and reading an engine's
  // parameter table are keyless page reads, and a search spends a plan credit
  // without changing anything on the other side — the same class `web_search`
  // sits in, which is the same SerpAPI call with the engine picked for it.
  list_serpapi_engines: "read",
  get_serpapi_engine_schema: "read",
  serpapi_search: "read",
  get_serpapi_account: "read",
  get_serpapi_locations: "read",
  // NodeTool's own configuration. Reading a setting or checking which
  // credentials exist has no side effect; `list_secrets` never carries a
  // value. `set_setting` and `request_secret` are left unlisted so the gate
  // classes them `external` — one changes how this install behaves, and the
  // other interrupts the user with a dialog.
  list_settings: "read",
  get_setting: "read",
  list_secrets: "read",
  take_screenshot: "read",
  // Live browser. Reading the page and the console has no effect on it;
  // acting on it does, and every acting `browser_*` is left unlisted so the
  // gate classes it `external` — a click, a keystroke or an upload lands on a
  // third-party site in the user's own logged-in session. `browser_restart`
  // and `browser_console_exec` are listed below as `execute`.
  browser_status: "read",
  browser_view: "read",
  browser_console_view: "read",
  extract_pdf_text: "read",
  extract_pdf_tables: "read",
  convert_pdf_to_markdown: "read",
  view_image: "read",
  list_images: "read",
  // --- read: nodetool inspection (REST + local) ---
  list_workflows: "read",
  get_workflow: "read",
  validate_workflow: "read",
  validate_code: "read",
  list_scripts: "read",
  get_script: "read",
  list_threads: "read",
  get_thread: "read",
  get_message: "read",
  validate_timeline: "read",
  preview_timeline_frame: "read",
  validate_sketch: "read",
  validate_model3d: "read",
  list_model3ds: "read",
  get_model3d: "read",
  // Measuring media decodes it in-process and writes nothing.
  analyze_audio: "read",
  analyze_audio_spectrum: "read",
  detect_audio_events: "read",
  analyze_video: "read",
  detect_video_scenes: "read",
  // The ingredients library: reading entities and seasoning a prompt with
  // their descriptors touches nothing. Tagging or retagging one writes the
  // entity marker onto a local asset, so those are `write`.
  list_entities: "read",
  get_entity: "read",
  apply_entities: "read",
  create_entity: "write",
  update_entity: "write",
  delete_entity: "write",
  // Timeline compositions: the shipped templates are files on disk and a saved
  // one is a JSON asset, so reading either touches nothing. Saving writes an
  // asset and deleting removes one.
  list_compositions: "read",
  get_composition: "read",
  save_composition: "write",
  delete_composition: "write",
  // Skills are the user's own instruction documents in the local DB: reading
  // the catalog or one body touches nothing, authoring one is a local write.
  list_skills: "read",
  load_skill: "read",
  create_skill: "write",
  update_skill: "write",
  delete_skill: "write",
  validate_js_script: "read",
  list_js_scripts: "read",
  get_js_script: "read",
  list_js_script_versions: "read",
  get_js_script_version: "read",
  list_sketches: "read",
  get_sketch: "read",
  list_sketch_versions: "read",
  get_sketch_version: "read",
  list_timelines: "read",
  create_timeline: "write",
  get_timeline: "read",
  list_timeline_versions: "read",
  get_timeline_version: "read",
  list_workflow_versions: "read",
  get_workflow_version: "read",
  list_storyboards: "read",
  get_storyboard: "read",
  get_example_workflow: "read",
  export_workflow_digraph: "read",
  list_jobs: "read",
  list_apps: "read",
  get_app: "read",
  get_cost_summary: "read",
  get_job: "read",
  get_job_logs: "read",
  list_assets: "read",
  get_asset: "read",
  read_asset: "read",
  read_media_bytes: "read",
  list_models: "read",
  list_provider_models: "read",
  find_model: "read",
  list_nodes: "read",
  search_nodes: "read",
  get_node_info: "read",
  ui_get_graph: "read",
  search_email: "read",
  // --- read: knowledge / collections ---
  list_collections: "read",
  search_collections: "read",
  query_collection: "read",
  vector_text_search: "read",
  vector_hybrid_search: "read",
  // --- read: internal agent bookkeeping (no external side effects) ---
  todo_write: "read",
  list_shared: "read",
  read_shared: "read",
  share_result: "read",
  // Memory reads + asset-library discovery have no side effects.
  memory_list: "read",
  memory_search: "read",
  asset_search: "read",
  asset_list: "read",
  create_plan: "read",
  finish_plan: "read",
  create_task: "read",
  add_task: "read",
  remove_task: "read",
  finish_task: "read",
  finish_step: "read",
  finish_graph: "read",
  add_node: "read",
  add_edge: "read",
  // run_subtask spawns a child loop whose own tools are gated; the call
  // itself has no side effects, so it always runs.
  run_subtask: "read",
  // run_search spawns a read-only child loop (read_file/glob/grep/
  // list_directory/read_shared only); the call itself has no side effects, so
  // it always runs ungated.
  run_search: "read",
  // start_subtask spawns the same kind of child, detached; the registry it
  // writes to is per-turn bookkeeping, not an external mutation. wait_subtasks
  // only reads that registry.
  start_subtask: "read",
  wait_subtasks: "read",

  // --- write: produces files / artifacts / costly media ---
  write_file: "write",
  edit_file: "write",
  download_file: "write",
  convert_markdown_to_pdf: "write",
  convert_document: "write",
  save_asset: "write",
  // Memory mutations touch local DB state (not third-party), so they
  // are `write` (gated in default/plan mode), not the conservative `external`.
  memory_save: "write",
  memory_update: "write",
  memory_delete: "write",
  create_workflow: "write",
  ui_add_node: "write",
  ui_connect_nodes: "write",
  ui_update_node_data: "write",
  ui_delete_node: "write",
  ui_delete_edge: "write",
  ui_move_node: "write",
  ui_set_node_title: "write",
  generate_image: "write",
  edit_image: "write",
  segment_image: "write",
  // Storyboard renders call an image/video model per shot and write the
  // results back onto a local board — costly media, local state.
  render_storyboard_stills: "write",
  render_storyboard_clips: "write",
  revise_storyboard_clip: "write",
  assemble_storyboard_timeline: "write",
  generate_video: "write",
  animate_image: "write",
  generate_speech: "write",
  generate_music: "write",
  // Voicing calls a TTS model per line and writes takes onto a local script;
  // assembly writes a timeline row.
  voice_script_lines: "write",
  assemble_script_timeline: "write",
  // Both write the sketch's snapshot history; a restore also rewrites the
  // document itself (undoably — it snapshots first).
  create_sketch: "write",
  create_sketch_version: "write",
  create_script: "write",
  create_storyboard: "write",
  restore_sketch_version: "write",
  delete_sketch_version: "write",
  // Same for a timeline sequence's history: a restore rewrites the cut, after
  // snapshotting the state it replaces.
  create_timeline_version: "write",
  restore_timeline_version: "write",
  delete_timeline_version: "write",
  // And for a JS script's history.
  create_js_script_version: "write",
  restore_js_script_version: "write",
  delete_js_script_version: "write",
  create_workflow_version: "write",
  restore_workflow_version: "write",
  delete_workflow_version: "write",
  // Document edits: each rewrites a stored document under a CAS.
  edit_timeline: "write",
  edit_sketch: "write",
  // Replaces a timeline's whole document, after snapshotting what it replaces.
  set_timeline_document: "write",
  // Composites the cut locally and saves the video as an asset. No model
  // is called, so it sits with the other renders rather than with the
  // arbitrary-compute tools.
  render_timeline: "write",
  // Writes the glTF back over the asset it came from.
  edit_model3d: "write",
  create_model3d: "write",
  save_js_script: "write",
  edit_script: "write",
  edit_storyboard: "write",
  // Each creates a second document and links the pair.
  extract_script_from_storyboard: "write",
  derive_storyboard_from_script: "write",
  cancel_job: "write",
  update_asset: "write",
  create_app: "write",
  edit_app: "write",
  delete_app: "write",
  delete_timeline: "write",
  delete_sketch: "write",
  delete_script: "write",
  delete_storyboard: "write",
  delete_js_script: "write",
  create_collection: "write",
  delete_collection: "write",
  update_workflow: "write",
  delete_workflow: "write",
  transcribe_audio: "write",
  embed_text: "write",
  vector_index: "write",
  vector_batch_index: "write",
  vector_recursive_split_and_index: "write",
  vector_markdown_split_and_index: "write",

  // --- execute: runs arbitrary compute ---
  run_node: "execute",
  run_code: "execute",
  test_code: "execute",
  run_js_script: "execute",
  test_js_script: "execute",
  run_workflow: "execute",
  debug_workflow: "execute",
  debug_app: "execute",
  start_background_job: "execute",
  ffmpeg: "execute",
  ffprobe: "execute",
  browser_restart: "execute",
  browser_console_exec: "execute",

  // --- external: third-party side effects ---
  browser: "external",
  // Running a plan is not one action but every action in it, with whatever the
  // belt offers — writes, spend, third-party calls. `external` blocks it in
  // plan mode (running a plan there is the opposite of planning) and asks once
  // everywhere else; each step's own calls are still gated inside its loop.
  execute_plan: "external",
  // Publishing a workflow discloses it outside the account, and cannot be
  // taken back from whoever read it while it was public.
  set_workflow_access: "external",
  http_request: "external",
  yt_dlp: "external",
  archive_email: "external",
  add_label_to_email: "external"
};

/** Category for a tool name, defaulting to the conservative `external`. */
export function permissionCategoryFor(name: string): PermissionCategory {
  return TOOL_PERMISSION_CATEGORIES[name] ?? "external";
}

/**
 * The matrix: `read` always runs; in `auto` everything runs; in `plan`
 * anything actionable is blocked; in `default` actionable calls ask.
 */
export function decidePermission(
  mode: PermissionMode,
  category: PermissionCategory
): PermissionDecision {
  if (category === "read") return "allow";
  if (mode === "auto") return "allow";
  if (mode === "plan") return "block";
  return "ask";
}

export interface ApprovalRequest {
  toolName: string;
  category: PermissionCategory;
  /** Tool arguments, with the reserved `_message` field stripped. */
  args: Record<string, unknown>;
  /** Resolved user-facing status (LLM `_message` or the tool's template). */
  message: string;
  /**
   * What the call will do, in plain sentences, for the approval dialog to ask
   * about. A high-risk code action supplies one (`execute_code`'s
   * `description`); most calls have none and the dialog shows `message`.
   */
  description?: string;
}

export type RequestApproval = (
  request: ApprovalRequest
) => Promise<ApprovalDecision>;

export interface PermissionGateOptions {
  mode: PermissionMode;
  /**
   * Tool names the user has approved for the rest of the chat. Shared (by
   * reference) across a thread so "Allow for this chat" sticks between turns.
   */
  sessionAllow: Set<string>;
  /** Round-trips an approval prompt to the UI and resolves with the answer. */
  requestApproval: RequestApproval;
  /**
   * Opt-in LLM-judge consult. When set, every actionable (non-read) tool call
   * that the mode/approval logic would otherwise run is first vetted by the
   * monitor; a `block` verdict stops execution with a structured error. This
   * is a plain callback (NOT the monitor class) so the gate carries no
   * provider/LLM dependency. Default undefined → the gate behaves exactly as
   * before, byte-for-byte. Read-class tools are NEVER consulted, even when set.
   */
  securityMonitor?: (action: PendingAction) => Promise<SecurityVerdict>;
  /**
   * The sandbox clock a code action runs on, when the call comes from one. The
   * gate stops it for the length of an approval prompt or a monitor consult:
   * that wait is the user's (or another model's), not the guest program's, and
   * charging it to the action's wall clock kills the program that asked.
   */
  clock?: SandboxClock;
  /**
   * Optional accessor for the recent transcript text, forwarded into the
   * monitor's {@link PendingAction.transcript} so SOFT-block user-intent
   * clearing has evidence to reason over. Defaults to undefined → empty
   * transcript. Only invoked when {@link securityMonitor} is set.
   */
  recentTranscript?: () => string;
}

/**
 * Why a headless host refuses an escalation, in one sentence naming it.
 *
 * Exported because two callers need the same words: the gate reports it when
 * it denies, and a host that runs headless on purpose (the CLI behind a pipe)
 * prints it once up front so the user is not left guessing why a later call
 * was refused.
 */
export function headlessDenialReason(hostName: string): string {
  return (
    `${hostName} runs without a user to ask, so calls the permission ladder ` +
    `escalates are denied.`
  );
}

/**
 * The gate for a host with nobody to ask: `auto`, denying every escalation.
 *
 * `decidePermission` allows read, write, execute and external outright in
 * `auto`, so this approver is reached only by a request the ladder itself
 * raises — a security-monitor consult, or a category that starts asking in
 * `auto` later. Denying is the only answer a host with no user can give
 * honestly: resolving `"allow"` would grant exactly what the escalation was
 * raised to withhold, and never resolving would hang the run (invariant I-4).
 *
 * `hostName` names the caller so the refusal says which host had no one to
 * ask, rather than only that something was refused.
 */
export function headlessGate(hostName: string): PermissionGateOptions {
  const reason = headlessDenialReason(hostName);
  const headlessDeny: RequestApproval = async (request) => {
    // Loud on the refusal (I-4): a denial nobody can see reads as a tool that
    // silently did nothing. `console` rather than a logger keeps the
    // type-only-imports rule at the top of this file.
    console.warn(`Denied \`${request.toolName}\` without asking: ${reason}`);
    return "deny";
  };
  return {
    mode: "auto",
    sessionAllow: new Set<string>(),
    requestApproval: headlessDeny
  };
}
