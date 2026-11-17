/**
 * Storage accounting (WP2.3): use over distinct committed hashes, the
 * allowance, and the holders the storage view lists for each file.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Asset } from "../src/asset.js";
import { initTestDb } from "../src/db.js";
import { retainDeletedProject, setDocumentRetentionDays } from "../src/deleted-document.js";
import { DocumentRefs } from "../src/document-refs.js";
import { Project } from "../src/project.js";
import { commitProjectBlobs, stageProjectBlob } from "../src/project-blob.js";
import {
  exceedsStorageAllowance,
  parseStorageAllowance,
  setStorageAllowanceBytes,
  storageAllowanceStatus,
  storageFiles,
  storageUse
} from "../src/storage-accounting.js";
import { Workflow } from "../src/workflow.js";

const OWNER = "u1";
const OTHER = "u2";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

async function hold(projectId: string, hash: string, size: number, userId = OWNER, transferId = "t1") {
  await stageProjectBlob({ projectId, userId, hash, size, transferId });
  await commitProjectBlobs(projectId, transferId);
}

async function asset(projectId: string, hash: string, userId = OWNER) {
  return Asset.create<Asset>({
    user_id: userId,
    project_id: projectId,
    name: hash.slice(0, 4),
    content_type: "image/png",
    content_hash: hash
  });
}

const ownerOnly = async (documentType: string, documentId: string) => {
  if (documentType !== "workflow") return false;
  const workflow = await Workflow.get<Workflow>(documentId);
  return workflow?.user_id === OWNER;
};

describe("storage accounting", () => {
  beforeEach(() => initTestDb());
  afterEach(() => {
    setStorageAllowanceBytes(null);
    setDocumentRetentionDays(null);
  });

  it("counts each committed hash of the owner once", async () => {
    await hold("p1", HASH_A, 100);
    await hold("p2", HASH_A, 100);
    await hold("p1", HASH_B, 30);
    // Staged rows of an open transfer and another owner's rows do not count.
    await stageProjectBlob({ projectId: "p1", userId: OWNER, hash: HASH_C, size: 7, transferId: "open" });
    await hold("p9", HASH_C, 1000, OTHER);

    expect(await storageUse(OWNER)).toEqual({ usedBytes: 130, fileCount: 2 });
    expect(await storageUse(OTHER)).toEqual({ usedBytes: 1000, fileCount: 1 });
    expect(await storageUse("nobody")).toEqual({ usedBytes: 0, fileCount: 0 });
  });

  it("treats an unset allowance as unlimited", async () => {
    await hold("p1", HASH_A, 100);
    expect(await storageAllowanceStatus(OWNER)).toEqual({
      usedBytes: 100,
      fileCount: 1,
      allowanceBytes: null,
      overAllowance: false,
      nearAllowance: false
    });
    expect(await exceedsStorageAllowance(OWNER, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it("warns at 90 percent and is over only above the allowance", async () => {
    await hold("p1", HASH_A, 90);
    setStorageAllowanceBytes(100);
    expect(await storageAllowanceStatus(OWNER)).toMatchObject({ nearAllowance: true, overAllowance: false });
    expect(await exceedsStorageAllowance(OWNER, 10)).toBe(false);
    expect(await exceedsStorageAllowance(OWNER, 11)).toBe(true);

    setStorageAllowanceBytes(89);
    expect(await storageAllowanceStatus(OWNER)).toMatchObject({ nearAllowance: true, overAllowance: true });
    setStorageAllowanceBytes(200);
    expect(await storageAllowanceStatus(OWNER)).toMatchObject({ nearAllowance: false, overAllowance: false });
  });

  it("refuses an allowance that is not a whole number of bytes", () => {
    for (const bytes of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => setStorageAllowanceBytes(bytes)).toThrow();
    }
    expect(() => setStorageAllowanceBytes(0)).not.toThrow();
  });

  it("reads the allowance from configuration text", () => {
    expect(parseStorageAllowance(undefined)).toBeNull();
    expect(parseStorageAllowance("  ")).toBeNull();
    expect(parseStorageAllowance(" 1073741824 ")).toBe(1073741824);
    for (const text of ["10GB", "-1", "1.5", "1e9", "99999999999999999999"]) {
      expect(() => parseStorageAllowance(text)).toThrow();
    }
  });

  it("names what keeps each file, from the retention roots", async () => {
    await Project.create<Project>({ id: "p1", user_id: OWNER, name: "Film" });
    await Project.create<Project>({ id: "p2", user_id: OWNER, name: "Copy" });
    await hold("p1", HASH_A, 100);
    await hold("p2", HASH_A, 100);
    await hold("p1", HASH_B, 30);
    await hold("p1", HASH_C, 5);
    const a = await asset("p1", HASH_A);
    const b = await asset("p1", HASH_B);
    await asset("p1", HASH_C);

    const wf = await Workflow.create<Workflow>({
      user_id: OWNER,
      project_id: "p1",
      name: "Cut",
      description: "",
      tags: [],
      access: "private",
      graph: { nodes: [], edges: [] },
      run_mode: "workflow"
    });
    const current = DocumentRefs.currentKey("h1");
    await DocumentRefs.writeSet("workflow", wf.id, current, "h1", { viewer: [a.id], editor: [a.id] });
    await DocumentRefs.writeSet("workflow", wf.id, "v1", "h0", { version_viewer: [b.id] });
    // Another person's document that refers to the owner's file is not named.
    const theirs = await Workflow.create<Workflow>({
      user_id: OTHER,
      name: "Theirs",
      description: "",
      tags: [],
      access: "private",
      graph: { nodes: [], edges: [] },
      run_mode: "workflow"
    });
    await DocumentRefs.writeSet("workflow", theirs.id, DocumentRefs.currentKey("x"), "x", { viewer: [b.id] });

    const files = await storageFiles(OWNER, ownerOnly);
    const byHash = new Map(files.map((file) => [file.hash, file]));
    expect(files).toHaveLength(3);

    expect(byHash.get(HASH_A)).toMatchObject({
      size: 100,
      assetIds: [a.id],
      holders: [{ kind: "current", documentType: "workflow", documentId: wf.id }]
    });
    expect(byHash.get(HASH_A)?.projects.map((p) => p.name).sort()).toEqual(["Copy", "Film"]);
    expect(byHash.get(HASH_B)?.holders).toEqual([
      { kind: "version", documentType: "workflow", documentId: wf.id, versionId: "v1" }
    ]);
    // Nothing refers to C: erasing it frees it.
    expect(byHash.get(HASH_C)?.holders).toEqual([]);
  });

  it("lists a deleted document and a deleted project as holders until the purge", async () => {
    setDocumentRetentionDays(30);
    await Project.create<Project>({ id: "p1", user_id: OWNER, name: "Film" });
    await hold("p1", HASH_A, 100);
    const a = await asset("p1", HASH_A);
    const wf = await Workflow.create<Workflow>({
      user_id: OWNER,
      project_id: "p1",
      name: "Cut",
      description: "",
      tags: [],
      access: "private",
      graph: { nodes: [], edges: [] },
      run_mode: "workflow"
    });
    await DocumentRefs.writeSet("workflow", wf.id, DocumentRefs.currentKey("h1"), "h1", { viewer: [a.id] });

    expect(await Workflow.deleteOwned(OWNER, wf.id)).toBe(true);
    let [file] = await storageFiles(OWNER, ownerOnly);
    expect(file.holders).toEqual([
      expect.objectContaining({ kind: "deleted_document", documentType: "workflow", documentId: wf.id, name: "Cut" })
    ]);
    // The use is unchanged: the deleted document still holds the file.
    expect((await storageUse(OWNER)).usedBytes).toBe(100);

    await retainDeletedProject({
      kind: "project",
      documentId: "p1",
      userId: OWNER,
      projectId: "p1",
      name: "Film",
      payload: { row: {}, dependents: {} }
    });
    [file] = await storageFiles(OWNER, ownerOnly);
    expect(file.holders.map((holder) => holder.kind).sort()).toEqual(["deleted_document", "deleted_project"]);
  });
});
