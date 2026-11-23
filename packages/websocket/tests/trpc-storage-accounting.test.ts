/**
 * Storage use, the allowance and the storage view over tRPC (WP2.3, PRD D5).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Asset,
  commitProjectBlobs,
  DocumentRefs,
  initTestDb,
  Project,
  setStorageAllowanceBytes,
  stageProjectBlob,
  Workflow,
  WorkflowCollaborator
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
const OTHER = "other-1";
const HASH = "d".repeat(64);

async function workflow(userId: string, projectId: string | null, name: string) {
  return Workflow.create<Workflow>({
    user_id: userId,
    project_id: projectId,
    name,
    description: "",
    tags: [],
    access: "private",
    graph: { nodes: [], edges: [] },
    run_mode: "workflow"
  });
}

describe("storage accounting over tRPC", () => {
  beforeEach(() => initTestDb());
  afterEach(() => setStorageAllowanceBytes(null));

  it("reports use against the allowance for the caller only", async () => {
    const project = await Project.create<Project>({ user_id: OWNER, name: "Film", kind: "project" });
    await stageProjectBlob({ projectId: project.id, userId: OWNER, hash: HASH, size: 950, transferId: "t" });
    await commitProjectBlobs(project.id, "t");

    const owner = createCaller(makeCtx(OWNER));
    expect(await owner.storage.allowance()).toEqual({
      used_bytes: 950,
      file_count: 1,
      allowance_bytes: null,
      over_allowance: false,
      near_allowance: false
    });
    setStorageAllowanceBytes(1000);
    expect(await owner.storage.allowance()).toMatchObject({ allowance_bytes: 1000, near_allowance: true });
    expect(await createCaller(makeCtx(OTHER)).storage.allowance()).toMatchObject({ used_bytes: 0 });
  });

  it("names the caller's documents and leaves out other people's", async () => {
    const project = await Project.create<Project>({ user_id: OWNER, name: "Film", kind: "project" });
    await stageProjectBlob({ projectId: project.id, userId: OWNER, hash: HASH, size: 10, transferId: "t" });
    await commitProjectBlobs(project.id, "t");
    const asset = await Asset.create<Asset>({
      user_id: OWNER,
      project_id: project.id,
      name: "still",
      content_type: "image/png",
      content_hash: HASH
    });
    const mine = await workflow(OWNER, project.id, "Mine");
    const theirs = await workflow(OTHER, null, "Theirs");
    await DocumentRefs.writeSet("workflow", mine.id, DocumentRefs.currentKey("m"), "m", { viewer: [asset.id] });
    await DocumentRefs.writeSet("workflow", theirs.id, DocumentRefs.currentKey("t"), "t", { viewer: [asset.id] });
    // A kind the view does not know is not named either.
    await DocumentRefs.writeSet("unknown-kind", "x", DocumentRefs.currentKey("u"), "u", { viewer: [asset.id] });

    const { files } = await createCaller(makeCtx(OWNER)).storage.files();
    expect(files).toEqual([
      {
        hash: HASH,
        size: 10,
        projects: [{ id: project.id, name: "Film", deleted: false }],
        asset_ids: [asset.id],
        holders: [{ kind: "current", document_type: "workflow", document_id: mine.id }]
      }
    ]);
    expect((await createCaller(makeCtx(OTHER)).storage.files()).files).toEqual([]);
  });

  it("erases a file for the owner only, and answers a refusal with the content that shows it (FR79, SR33)", async () => {
    const project = await Project.create<Project>({ user_id: OWNER, name: "Film", kind: "project" });
    await stageProjectBlob({ projectId: project.id, userId: OWNER, hash: HASH, size: 10, transferId: "t" });
    await commitProjectBlobs(project.id, "t");
    const asset = await Asset.create<Asset>({
      user_id: OWNER,
      project_id: project.id,
      name: "still",
      content_type: "image/png",
      content_hash: HASH
    });
    const shown = await Workflow.create<Workflow>({
      user_id: OWNER,
      project_id: project.id,
      name: "Cut",
      description: "",
      tags: [],
      access: "private",
      graph: { nodes: [{ id: "n1", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: asset.id } } }], edges: [] },
      run_mode: "workflow"
    });
    await WorkflowCollaborator.upsert({ workflowId: shown.id, userId: OTHER, role: "editor", invitedBy: OWNER });
    const input = { project_id: project.id, hash: HASH };

    await expect(createCaller(makeCtx(OTHER)).storage.erase(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createCaller(makeCtx("stranger-1")).storage.erasePreview(input)).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
    const owner = createCaller(makeCtx(OWNER));
    expect(await owner.storage.erase(input)).toEqual({
      outcome: "refused",
      hash: HASH,
      current: [{ kind: "workflow", document_id: shown.id, name: "Cut" }]
    });

    shown.graph = { nodes: [], edges: [] };
    await shown.save();
    expect(await owner.storage.erase(input)).toMatchObject({ outcome: "erased", hash: HASH, size: 10, asset_ids: [asset.id] });
    expect(await owner.storage.allowance()).toMatchObject({ used_bytes: 0 });
    expect(await owner.storage.unerase(input)).toEqual({ removed: true });
  });
});
