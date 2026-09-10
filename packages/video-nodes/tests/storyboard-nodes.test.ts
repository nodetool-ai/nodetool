/**
 * Behaviour tests for the `nodetool.storyboard.*` nodes (design §4.2).
 *
 * The context is runtime's in-memory `createFakeContext` with the document
 * model interfaces wired to maps, so the nodes exercise the real
 * `ProcessingContext` forwarders. `runGeneration` is replaced by a recorder:
 * every assertion about spend is "how many generations did this run ask for",
 * which is the only question the write contract and the skip gates are about.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeContext,
  type BaseProvider,
  type ProcessingContext,
  type ProcessingContextModelInterfaces
} from "@nodetool-ai/runtime";
import {
  currentRenderInputs,
  stampRenderInputs,
  type Entity,
  type Screenplay,
  type Shot
} from "@nodetool-ai/protocol";
import type {
  ScriptSection,
  Speaker
} from "@nodetool-ai/protocol/api-schemas/scripts.js";
import {
  boardRenderContext,
  type StoryboardDocument
} from "@nodetool-ai/storyboard";
import {
  makeClip,
  makeSequence,
  makeTrack,
  type TimelineClip,
  type TimelineSequence
} from "@nodetool-ai/timeline";

import {
  AssembleTimelineNode,
  LoadStoryboardNode,
  RecastStoryboardNode,
  RenderClipsNode,
  RenderStillsNode,
  StoryboardShotsNode
} from "../src/nodes/storyboard.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

interface BoardRow {
  id: string;
  projectId: string;
  name: string;
  document: StoryboardDocument;
  timelineId?: string;
  updatedAt: string;
}

interface ScriptRow {
  id: string;
  projectId: string;
  name: string;
  document: { cast: Speaker[]; sections: ScriptSection[] };
  updatedAt: string;
}

const entity = (
  id: string,
  kind: Entity["kind"],
  name: string,
  descriptor: string
): Entity => ({ type: "entity", id, kind, name, descriptor });

const HERO = entity("ent-hero", "character", "Nova", "a courier in a red coat");
const RIVAL = entity("ent-rival", "character", "Kai", "a courier in a blue coat");

const shot = (id: string, index: number, over: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id,
  index,
  slug: `sh-${index + 1}`,
  action: `Nova walks the pier, shot ${index + 1}`,
  status: "planned",
  ...over
});

const renderedClip = (assetId: string) => ({
  type: "video" as const,
  asset_id: assetId,
  uri: `asset://${assetId}`,
  duration: 3
});

function mp4WithDuration(durationMs: number): Uint8Array {
  const box = (type: string, payload: Uint8Array): Uint8Array => {
    const out = new Uint8Array(8 + payload.length);
    new DataView(out.buffer).setUint32(0, out.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(payload, 8);
    return out;
  };
  const header = new Uint8Array(100);
  const view = new DataView(header.buffer);
  view.setUint32(12, 1000);
  view.setUint32(16, durationMs);
  return box("moov", box("mvhd", header));
}

const boardDocument = (over: Partial<StoryboardDocument> = {}): StoryboardDocument => ({
  screenplay: null,
  shots: [shot("shot-1", 0), shot("shot-2", 1)],
  brief: "A courier at dusk",
  style: "noir",
  entityIds: [HERO.id],
  aspectRatio: "16:9",
  setupStage: "done",
  genre: "",
  directorModel: null,
  imageModel: { type: "image_model", provider: "fal_ai", id: "flux" },
  videoModel: {
    type: "video_model",
    provider: "fal_ai",
    id: "kling",
    supported_tasks: ["image_to_video", "text_to_video", "reference_to_video"]
  },
  ...over
});

/** A keyframe the board would render exactly as it already did. */
const freshKeyframe = (
  doc: StoryboardDocument,
  target: Shot,
  entities: Entity[],
  assetId: string
) => ({
  type: "image" as const,
  asset_id: assetId,
  uri: `asset://${assetId}`,
  render_inputs: stampRenderInputs(
    currentRenderInputs(target, boardRenderContext(doc, entities), "keyframe")
  )
});

// ── Harness ─────────────────────────────────────────────────────────────────

interface Harness {
  context: ProcessingContext;
  boards: Map<string, BoardRow>;
  sequences: Map<string, TimelineSequence>;
  scripts: Map<string, ScriptRow>;
  entities: Map<string, Entity>;
  generations: Array<{ capability: string; model: string }>;
  generationRequests: Array<{ capability: string; params: Record<string, unknown> }>;
  videoModels: Map<string, { id: string; name: string; provider: string; supportedTasks: string[] }>;
  getStoryboard: ReturnType<typeof vi.fn>;
  /**
   * Wire the board listing a `reuse_existing` recast falls back to, windowed
   * the way the real adapter is: `Storyboard.listByProject` answers with the
   * 50 most recently updated rows.
   */
  withBoardListing(): void;
  /** Wire the scoped lookup the server and the CLI install beside it. */
  withRecastLookup(): void;
  cleanup(): void;
}

