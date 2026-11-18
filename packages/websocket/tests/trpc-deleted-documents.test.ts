/**
 * Deleted documents router and the project delete that keeps content for the
 * restore period (PRD D4, PG2, WP2.2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  initTestDb,
  ModelObserver,
  Project,
  purgeDeletedDocuments,
  setDocumentRetentionDays,
  TimelineSequence,
  Workflow
} from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import { purgeDueDeletedDocuments } from "../src/lib/deleted-documents.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const OWNER = "owner-1";

async function makeProject(name = "Film") {
  return Project.create<Project>({ user_id: OWNER, name, kind: "project" });
}

async function makeWorkflow(projectId: string | null, name = "wf") {
  return Workflow.create<Workflow>({
    user_id: OWNER,
    project_id: projectId,
    name,
    description: "",
    tags: [],
    access: "private",
    graph: { nodes: [], edges: [] },
    run_mode: "workflow"
  });
}

async function makeTimeline(projectId: string) {
  return TimelineSequence.create<TimelineSequence>({
    user_id: OWNER,
    project_id: projectId,
    name: "cut",
    fps: 30,
    width: 16,
    height: 9,
    duration_ms: 1,
    document: JSON.stringify({ tracks: [], clips: [], markers: [] })
  });
}

describe("deletedDocuments router", () => {
  beforeEach(() => {
    initTestDb();
    setDocumentRetentionDays(30);
  });
  afterEach(() => {
    setDocumentRetentionDays(null);
    ModelObserver.clear();
  });

  it("lists, restores and ends the restore period of a deleted workflow for its owner only", async () => {
    const owner = createCaller(makeCtx(OWNER));
    const other = createCaller(makeCtx("other"));
    const kept = await makeWorkflow(null, "kept");
    const ended = await makeWorkflow(null, "ended");
    await Workflow.deleteOwned(OWNER, kept.id);
    await Workflow.deleteOwned(OWNER, ended.id);

    const listed = await owner.deletedDocuments.list({});
    expect(listed.documents.map((d) => d.name).sort()).toEqual(["ended", "kept"]);
    expect((await other.deletedDocuments.list({})).documents).toEqual([]);
    await expect(
      other.deletedDocuments.restore({ kind: "workflow", document_id: kept.id })
    ).rejects.toThrow(/not found/i);

    await owner.deletedDocuments.restore({ kind: "workflow", document_id: kept.id });
    expect((await Workflow.get<Workflow>(kept.id))?.name).toBe("kept");

    await owner.deletedDocuments.endRestorePeriod({ kind: "workflow", document_id: ended.id });
    await expect(
      owner.deletedDocuments.restore({ kind: "workflow", document_id: ended.id })
    ).rejects.toThrow(/not found/i);
    expect((await owner.deletedDocuments.list({})).documents).toEqual([]);
  });

  it("keeps a deleted project and its documents and restores them together", async () => {
    const owner = createCaller(makeCtx(OWNER));
    const project = await makeProject();
    const wf = await makeWorkflow(project.id);
    const timeline = await makeTimeline(project.id);
    const asset = await Asset.create<Asset>({
      user_id: OWNER,
      project_id: project.id,
      name: "clip.png",
      content_type: "image/png"
    });

    const deleted = await owner.projects.delete({ id: project.id });
    expect(deleted.folder.action).toBe("none");
    expect(Date.parse(deleted.restorable_until ?? "")).toBeGreaterThan(Date.now() + 29 * 86_400_000);

    // The documents left the live tables, so no read or link reaches them.
    expect(await Workflow.get<Workflow>(wf.id)).toBeNull();
    expect(await TimelineSequence.findById(timeline.id)).toBeNull();
    // The rest stays behind the tombstone for the purge.
    expect((await Project.findOwnedIncludingDeleted(OWNER, project.id))?.deleted_at).not.toBeNull();
    expect(await Asset.get<Asset>(asset.id)).not.toBeNull();

    const listed = await owner.deletedDocuments.list({ project_id: project.id });
    expect(listed.documents.map((d) => d.kind).sort()).toEqual(["project", "timeline", "workflow"]);

    // A document cannot come back into a deleted project.
    await expect(
      owner.deletedDocuments.restore({ kind: "workflow", document_id: wf.id })
    ).rejects.toThrow(/project is deleted/);

    await owner.deletedDocuments.restore({ kind: "project", document_id: project.id });
    expect((await Project.findOwned(OWNER, project.id))?.deleted_at).toBeNull();
    expect((await Workflow.get<Workflow>(wf.id))?.project_id).toBe(project.id);
    expect((await TimelineSequence.findById(timeline.id))?.name).toBe("cut");
    expect((await owner.deletedDocuments.list({})).documents).toEqual([]);
  });

  it("restores only the documents the project delete moved (F8)", async () => {
    const owner = createCaller(makeCtx(OWNER));
    const project = await makeProject();
    const earlier = await makeWorkflow(project.id, "deleted first");
    const kept = await makeWorkflow(project.id, "deleted with the project");
    expect(await Workflow.deleteOwned(OWNER, earlier.id)).toBe(true);
    await owner.projects.delete({ id: project.id });

    await owner.deletedDocuments.restore({ kind: "project", document_id: project.id });
    expect((await Workflow.get<Workflow>(kept.id))?.name).toBe("deleted with the project");
    expect(await Workflow.get<Workflow>(earlier.id)).toBeNull();
    const listed = (await owner.deletedDocuments.list({})).documents;
    expect(listed.map((d) => d.document_id)).toEqual([earlier.id]);
  });

  it("keeps every member when a project delete or its restore stops part way (review F26)", async () => {
    const owner = createCaller(makeCtx(OWNER));
    const project = await makeProject();
    const first = await makeWorkflow(project.id, "first");
    const second = await makeWorkflow(project.id, "second");
    const timeline = await makeTimeline(project.id);

    // The delete stops after it moved one workflow, and is tried again.
    const deleteOwned = Workflow.deleteOwned.bind(Workflow);
    let deletes = 0;
    const stop = vi.spyOn(Workflow, "deleteOwned").mockImplementation(async (...args) => {
      deletes += 1;
      if (deletes === 2) throw new Error("server stopped");
      return deleteOwned(...args);
    });
    await expect(owner.projects.delete({ id: project.id })).rejects.toThrow();
    stop.mockRestore();
    await owner.projects.delete({ id: project.id });
    expect(await Workflow.get<Workflow>(first.id)).toBeNull();
    expect(await Workflow.get<Workflow>(second.id)).toBeNull();

    // The restore stops after it brought back one document.
    const write = vi.spyOn(Workflow.prototype, "writeFile").mockRejectedValueOnce(new Error("server stopped"));
    await expect(owner.deletedDocuments.restore({ kind: "project", document_id: project.id })).rejects.toThrow();
    write.mockRestore();
    expect((await Project.findOwned(OWNER, project.id))?.deleted_at).toBeNull();
    const back = [await Workflow.get<Workflow>(first.id), await Workflow.get<Workflow>(second.id)];
    expect(back.filter((wf) => wf !== null)).toHaveLength(1);

    // The purge job finishes it.
    await purgeDueDeletedDocuments();
    expect((await Workflow.get<Workflow>(first.id))?.name).toBe("first");
    expect((await Workflow.get<Workflow>(second.id))?.name).toBe("second");
    expect((await TimelineSequence.findById(timeline.id))?.name).toBe("cut");
    expect((await owner.deletedDocuments.list({})).documents).toEqual([]);
  });

  it("never purges a project a restore took first (F5)", async () => {
    const owner = createCaller(makeCtx(OWNER));
    const project = await makeProject();
    const wf = await makeWorkflow(project.id);
    await owner.projects.delete({ id: project.id });
    await owner.deletedDocuments.restore({ kind: "project", document_id: project.id });

    expect(await purgeDeletedDocuments(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))).toBe(0);
    expect((await Project.findOwned(OWNER, project.id))?.deleted_at).toBeNull();
    expect(await Workflow.get<Workflow>(wf.id)).not.toBeNull();
  });

  it("removes a kept project's content when its restore period ends", async () => {
    const owner = createCaller(makeCtx(OWNER));
    const project = await makeProject();
    const wf = await makeWorkflow(project.id);
    const asset = await Asset.create<Asset>({
      user_id: OWNER,
      project_id: project.id,
      name: "clip.png",
      content_type: "image/png"
    });
    await owner.projects.delete({ id: project.id });

    await owner.deletedDocuments.endRestorePeriod({ kind: "project", document_id: project.id });
    // Only the tombstone stays, as after an immediate delete.
    expect((await Project.findOwnedIncludingDeleted(OWNER, project.id))?.deleted_at).not.toBeNull();
    expect(await Asset.get<Asset>(asset.id)).toBeNull();
    expect((await owner.deletedDocuments.list({})).documents).toEqual([]);
    await expect(
      owner.deletedDocuments.restore({ kind: "workflow", document_id: wf.id })
    ).rejects.toThrow(/not found/i);
  });

  it("deletes a project at once while retention is off", async () => {
    setDocumentRetentionDays(null);
    const owner = createCaller(makeCtx(OWNER));
    const project = await makeProject();
    const wf = await makeWorkflow(project.id);
    const deleted = await owner.projects.delete({ id: project.id });
    expect(deleted.restorable_until).toBeUndefined();
    expect(await Workflow.get<Workflow>(wf.id)).toBeNull();
    expect((await owner.deletedDocuments.list({})).documents).toEqual([]);
  });
});
