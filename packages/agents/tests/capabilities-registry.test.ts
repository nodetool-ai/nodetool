/**
 * Classification drift.
 *
 * The `Tool` classification map defaults anything unlisted to `external`. A
 * typed registry replaces that with a required `category` plus this walk: every
 * registered export must carry one, and the checked-in snapshot makes a
 * reclassification a one-line diff a reviewer sees.
 *
 * The registry is empty in this PR, so the walk asserts the machinery — the
 * snapshot's shape and the issue detector's teeth — rather than a table of
 * names. As namespaces land (PRs 3–9) the snapshot fills in and the walk bites.
 */

import { describe, expect, it } from "vitest";
import {
  DECLARED_CAPABILITY_MODULES,
  capabilityCategorySnapshot,
  capabilityModuleDrift,
  capabilityModuleIssues,
  listCapabilityModules,
  loadAllCapabilityModules,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import {
  PERMISSION_CATEGORIES,
  type CapabilityModule,
  type PermissionCategory
} from "../src/capabilities/types.js";

/**
 * The checked-in classification snapshot: every registered capability's wire
 * name → permission category. Add a line here in the same PR that adds the
 * capability; changing one is a reviewable diff, which is the whole point.
 */
const CAPABILITY_CATEGORY_SNAPSHOT: Record<string, PermissionCategory> = {
  animate_image: "write",
  // Unlisted in `TOOL_PERMISSION_CATEGORIES`, so the map's conservative
  // default classes the three judges and the taste pair `external`.
  compare_images: "external",
  create_workflow: "write",
  critique_image: "external",
  edit_file: "write",
  glob: "read",
  grep: "read",
  list_directory: "read",
  read_file: "read",
  // Both spawn a child loop whose own tools are gated inside it, so the
  // spawning call itself has no side effect.
  run_search: "read",
  run_subtask: "read",
  todo_write: "read",
  understand_video: "external",
  write_file: "write",
  // Google Workspace: none is listed in `TOOL_PERMISSION_CATEGORIES`, so the
  // map's conservative default classes them `external`. Carried over as-is.
  gmail_get_message: "external",
  gmail_list_labels: "external",
  gmail_modify_labels: "external",
  gmail_search: "external",
  gmail_send_message: "external",
  google_calendar_create_event: "external",
  google_calendar_delete_event: "external",
  google_calendar_list_calendars: "external",
  google_calendar_list_events: "external",
  google_docs_append: "external",
  google_docs_create: "external",
  google_docs_read: "external",
  google_drive_create_file: "external",
  google_drive_get_file: "external",
  google_drive_read_file: "external",
  google_drive_search: "external",
  google_sheets_append: "external",
  google_sheets_create: "external",
  google_sheets_read: "external",
  google_sheets_update: "external",
  debug_workflow: "execute",
  edit_image: "write",
  embed_text: "write",
  read_media_bytes: "read",
  export_workflow_digraph: "read",
  find_model: "read",
  generate_image: "write",
  generate_speech: "write",
  generate_video: "write",
  get_example_workflow: "read",
  get_node_info: "read",
  get_style_profile: "external",
  get_workflow: "read",
  list_collections: "read",
  list_models: "read",
  list_nodes: "read",
  list_provider_models: "read",
  list_workflows: "read",
  query_collection: "read",
  record_style_preference: "external",
  // Unlisted in `TOOL_PERMISSION_CATEGORIES`, so the map's conservative
  // default classes it `external`. Carried over as-is by the port.
  resolve_workflow_escalation: "external",
  run_workflow: "execute",
  score_image_adherence: "external",
  search_nodes: "read",
  start_background_job: "execute",
  transcribe_audio: "write",
  ffmpeg: "execute",
  yt_dlp: "external",
  validate_workflow: "read",
  vector_batch_index: "write",
  vector_hybrid_search: "read",
  vector_index: "write",
  vector_markdown_split_and_index: "write",
  vector_recursive_split_and_index: "write",
  vector_text_search: "read",
  // jobs
  get_job: "read",
  get_job_logs: "read",
  list_jobs: "read",
  // assets
  asset_list: "read",
  asset_search: "read",
  get_asset: "read",
  list_assets: "read",
  list_images: "read",
  read_asset: "read",
  save_asset: "write",
  view_image: "read",
  // apps
  debug_app: "execute",
  // --- web ---
  web_search: "read",
  google_news: "read",
  google_images: "read",
  browser: "external",
  take_screenshot: "read",
  http_request: "external",
  download_file: "write",
  // --- documents ---
  extract_pdf_text: "read",
  extract_pdf_tables: "read",
  convert_pdf_to_markdown: "read",
  convert_markdown_to_pdf: "write",
  convert_document: "write",
  // --- memory (thread memory: outlives the run, lives in the database) ---
  thread_memory_save: "write",
  thread_memory_list: "read",
  thread_memory_update: "write",
  thread_memory_delete: "write",
  // --- shared (run-scoped AgentMemory; the executors mount these) ---
  list_shared: "read",
  read_shared: "read",
  share_result: "read",
  // --- email ---
  search_email: "read",
  archive_email: "external",
  add_label_to_email: "external",
  // timelines
  list_timelines: "read",
  list_timeline_versions: "read",
  get_timeline_version: "read",
  create_timeline_version: "write",
  restore_timeline_version: "write",
  edit_timeline: "write",
  validate_timeline: "read",
  // sketches
  list_sketches: "read",
  list_sketch_versions: "read",
  get_sketch_version: "read",
  create_sketch_version: "write",
  restore_sketch_version: "write",
  edit_sketch: "write",
  validate_sketch: "read",
  validate_js_script: "read",
  list_js_scripts: "read",
  get_js_script: "read",
  save_js_script: "write",
  run_js_script: "execute",
  test_js_script: "execute",
  // scripts
  list_scripts: "read",
  get_script: "read",
  voice_script_lines: "write",
  assemble_script_timeline: "write",
  edit_script: "write",
  derive_storyboard_from_script: "write",
  // threads (chat history — read-only)
  list_threads: "read",
  get_thread: "read",
  get_message: "read",
  // storyboards
  list_storyboards: "read",
  get_storyboard: "read",
  render_storyboard_stills: "write",
  render_storyboard_clips: "write",
  revise_storyboard_clip: "write",
  assemble_storyboard_timeline: "write",
  edit_storyboard: "write",
  extract_script_from_storyboard: "write",
  // packs — sandbox package discovery, mounted per CodeAct session.
  get_sandbox_package_docs: "read",
  list_sandbox_packages: "read",
  // code (Code-node authoring harness)
  validate_code: "read",
  run_code: "execute",
  test_code: "execute",
  // ui — the eight workflow-document schemas. Reading the graph is a read; the
  // seven mutators rewrite a stored workflow.
  ui_get_graph: "read",
  ui_add_node: "write",
  ui_connect_nodes: "write",
  ui_update_node_data: "write",
  ui_delete_node: "write",
  ui_delete_edge: "write",
  ui_move_node: "write",
  ui_set_node_title: "write"
};

describe("capability registry walk", () => {
  it("every registered export carries an identity and a category", async () => {
    const names = listCapabilityModules();
    for (const name of names) {
      const mod = await loadCapabilityModule(name);
      expect(mod.module).toBe(name);
      for (const entry of mod.exports) {
        expect(entry.spec.name.trim()).not.toBe("");
        expect(entry.spec.description.trim()).not.toBe("");
        expect(PERMISSION_CATEGORIES).toContain(entry.spec.category);
        expect(typeof entry.impl).toBe("function");
      }
    }
    // The walk must have visited every declared module, not silently nothing.
    expect(names.length).toBe(DECLARED_CAPABILITY_MODULES.length);
  });

  it("has no drift between the declaration and the loader table", async () => {
    expect(await capabilityModuleDrift()).toEqual([]);
  });

  it("matches the checked-in name → category snapshot", async () => {
    expect(await capabilityCategorySnapshot()).toEqual(
      CAPABILITY_CATEGORY_SNAPSHOT
    );
  });

  it("caches each module load", async () => {
    const first = await loadAllCapabilityModules();
    const second = await loadAllCapabilityModules();
    expect(second).toHaveLength(first.length);
    for (let i = 0; i < first.length; i += 1) {
      expect(second[i]).toBe(first[i]);
    }
  });

  it("rejects an unregistered module by name", async () => {
    await expect(loadCapabilityModule("nope")).rejects.toThrow(
      /no capability module is registered for "nope"/
    );
  });
});

describe("capabilityModuleIssues", () => {
  const good = {
    spec: {
      name: "list_widgets",
      description: "List widgets.",
      inputSchema: { type: "object", properties: {} },
      category: "read" as const
    },
    impl: async () => ({ widgets: [] })
  };

  it("passes a well-formed module", () => {
    const mod: CapabilityModule = { module: "widgets", exports: [good] };
    expect(capabilityModuleIssues("widgets", mod)).toEqual([]);
  });

  it("catches a spec with no category — the failure it exists for", () => {
    const uncategorized = {
      spec: { ...good.spec, name: "burn_widgets", category: undefined },
      impl: good.impl
    } as unknown as CapabilityModule["exports"][number];
    const mod: CapabilityModule = {
      module: "widgets",
      exports: [uncategorized]
    };
    expect(capabilityModuleIssues("widgets", mod)).toEqual([
      "burn_widgets carries no permission category (got undefined)"
    ]);
  });

  it("catches a category outside the four classes", () => {
    const bogus = {
      spec: { ...good.spec, category: "readonly" },
      impl: good.impl
    } as unknown as CapabilityModule["exports"][number];
    const mod: CapabilityModule = { module: "widgets", exports: [bogus] };
    expect(capabilityModuleIssues("widgets", mod)).toEqual([
      'list_widgets carries no permission category (got "readonly")'
    ]);
  });

  it("catches a key that disagrees with the module's own name", () => {
    const mod: CapabilityModule = { module: "gadgets", exports: [good] };
    expect(capabilityModuleIssues("widgets", mod)).toContain(
      'widgets declares itself as "gadgets"'
    );
  });

  it("catches a duplicate export and a missing implementation", () => {
    const broken = {
      spec: good.spec,
      impl: undefined
    } as unknown as CapabilityModule["exports"][number];
    const mod: CapabilityModule = {
      module: "widgets",
      exports: [good, broken]
    };
    expect(capabilityModuleIssues("widgets", mod)).toEqual([
      "widgets exports list_widgets twice",
      "list_widgets carries no implementation"
    ]);
  });
});
