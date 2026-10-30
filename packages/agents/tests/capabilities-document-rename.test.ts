/**
 * Renaming documents through the edit tools.
 *
 * Every editable document an agent works on carries a name, and each edit tool
 * takes a `name` beside its ops: alone it renames, with ops it renames after
 * them. Someone else's document stays out of reach, and a blank name is
 * refused rather than stored.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ImageDocument,
  ModelObserver,
  Script,
  Storyboard,
  TimelineSequence,
  Workflow,
  initTestDb
} from "@nodetool-ai/models";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { parseRename } from "../src/capabilities/rename.js";

const ctx = (userId = "u1") => ({ userId }) as unknown as ProcessingContext;

const run = (userId = "u1") =>
  createCapabilityRun({ context: ctx(userId), gate: UNGATED });

type Result = Record<string, unknown> & { error?: string };

async function makeTimeline(): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    user_id: "u1",
    project_id: "default",
    name: "Trailer cut",
    fps: 30,
    width: 1920,
    height: 1080,
    duration_ms: 0,
    document: JSON.stringify({ tracks: [], clips: [], markers: [] })
  });
}

async function makeSketch(): Promise<ImageDocument> {
  return ImageDocument.create<ImageDocument>({
    user_id: "u1",
    project_id: "default",
    name: "Poster",
    width: 1024,
    height: 768,
    background_color: "#ffffff",
    document: JSON.stringify({
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
    })
  });
}

async function makeBoard(): Promise<Storyboard> {
  return Storyboard.create<Storyboard>({
    user_id: "u1",
    project_id: "default",
    name: "Board",
    document: JSON.stringify({
      screenplay: null,
      shots: [],
      brief: "",
      style: "",
      entityIds: [],
      aspectRatio: "16:9",
      directorModel: null,
      imageModel: null,
      videoModel: null
    })
  });
}

async function makeScript(): Promise<Script> {
  return Script.create<Script>({
    user_id: "u1",
    project_id: "default",
    name: "Script",
    document: JSON.stringify({
      cast: [{ id: "sp1", name: "Narrator" }],
      sections: [{ id: "sec1", title: "Main", lines: [] }]
    })
  });
}

interface Case {
  tool: string;
  idKey: string;
  make: () => Promise<{ id: string; name: string }>;
  read: (id: string) => Promise<{ name: string } | null>;
  op: Record<string, unknown>;
}

const CASES: Case[] = [
  {
    tool: "edit_timeline",
    idKey: "timeline_id",
    make: makeTimeline,
    read: (id) => TimelineSequence.findById(id),
    op: { op: "add_track", type: "audio", name: "Music" }
  },
  {
    tool: "edit_sketch",
    idKey: "image_document_id",
    make: makeSketch,
    read: (id) => ImageDocument.findById(id),
    op: { op: "add_layer", name: "Ink" }
  },
  {
    tool: "edit_storyboard",
    idKey: "storyboard_id",
    make: makeBoard,
    read: (id) => Storyboard.findById(id),
    op: { op: "set_board", brief: "A paper boat in a gutter" }
  },
  {
    tool: "edit_script",
    idKey: "script_id",
    make: makeScript,
    read: (id) => Script.findById(id),
    op: { op: "add_line", text: "Hello", speaker: "Narrator" }
  }
];

describe("renaming documents through their edit tools", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  for (const c of CASES) {
    describe(c.tool, () => {
      it("renames without ops", async () => {
        const row = await c.make();
        const result = (await run().invoke(c.tool, {
          [c.idKey]: row.id,
          name: "  Renamed  "
        })) as Result;

        expect(result.error).toBeUndefined();
        expect(result).toMatchObject({ [c.idKey]: row.id, name: "Renamed" });
        expect(typeof result["updated_at"]).toBe("string");
        expect((await c.read(row.id))?.name).toBe("Renamed");
      });

      it("renames after applying ops in the same call", async () => {
        const row = await c.make();
        const result = (await run().invoke(c.tool, {
          [c.idKey]: row.id,
          name: "Edited and renamed",
          ops: [c.op]
        })) as Result;

        expect(result.error).toBeUndefined();
        expect(result["failed"]).toBe(0);
        expect(result["applied"]).toBe(1);
        expect(result["name"]).toBe("Edited and renamed");
        const stored = await c.read(row.id);
        expect(stored?.name).toBe("Edited and renamed");
        expect((stored as { updated_at?: string }).updated_at).toBe(
          result["updated_at"]
        );
      });

      it("refuses a blank name and leaves the document alone", async () => {
        const row = await c.make();
        const result = (await run().invoke(c.tool, {
          [c.idKey]: row.id,
          name: "   "
        })) as Result;

        expect(result.error).toMatch(/name must be a non-empty string/);
        expect((await c.read(row.id))?.name).toBe(row.name);
      });

      it("does not rename someone else's document", async () => {
        const row = await c.make();
        const result = (await run("intruder").invoke(c.tool, {
          [c.idKey]: row.id,
          name: "Mine now"
        })) as Result;

        expect(result.error).toMatch(/not found/);
        expect((await c.read(row.id))?.name).toBe(row.name);
      });

      it("skips the rename when the ops are refused", async () => {
        const row = await c.make();
        const result = (await run().invoke(c.tool, {
          [c.idKey]: row.id,
          name: "Should not land",
          ops: "not an array"
        })) as Result;

        expect(result.error).toBeDefined();
        expect((await c.read(row.id))?.name).toBe(row.name);
      });

      it("still asks for ops when given neither ops nor a name", async () => {
        const row = await c.make();
        const result = (await run().invoke(c.tool, {
          [c.idKey]: row.id
        })) as Result;

        expect(result.error).toMatch(/ops/);
      });
    });
  }

  it("bumps the storyboard revision a later expected_revision checks", async () => {
    const board = await makeBoard();
    const renamed = (await run().invoke("edit_storyboard", {
      storyboard_id: board.id,
      name: "Act one"
    })) as Result;
    const stored = await Storyboard.findById(board.id);
    expect(renamed["revision"]).toBe(stored?.revision);

    const stale = (await run().invoke("edit_storyboard", {
      storyboard_id: board.id,
      name: "Act two",
      expected_revision: board.revision
    })) as Result;
    expect(stale.error).toMatch(/revision conflict/);
    expect((await Storyboard.findById(board.id))?.name).toBe("Act one");
  });
});

describe("update_workflow names", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  async function makeWorkflow(): Promise<Workflow> {
    return (await Workflow.create({
      user_id: "u1",
      name: "wf",
      description: "",
      tags: [],
      access: "private",
      graph: { nodes: [], edges: [] },
      run_mode: "workflow"
    })) as Workflow;
  }

  it("renames a workflow on its own", async () => {
    const workflow = await makeWorkflow();
    const result = (await run().invoke("update_workflow", {
      workflow_id: workflow.id,
      name: " Daily digest "
    })) as Result;

    expect(result.error).toBeUndefined();
    expect((await Workflow.get<Workflow>(workflow.id))?.name).toBe("Daily digest");
  });

  it("refuses a blank workflow name", async () => {
    const workflow = await makeWorkflow();
    const result = (await run().invoke("update_workflow", {
      workflow_id: workflow.id,
      name: ""
    })) as Result;

    expect(result.error).toMatch(/name must be a non-empty string/);
    expect((await Workflow.get<Workflow>(workflow.id))?.name).toBe("wf");
  });
});

describe("parseRename", () => {
  it("reads absent, trimmed, blank and over-long names", () => {
    expect(parseRename(undefined)).toBeUndefined();
    expect(parseRename(null)).toBeUndefined();
    expect(parseRename("  Cut  ")).toBe("Cut");
    expect(parseRename("")).toEqual({
      error: "name must be a non-empty string."
    });
    expect(parseRename(42)).toEqual({
      error: "name must be a non-empty string."
    });
    expect(parseRename("x".repeat(201))).toMatchObject({
      error: expect.stringContaining("at most 200")
    });
  });
});
