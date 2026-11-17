/**
 * Deleted documents kept for their restore period (WP2.2, PRD D4).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  restoreDeletedDocument,
  setDocumentRetentionDays
} from "../src/deleted-document.js";

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
