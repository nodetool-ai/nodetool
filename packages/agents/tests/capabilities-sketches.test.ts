/**
 * The `sketches` capability module.
 *
 * Same three assertions the timelines port makes: a well-formed, correctly
 * classified module, specs byte-identical to the wire surface they replaced, and
 * implementations that still do the work. `tests/sketch-version-tools.test.ts`
 * and `tests/document-edit-tools.test.ts` run unmodified against those classes.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { ImageDocument, ModelObserver, initTestDb } from "@nodetool-ai/models";
import { module as sketches } from "../src/capabilities/sketches.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { capabilityModuleIssues } from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { Tool } from "../src/tools/base-tool.js";

const ctx = (userId = "u1") => ({ userId }) as unknown as ProcessingContext;

const run = (userId = "u1") =>
  createCapabilityRun({ context: ctx(userId), gate: UNGATED });

const documentData = () => ({
  sketch: {
    version: 3,
    canvas: { width: 1024, height: 768, backgroundColor: "#ffffff" },
    layers: [
      {
        id: "layer-1",
        name: "Background",
        type: "raster",
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: "normal",
        data: null
      }
    ],
    activeLayerId: "layer-1",
    maskLayerId: null
  },
  layerBindings: []
});

async function makeSketch(
  overrides: Record<string, unknown> = {}
): Promise<ImageDocument> {
  return ImageDocument.create<ImageDocument>({
    user_id: "u1",
    project_id: "default",
    name: "Poster",
    width: 1024,
    height: 768,
    background_color: "#ffffff",
    document: JSON.stringify(documentData()),
    ...overrides
  });
}

/** Every capability paired with the `Tool` the belt builds for it. */
const PAIRS: Array<[string, () => Tool]> = [
  ["list_sketches", () => toolForCapabilityName("list_sketches")],
  ["list_sketch_versions", () => toolForCapabilityName("list_sketch_versions")],
  ["get_sketch_version", () => toolForCapabilityName("get_sketch_version")],
  [
    "create_sketch_version",
    () => toolForCapabilityName("create_sketch_version")
  ],
  [
    "restore_sketch_version",
    () => toolForCapabilityName("restore_sketch_version")
  ],
  ["edit_sketch", () => toolForCapabilityName("edit_sketch")],
  ["validate_sketch", () => toolForCapabilityName("validate_sketch")]
];

describe("sketches capability module", () => {
  it("is well-formed and declares itself as sketches", () => {
    expect(capabilityModuleIssues("sketches", sketches)).toEqual([]);
    expect(sketches.exports.map((e) => e.spec.name)).toEqual([
      "list_sketches",
      "list_sketch_versions",
      "get_sketch_version",
      "create_sketch_version",
      "restore_sketch_version",
      "edit_sketch",
      "validate_sketch",
      "delete_sketch"
    ]);
  });

  it("classifies every export the way the gate's map does", () => {
    for (const entry of sketches.exports) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("keeps the wire surface the belt offers", () => {
    for (const [name, make] of PAIRS) {
      const spec = sketches.exports.find((e) => e.spec.name === name)?.spec;
      const tool = make();
      expect(spec).toBeDefined();
      expect(tool.name).toBe(name);
      expect(tool.description).toBe(spec?.description);
      expect(tool.inputSchema).toEqual(spec?.inputSchema);
    }
  });

  it("renders the user-facing messages", () => {
    const args = {
      image_document_id: "s1",
      version: 2,
      ops: [{ op: "add_layer" }]
    };
    for (const [name, make] of PAIRS) {
      const spec = sketches.exports.find((e) => e.spec.name === name)!.spec;
      expect([name, spec.userMessage?.(args)]).toEqual([
        name,
        make().userMessage(args)
      ]);
    }
  });
});

describe("sketches capability behaviour", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("lists, filters, and hides another user's sketches", async () => {
    const poster = await makeSketch();
    await makeSketch({ name: "Storyboard frame" });

    const all = (await run().invoke("list_sketches", {})) as {
      sketches: Array<{ id: string }>;
    };
    expect(all.sketches).toHaveLength(2);

    const filtered = (await run().invoke("list_sketches", {
      query: "post"
    })) as { sketches: Array<{ id: string; width: number }> };
    expect(filtered.sketches).toEqual([
      expect.objectContaining({ id: poster.id, width: 1024 })
    ]);

    const other = (await run("other").invoke("list_sketches", {})) as {
      sketches: unknown[];
    };
    expect(other.sketches).toEqual([]);
  });

  it("snapshots, reads, and restores a version", async () => {
    const row = await makeSketch();

    const created = (await run().invoke("create_sketch_version", {
      image_document_id: row.id,
      name: "before the repaint"
    })) as { ok: boolean; version: number };
    expect(created.ok).toBe(true);

    const listed = (await run().invoke("list_sketch_versions", {
      image_document_id: row.id
    })) as { versions: Array<{ name: string }> };
    expect(listed.versions[0]).toMatchObject({ name: "before the repaint" });

    const read = (await run().invoke("get_sketch_version", {
      image_document_id: row.id,
      version: created.version
    })) as { document: { sketch: { layers: unknown[] } } };
    expect(read.document.sketch.layers).toHaveLength(1);

    const restored = (await run().invoke("restore_sketch_version", {
      image_document_id: row.id,
      version: created.version
    })) as { ok: boolean; restored_version: number };
    expect(restored).toMatchObject({
      ok: true,
      restored_version: created.version
    });
  });

  it("adds a layer and reports the stack", async () => {
    const row = await makeSketch();
    const result = (await run().invoke("edit_sketch", {
      image_document_id: row.id,
      ops: [{ op: "add_layer", name: "Shadow" }]
    })) as {
      applied: number;
      failed: number;
      layers: Array<{ name: string }>;
      active_layer_id: string;
    };
    expect(result).toMatchObject({ applied: 1, failed: 0 });
    expect(result.layers.map((l) => l.name)).toEqual(["Background", "Shadow"]);
    expect(result.active_layer_id).not.toBe("layer-1");
  });

  it("rejects a blend mode the compositor does not ship", async () => {
    const row = await makeSketch();
    const result = (await run().invoke("edit_sketch", {
      image_document_id: row.id,
      ops: [{ op: "set_layer_props", target: "Background", blendMode: "glow" }]
    })) as { failed: number; ops: Array<{ error?: string }> };
    expect(result.failed).toBe(1);
    expect(result.ops[0].error).toContain("is not one the compositor ships");
  });

  it("validates an inline document and says so without a loader", async () => {
    const inline = (await run().invoke("validate_sketch", {
      document: documentData(),
      width: 1024,
      height: 768
    })) as { summary: string };
    expect(inline.summary).toBe("No issues found.");

    const noLoader = (await run().invoke("validate_sketch", {
      image_document_id: "s1"
    })) as { error: string; validated: boolean };
    expect(noLoader.validated).toBe(false);
    expect(noLoader.error).toContain("no sketch loader is available");
  });

  it("reads a saved sketch through the run's loader", async () => {
    const loaded = createCapabilityRun({
      context: ctx(),
      gate: UNGATED,
      loaders: {
        sketch: async () => ({
          document: JSON.stringify(documentData()),
          width: 1024,
          height: 768,
          backgroundColor: "#ffffff",
          name: "Poster"
        })
      }
    });
    const result = (await loaded.invoke("validate_sketch", {
      image_document_id: "s1"
    })) as { image_document_id: string; name: string; summary: string };
    expect(result).toMatchObject({
      image_document_id: "s1",
      name: "Poster",
      summary: "No issues found."
    });
  });
});
