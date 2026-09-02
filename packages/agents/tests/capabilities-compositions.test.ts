/**
 * The `compositions` capability module — timeline templates without an editor.
 *
 * Two things the marker-plus-file arrangement makes easy to get wrong are what
 * these check: the shipped half is readable with no user and no database, and
 * an untagged JSON asset is not a composition. Saving is checked end to end,
 * because the value that has to survive is the extracted template, not the row.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Asset, TimelineSequence, initTestDb } from "@nodetool-ai/models";
import { instantiateComposition } from "@nodetool-ai/timeline";
import {
  COMPOSITION_CAPABILITIES,
  COMPOSITION_METADATA_KEY,
  loadShippedCompositions,
  module as compositionsModule
} from "../src/capabilities/compositions.js";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import {
  capabilityModuleIssues,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";

const USER = "user-compositions";

function makeContext(): ProcessingContext {
  const store = new Map<string, Uint8Array>();
  return {
    userId: USER,
    createAsset: async (args: {
      name: string;
      contentType: string;
      content: Uint8Array;
    }) => {
      const asset = (await Asset.create({
        user_id: USER,
        name: args.name,
        content_type: args.contentType
      })) as Asset;
      store.set(asset.id, args.content);
      return { id: asset.id };
    },
    resolveAssetBytes: async (uri: string) => {
      const id = uri.replace(/^asset:\/\//, "").replace(/\.[a-z]+$/i, "");
      return { bytes: store.get(id) ?? null, attempts: [] };
    }
  } as unknown as ProcessingContext;
}

const byName = (name: string) => {
  const entry = COMPOSITION_CAPABILITIES.find((e) => e.spec.name === name);
  if (!entry) throw new Error(`no capability ${name}`);
  return entry;
};

const call = (context: ProcessingContext, name: string, params: object) =>
  byName(name).impl(
    createCapabilityRun({ context, gate: UNGATED }),
    params as Record<string, unknown>
  );

/** A saved sequence carrying one group and two clips parented to it. */
async function seedTimeline(): Promise<string> {
  const group = {
    id: "g1",
    trackId: "t1",
    name: "Lower third",
    startMs: 2000,
    durationMs: 3000,
    mediaType: "group",
    sourceType: "imported",
    status: "generated"
  };
  const bar = {
    id: "c-bar",
    trackId: "t1",
    parentId: "g1",
    name: "Bar",
    startMs: 2000,
    durationMs: 3000,
    mediaType: "shape",
    sourceType: "generated",
    status: "generated",
    shapeStyle: { kind: "rect", fill: "#0A84FF", x: 0.1, y: 0.7, width: 0.4, height: 0.15 }
  };
  const name = {
    id: "c-name",
    trackId: "t2",
    parentId: "g1",
    name: "Name",
    startMs: 2300,
    durationMs: 2700,
    mediaType: "text",
    sourceType: "generated",
    status: "generated",
    textStyle: { text: "Name", fontSizePx: 60, color: "#FFFFFF" }
  };
  const seq = (await TimelineSequence.create({
    user_id: USER,
    project_id: "p1",
    name: "Seq",
    fps: 30,
    width: 1920,
    height: 1080,
    duration_ms: 6000,
    document: JSON.stringify({
      tracks: [
        { id: "t1", name: "Plate", type: "overlay", index: 1, visible: true, locked: false },
        { id: "t2", name: "Text", type: "overlay", index: 0, visible: true, locked: false }
      ],
      clips: [group, bar, name],
      markers: []
    })
  })) as TimelineSequence;
  return seq.id;
}

beforeEach(() => {
  initTestDb();
});

