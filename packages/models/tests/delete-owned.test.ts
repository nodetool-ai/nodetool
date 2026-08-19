/**
 * `deleteOwned` on the six models that carry one.
 *
 * Each is called from two places — a tRPC route and a sandbox capability — so
 * the ownership test and the cascade live on the model rather than in either
 * caller. Enumerated rather than sampled: the six resolve their rows
 * differently and each carries its own `user_id`, so "one of them is right" is
 * not evidence about the others.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Workflow } from "../src/workflow.js";
import { WorkflowCollaborator } from "../src/workflow-collaborator.js";
import { WorkflowShare } from "../src/workflow-share.js";
import { TimelineSequence } from "../src/timeline-sequence.js";
import { TimelineSequenceVersion } from "../src/timeline-sequence-version.js";
import { ImageDocument } from "../src/image-document.js";
import { ImageDocumentVersion } from "../src/image-document-version.js";
import { Script } from "../src/script.js";
import { Storyboard } from "../src/storyboard.js";
import { JsScript } from "../src/js-script.js";

const OWNER = "u1";
const OTHER = "u2";

interface Subject {
  readonly name: string;
  make(userId: string): Promise<{ id: string }>;
  remove(userId: string, id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
}

const SUBJECTS: Subject[] = [
  {
    name: "Workflow",
    make: (user) =>
      Workflow.create<Workflow>({
        user_id: user,
        name: "wf",
        description: "",
        tags: [],
        access: "private",
        graph: { nodes: [], edges: [] },
        run_mode: "workflow"
      }),
    remove: (user, id) => Workflow.deleteOwned(user, id),
    exists: async (id) => (await Workflow.get<Workflow>(id)) !== null
  },
  {
    name: "TimelineSequence",
    make: (user) =>
      TimelineSequence.create<TimelineSequence>({
        user_id: user,
        project_id: "p",
        name: "cut",
        fps: 30,
        width: 16,
        height: 9,
        duration_ms: 1,
        document: JSON.stringify({ tracks: [], clips: [], markers: [] })
      }),
    remove: (user, id) => TimelineSequence.deleteOwned(user, id),
    exists: async (id) => (await TimelineSequence.findById(id)) !== null
  },
  {
    name: "ImageDocument",
    make: (user) =>
      ImageDocument.create<ImageDocument>({
        user_id: user,
        project_id: "p",
        name: "poster",
        width: 8,
        height: 8,
        background_color: "#fff",
        document: JSON.stringify({
          sketch: { layers: [], activeLayerId: null, maskLayerId: null },
          layerBindings: []
        })
      }),
    remove: (user, id) => ImageDocument.deleteOwned(user, id),
    exists: async (id) => (await ImageDocument.findById(id)) !== null
  },
  {
    name: "Script",
    make: (user) =>
      Script.create<Script>({
        user_id: user,
        project_id: "p",
        name: "s",
        document: JSON.stringify({ cast: [], sections: [] })
      }),
    remove: (user, id) => Script.deleteOwned(user, id),
    exists: async (id) => (await Script.findById(id)) !== null
  },
  {
    name: "Storyboard",
    make: (user) =>
      Storyboard.create<Storyboard>({
        user_id: user,
        project_id: "p",
        name: "b",
        document: JSON.stringify({ shots: [] })
      }),
    remove: (user, id) => Storyboard.deleteOwned(user, id),
    exists: async (id) => (await Storyboard.findById(id)) !== null
  },
  {
    name: "JsScript",
    make: async (user) => {
      const script = new JsScript({
        user_id: user,
        name: "js",
        document: JSON.stringify({
          schemaVersion: 1,
          code: "",
          inputs: [],
          outputs: [],
          packages: [],
          secrets: [],
          timeoutMs: 30000,
          tests: []
        })
      });
      await script.save();
      return script;
    },
    remove: (user, id) => JsScript.deleteOwned(user, id),
    exists: async (id) => (await JsScript.findById(id)) !== null
  }
];

describe("deleteOwned", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  for (const subject of SUBJECTS) {
    it(`${subject.name}: deletes the owner's row`, async () => {
      const row = await subject.make(OWNER);
      expect(await subject.remove(OWNER, row.id)).toBe(true);
      expect(await subject.exists(row.id)).toBe(false);
    });

    it(`${subject.name}: refuses another user's row and leaves it alone`, async () => {
      const row = await subject.make(OTHER);
      expect(await subject.remove(OWNER, row.id)).toBe(false);
      expect(await subject.exists(row.id)).toBe(true);
    });

    it(`${subject.name}: reports a missing row as not deleted`, async () => {
      expect(await subject.remove(OWNER, "no-such-id")).toBe(false);
    });
  }
});

describe("deleteOwned cascades", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("takes a workflow's collaborator grants and share links with it", async () => {
    const wf = await Workflow.create<Workflow>({
      user_id: OWNER,
      name: "wf",
      description: "",
      tags: [],
      access: "private",
      graph: { nodes: [], edges: [] },
      run_mode: "workflow"
    });
    await WorkflowCollaborator.upsert({
      workflowId: wf.id,
      userId: OTHER,
      role: "viewer",
      invitedBy: OWNER
    });
    await WorkflowShare.ensure({
      workflowId: wf.id,
      role: "viewer",
      createdBy: OWNER
    });

    expect(await Workflow.deleteOwned(OWNER, wf.id)).toBe(true);

    // A workflow row can be recreated under the same id; a grant left behind
    // would then apply to a workflow its holder was never given.
    expect(await WorkflowCollaborator.findFor(wf.id, OTHER)).toBeNull();
    expect(await WorkflowShare.listForWorkflow(wf.id)).toEqual([]);
  });

  it("takes a timeline's version rows with it", async () => {
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: OWNER,
      project_id: "p",
      name: "cut",
      fps: 30,
      width: 16,
      height: 9,
      duration_ms: 1,
      document: JSON.stringify({ tracks: [], clips: [], markers: [] })
    });
    await TimelineSequenceVersion.snapshot(seq, { saveType: "manual" });
    expect(
      (await TimelineSequenceVersion.listForTimeline(seq.id)).length
    ).toBeGreaterThan(0);

    await TimelineSequence.deleteOwned(OWNER, seq.id);
    expect(await TimelineSequenceVersion.listForTimeline(seq.id)).toEqual([]);
  });

  it("leaves another user's version rows alone when the delete is refused", async () => {
    const seq = await TimelineSequence.create<TimelineSequence>({
      user_id: OTHER,
      project_id: "p",
      name: "cut",
      fps: 30,
      width: 16,
      height: 9,
      duration_ms: 1,
      document: JSON.stringify({ tracks: [], clips: [], markers: [] })
    });
    await TimelineSequenceVersion.snapshot(seq, { saveType: "manual" });

    expect(await TimelineSequence.deleteOwned(OWNER, seq.id)).toBe(false);
    expect(
      (await TimelineSequenceVersion.listForTimeline(seq.id)).length
    ).toBeGreaterThan(0);
  });

  it("takes an image document's version rows with it", async () => {
    const doc = await ImageDocument.create<ImageDocument>({
      user_id: OWNER,
      project_id: "p",
      name: "poster",
      width: 8,
      height: 8,
      background_color: "#fff",
      document: JSON.stringify({
        sketch: { layers: [], activeLayerId: null, maskLayerId: null },
        layerBindings: []
      })
    });
    await ImageDocumentVersion.snapshot(doc, { saveType: "manual" });
    expect(
      (await ImageDocumentVersion.listForDocument(doc.id)).length
    ).toBeGreaterThan(0);

    await ImageDocument.deleteOwned(OWNER, doc.id);
    expect(await ImageDocumentVersion.listForDocument(doc.id)).toEqual([]);
  });
});
