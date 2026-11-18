/**
 * Deleted documents kept for their restore period (WP2.2, PRD D4).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Workflow } from "../src/workflow.js";
import { WorkflowCollaborator } from "../src/workflow-collaborator.js";
import { WorkflowShare } from "../src/workflow-share.js";
import { WorkflowVersion } from "../src/workflow-version.js";
import { TimelineSequence } from "../src/timeline-sequence.js";
import { TimelineSequenceVersion } from "../src/timeline-sequence-version.js";
import { DocumentCollaborator } from "../src/document-sharing.js";
import {
  endDeletedDocumentRestorePeriod,
  listDeletedDocuments,
  purgeDeletedDocuments,
  registerDeletedDocumentKind,
  restoreDeletedDocument,
  retainDeletedProject,
  setDocumentRetentionDays
} from "../src/deleted-document.js";
import { getPortableDb } from "../src/db.js";
import { workflowVersions } from "../src/schema/workflow-versions.js";

const OWNER = "u1";
const OTHER = "u2";
const DAY = 24 * 60 * 60 * 1000;

function makeWorkflow(name = "wf") {
  return Workflow.create<Workflow>({
    user_id: OWNER,
    name,
    description: "",
    tags: [],
    access: "private",
    graph: { nodes: [{ id: "n1", type: "nodetool.workflows.base_node.Comment", data: {} }], edges: [] },
    run_mode: "workflow"
  });
}

function makeTimeline() {
  return TimelineSequence.create<TimelineSequence>({
    user_id: OWNER,
    project_id: "p",
    name: "cut",
    fps: 30,
    width: 16,
    height: 9,
    duration_ms: 1,
    document: JSON.stringify({ tracks: [], clips: [], markers: [] })
  });
}

describe("deleted documents", () => {
  beforeEach(() => {
    initTestDb();
    setDocumentRetentionDays(30);
  });
  afterEach(() => {
    setDocumentRetentionDays(null);
    ModelObserver.clear();
  });

  it("restores a deleted workflow with its versions and sharing under the same id", async () => {
    const wf = await makeWorkflow();
    await WorkflowVersion.create<WorkflowVersion>({
      workflow_id: wf.id,
      user_id: OWNER,
      version: await WorkflowVersion.nextVersion(wf.id)
    });
    await WorkflowCollaborator.upsert({ workflowId: wf.id, userId: OTHER, role: "viewer", invitedBy: OWNER });
    await WorkflowShare.ensure({ workflowId: wf.id, role: "viewer", createdBy: OWNER });

    expect(await Workflow.deleteOwned(OWNER, wf.id)).toBe(true);
    expect(await Workflow.get<Workflow>(wf.id)).toBeNull();
    expect(await WorkflowVersion.listForWorkflow(wf.id)).toEqual([]);

    const listed = await listDeletedDocuments(OWNER);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ kind: "workflow", documentId: wf.id, name: "wf" });
    expect(await listDeletedDocuments(OTHER)).toEqual([]);

    // Another account cannot restore it.
    expect(await restoreDeletedDocument(OTHER, "workflow", wf.id)).toEqual({ outcome: "not_found" });
    expect(await restoreDeletedDocument(OWNER, "workflow", wf.id)).toEqual({ outcome: "restored" });

    const restored = await Workflow.get<Workflow>(wf.id);
    expect(restored?.name).toBe("wf");
    expect(restored?.graph.nodes).toHaveLength(1);
    expect(await WorkflowVersion.listForWorkflow(wf.id)).toHaveLength(1);
    expect(await WorkflowCollaborator.findFor(wf.id, OTHER)).not.toBeNull();
    expect(await WorkflowShare.listForWorkflow(wf.id)).toHaveLength(1);
    expect(await listDeletedDocuments(OWNER)).toEqual([]);
  });

  it("restores a deleted timeline with its versions and collaborators", async () => {
    const seq = await makeTimeline();
    await TimelineSequenceVersion.snapshot(seq, { saveType: "manual" });
    await DocumentCollaborator.upsert({
      documentType: "timeline",
      documentId: seq.id,
      userId: OTHER,
      role: "editor",
      invitedBy: OWNER
    });
    const versions = (await TimelineSequenceVersion.listForTimeline(seq.id)).length;
    expect(versions).toBeGreaterThan(0);

    expect(await TimelineSequence.deleteOwned(OWNER, seq.id)).toBe(true);
    expect(await TimelineSequenceVersion.listForTimeline(seq.id)).toEqual([]);

    expect(await restoreDeletedDocument(OWNER, "timeline", seq.id)).toEqual({ outcome: "restored" });
    expect((await TimelineSequence.findById(seq.id))?.name).toBe("cut");
    expect(await TimelineSequenceVersion.listForTimeline(seq.id)).toHaveLength(versions);
    expect(await DocumentCollaborator.findFor("timeline", seq.id, OTHER)).not.toBeNull();
  });

  it("refuses a restore over a live document with the same id and keeps the deleted one", async () => {
    const wf = await makeWorkflow();
    await Workflow.deleteOwned(OWNER, wf.id);
    await Workflow.create<Workflow>({ ...wf.toRow(), name: "again" });

    const outcome = await restoreDeletedDocument(OWNER, "workflow", wf.id);
    expect(outcome.outcome).toBe("failed");
    expect((await Workflow.get<Workflow>(wf.id))?.name).toBe("again");
    expect(await listDeletedDocuments(OWNER)).toHaveLength(1);
  });

  it("purges after the restore period and not before", async () => {
    const wf = await makeWorkflow();
    const now = Date.now();
    await Workflow.deleteOwned(OWNER, wf.id);

    expect(await purgeDeletedDocuments(new Date(now + 29 * DAY))).toBe(0);
    expect(await restoreDeletedDocument(OWNER, "workflow", wf.id, new Date(now + 29 * DAY))).toEqual({
      outcome: "restored"
    });

    await Workflow.deleteOwned(OWNER, wf.id);
    // Past the period, the document is no longer listed or restorable, and
    // the job deletes it.
    const later = new Date(now + 31 * DAY);
    expect(await listDeletedDocuments(OWNER, { now: later })).toEqual([]);
    expect(await restoreDeletedDocument(OWNER, "workflow", wf.id, later)).toEqual({ outcome: "not_found" });
    expect(await purgeDeletedDocuments(later)).toBe(1);
    expect(await listDeletedDocuments(OWNER)).toEqual([]);
  });

  it("ends a restore period at the owner's request", async () => {
    const wf = await makeWorkflow();
    await Workflow.deleteOwned(OWNER, wf.id);
    expect(await endDeletedDocumentRestorePeriod(OTHER, "workflow", wf.id)).toBe(false);
    expect(await endDeletedDocumentRestorePeriod(OWNER, "workflow", wf.id)).toBe(true);
    expect(await restoreDeletedDocument(OWNER, "workflow", wf.id)).toEqual({ outcome: "not_found" });
    expect(await endDeletedDocumentRestorePeriod(OWNER, "workflow", wf.id)).toBe(false);
  });

  it("keeps the revision a save wrote after the delete's first read (F6)", async () => {
    const wf = await makeWorkflow("first");
    const stale = await Workflow.get<Workflow>(wf.id);
    const saved = await Workflow.updateFieldsIfUnchanged(wf.id, wf.updated_at, { name: "second" });
    expect(saved?.name).toBe("second");
    // The delete's ownership read sees the revision before the save.
    const read = vi.spyOn(Workflow, "get").mockResolvedValueOnce(stale);
    expect(await Workflow.deleteOwned(OWNER, wf.id)).toBe(true);
    read.mockRestore();

    const [entry] = await listDeletedDocuments(OWNER);
    expect(entry?.name).toBe("second");
    expect(await restoreDeletedDocument(OWNER, "workflow", wf.id)).toEqual({ outcome: "restored" });
    expect((await Workflow.get<Workflow>(wf.id))?.name).toBe("second");
  });

  it("keeps the first copy when a delete is repeated (F6)", async () => {
    const wf = await makeWorkflow();
    expect(await Workflow.deleteOwned(OWNER, wf.id)).toBe(true);
    const [before] = await listDeletedDocuments(OWNER);
    expect(await Workflow.deleteOwned(OWNER, wf.id)).toBe(false);
    expect(await listDeletedDocuments(OWNER)).toEqual([before]);
  });

  it("restores nothing when one kept row cannot be written, and can be tried again (F7)", async () => {
    const wf = await makeWorkflow();
    const version = await WorkflowVersion.create<WorkflowVersion>({
      workflow_id: wf.id,
      user_id: OWNER,
      version: await WorkflowVersion.nextVersion(wf.id)
    });
    await Workflow.deleteOwned(OWNER, wf.id);
    // A row that takes the kept version's id makes its insert fail.
    const other = await makeWorkflow("other");
    await getPortableDb()
      .insert(workflowVersions)
      .values({ ...version.toRow(), workflow_id: other.id } as never);

    const failed = await restoreDeletedDocument(OWNER, "workflow", wf.id);
    expect(failed.outcome).toBe("failed");
    expect(await Workflow.get<Workflow>(wf.id)).toBeNull();
    expect(await listDeletedDocuments(OWNER)).toHaveLength(1);

    await WorkflowVersion.deleteForWorkflow(other.id);
    expect(await restoreDeletedDocument(OWNER, "workflow", wf.id)).toEqual({ outcome: "restored" });
    expect(await WorkflowVersion.listForWorkflow(wf.id)).toHaveLength(1);
  });

  it("refuses a restore once a purge claimed the row, and resumes the purge (F5)", async () => {
    let purgeFails = true;
    const purged: string[] = [];
    registerDeletedDocumentKind("probe", {
      *restore() {},
      async purge({ documentId }) {
        if (purgeFails) throw new Error("storage unreachable");
        purged.push(documentId);
      }
    });
    await retainDeletedProject({ kind: "probe", documentId: "d1", userId: OWNER, projectId: null, name: "p", payload: { row: {}, dependents: {} } });

    expect(await endDeletedDocumentRestorePeriod(OWNER, "probe", "d1")).toBe(false);
    // The claim holds: the row is neither listed nor restorable.
    expect(await listDeletedDocuments(OWNER)).toEqual([]);
    expect(await restoreDeletedDocument(OWNER, "probe", "d1")).toEqual({ outcome: "not_found" });

    purgeFails = false;
    expect(await purgeDeletedDocuments(new Date(Date.now() + 1000))).toBe(1);
    expect(purged).toEqual(["d1"]);
  });

  it("purges nothing a restore already took (F5)", async () => {
    const purged: string[] = [];
    registerDeletedDocumentKind("probe2", {
      *restore() {},
      async purge({ documentId }) {
        purged.push(documentId);
      }
    });
    const now = Date.now();
    await retainDeletedProject(
      { kind: "probe2", documentId: "d2", userId: OWNER, projectId: null, name: "p", payload: { row: {}, dependents: {} } },
      new Date(now)
    );
    expect(await restoreDeletedDocument(OWNER, "probe2", "d2", new Date(now))).toEqual({ outcome: "restored" });
    expect(await purgeDeletedDocuments(new Date(now + 31 * DAY))).toBe(0);
    expect(purged).toEqual([]);
  });

  it("keeps a repeated project delete's first copy and adds its members (F6, F8)", async () => {
    const input = { kind: "probe3", documentId: "p1", userId: OWNER, projectId: "p1", name: "p" };
    const first = await retainDeletedProject({ ...input, payload: { row: {}, dependents: {}, members: [{ kind: "workflow", documentId: "a" }] } });
    const again = await retainDeletedProject(
      { ...input, payload: { row: {}, dependents: {}, members: [{ kind: "timeline", documentId: "b" }] } },
      new Date(Date.now() + DAY)
    );
    expect(again).toBe(first);
  });

  it("keeps nothing while retention is off", async () => {
    setDocumentRetentionDays(null);
    const wf = await makeWorkflow();
    await Workflow.deleteOwned(OWNER, wf.id);
    expect(await listDeletedDocuments(OWNER)).toEqual([]);
    expect(await restoreDeletedDocument(OWNER, "workflow", wf.id)).toEqual({ outcome: "not_found" });
  });

  it("refuses a retention period that is not a positive number of days", () => {
    for (const days of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => setDocumentRetentionDays(days)).toThrow();
    }
  });
});
