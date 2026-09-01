import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ImageDocument,
  ModelObserver,
  Script,
  Storyboard,
  TimelineSequence,
  initTestDb
} from "@nodetool-ai/models";
import type { Shot } from "@nodetool-ai/protocol";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { BUILTIN_TOOL_NAMES } from "../src/tools/builtin-tools.js";

const ctx = (userId = "u1") => ({ userId }) as unknown as ProcessingContext;

type Result = Record<string, unknown>;

async function makeTimeline(): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    user_id: "u1",
    project_id: "default",
    name: "Cut",
    fps: 30,
    width: 1920,
    height: 1080,
    duration_ms: 6000,
    document: JSON.stringify({
      tracks: [{ id: "track_a", name: "Video", type: "video", index: 0 }],
      clips: [
        {
          id: "clip_a",
          trackId: "track_a",
          name: "shot",
          mediaType: "video",
          startMs: 0,
          durationMs: 6000
        }
      ],
      markers: [{ id: "m1", timeMs: 100, label: "start" }]
    })
  });
}

describe("document edit tools", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("registers as built-ins with write permissions", () => {
    const names = BUILTIN_TOOL_NAMES;
    expect(names).toEqual(
      expect.arrayContaining([
        "edit_timeline",
        "edit_sketch",
        "edit_script",
        "edit_storyboard"
      ])
    );
    for (const name of ["edit_timeline", "edit_sketch", "edit_script", "edit_storyboard"]) {
      expect(permissionCategoryFor(name)).toBe("write");
    }
  });

  /**
   * The create half of the same four surfaces. `edit_*` on the belt without
   * `create_*` is worse than neither: the namespace lights up, so
   * `nodetool.<surface>.create()` is documented and reachable, and it throws
   * "not in this toolbelt" — leaving a blank document only obtainable by
   * editing one the user already has.
   */
  it("registers the create half of each surface too", () => {
    const creates = [
      "create_timeline",
      "create_sketch",
      "create_script",
      "create_storyboard"
    ];
    expect(BUILTIN_TOOL_NAMES).toEqual(expect.arrayContaining(creates));
    for (const name of creates) {
      expect(permissionCategoryFor(name)).toBe("write");
    }
  });

  describe("edit_timeline", () => {
    it("applies ops and persists the new document", async () => {
      const sequence = await makeTimeline();
      const result = (await toolForCapabilityName("edit_timeline").process(ctx(), {
        timeline_id: sequence.id,
        ops: [
          { op: "add_track", type: "audio", name: "Music" },
          { op: "split_clip", target: "shot", atMs: 3000 }
        ]
      })) as Result;

      expect(result["failed"]).toBe(0);
      expect(result["applied"]).toBe(2);

      const reloaded = await TimelineSequence.findById(sequence.id);
      const doc = reloaded!.toDocument();
      expect(doc.tracks).toHaveLength(2);
      expect(doc.clips).toHaveLength(2);
      // Markers ride through untouched — no timeline op edits them.
      expect(doc.markers).toHaveLength(1);
      expect(reloaded!.updated_at).not.toBe(sequence.updated_at);
    });

    it("records a failing op and still applies the rest", async () => {
      const sequence = await makeTimeline();
      const result = (await toolForCapabilityName("edit_timeline").process(ctx(), {
        timeline_id: sequence.id,
        ops: [
          { op: "delete_clip", target: "nope" },
          { op: "add_track", type: "audio" }
        ]
      })) as Result;

      expect(result["failed"]).toBe(1);
      expect(result["applied"]).toBe(1);
      const doc = (await TimelineSequence.findById(sequence.id))!.toDocument();
      expect(doc.tracks).toHaveLength(2);
    });

    it("refuses the browser-only and generation ops", async () => {
      const sequence = await makeTimeline();
      const result = (await toolForCapabilityName("edit_timeline").process(ctx(), {
        timeline_id: sequence.id,
        ops: [{ op: "generate_clip", prompt: "a fox" }]
      })) as Result;
      expect(result["failed"]).toBe(1);
    });

    it("reads a sequence owned by someone else as missing", async () => {
      const sequence = await makeTimeline();
      const result = (await toolForCapabilityName("edit_timeline").process(ctx("other"), {
        timeline_id: sequence.id,
        ops: [{ op: "add_track", type: "audio" }]
      })) as Result;
      expect(String(result["error"])).toMatch(/not found/i);
    });
  });

  describe("edit_sketch", () => {
    it("adds, styles and reorders layers without touching bitmaps", async () => {
      const sketch = await ImageDocument.create<ImageDocument>({
        user_id: "u1",
        project_id: "default",
        name: "Sketch"
      });
      const before = sketch.toDocumentData().sketch.layers[0];

      const result = (await toolForCapabilityName("edit_sketch").process(ctx(), {
        image_document_id: sketch.id,
        ops: [
          { op: "add_layer", name: "Shadow" },
          { op: "set_layer_props", target: "Shadow", opacity: 0.4, blendMode: "multiply" },
          { op: "reorder_layer", target: "Shadow", index: 0 }
        ]
      })) as Result;

      expect(result["failed"]).toBe(0);
      const data = (await ImageDocument.findById(sketch.id))!.toDocumentData();
      expect(data.sketch.layers.map((l) => l.name)).toEqual(["Shadow", before.name]);
      const shadow = data.sketch.layers[0] as Record<string, unknown>;
      expect(shadow["opacity"]).toBe(0.4);
      expect(shadow["blendMode"]).toBe("multiply");
      // The pre-existing layer's bitmap field is untouched.
      expect(data.sketch.layers[1]).toEqual(before);
    });

    it("rejects a blend mode no compositor ships and keeps the rest", async () => {
      const sketch = await ImageDocument.create<ImageDocument>({
        user_id: "u1",
        project_id: "default",
        name: "Sketch"
      });
      const result = (await toolForCapabilityName("edit_sketch").process(ctx(), {
        image_document_id: sketch.id,
        ops: [
          { op: "add_layer", name: "Glow" },
          { op: "set_layer_props", target: "Glow", blendMode: "warp" }
        ]
      })) as Result;
      expect(result["failed"]).toBe(1);
      const data = (await ImageDocument.findById(sketch.id))!.toDocumentData();
      expect(data.sketch.layers.map((l) => l.name)).toContain("Glow");
    });

    it("refuses to remove the last layer", async () => {
      const sketch = await ImageDocument.create<ImageDocument>({
        user_id: "u1",
        project_id: "default",
        name: "Sketch"
      });
      const result = (await toolForCapabilityName("edit_sketch").process(ctx(), {
        image_document_id: sketch.id,
        ops: [{ op: "remove_layer", target: "active" }]
      })) as Result;
      expect(result["failed"]).toBe(1);
    });
  });

  describe("edit_script", () => {
    const makeScript = async () =>
      Script.create<Script>({
        user_id: "u1",
        project_id: "default",
        name: "Script",
        document: JSON.stringify({ cast: [], sections: [] })
      });

    it("adds cast and lines, and rewriting a line keeps its takes", async () => {
      const script = await makeScript();
      const added = (await toolForCapabilityName("edit_script").process(ctx(), {
        script_id: script.id,
        ops: [
          { op: "add_speaker", name: "Narrator" },
          { op: "add_line", text: "Once upon a time.", speaker: "Narrator" }
        ]
      })) as Result;
      expect(added["failed"]).toBe(0);

      // Give the line a take, the way voicing would.
      const withTake = (await Script.findById(script.id))!;
      const doc = withTake.toDocument();
      doc.sections[0].lines[0].takes = [
        {
          id: "take_1",
          assetId: "a1",
          durationMs: 1000,
          words: [],
          textSnapshot: "Once upon a time.",
          voiceSnapshot: null,
          createdAt: new Date().toISOString()
        }
      ];
      await Script.updateFieldsIfUnchanged(script.id, withTake.updated_at, {
        document: JSON.stringify(doc)
      });

      const rewritten = (await toolForCapabilityName("edit_script").process(ctx(), {
        script_id: script.id,
        ops: [{ op: "set_line_text", target: "0", text: "Once, at the end." }]
      })) as Result;
      expect(rewritten["failed"]).toBe(0);

      const after = (await Script.findById(script.id))!.toDocument();
      const line = after.sections[0].lines[0];
      expect(line.text).toBe("Once, at the end.");
      // Stale, not gone: the take still carries the text it was voiced from.
      expect(line.takes).toHaveLength(1);
      expect(line.takes[0].textSnapshot).toBe("Once upon a time.");
    });

    it("refuses a half-specified voice", async () => {
      const script = await makeScript();
      const result = (await toolForCapabilityName("edit_script").process(ctx(), {
        script_id: script.id,
        ops: [{ op: "add_speaker", name: "Narrator", provider: "openai" }]
      })) as Result;
      expect(result["failed"]).toBe(1);
    });
  });

  describe("edit_storyboard", () => {
    const shot = (id: string, index: number): Shot => ({
      type: "shot",
      id,
      index,
      action: `action ${index}`,
      status: "planned"
    });

    const makeBoard = async () =>
      Storyboard.create<Storyboard>({
        user_id: "u1",
        project_id: "default",
        name: "Board",
        document: JSON.stringify({
          screenplay: null,
          shots: [shot("s1", 0), shot("s2", 1)],
          brief: "",
          style: "",
          entityIds: [],
          aspectRatio: "16:9",
          directorModel: null,
          imageModel: null,
          videoModel: null
        })
      });

    it("adds and reorders shots, renumbering the index", async () => {
      const board = await makeBoard();
      const result = (await toolForCapabilityName("edit_storyboard").process(ctx(), {
        storyboard_id: board.id,
        ops: [
          { op: "add_shot", action: "Wide of the lighthouse", duration_seconds: 4 },
          { op: "reorder_shot", target: "s2", index: 0 },
          { op: "set_board", brief: "a short film", style: "moody neon" }
        ]
      })) as Result;

      expect(result["failed"]).toBe(0);
      const doc = (await Storyboard.findById(board.id))!.toDocument();
      expect(doc.shots.map((s) => s.id)[0]).toBe("s2");
      expect(doc.shots.map((s) => s.index)).toEqual([0, 1, 2]);
      expect(doc.brief).toBe("a short film");
    });

    it("names an unknown shot instead of guessing", async () => {
      const board = await makeBoard();
      const result = (await toolForCapabilityName("edit_storyboard").process(ctx(), {
        storyboard_id: board.id,
        ops: [{ op: "update_shot", target: "nope", action: "x" }]
      })) as Result;
      expect(result["failed"]).toBe(1);
      expect(
        (result["ops"] as { error?: string }[])[0].error
      ).toMatch(/No shot matches/);
    });
  });
});