/** The 50 most recently updated rows, as `Storyboard.listByProject` answers. */
const listWindow = (boards: BoardRow[]): BoardRow[] =>
  [...boards]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 50);

function harness(): Harness {
  const fake = createFakeContext();
  const context = fake.context;
  const boards = new Map<string, BoardRow>();
  const sequences = new Map<string, TimelineSequence>();
  const scripts = new Map<string, ScriptRow>();
  const entities = new Map<string, Entity>([
    [HERO.id, HERO],
    [RIVAL.id, RIVAL]
  ]);
  const generations: Array<{ capability: string; model: string }> = [];
  const generationRequests: Array<{ capability: string; params: Record<string, unknown> }> = [];
  const videoModels = new Map([
    [
      "kling",
      {
        id: "kling",
        name: "Kling",
        provider: "fal_ai",
        supportedTasks: ["image_to_video", "text_to_video", "reference_to_video"]
      }
    ],
    [
      "text-only",
      {
        id: "text-only",
        name: "Text only",
        provider: "fal_ai",
        supportedTasks: ["text_to_video"]
      }
    ]
  ]);
  let created = 0;
  const stamp = (): string => new Date(Date.now() + ++created).toISOString();

  const getStoryboard = vi.fn(
    async ({ id }: { id: string }) => boards.get(id) ?? null
  );

  const interfaces: ProcessingContextModelInterfaces = {
    getStoryboard,
    createStoryboard: async ({ name, projectId, document }) => {
      const id = `board-${++created}`;
      const row: BoardRow = {
        id,
        projectId: projectId ?? "default",
        name: name ?? "",
        document: document as StoryboardDocument,
        updatedAt: stamp()
      };
      boards.set(id, row);
      return row;
    },
    updateStoryboard: async ({ id, document, timelineId }) => {
      const row = boards.get(id);
      if (!row) return null;
      if (document !== undefined) row.document = document as StoryboardDocument;
      if (timelineId !== undefined) row.timelineId = timelineId ?? undefined;
      row.updatedAt = stamp();
      return row;
    },
    getEntity: async ({ id }) => entities.get(id) ?? null,
    getScript: async ({ id }) => scripts.get(id) ?? null,
    getTimelineSequence: async ({ id }) => sequences.get(id) ?? null,
    createTimelineSequence: async ({ sequence }) => {
      const seq = sequence as TimelineSequence;
      sequences.set(seq.id, seq);
      return seq;
    },
    updateTimelineSequence: async ({ id, sequence }) => {
      sequences.set(id, sequence as TimelineSequence);
      return { id };
    }
  };
  context.setModelInterfaces(interfaces);
  // Generation is recorded by runGeneration, so discovery is the only provider method used here.
  vi.spyOn(context, "getProvider").mockImplementation(async () =>
    ({
      getAvailableVideoModels: async () => [...videoModels.values()]
    }) as unknown as BaseProvider
  );

  const listing: Pick<ProcessingContextModelInterfaces, "listStoryboards"> = {
    listStoryboards: async ({ projectId }) =>
      listWindow(
        [...boards.values()].filter(
          (board) => !projectId || board.projectId === projectId
        )
      )
  };

  context.runGeneration = vi.fn(async (request) => {
    generations.push({
      capability: String(request.capability),
      model: String(request.model)
    });
    generationRequests.push({
      capability: String(request.capability),
      params: request.params
    });
    const assetId = `asset-${generations.length}`;
    return {
      id: request.id ?? assetId,
      output: new Uint8Array([1, 2, 3]),
      assets: [
        { type: "asset" as const, uri: `asset://${assetId}`, asset_id: assetId }
      ],
      receipt: null,
      duration_ms: 1
    };
  });

  return {
    context,
    boards,
    sequences,
    scripts,
    entities,
    generations,
    generationRequests,
    videoModels,
    getStoryboard,
    withBoardListing: () => {
      context.setModelInterfaces({ ...interfaces, ...listing });
    },
    withRecastLookup: () => {
      context.setModelInterfaces({
        ...interfaces,
        ...listing,
        findRecastStoryboard: async ({ projectId, templateId, recastKey }) =>
          [...boards.values()].find(
            (board) =>
              (!projectId || board.projectId === projectId) &&
              board.document.templateId === templateId &&
              board.document.recastKey === recastKey
          ) ?? null
      });
    },
    cleanup: fake.cleanup
  };
}

const seedBoard = (
  h: Harness,
  id: string,
  document: StoryboardDocument,
  over: Partial<BoardRow> = {}
): BoardRow => {
  const row: BoardRow = {
    id,
    projectId: "proj-1",
    name: "Courier",
    document,
    updatedAt: new Date().toISOString(),
    ...over
  };
  h.boards.set(id, row);
  return row;
};

const writable = (id: string) =>
  ({ type: "storyboard", id, writable: true }) as const;
