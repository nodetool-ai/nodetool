/**
 * `DBModel.get` resolves a 12-char short id (`resource-id.ts` in protocol) by
 * prefix, and only then: the exact key still wins, an ambiguous prefix is an
 * error, and a key that is not the short form never reaches the prefix query.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { shortResourceId } from "@nodetool-ai/protocol";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Asset } from "../src/asset.js";
import { ImageDocument } from "../src/image-document.js";
import { JsScript } from "../src/js-script.js";
import { Memory } from "../src/memory.js";
import { Project } from "../src/project.js";
import { Script } from "../src/script.js";
import { Skill } from "../src/skill.js";
import { Storyboard } from "../src/storyboard.js";
import { Thread } from "../src/thread.js";
import { TimelineSequence } from "../src/timeline-sequence.js";
import { Workflow } from "../src/workflow.js";

describe("DBModel.get with a short resource id", () => {
  beforeEach(() => {
    initTestDb();
  });
  afterEach(() => ModelObserver.clear());

  it("resolves the 12-char prefix to the one row it names", async () => {
    const asset = await Asset.create<Asset>({
      user_id: "u1",
      name: "hero.png",
      content_type: "image/png"
    });
    const short = shortResourceId(asset.id);
    expect(short).toHaveLength(12);
    const found = await Asset.find("u1", short);
    expect(found?.id).toBe(asset.id);
    expect(await Asset.find("u2", short)).toBeNull();
  });

  it("refuses a prefix that matches more than one row", async () => {
    const shared = "0123456789ab";
    await Asset.create<Asset>({
      id: `${shared}cdef0123456789abcdef`,
      user_id: "u1",
      name: "a.png",
      content_type: "image/png"
    });
    await Asset.create<Asset>({
      id: `${shared}fedcba9876543210fedc`,
      user_id: "u1",
      name: "b.png",
      content_type: "image/png"
    });
    await expect(Asset.get<Asset>(shared)).rejects.toThrow(
      /matches more than one row/
    );
  });

  it("resolves asset prefixes within the caller's user scope", async () => {
    const shared = "abcdef012345";
    const own = await Asset.create<Asset>({
      id: `${shared}00000000000000000001`,
      user_id: "u1",
      name: "own.png",
      content_type: "image/png"
    });
    await Asset.create<Asset>({
      id: `${shared}00000000000000000002`,
      user_id: "u2",
      name: "other.png",
      content_type: "image/png"
    });
    expect((await Asset.find("u1", shared))?.id).toBe(own.id);
  });

  it("does not prefix-match a key that is not the short form", async () => {
    const wf = await Workflow.create<Workflow>({
      id: "abcdef0123456789abcdef0123456789",
      user_id: "u1",
      name: "wf",
      graph: { nodes: [], edges: [] }
    });
    // 11 and 13 chars, and uppercase: none is a short id.
    expect(await Workflow.get<Workflow>(wf.id.slice(0, 11))).toBeNull();
    expect(await Workflow.get<Workflow>(wf.id.slice(0, 13))).toBeNull();
    expect(
      await Workflow.get<Workflow>(wf.id.slice(0, 12).toUpperCase())
    ).toBeNull();
    expect(await Workflow.get<Workflow>("nonexistent-id")).toBeNull();
  });

  it("scopes short-id resolution to the caller's user across owner-scoped find and deleteOwned methods", async () => {
    const shared = "1234567890ab";
    const id1 = `${shared}00000000000000000001`;
    const id2 = `${shared}00000000000000000002`;
    const id3 = `${shared}00000000000000000003`;

    // Thread.find: u1 has 1 row, u2 has 2 rows sharing the same 12-char prefix.
    // u1 must resolve its own row; u3 (with 0 rows) must get null, not an ambiguity error.
    await Thread.create<Thread>({ id: id1, user_id: "u1", title: "u1 thread" });
    await Thread.create<Thread>({ id: id2, user_id: "u2", title: "u2 thread a" });
    await Thread.create<Thread>({ id: id3, user_id: "u2", title: "u2 thread b" });
    expect((await Thread.find("u1", shared))?.id).toBe(id1);
    expect(await Thread.find("u3", shared)).toBeNull();
    await expect(Thread.find("u2", shared)).rejects.toThrow(/matches more than one row/);

    // Memory.find
    await Memory.create<Memory>({ id: id1, user_id: "u1", title: "m1", content: "c" });
    await Memory.create<Memory>({ id: id2, user_id: "u2", title: "m2", content: "c" });
    expect((await Memory.find("u1", shared))?.id).toBe(id1);
    expect(await Memory.find("u3", shared)).toBeNull();

    // Project.findOwned / findOwnedIncludingDeleted
    await Project.create<Project>({ id: id1, user_id: "u1", name: "p1" });
    await Project.create<Project>({ id: id2, user_id: "u2", name: "p2" });
    expect((await Project.findOwned("u1", shared))?.id).toBe(id1);
    expect((await Project.findOwnedIncludingDeleted("u1", shared))?.id).toBe(id1);
    expect(await Project.findOwned("u3", shared)).toBeNull();

    // Owner-scoped deleteOwned methods must resolve within caller's user scope.
    await Workflow.create<Workflow>({ id: id1, user_id: "u1", name: "w1", graph: { nodes: [], edges: [] } });
    await Workflow.create<Workflow>({ id: id2, user_id: "u2", name: "w2", graph: { nodes: [], edges: [] } });
    expect(await Workflow.deleteOwned("u3", shared)).toBe(false);
    expect(await Workflow.deleteOwned("u1", shared)).toBe(true);

    await Skill.create<Skill>({ id: id1, user_id: "u1", name: "s1", content: "x" });
    await Skill.create<Skill>({ id: id2, user_id: "u2", name: "s2", content: "x" });
    expect(await Skill.deleteOwned("u3", shared)).toBe(false);
    expect(await Skill.deleteOwned("u1", shared)).toBe(true);

    await Storyboard.create<Storyboard>({ id: id1, user_id: "u1", name: "sb1" });
    await Storyboard.create<Storyboard>({ id: id2, user_id: "u2", name: "sb2" });
    expect(await Storyboard.deleteOwned("u3", shared)).toBe(false);
    expect(await Storyboard.deleteOwned("u1", shared)).toBe(true);

    await Script.create<Script>({ id: id1, user_id: "u1", name: "sc1" });
    await Script.create<Script>({ id: id2, user_id: "u2", name: "sc2" });
    expect(await Script.deleteOwned("u3", shared)).toBe(false);
    expect(await Script.deleteOwned("u1", shared)).toBe(true);

    await ImageDocument.create<ImageDocument>({ id: id1, user_id: "u1", project_id: "default", name: "img1" });
    await ImageDocument.create<ImageDocument>({ id: id2, user_id: "u2", project_id: "default", name: "img2" });
    expect(await ImageDocument.deleteOwned("u3", shared)).toBe(false);
    expect(await ImageDocument.deleteOwned("u1", shared)).toBe(true);

    await TimelineSequence.create<TimelineSequence>({ id: id1, user_id: "u1", project_id: "default", name: "tl1" });
    await TimelineSequence.create<TimelineSequence>({ id: id2, user_id: "u2", project_id: "default", name: "tl2" });
    expect(await TimelineSequence.deleteOwned("u3", shared)).toBe(false);
    expect(await TimelineSequence.deleteOwned("u1", shared)).toBe(true);

    await JsScript.create<JsScript>({ id: id1, user_id: "u1", project_id: "default", name: "js1" });
    await JsScript.create<JsScript>({ id: id2, user_id: "u2", project_id: "default", name: "js2" });
    expect(await JsScript.deleteOwned("u3", shared)).toBe(false);
    expect(await JsScript.deleteOwned("u1", shared)).toBe(true);
  });
});
