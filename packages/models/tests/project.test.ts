/**
 * Tests for the Project model and the summary it derives.
 *
 * Covers: ownership on read/update/delete, the document gather across the six
 * tables that carry `project_id`, the per-document status derivations, and the
 * spend rollup — including that an unpriced row is counted rather than summed
 * as zero.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb } from "../src/db.js";
import { Project } from "../src/project.js";
import {
  listProjectDocuments,
  scriptStatus,
  spendCategory,
  storyboardStatus,
  summarizeProject,
  summarizeSpend,
  timelineStatus,
  type SpendRow
} from "../src/project-summary.js";
import { Prediction } from "../src/prediction.js";
import { Script, type ScriptDocument } from "../src/script.js";
import { Storyboard, type StoryboardDocument } from "../src/storyboard.js";
import { TimelineSequence } from "../src/timeline-sequence.js";
import type { Shot } from "@nodetool-ai/protocol";

const shot = (id: string, over: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id,
  index: 0,
  action: "a shot",
  status: "draft",
  ...over
});

const storyboardDoc = (shots: Shot[]): StoryboardDocument => ({
  screenplay: null,
  shots,
  brief: "",
  style: "",
  entityIds: [],
  aspectRatio: "16:9",
  directorModel: null,
  imageModel: null,
  videoModel: null
});

describe("Project model", () => {
  beforeEach(() => initTestDb());

  it("creates with defaults and lists by user", async () => {
    await Project.create<Project>({ user_id: "u1", name: "Aurora", kind: "spot" });
    await Project.create<Project>({ user_id: "u2", name: "Someone else's" });

    const mine = await Project.listByUser("u1");
    expect(mine).toHaveLength(1);
    expect(mine[0].toResponse()).toMatchObject({ name: "Aurora", kind: "spot" });
  });

  it("answers not-found the same for a missing project and another user's", async () => {
    const other = await Project.create<Project>({ user_id: "u2", name: "Theirs" });
    expect(await Project.findOwned("u1", other.id)).toBeNull();
    expect(await Project.findOwned("u1", "no-such-id")).toBeNull();
    expect(await Project.deleteOwned("u1", other.id)).toBe(false);
    expect(await Project.updateOwned("u1", other.id, { name: "Mine now" })).toBeNull();
    expect((await Project.findById(other.id))?.name).toBe("Theirs");
  });

  it("updates name and kind and moves updated_at forward", async () => {
    const project = await Project.create<Project>({
      user_id: "u1",
      name: "Aurora",
      updated_at: "2020-01-01T00:00:00.000Z"
    });
    const updated = await Project.updateOwned("u1", project.id, {
      name: "Aurora Launch Spot",
      kind: "spot"
    });
    expect(updated?.name).toBe("Aurora Launch Spot");
    expect(updated?.kind).toBe("spot");
    expect(updated!.updated_at > "2020-01-01T00:00:00.000Z").toBe(true);
  });

  it("deletes the project and leaves its documents where they are", async () => {
    const project = await Project.create<Project>({ user_id: "u1", name: "Aurora" });
    const board = await Storyboard.create<Storyboard>({
      user_id: "u1",
      project_id: project.id,
      name: "Board"
    });
    expect(await Project.deleteOwned("u1", project.id)).toBe(true);
    expect(await Project.findById(project.id)).toBeNull();
    expect((await Storyboard.findById(board.id))?.project_id).toBe(project.id);
  });
});

describe("project documents", () => {
  beforeEach(() => initTestDb());

  it("gathers every table that carries the project id, newest first", async () => {
    // Saves stamp their own `updated_at`, so the order is creation order —
    // spaced out so the assertion is about the sort, not about clock ties.
    const tick = () => new Promise((resolve) => setTimeout(resolve, 2));
    await Storyboard.create<Storyboard>({
      user_id: "u1",
      project_id: "p1",
      name: "Board"
    });
    await tick();
    await TimelineSequence.create<TimelineSequence>({
      user_id: "u1",
      project_id: "p1",
      name: "Cut"
    });
    await tick();
    await Script.create<Script>({
      user_id: "u1",
      project_id: "p1",
      name: "VO"
    });
    // Another project and another user must not leak in.
    await Script.create<Script>({ user_id: "u1", project_id: "p2", name: "Other" });
    await Script.create<Script>({ user_id: "u2", project_id: "p1", name: "Theirs" });

    const docs = await listProjectDocuments("u1", "p1");
    expect(docs.map((d) => [d.type, d.name])).toEqual([
      ["script", "VO"],
      ["timeline", "Cut"],
      ["storyboard", "Board"]
    ]);
  });
});

describe("document status", () => {
  it("counts a board's shots, stills and clips", () => {
    const status = storyboardStatus(
      storyboardDoc([
        shot("a", { keyframe: { type: "image", uri: "asset://1" }, clip: { type: "video", uri: "asset://2" } }),
        shot("b", { keyframe: { type: "image", uri: "asset://3" } }),
        shot("c")
      ])
    );
    expect(status).toEqual({ kind: "storyboard", shots: 3, stills: 2, clips: 1 });
  });

  it("separates a voiced line from one whose take drifted", () => {
    const voice = { provider: "p", model: "m", voice: "v" };
    const doc: ScriptDocument = {
      cast: [{ id: "s1", name: "Narrator", voice }],
      sections: [
        {
          id: "sec",
          lines: [
            {
              id: "voiced",
              speakerId: "s1",
              text: "hello",
              currentTakeId: "t1",
              takes: [
                {
                  id: "t1",
                  assetId: "a1",
                  durationMs: 1000,
                  words: [],
                  textSnapshot: "hello",
                  voiceSnapshot: voice,
                  createdAt: "2026-01-01T00:00:00.000Z"
                }
              ]
            },
            {
              id: "stale",
              speakerId: "s1",
              text: "rewritten",
              currentTakeId: "t2",
              takes: [
                {
                  id: "t2",
                  assetId: "a2",
                  durationMs: 1000,
                  words: [],
                  textSnapshot: "the old words",
                  voiceSnapshot: voice,
                  createdAt: "2026-01-01T00:00:00.000Z"
                }
              ]
            },
            { id: "never", speakerId: "s1", text: "unvoiced", takes: [] }
          ]
        }
      ]
    };
    expect(scriptStatus(doc)).toEqual({
      kind: "script",
      lines: 3,
      voiced: 1,
      stale: 1
    });
  });

  it("reports a cut's size", () => {
    expect(timelineStatus(9, 30_000)).toEqual({
      kind: "timeline",
      clips: 9,
      durationMs: 30_000
    });
  });
});

describe("spend rollup", () => {
  const row = (over: Partial<SpendRow> = {}): SpendRow => ({
    cost: 1,
    ...over
  });

  it("routes a row by capability, then by node type, then to pipeline", () => {
    expect(spendCategory(row({ metadata: { capability: "text_to_image" } }))).toBe("stills");
    expect(spendCategory(row({ metadata: { capability: "image_to_video" } }))).toBe("clips");
    expect(spendCategory(row({ metadata: { capability: "text_to_speech" } }))).toBe("voice");
    // An unpriced generation records its capability as the billing unit.
    expect(spendCategory(row({ billing_unit: "lip_sync" }))).toBe("clips");
    // A node-reported charge naming no capability is read off the node type.
    expect(spendCategory(row({ node_type: "fal.video.Kling", billing_unit: "seconds" }))).toBe("clips");
    expect(spendCategory(row({ node_type: "fal.image.Flux", billing_unit: "megapixels" }))).toBe("stills");
    expect(spendCategory(row({ node_type: "nodetool.agents.Agent" }))).toBe("pipeline");
  });

  it("counts an unpriced row instead of summing it as zero", () => {
    const spend = summarizeSpend([
      row({ cost: 1.28, metadata: { capability: "text_to_image" } }),
      row({ cost: 2.6, metadata: { capability: "image_to_video" } }),
      row({ cost: null, metadata: { capability: "image_to_video" } }),
      row({ cost: 0.19, metadata: { capability: "text_to_speech" } }),
      row({ cost: 0.05, node_type: "nodetool.agents.Agent" })
    ]);
    expect(spend.totalUsd).toBeCloseTo(4.12, 6);
    expect(spend.unpricedCount).toBe(1);
    expect(spend.byCategory).toEqual([
      { category: "stills", usd: 1.28, unpricedCount: 0 },
      { category: "clips", usd: 2.6, unpricedCount: 1 },
      { category: "voice", usd: 0.19, unpricedCount: 0 },
      { category: "pipeline", usd: 0.05, unpricedCount: 0 }
    ]);
  });
});

describe("summarizeProject", () => {
  beforeEach(() => initTestDb());

  it("attaches each document's status and its share of the ledger", async () => {
    const board = await Storyboard.create<Storyboard>({
      user_id: "u1",
      project_id: "p1",
      name: "Board",
      document: JSON.stringify(
        storyboardDoc([
          shot("a", { keyframe: { type: "image", uri: "asset://1" } }),
          shot("b")
        ])
      )
    });
    await Prediction.create<Prediction>({
      user_id: "u1",
      project_id: "p1",
      document_id: board.id,
      cost: 0.5,
      metadata: { capability: "text_to_image" }
    });
    // A charge on the project that names no document still counts in the total.
    await Prediction.create<Prediction>({
      user_id: "u1",
      project_id: "p1",
      cost: 0.25,
      node_type: "nodetool.agents.Agent"
    });
    // Another project's row must not reach this one.
    await Prediction.create<Prediction>({
      user_id: "u1",
      project_id: "p2",
      cost: 99
    });

    const summary = await summarizeProject("u1", "p1");
    expect(summary.documents).toHaveLength(1);
    expect(summary.documents[0]).toMatchObject({
      type: "storyboard",
      ref: board.id,
      spendUsd: 0.5,
      unpricedCount: 0,
      status: { kind: "storyboard", shots: 2, stills: 1, clips: 0 }
    });
    expect(summary.spend.totalUsd).toBeCloseTo(0.75, 6);
  });
});
