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
  debug_workflow: "execute",
  edit_image: "write",
  embed_text: "write",
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
  build_app: "execute",
  debug_app: "execute"
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