const picked = (id: string) => ({ type: "storyboard", id }) as const;

let h: Harness;

beforeEach(() => {
  h = harness();
});

// ── LoadStoryboard / StoryboardShots ────────────────────────────────────────

describe("LoadStoryboardNode", () => {
  it("reads a board's shots, cast and settings without claiming write access", async () => {
    seedBoard(h, "tpl", boardDocument());
    const node = new LoadStoryboardNode();
    node.assign({ storyboard: picked("tpl") });

    const result = await node.process(h.context);

    expect(result.shot_count).toBe(2);
    expect(result.shots.map((s) => s.id)).toEqual(["shot-1", "shot-2"]);
    expect(result.entities.map((e) => e.name)).toEqual(["Nova"]);
    expect(result.style).toBe("noir");
    expect(result.aspect_ratio).toBe("16:9");
    expect(result.name).toBe("Courier");
    expect(result.storyboard).toEqual({ type: "storyboard", id: "tpl" });
    expect(result.storyboard).not.toHaveProperty("writable");
  });
});

describe("StoryboardShotsNode", () => {
  it("streams one message per shot and the whole list at the end", async () => {
    const doc = boardDocument();
    doc.shots[0].keyframe = {
      type: "image",
      asset_id: "still-1",
      uri: "asset://still-1"
    };
    doc.shots[1].clip = renderedClip("clip-2");
    seedBoard(h, "tpl", doc);
    const node = new StoryboardShotsNode();
    node.assign({ storyboard: picked("tpl") });

    const chunks: Array<Record<string, unknown>> = [];
    for await (const chunk of node.genProcess(h.context)) {
      chunks.push(chunk as unknown as Record<string, unknown>);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({ index: 0, slug: "sh-1" });
    expect(chunks[0].keyframe).toMatchObject({
      type: "image",
      asset_id: "still-1"
    });
    expect(chunks[1].clip).toMatchObject({ type: "video", asset_id: "clip-2" });
    expect((chunks[2].output as Shot[]).map((s) => s.id)).toEqual([
      "shot-1",
      "shot-2"
    ]);
  });
});

// ── RecastStoryboard ────────────────────────────────────────────────────────

describe("RecastStoryboardNode", () => {
  it("re-derives the prior copy instead of making a second row", async () => {
    h.withBoardListing();
    seedBoard(h, "tpl", boardDocument());
    const node = new RecastStoryboardNode();
    node.assign({ storyboard: picked("tpl"), cast: [RIVAL] });

    const first = await node.process(h.context);
    expect(h.boards.size).toBe(2);
    expect(first.storyboard.writable).toBe(true);

    const second = await node.process(h.context);

    expect(second.storyboard.id).toBe(first.storyboard.id);
    expect(h.boards.size).toBe(2);
    const copy = h.boards.get(String(first.storyboard.id));
    expect(copy?.document.templateId).toBe("tpl");
    // The rename reached the shots, so the copy is about Kai, not Nova.
    expect(copy?.document.shots[0].action).toContain("Kai");
  });

  it("finds the copy it made even after the board listing has moved on", async () => {
    h.withRecastLookup();
    seedBoard(h, "tpl", boardDocument());
    const node = new RecastStoryboardNode();
    node.assign({ storyboard: picked("tpl"), cast: [RIVAL] });

    const first = await node.process(h.context);
    // A catalog batch: sixty boards updated after the copy, so it falls out of
    // the 50-row window the listing answers with.
    for (let i = 0; i < 60; i += 1) {
      seedBoard(h, `sku-${i}`, boardDocument(), {
        updatedAt: new Date(Date.now() + 60_000 + i).toISOString()
      });
    }
    const before = h.boards.size;

    const second = await node.process(h.context);

    expect(second.storyboard.id).toBe(first.storyboard.id);
    expect(h.boards.size).toBe(before);
  });

  it("makes a second copy when reuse is off", async () => {
    h.withBoardListing();
    seedBoard(h, "tpl", boardDocument());
    const node = new RecastStoryboardNode();
    node.assign({
      storyboard: picked("tpl"),
      cast: [RIVAL],
      reuse_existing: false
    });

    const first = await node.process(h.context);
    const second = await node.process(h.context);

    expect(second.storyboard.id).not.toBe(first.storyboard.id);
    expect(h.boards.size).toBe(3);
  });

  it("refuses to reuse when the host cannot look up prior copies", async () => {
    seedBoard(h, "tpl", boardDocument());
    const node = new RecastStoryboardNode();
    node.assign({ storyboard: picked("tpl"), cast: [RIVAL] });

    await expect(node.process(h.context)).rejects.toThrow(
      /cannot look up the copy a previous run made/
    );
    expect(h.boards.size).toBe(1);
  });
});

// ── Render gates ────────────────────────────────────────────────────────────

describe("RenderStillsNode", () => {
  it("skips a shot whose still the board would render the same way", async () => {
    const doc = boardDocument();
    doc.shots[0].keyframe = freshKeyframe(doc, doc.shots[0], [HERO], "still-1");
    seedBoard(h, "tpl", doc);
    const node = new RenderStillsNode();
    node.assign({ storyboard: writable("tpl") });

    const result = await node.process(h.context);

    expect(result.skipped).toEqual(["shot-1"]);
    expect(result.rendered).toEqual(["shot-2"]);
    expect(result.failed).toEqual([]);
    expect(h.generations).toHaveLength(1);
    expect(h.generations[0]).toMatchObject({
      capability: "text_to_image",
      model: "flux"
    });
    expect(result.keyframes[0]).toMatchObject({ type: "image" });
    expect(result.storyboard.writable).toBe(true);
    // The render landed on the board, not just in the outputs.
    expect(h.boards.get("tpl")?.document.shots[1].keyframe?.asset_id).toBe(
      "asset-1"
    );
  });

  it("renders a shot that has no still at all, stale gate or not", async () => {
    seedBoard(h, "tpl", boardDocument());
    const node = new RenderStillsNode();
    node.assign({ storyboard: writable("tpl") });

    const result = await node.process(h.context);

    expect(result.rendered).toEqual(["shot-1", "shot-2"]);
    expect(h.generations).toHaveLength(2);
  });

  it("renders at most max_shots and reports the rest as skipped", async () => {
    seedBoard(h, "tpl", boardDocument());
    const node = new RenderStillsNode();
    node.assign({ storyboard: writable("tpl"), max_shots: 1 });

    const result = await node.process(h.context);

    expect(result.rendered).toEqual(["shot-1"]);
    expect(result.skipped).toEqual(["shot-2"]);
    expect(h.generations).toHaveLength(1);
  });

  it("names find_model when neither the board nor the node sets one", async () => {
    seedBoard(h, "tpl", boardDocument({ imageModel: null }));
    const node = new RenderStillsNode();
    node.assign({ storyboard: writable("tpl") });

    await expect(node.process(h.context)).rejects.toThrow(/find_model/);
    expect(h.generations).toHaveLength(0);
  });
});

describe("RenderClipsNode", () => {
  it("dispatches all three mixed modes through their matching capabilities", async () => {
    h.entities.set("ent-hero", {
      ...HERO,
      reference_images: [{ type: "image", asset_id: null, uri: "data:image/png;base64,AQID" }]
    });
    const doc = boardDocument({
      videoModel: { type: "video_model", provider: "fal_ai", id: "kling" },
      shots: [
        shot("shot-1", 0, {
          keyframe: { type: "image", asset_id: null, uri: "data:image/png;base64,AQID" }
        }),
        shot("shot-2", 1, { render_mode: "direct" }),
        shot("shot-3", 2, { render_mode: "reference", entity_ids: ["ent-hero"] })
      ]
    });
    seedBoard(h, "tpl", doc);
    const node = new RenderClipsNode();
    node.assign({ storyboard: writable("tpl") });
    const result = await node.process(h.context);
    expect(result.rendered).toEqual(["shot-1", "shot-2", "shot-3"]);
    expect(h.generationRequests.map((request) => request.capability)).toEqual([
      "image_to_video",
      "text_to_video",
      "reference_to_video"
    ]);
    expect(h.generationRequests[0].params.images).toBeDefined();
    expect(h.generationRequests[2].params.reference_images).toBeDefined();
  });

  it("does not trust saved all-task metadata over incompatible discovery", async () => {
    const doc = boardDocument({
      videoModel: {
        type: "video_model",
        provider: "fal_ai",
        id: "text-only",
        supported_tasks: ["image_to_video", "text_to_video", "reference_to_video"]
      },
      shots: [
        shot("shot-1", 0, { render_mode: "direct" }),
        shot("shot-2", 1, { render_mode: "reference" })
      ]
    });
    seedBoard(h, "tpl", doc);
    const node = new RenderClipsNode();
    node.assign({ storyboard: writable("tpl") });
    await expect(node.process(h.context)).rejects.toThrow(/does not support every/);
    expect(h.generationRequests).toHaveLength(0);
  });

  it("uses discovered metadata when the board has no saved task list", async () => {
    const doc = boardDocument({
      videoModel: { type: "video_model", provider: "fal_ai", id: "kling" },
      shots: [
        shot("shot-1", 0, { render_mode: "direct" }),
        shot("shot-2", 1, { render_mode: "reference" })
      ]
    });
    seedBoard(h, "tpl", doc);
    const node = new RenderClipsNode();
    node.assign({ storyboard: writable("tpl") });
    const result = await node.process(h.context);
    expect(result.rendered).toEqual(["shot-1", "shot-2"]);
    expect(h.generations).toHaveLength(2);
  });

  it("refuses mixed rendering when provider discovery fails", async () => {
    seedBoard(h, "tpl", boardDocument({
      shots: [
        shot("shot-1", 0, { render_mode: "direct" }),
        shot("shot-2", 1, { render_mode: "reference" })
      ]
    }));
    vi.mocked(h.context.getProvider).mockRejectedValue(new Error("Discovery unavailable"));
    const node = new RenderClipsNode();
    node.assign({ storyboard: writable("tpl") });
    await expect(node.process(h.context)).rejects.toThrow(/Could not verify/);
    expect(h.generations).toHaveLength(0);
  });

  it("preserves single-mode generation with a legacy provider without discovery", async () => {
    seedBoard(h, "tpl", boardDocument({
      videoModel: { type: "video_model", provider: "fal_ai", id: "legacy" },
      shots: [shot("shot-1", 0, { render_mode: "direct" })]
    }));
    vi.mocked(h.context.getProvider).mockRejectedValue(new Error("Discovery unavailable"));
    const node = new RenderClipsNode();
    node.assign({ storyboard: writable("tpl") });
    expect((await node.process(h.context)).rendered).toEqual(["shot-1"]);
    expect(h.generations).toEqual([{ capability: "text_to_video", model: "legacy" }]);
  });

  it("rejects an unknown model on a mixed board before submission", async () => {
    const doc = boardDocument({
      videoModel: { type: "video_model", provider: "fal_ai", id: "missing" },
      shots: [
        shot("shot-1", 0, { render_mode: "direct" }),
        shot("shot-2", 1, { render_mode: "reference" })
      ]
    });
    seedBoard(h, "tpl", doc);
    const node = new RenderClipsNode();
    node.assign({ storyboard: writable("tpl") });
    await expect(node.process(h.context)).rejects.toThrow(/Could not verify/);
    expect(h.generations).toHaveLength(0);
  });

  it("rejects a selected model that cannot serve every shot mode before spending", async () => {
    const doc = boardDocument({
      videoModel: {
        type: "video_model",
        provider: "fal_ai",
        id: "text-only",
        supported_tasks: ["text_to_video"]
      },
      shots: [
        shot("shot-1", 0, {
          render_mode: "keyframe",
          keyframe: {
            type: "image",
            asset_id: "still",
            uri: "asset://still"
          }
        }),
        shot("shot-2", 1, { render_mode: "direct" }),
        shot("shot-3", 2, { render_mode: "reference" })
      ]
    });
    seedBoard(h, "tpl", doc);
    const node = new RenderClipsNode();
    node.assign({ storyboard: writable("tpl") });

    await expect(node.process(h.context)).rejects.toThrow(
      /does not support every shot mode/
    );
    expect(h.generations).toHaveLength(0);
  });
  it("skips a keyframe-mode shot with no selected still", async () => {
    const doc = boardDocument({
      videoModel: {
        type: "video_model",
        provider: "fal_ai",
        id: "kling",
        supported_tasks: ["image_to_video", "text_to_video", "reference_to_video"]
      },
      shots: [shot("shot-1", 0), shot("shot-2", 1, { render_mode: "direct" })]
    });
    seedBoard(h, "tpl", doc);
    const node = new RenderClipsNode();
    node.assign({ storyboard: writable("tpl") });

    const result = await node.process(h.context);

    expect(result.skipped).toEqual(["shot-1"]);
    expect(result.rendered).toEqual(["shot-2"]);
    expect(h.generations).toHaveLength(1);
    expect(h.generations[0]).toMatchObject({
      capability: "text_to_video",
      model: "kling"
    });
  });

  it("attempts the shot with no still once require_keyframe is off", async () => {
    const doc = boardDocument({ shots: [shot("shot-1", 0)] });
    seedBoard(h, "tpl", doc);
    const node = new RenderClipsNode();
    node.assign({ storyboard: writable("tpl"), require_keyframe: false });

    const result = await node.process(h.context);

    expect(result.skipped).toEqual([]);
    expect(result.rendered).toEqual([]);
    expect(result.failed).toEqual(["shot-1"]);
    // The render path refuses it rather than spending on nothing to animate.
    expect(h.generations).toHaveLength(0);
  });
});

// ── Write contract ──────────────────────────────────────────────────────────

describe("the write contract", () => {
  it("refuses a picked board on its first run, before any spend", async () => {
    seedBoard(h, "tpl", boardDocument());
    const node = new RenderStillsNode();
    node.assign({ storyboard: picked("tpl") });

    await expect(node.process(h.context)).rejects.toThrow(/allow_writes/);
    // Refused before the board was even read: no lookup, no generation.
    expect(h.getStoryboard).not.toHaveBeenCalled();
    expect(h.generations).toHaveLength(0);
  });

  it("refuses a derived board picked from the library just the same", async () => {
    seedBoard(h, "tpl", boardDocument());
    seedBoard(
      h,
      "copy",
      boardDocument({ templateId: "tpl", recastKey: "ent-hero>ent-rival" })
    );
    const node = new RenderStillsNode();
    node.assign({ storyboard: picked("copy") });

    await expect(node.process(h.context)).rejects.toThrow(/allow_writes/);
    expect(h.generations).toHaveLength(0);
  });

  it("admits both once allow_writes is on", async () => {
    seedBoard(h, "tpl", boardDocument());
    seedBoard(h, "copy", boardDocument({ templateId: "tpl" }));

    for (const id of ["tpl", "copy"]) {
      const node = new RenderStillsNode();
      node.assign({ storyboard: picked(id), allow_writes: true });
      const result = await node.process(h.context);
      expect(result.rendered).toEqual(["shot-1", "shot-2"]);
    }
    expect(h.generations).toHaveLength(4);
  });

  it("refuses a picked board on RenderClips and AssembleTimeline too", async () => {
    seedBoard(h, "tpl", boardDocument());
    const clips = new RenderClipsNode();
    clips.assign({ storyboard: picked("tpl") });
    const assemble = new AssembleTimelineNode();
    assemble.assign({ storyboard: picked("tpl") });

    await expect(clips.process(h.context)).rejects.toThrow(/allow_writes/);
    await expect(assemble.process(h.context)).rejects.toThrow(/allow_writes/);
    expect(h.generations).toHaveLength(0);
  });

  it("hands a writable ref to whatever comes next", async () => {
    h.withBoardListing();
    seedBoard(h, "tpl", boardDocument());
    const recast = new RecastStoryboardNode();
    recast.assign({ storyboard: picked("tpl"), cast: [RIVAL] });

    const copy = await recast.process(h.context);
    const stills = new RenderStillsNode();
    stills.assign({ storyboard: copy.storyboard });
    const rendered = await stills.process(h.context);

    expect(copy.storyboard.writable).toBe(true);
    expect(rendered.storyboard).toEqual({
      type: "storyboard",
      id: copy.storyboard.id,
      writable: true
    });
  });
});

// ── AssembleTimeline ────────────────────────────────────────────────────────

/** A template cut: one shot clip the board owns, one title clip it does not. */
function templateSequence(boardId: string): TimelineSequence {
  const shotsTrack = makeTrack({ type: "video", name: "Shots", index: 0 });
  const titleTrack = makeTrack({ type: "video", name: "Titles", index: 1 });
  const seq = makeSequence({
    projectId: "proj-1",
    name: "Courier cut",
    tracks: [shotsTrack, titleTrack],
    durationMs: 3000
  });
  seq.clips = [
    makeClip({
      trackId: shotsTrack.id,
      name: "Shot 1",
      startMs: 0,
      durationMs: 3000,
      mediaType: "video",
      sourceType: "generated",
      status: "generated",
      currentAssetId: "tpl-clip-1",
      storyboardBoardId: boardId,
      storyboardShotId: "shot-1"
    }),
    makeClip({
      trackId: titleTrack.id,
      name: "Title card",
      startMs: 0,
      durationMs: 1500,
      mediaType: "image",
      sourceType: "imported",
      status: "generated",
      currentAssetId: "title-card"
    })
  ];
  return seq;
}

const renderedBoard = (over: Partial<StoryboardDocument> = {}) =>
  boardDocument({
    shots: [
      shot("shot-1", 0, { status: "rendered", clip: renderedClip("clip-1") }),
      shot("shot-2", 1, { status: "rendered", clip: renderedClip("clip-2") })
    ],
    ...over
  });

describe("AssembleTimelineNode", () => {
  it("measures persisted clips before laying out the timeline", async () => {
    seedBoard(h, "measured", renderedBoard());
    h.context.resolveAssetBytes = vi.fn(async () => ({
      bytes: mp4WithDuration(5184),
      attempts: []
    }));

    const node = new AssembleTimelineNode();
    node.assign({ storyboard: writable("measured") });
    const result = await node.process(h.context);

    const clips = h.sequences.get(result.timeline.id)?.clips ?? [];
    expect(
      clips
        .filter((clip) => clip.storyboardShotId)
        .map((clip) => clip.durationMs)
    ).toEqual([5184, 5184, 5184, 5184]);
  });

  it("inherits the template's cut for a copy and keeps its foreign clips", async () => {
    const template = seedBoard(h, "tpl", boardDocument());
    const cut = templateSequence(template.id);
    h.sequences.set(cut.id, cut);
    template.timelineId = cut.id;
    seedBoard(h, "copy", renderedBoard({ templateId: "tpl" }));

    const node = new AssembleTimelineNode();
    node.assign({ storyboard: writable("copy") });
    const result = await node.process(h.context);

    // A copy earns its own sequence; the template's is untouched.
    expect(result.timeline.id).not.toBe(cut.id);
    expect(h.sequences.get(cut.id)?.clips).toHaveLength(2);
    const assembled = h.sequences.get(result.timeline.id);
    expect(assembled).toBeDefined();
    // The title card came across; the shot clips were rebuilt from the copy.
    expect(
      assembled?.clips.filter((clip) => clip.currentAssetId === "title-card")
    ).toHaveLength(1);
    expect(
      assembled?.clips
        .filter(
          (clip) =>
            clip.storyboardBoardId === "copy" && clip.mediaType === "video"
        )
        .map((clip) => clip.currentAssetId)
    ).toEqual(["clip-1", "clip-2"]);
    // The template's own shot clip is gone: cloned, then rebuilt from the copy.
    expect(
      assembled?.clips.some((clip) => clip.currentAssetId === "tpl-clip-1")
    ).toBe(false);
    expect(assembled?.tracks.some((track) => track.name === "Titles")).toBe(true);
    expect(h.boards.get("copy")?.timelineId).toBe(result.timeline.id);
  });

  it("writes timeline_id on a board with no template and no cut", async () => {
    seedBoard(h, "solo", renderedBoard());
    const node = new AssembleTimelineNode();
    node.assign({ storyboard: writable("solo"), name: "Solo cut" });

    const result = await node.process(h.context);

    expect(h.boards.get("solo")?.timelineId).toBe(result.timeline.id);
    expect(h.sequences.get(result.timeline.id)?.name).toBe("Solo cut");
    expect(result.skipped_shots).toEqual([]);
  });

  it("cuts against the words when the board links a script", async () => {
    const screenplay: Screenplay = {
      type: "screenplay",
      id: "sp-1",
      title: "Courier",
      shots: [],
      script_id: "script-1"
    };
    const doc = renderedBoard({ screenplay });
    doc.shots[0].script_line_ids = ["line-1"];
    seedBoard(h, "linked", doc);
    h.scripts.set("script-1", {
      id: "script-1",
      projectId: "proj-1",
      name: "Courier VO",
      updatedAt: new Date().toISOString(),
      document: {
        cast: [{ id: "spk-1", name: "Narrator" }],
        sections: [
          {
            id: "sec-1",
            lines: [
              {
                id: "line-1",
                speakerId: "spk-1",
                text: "She runs the last mile.",
                currentTakeId: "take-1",
                takes: [
                  {
                    id: "take-1",
                    assetId: "vo-1",
                    durationMs: 2000,
                    words: [],
                    textSnapshot: "She runs the last mile.",
                    voiceSnapshot: null,
                    createdAt: new Date().toISOString()
                  }
                ]
              }
            ]
          }
        ]
      }
    });

    const node = new AssembleTimelineNode();
    node.assign({ storyboard: writable("linked") });
    const result = await node.process(h.context);

    const assembled = h.sequences.get(result.timeline.id);
    expect(assembled?.tracks.some((track) => track.name === "Voiceover")).toBe(
      true
    );
    expect(
      assembled?.clips.some((clip) => clip.currentAssetId === "vo-1")
    ).toBe(true);
    expect(h.boards.get("linked")?.timelineId).toBe(result.timeline.id);
  });

  it("refuses to assemble a board with no rendered clip", async () => {
    seedBoard(h, "empty", boardDocument());
    const node = new AssembleTimelineNode();
    node.assign({ storyboard: writable("empty") });

    await expect(node.process(h.context)).rejects.toThrow(/nothing to assemble/);
  });
});

// ── The approved cut survives a re-assemble ─────────────────────────────────

/**
 * A cut a director edited: shot 1 starts late, is trimmed to a second, plays
 * from two seconds into its footage and sits half-transparent under a moved
 * transform; shot 2 follows at 4s. The title card above them belongs to no
 * board, as in {@link templateSequence}.
 */
function editedSequence(boardId: string, shotIds: string[]): TimelineSequence {
  const shotsTrack = makeTrack({ type: "video", name: "Shots", index: 0 });
  const titleTrack = makeTrack({ type: "video", name: "Titles", index: 1 });
  const seq = makeSequence({
    projectId: "proj-1",
    name: "Courier cut",
    tracks: [shotsTrack, titleTrack],
    durationMs: 6000
  });
  const edits: Record<string, Partial<TimelineClip>> = {
    "shot-1": {
      startMs: 1500,
      durationMs: 1000,
      inPointMs: 2000,
      outPointMs: 3000,
      opacity: 0.5,
      transform: {
        position: { x: 120, y: -40 },
        scale: { x: 1.4, y: 1.4 },
        rotation: 3,
        anchor: { x: 0.5, y: 0.5 }
      }
    },
    "shot-2": { startMs: 4000, durationMs: 2000 }
  };
  seq.clips = shotIds.map((shotId, index) =>
    makeClip({
      trackId: shotsTrack.id,
      name: `Shot ${index + 1}`,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      currentAssetId: `tpl-${shotId}`,
      storyboardBoardId: boardId,
      storyboardShotId: shotId,
      startMs: index * 3000,
      durationMs: 3000,
      ...(edits[shotId] ?? {})
    })
  );
  seq.clips.push(
    makeClip({
      trackId: titleTrack.id,
      name: "Title card",
      startMs: 0,
      durationMs: 1500,
      mediaType: "image",
      sourceType: "imported",
      status: "generated",
      currentAssetId: "title-card"
    })
  );
  return seq;
}

/** Seed a template with an edited cut and a copy of it, and return the copy. */
function seedEditedTemplate(
  shotIds: string[],
  copyDoc: StoryboardDocument
): TimelineSequence {
  const template = seedBoard(h, "tpl", boardDocument());
  const cut = editedSequence(template.id, shotIds);
  h.sequences.set(cut.id, cut);
  template.timelineId = cut.id;
  seedBoard(h, "copy", copyDoc);
  return cut;
}

const shotClipsOf = (seq: TimelineSequence | undefined, shotId: string) =>
  (seq?.clips ?? []).filter(
    (clip) => clip.storyboardShotId === shotId && clip.mediaType === "video"
  );

describe("AssembleTimelineNode and the approved cut", () => {
  it("keeps each shot clip's placement, trim and transform and swaps only the media", async () => {
    seedEditedTemplate(
      ["shot-1", "shot-2"],
      renderedBoard({ templateId: "tpl" })
    );

    const node = new AssembleTimelineNode();
    node.assign({ storyboard: writable("copy") });
    const result = await node.process(h.context);

    const assembled = h.sequences.get(result.timeline.id);
    const [first] = shotClipsOf(assembled, "shot-1");
    expect(first).toMatchObject({
      startMs: 1500,
      durationMs: 1000,
      inPointMs: 2000,
      outPointMs: 3000,
      opacity: 0.5,
      currentAssetId: "clip-1"
    });
    expect(first?.transform?.position).toEqual({ x: 120, y: -40 });
    expect(shotClipsOf(assembled, "shot-2")[0]).toMatchObject({
      startMs: 4000,
      durationMs: 2000,
      currentAssetId: "clip-2"
    });
    // The template's own footage is gone and its title card came across.
    expect(
      assembled?.clips.some((clip) =>
        String(clip.currentAssetId ?? "").startsWith("tpl-")
      )
    ).toBe(false);
    expect(
      assembled?.clips.filter((clip) => clip.currentAssetId === "title-card")
    ).toHaveLength(1);
    // One shots track, not the template's plus a fresh one.
    expect(
      assembled?.tracks.filter((track) => track.name === "Shots")
    ).toHaveLength(1);
  });

  it("keeps the edit on the copy's own cut when it is assembled again", async () => {
    seedEditedTemplate(
      ["shot-1", "shot-2"],
      renderedBoard({ templateId: "tpl" })
    );

    const node = new AssembleTimelineNode();
    node.assign({ storyboard: writable("copy") });
    const first = await node.process(h.context);
    const second = await node.process(h.context);

    expect(second.timeline.id).toBe(first.timeline.id);
    expect(shotClipsOf(h.sequences.get(second.timeline.id), "shot-1")[0]).toMatchObject({
      startMs: 1500,
      durationMs: 1000,
      inPointMs: 2000
    });
  });

  it("appends a shot the copy added and drops the clip of one it deleted", async () => {
    seedEditedTemplate(
      ["shot-1", "shot-2"],
      boardDocument({
        templateId: "tpl",
        shots: [
          shot("shot-1", 0, { status: "rendered", clip: renderedClip("clip-1") }),
          shot("shot-3", 1, { status: "rendered", clip: renderedClip("clip-3") })
        ]
      })
    );

    const node = new AssembleTimelineNode();
    node.assign({ storyboard: writable("copy") });
    const result = await node.process(h.context);

    const assembled = h.sequences.get(result.timeline.id);
    // Kept, in place.
    expect(shotClipsOf(assembled, "shot-1")[0]).toMatchObject({
      startMs: 1500,
      durationMs: 1000,
      currentAssetId: "clip-1"
    });
    // Deleted from the board, so gone from the cut.
    expect(shotClipsOf(assembled, "shot-2")).toHaveLength(0);
    // Added to the board, so laid down after everything the cut already held.
    const added = shotClipsOf(assembled, "shot-3")[0];
    expect(added?.currentAssetId).toBe("clip-3");
    expect(added?.startMs).toBe(2500);
    expect(added?.durationMs).toBe(3000);
  });

  it("holds the place of a shot that has not been rendered yet", async () => {
    seedEditedTemplate(
      ["shot-1", "shot-2"],
      boardDocument({
        templateId: "tpl",
        shots: [
          shot("shot-1", 0, { status: "rendered", clip: renderedClip("clip-1") }),
          shot("shot-2", 1)
        ]
      })
    );

    const node = new AssembleTimelineNode();
    node.assign({ storyboard: writable("copy") });
    const result = await node.process(h.context);

    const assembled = h.sequences.get(result.timeline.id);
    const held = shotClipsOf(assembled, "shot-2")[0];
    expect(held).toMatchObject({ startMs: 4000, durationMs: 2000 });
    expect(held?.currentAssetId).toBeUndefined();
    expect(result.skipped_shots).toEqual(["shot-2"]);
  });
});