describe("compositions capability module", () => {
  it("is registered and drift-clean", async () => {
    const loaded = await loadCapabilityModule("compositions");
    expect(loaded).toBe(compositionsModule);
    expect(capabilityModuleIssues("compositions", loaded)).toEqual([]);
  });

  it("carries the four wire names and the gate's categories", () => {
    expect(COMPOSITION_CAPABILITIES.map((e) => e.spec.name)).toEqual([
      "list_compositions",
      "get_composition",
      "save_composition",
      "delete_composition"
    ]);
    for (const entry of COMPOSITION_CAPABILITIES) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("renders as a Tool, spec for spec", () => {
    for (const entry of COMPOSITION_CAPABILITIES) {
      const tool = toolForCapabilityName(entry.spec.name);
      expect(tool.description).toBe(entry.spec.description);
      expect(tool.inputSchema).toEqual(entry.spec.inputSchema);
    }
  });
});

describe("list_compositions and get_composition", () => {
  it("lists the six shipped templates with their parameters", async () => {
    const result = (await call(makeContext(), "list_compositions", {
      source: "shipped"
    })) as { compositions: { id: string; source: string; params: unknown[] }[] };

    expect(result.compositions.map((c) => c.id).sort()).toEqual([
      "callout",
      "caption-bar",
      "cta-end-card",
      "logo-sting",
      "lower-third",
      "title-card"
    ]);
    for (const row of result.compositions) {
      expect(row.source).toBe("shipped");
      expect(row.params.length).toBeGreaterThan(0);
    }
  });

  it("reads one shipped template in full", async () => {
    const result = (await call(makeContext(), "get_composition", {
      composition_id: "lower-third"
    })) as {
      source: string;
      composition: { children: unknown[]; params: Record<string, unknown> };
    };
    expect(result.source).toBe("shipped");
    expect(result.composition.children.length).toBeGreaterThan(1);
    expect(Object.keys(result.composition.params)).toContain("name");
  });

  it("names the shipped ids when an id resolves to nothing", async () => {
    const result = (await call(makeContext(), "get_composition", {
      composition_id: "no-such-template"
    })) as { error: string };
    expect(result.error).toContain("lower-third");
  });
});

describe("save_composition", () => {
  it("extracts a group into a template and tags the asset", async () => {
    const context = makeContext();
    const timelineId = await seedTimeline();

    const saved = (await call(context, "save_composition", {
      timeline_id: timelineId,
      group_target: "Lower third",
      name: "My lower third",
      description: "House style",
      params: {
        name: { type: "string", default: "Name", path: "/1/textStyle/text" }
      }
    })) as {
      composition_id: string;
      composition: { children: { startMs: number }[]; name: string };
    };

    expect(saved.composition.name).toBe("My lower third");
    // Child times are rebased onto the group start: 2300 - 2000.
    expect(saved.composition.children.map((c) => c.startMs)).toEqual([0, 300]);

    const asset = await Asset.find(USER, saved.composition_id);
    expect(asset?.metadata?.[COMPOSITION_METADATA_KEY]).toMatchObject({
      name: "My lower third",
      param_names: ["name"]
    });

    const listed = (await call(context, "list_compositions", {
      source: "user"
    })) as { compositions: { id: string; source: string }[] };
    expect(listed.compositions).toEqual([
      expect.objectContaining({ id: saved.composition_id, source: "user" })
    ]);
  });

  it("refuses a parameter path that no child has", async () => {
    const context = makeContext();
    const timelineId = await seedTimeline();
    const result = (await call(context, "save_composition", {
      timeline_id: timelineId,
      group_target: "g1",
      name: "Broken",
      params: {
        role: { type: "string", default: "Role", path: "/9/textStyle/text" }
      }
    })) as { error: string };
    expect(result.error).toContain("/9/textStyle/text");

    const listed = (await call(context, "list_compositions", {
      source: "user"
    })) as { compositions: unknown[] };
    expect(listed.compositions).toEqual([]);
  });

  it("refuses a target that is not a group, listing the groups", async () => {
    const context = makeContext();
    const timelineId = await seedTimeline();
    const result = (await call(context, "save_composition", {
      timeline_id: timelineId,
      group_target: "Bar",
      name: "Nope",
      params: {}
    })) as { error: string };
    expect(result.error).toContain("not a group");
  });
});

describe("delete_composition", () => {
  it("removes a saved template and refuses a shipped one", async () => {
    const context = makeContext();
    const timelineId = await seedTimeline();
    const saved = (await call(context, "save_composition", {
      timeline_id: timelineId,
      group_target: "g1",
      name: "Temp",
      params: {}
    })) as { composition_id: string };

    const shipped = (await call(context, "delete_composition", {
      composition_id: "lower-third"
    })) as { error: string };
    expect(shipped.error).toContain("ships");

    const removed = (await call(context, "delete_composition", {
      composition_id: saved.composition_id
    })) as { ok: boolean };
    expect(removed.ok).toBe(true);
    expect(await Asset.find(USER, saved.composition_id)).toBeNull();
  });

  it("does not see an untagged JSON asset as a composition", async () => {
    const context = makeContext();
    const asset = (await Asset.create({
      user_id: USER,
      name: "notes.json",
      content_type: "application/json"
    })) as Asset;

    const result = (await call(context, "delete_composition", {
      composition_id: asset.id
    })) as { error: string };
    expect(result.error).toContain("was not found");

    const listed = (await call(context, "list_compositions", {
      source: "user"
    })) as { compositions: unknown[] };
    expect(listed.compositions).toEqual([]);
  });
});

describe("the shipped templates instantiate", () => {
  it("mints fresh clips for every one of them", () => {
    const shipped = loadShippedCompositions();
    expect(shipped).toHaveLength(6);
    for (const composition of shipped) {
      const clips = instantiateComposition(composition, { startMs: 1000 });
      expect(clips.length).toBe(composition.children.length + 1);
      expect(clips[0].startMs).toBe(1000);
      for (const clip of clips.slice(1)) {
        expect(clip.parentId).toBe(clips[0].id);
      }
    }
  });
});
