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
  abort_apify_run: "external",
  add_label_to_email: "external",
  animate_image: "write",
  archive_email: "external",
  assemble_script_timeline: "write",
  assemble_storyboard_timeline: "write",
  asset_list: "read",
  asset_search: "read",
  browser: "external",
  close_node_stream: "read",
  compare_images: "external",
  convert_document: "write",
  convert_markdown_to_pdf: "write",
  convert_pdf_to_markdown: "read",
  create_sketch_version: "write",
  create_timeline_version: "write",
  create_workflow: "write",
  critique_image: "external",
  debug_app: "execute",
  debug_workflow: "execute",
  derive_storyboard_from_script: "write",
  download_file: "write",
  edit_file: "write",
  edit_image: "write",
  edit_script: "write",
  edit_sketch: "write",
  edit_storyboard: "write",
  edit_timeline: "write",
  embed_text: "write",
  export_workflow_digraph: "read",
  extract_pdf_tables: "read",
  extract_pdf_text: "read",
  extract_script_from_storyboard: "write",
  ffmpeg: "execute",
  ffprobe: "execute",
  find_model: "read",
  generate_image: "write",
  generate_speech: "write",
  generate_video: "write",
  get_apify_actor: "read",
  get_apify_actor_schema: "read",
  get_apify_dataset_items: "read",
  get_apify_key_value_record: "read",
  get_apify_run: "read",
  get_asset: "read",
  get_example_workflow: "read",
  get_job: "read",
  get_job_logs: "read",
  get_js_script: "read",
  get_message: "read",
  get_node_info: "read",
  get_sandbox_package_docs: "read",
  get_script: "read",
  get_serpapi_account: "read",
  get_serpapi_engine_schema: "read",
  get_serpapi_locations: "read",
  get_setting: "read",
  get_sketch_version: "read",
  get_storyboard: "read",
  get_style_profile: "external",
  get_thread: "read",
  get_timeline_version: "read",
  get_workflow: "read",
  glob: "read",
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
  grep: "read",
  http_request: "external",
  invoke_node: "execute",
  list_assets: "read",
  list_collections: "read",
  list_directory: "read",
  list_images: "read",
  list_jobs: "read",
  list_js_scripts: "read",
  list_models: "read",
  list_nodes: "read",
  list_provider_models: "read",
  list_sandbox_packages: "read",
  list_scripts: "read",
  list_secrets: "read",
  list_serpapi_engines: "read",
  list_settings: "read",
  list_shared: "read",
  list_sketch_versions: "read",
  list_sketches: "read",
  list_storyboards: "read",
  list_threads: "read",
  list_timeline_versions: "read",
  list_timelines: "read",
  list_workflows: "read",
  open_node_stream: "execute",
  query_collection: "read",
  read_asset: "read",
  read_file: "read",
  read_media_bytes: "read",
  read_shared: "read",
  record_style_preference: "external",
  render_storyboard_clips: "write",
  render_storyboard_stills: "write",
  request_secret: "write",
  resolve_workflow_escalation: "external",
  restore_sketch_version: "write",
  restore_timeline_version: "write",
  revise_storyboard_clip: "write",
  run_apify_actor: "external",
  run_code: "execute",
  run_js_script: "execute",
  run_search: "read",
  run_subtask: "read",
  run_workflow: "execute",
  save_asset: "write",
  save_js_script: "write",
  score_image_adherence: "external",
  search_apify_actors: "read",
  search_email: "read",
  search_nodes: "read",
  serpapi_search: "read",
  set_setting: "write",
  share_result: "read",
  start_background_job: "execute",
  take_node_stream: "read",
  take_screenshot: "read",
  test_code: "execute",
  test_js_script: "execute",
  thread_memory_delete: "write",
  thread_memory_list: "read",
  thread_memory_save: "write",
  thread_memory_update: "write",
  todo_write: "read",
  transcribe_audio: "write",
  ui_add_node: "write",
  ui_connect_nodes: "write",
  ui_delete_edge: "write",
  ui_delete_node: "write",
  ui_get_graph: "read",
  ui_move_node: "write",
  ui_set_node_title: "write",
  ui_update_node_data: "write",
  understand_video: "external",
  validate_code: "read",
  validate_js_script: "read",
  validate_sketch: "read",
  validate_timeline: "read",
  validate_workflow: "read",
  vector_batch_index: "write",
  vector_hybrid_search: "read",
  vector_index: "write",
  vector_markdown_split_and_index: "write",
  vector_recursive_split_and_index: "write",
  vector_text_search: "read",
  view_image: "read",
  voice_script_lines: "write",
  web_search: "read",
  write_file: "write",
  yt_dlp: "external"
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
