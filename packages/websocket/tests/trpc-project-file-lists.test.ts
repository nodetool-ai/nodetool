/**
 * The Incomplete and erased lists of a cloud project, filtered per reader
 * (WP2.9, PRD X7, SR32, AC73).
 */
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  initTestDb,
  Project,
  recordErasedFile,
  recordMissingFiles,
  Workflow,
  WorkflowCollaborator,
  WorkflowVersion
} from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
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
const READER = "reader-1";
const STRANGER = "stranger-1";

function id(): string {
  return randomBytes(16).toString("hex");
}

function graphOf(...assetIds: string[]) {
  return {
    nodes: assetIds.map((assetId, i) => ({
      id: `n${i}`,
      type: "nodetool.constant.Image",
      data: { value: { type: "image", asset_id: assetId } }
    })),
    edges: []
  };
}

async function workflowIn(projectId: string, name: string, graph: ReturnType<typeof graphOf>): Promise<Workflow> {
  return Workflow.create<Workflow>({
    id: id(),
    user_id: OWNER,
    project_id: projectId,
    name,
    description: "",
    tags: [],
    access: "private",
    graph,
    run_mode: "workflow"
  });
}

async function versionOf(workflow: Workflow, graph: ReturnType<typeof graphOf>): Promise<void> {
  await WorkflowVersion.create<WorkflowVersion>({
    workflow_id: workflow.id,
    user_id: OWNER,
    name: "Earlier",
    description: null,
    graph,
    save_type: "manual",
    version: await WorkflowVersion.nextVersion(workflow.id)
  });
}

describe("project file lists over tRPC", () => {
  beforeEach(() => initTestDb());

  it("shows a reader only the files of documents they can open (AC73)", async () => {
    const project = await Project.create<Project>({ id: id(), user_id: OWNER, name: "Film", kind: "project" });
    const missingOfA = id();
    const missingOfB = id();
    const erasedOfB = id();
    const erasedInHistoryOfA = id();
    const hashOfB = "b".repeat(64);
    const hashOfA = "a".repeat(64);
    const missingHashOfB = "c".repeat(64);
    const shared = await workflowIn(project.id, "Shared cut", graphOf(missingOfA));
    const hidden = await workflowIn(project.id, "Secret cut", graphOf(missingOfB));
    await versionOf(hidden, graphOf(erasedOfB));
    await versionOf(shared, graphOf(erasedInHistoryOfA));
    await WorkflowCollaborator.upsert({ workflowId: shared.id, userId: READER, role: "viewer", invitedBy: OWNER });
    await recordMissingFiles({
      projectId: project.id,
      userId: OWNER,
      transferId: id(),
      files: [
        { assetId: missingOfA, size: 100, reason: "too_large" },
        { assetId: missingOfB, hash: missingHashOfB, size: 7777, reason: "missing_locally" }
      ]
    });
    await recordErasedFile({ projectId: project.id, userId: OWNER, hash: hashOfB, size: 5555, assetIds: [erasedOfB] });
    await recordErasedFile({ projectId: project.id, userId: OWNER, hash: hashOfA, size: 40, assetIds: [erasedInHistoryOfA] });

    const reader = createCaller(makeCtx(READER));
    const seen = await reader.storage.projectFileLists({ project_id: project.id });
    const sharedNamed = { kind: "workflow", document_id: shared.id, name: "Shared cut" };
    expect(seen).toEqual({
      incomplete: true,
      missing_files: [{ asset_id: missingOfA, hash: null, size: 100, reason: "too_large", documents: [sharedNamed] }],
      missing_bytes: 100,
      // A viewer without history does not read the version that names the erased file.
      erased_files: [],
      erased_bytes: 0
    });
    const body = JSON.stringify(seen);
    for (const secret of [hidden.id, "Secret cut", missingOfB, missingHashOfB, "7777", erasedOfB, hashOfB, "5555"]) {
      expect(body).not.toContain(secret);
    }

    // With history, the reader sees the erased file their versions name, and still nothing of the other document.
    const grant = await WorkflowCollaborator.findInvitation(shared.id, READER);
    grant!.allow_history = true;
    await grant!.save();
    const withHistory = await reader.storage.projectFileLists({ project_id: project.id });
    expect(withHistory.erased_files).toEqual([
      {
        hash: hashOfA,
        size: 40,
        asset_ids: [erasedInHistoryOfA],
        erased_by: OWNER,
        erased_at: expect.any(String),
        documents: [sharedNamed]
      }
    ]);
    expect(withHistory.erased_bytes).toBe(40);
    expect(JSON.stringify(withHistory)).not.toContain(hashOfB);

    // The owner sees both missing files and both erased files.
    const all = await createCaller(makeCtx(OWNER)).storage.projectFileLists({ project_id: project.id });
    expect(all.missing_files.map((file) => file.asset_id).sort()).toEqual([missingOfA, missingOfB].sort());
    expect(all.missing_bytes).toBe(7877);
    expect(all.erased_files.map((file) => file.hash).sort()).toEqual([hashOfA, hashOfB]);
    expect(all.erased_bytes).toBe(5595);
    expect(all.missing_files.find((file) => file.asset_id === missingOfB)?.documents).toEqual([
      { kind: "workflow", document_id: hidden.id, name: "Secret cut" }
    ]);

    // Someone who can open nothing of the project learns nothing, not even that it exists.
    await expect(createCaller(makeCtx(STRANGER)).storage.projectFileLists({ project_id: project.id })).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
  });

  it("clears the mark for a reader whose documents have no missing file", async () => {
    const project = await Project.create<Project>({ id: id(), user_id: OWNER, name: "Film", kind: "project" });
    const missing = id();
    const shared = await workflowIn(project.id, "Clean cut", graphOf());
    await workflowIn(project.id, "Broken cut", graphOf(missing));
    await WorkflowCollaborator.upsert({ workflowId: shared.id, userId: READER, role: "viewer", invitedBy: OWNER });
    await recordMissingFiles({
      projectId: project.id,
      userId: OWNER,
      transferId: id(),
      files: [{ assetId: missing, reason: "missing_locally" }]
    });

    expect(await createCaller(makeCtx(READER)).storage.projectFileLists({ project_id: project.id })).toEqual({
      incomplete: false,
      missing_files: [],
      missing_bytes: 0,
      erased_files: [],
      erased_bytes: 0
    });
    expect((await createCaller(makeCtx(OWNER)).storage.projectFileLists({ project_id: project.id })).incomplete).toBe(true);
  });
});
