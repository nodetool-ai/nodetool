import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ImageDocument,
  ImageDocumentVersion,
  ModelObserver,
  initTestDb
} from "@nodetool-ai/models";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { BUILTIN_TOOL_NAMES } from "../src/tools/builtin-tools.js";

const ctx = (userId = "u1") => ({ userId }) as unknown as ProcessingContext;

const layer = (overrides: Record<string, unknown> = {}) => ({
  id: "layer-1",
  name: "Background",
  type: "raster",
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: "normal",
  data: null,
  ...overrides
});

const document = (activeLayerId = "layer-1") =>
  JSON.stringify({
    sketch: {
      version: 3,
      canvas: { width: 1024, height: 768, backgroundColor: "#ffffff" },
      layers: [layer()],
      activeLayerId,
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
    document: document(),
    ...overrides
  });
}

describe("sketch version tools", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("registers as built-ins with sane permissions", () => {
    const names = BUILTIN_TOOL_NAMES;
    expect(names).toEqual(
      expect.arrayContaining([
        "list_sketches",
        "list_sketch_versions",
        "get_sketch_version",
        "create_sketch_version",
        "restore_sketch_version"
      ])
    );
    expect(permissionCategoryFor("list_sketch_versions")).toBe("read");
    expect(permissionCategoryFor("get_sketch_version")).toBe("read");
    expect(permissionCategoryFor("restore_sketch_version")).toBe("write");
    expect(permissionCategoryFor("validate_sketch")).toBe("read");
    expect(permissionCategoryFor("create_sketch")).toBe("write");
  });

  it("lists the caller's sketches and filters by name", async () => {
    const poster = await makeSketch();
    await makeSketch({ name: "Storyboard frame" });

    const all = (await toolForCapabilityName("list_sketches").process(ctx(), {})) as {
      sketches: Array<{ id: string; name: string; width: number }>;
    };
    expect(all.sketches).toHaveLength(2);

    const filtered = (await toolForCapabilityName("list_sketches").process(ctx(), {
      query: "post"
    })) as { sketches: Array<{ id: string; width: number }> };
    expect(filtered.sketches).toHaveLength(1);
    expect(filtered.sketches[0]).toMatchObject({ id: poster.id, width: 1024 });
  });

  it("hides another user's sketches", async () => {
    await makeSketch();
    const listed = (await toolForCapabilityName("list_sketches").process(ctx("other"), {})) as {
      sketches: unknown[];
    };
    expect(listed.sketches).toEqual([]);

    const versions = (await toolForCapabilityName("list_sketch_versions").process(ctx("other"), {
      image_document_id: (await ImageDocument.listByUser("u1"))[0].id
    })) as { error: string };
    expect(versions.error).toContain("was not found");
  });

  it("creates a manual snapshot and lists it", async () => {
    const row = await makeSketch();

    const created = (await toolForCapabilityName("create_sketch_version").process(ctx(), {
      image_document_id: row.id,
      name: "before the repaint"
    })) as { ok: boolean; version: number; saveType: string; name: string };
    expect(created).toMatchObject({
      ok: true,
      version: 1,
      saveType: "manual",
      name: "before the repaint",
      backgroundColor: "#ffffff"
    });

    await ImageDocumentVersion.snapshot(row, { saveType: "autosave" });

    const listed = (await toolForCapabilityName("list_sketch_versions").process(ctx(), {
      image_document_id: row.id
    })) as { versions: Array<{ version: number; saveType: string }> };
    // Newest first.
    expect(listed.versions.map((v) => [v.version, v.saveType])).toEqual([
      [2, "autosave"],
      [1, "manual"]
    ]);

    const manualOnly = (await toolForCapabilityName("list_sketch_versions").process(ctx(), {
      image_document_id: row.id,
      save_type: "manual"
    })) as { versions: Array<{ version: number }> };
    expect(manualOnly.versions.map((v) => v.version)).toEqual([1]);
  });

  it("reads one version's document without restoring it", async () => {
    const row = await makeSketch();
    await toolForCapabilityName("create_sketch_version").process(ctx(), {
      image_document_id: row.id,
      name: "the good one"
    });

    const result = (await toolForCapabilityName("get_sketch_version").process(ctx(), {
      image_document_id: row.id,
      version: 1
    })) as {
      version: number;
      saveType: string;
      name: string;
      document: { sketch: { activeLayerId: string } };
    };
    expect(result).toMatchObject({
      version: 1,
      saveType: "manual",
      name: "the good one",
      width: 1024
    });
    expect(result.document.sketch.activeLayerId).toBe("layer-1");

    // Reading is not restoring: the document row is untouched.
    const after = (await ImageDocument.findById(row.id))!;
    expect(after.updated_at).toBe(row.updated_at);

    const missing = (await toolForCapabilityName("get_sketch_version").process(ctx(), {
      image_document_id: row.id,
      version: 7
    })) as { error: string };
    expect(missing.error).toContain("no version 7");

    const otherUser = (await toolForCapabilityName("get_sketch_version").process(ctx("other"), {
      image_document_id: row.id,
      version: 1
    })) as { error: string };
    expect(otherUser.error).toContain("was not found");
  });

  it("restores a version, snapshots the overwritten state, and validates the result", async () => {
    const row = await makeSketch();
    await toolForCapabilityName("create_sketch_version").process(ctx(), {
      image_document_id: row.id,
      name: "the good one"
    });

    // Move the document on, so the restore has something to undo.
    const edited = (await ImageDocument.findById(row.id))!;
    edited.document = document("layer-2");
    edited.width = 512;
    await edited.save();

    const result = (await toolForCapabilityName("restore_sketch_version").process(ctx(), {
      image_document_id: row.id,
      version: 1
    })) as {
      ok: boolean;
      restored_version: number;
      undo_version: number;
      width: number;
      validation: { ok: boolean; errors: unknown[] };
      summary: string;
    };

    expect(result).toMatchObject({
      ok: true,
      restored_version: 1,
      undo_version: 2,
      width: 1024
    });
    expect(result.validation.ok).toBe(true);
    expect(result.summary).toBe("No issues found.");

    const restored = (await ImageDocument.findById(row.id))!;
    expect(restored.width).toBe(1024);
    expect(JSON.parse(restored.document).sketch.activeLayerId).toBe("layer-1");

    // The restore is undoable: v2 holds the state it overwrote.
    const undo = (await ImageDocumentVersion.findByVersion(row.id, 2))!;
    expect(undo.save_type).toBe("restore");
    expect(undo.name).toBe("Before restore to v1");
    expect(undo.width).toBe(512);
  });

  it("reports the findings when the restored document no longer validates", async () => {
    const row = await makeSketch({ document: document("gone") });
    await toolForCapabilityName("create_sketch_version").process(ctx(), {
      image_document_id: row.id
    });

    const result = (await toolForCapabilityName("restore_sketch_version").process(ctx(), {
      image_document_id: row.id,
      version: 1
    })) as {
      ok: boolean;
      validation: { ok: boolean; errors: Array<{ code: string }> };
      summary: string;
    };

    expect(result.ok).toBe(true);
    expect(result.validation.ok).toBe(false);
    expect(result.validation.errors.map((e) => e.code)).toContain(
      "active_layer_missing"
    );
    expect(result.summary).toContain("1 error");
  });

  it("refuses to restore a version the sketch does not have", async () => {
    const row = await makeSketch();
    const result = (await toolForCapabilityName("restore_sketch_version").process(ctx(), {
      image_document_id: row.id,
      version: 7
    })) as { error: string };
    expect(result.error).toContain("no version 7");
    expect(result.error).toContain("list_sketch_versions");
  });

  it("refuses to restore another user's sketch", async () => {
    const row = await makeSketch();
    await toolForCapabilityName("create_sketch_version").process(ctx(), {
      image_document_id: row.id
    });

    const result = (await toolForCapabilityName("restore_sketch_version").process(ctx("other"), {
      image_document_id: row.id,
      version: 1
    })) as { error: string };
    expect(result.error).toContain("was not found");
  });
});
