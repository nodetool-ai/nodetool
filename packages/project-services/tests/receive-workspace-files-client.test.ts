/**
 * Workspace files in the local half of a receive (technical design,
 * "Receiving workspace files", RW6 to RW8): the comparison with the bases
 * and the folder, the choice per file, placement and the bases it writes.
 * The cloud is a fake transport that lists workspace files only.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCloudLink,
  initTestDb,
  listCloudLinkWorkspaceFiles,
  setCloudLinkWorkspaceFileBase,
  type CloudLinkRow
} from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import type { CaptureRevisionSetOutput } from "@nodetool-ai/protocol/api-schemas/receive.js";
import { captureReceive, runReceive, type ReceiveTransport } from "../src/cloud-receive-client.js";

const USER = "local-user";
const PROJECT = "a".repeat(32);
const CLOUD_PROJECT = "c".repeat(32);

function id(): string {
  return randomBytes(16).toString("hex");
}

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** A cloud whose owner's folder holds workspace files and no documents. */
class FakeCloud implements ReceiveTransport {
  readonly files = new Map<string, Uint8Array>();
  readonly downloads: string[] = [];

  async capture(): Promise<CaptureRevisionSetOutput> {
    return {
      set_id: id(),
      project_id: CLOUD_PROJECT,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      documents: [],
      workspace_files: [...this.files].map(([path, bytes]) => ({ path, hash: sha(bytes), size: bytes.byteLength }))
    };
  }

  async document(): Promise<never> {
    throw new Error("No documents in this cloud");
  }

  async downloadFile(input: { set_id: string; hash: string }, destination: string): Promise<"ok" | "ERASED"> {
    const bytes = [...this.files.values()].find((entry) => sha(entry) === input.hash);
    if (!bytes) return "ERASED";
    this.downloads.push(input.hash);
    await writeFile(destination, bytes);
    return "ok";
  }

  async release(): Promise<void> {}
}

describe("receiving workspace files", { timeout: 30_000 }, () => {
  let root: string;
  let folder: Workspace;
  let cloud: FakeCloud;
  let link: CloudLinkRow;

  beforeEach(async () => {
    initTestDb();
    root = await mkdtemp(join(tmpdir(), "nodetool-receive-ws-client-"));
    folder = createLocalWorkspace(join(root, PROJECT));
    await folder.mkdir("");
    setProjectFolderResolver(async (projectId): Promise<ProjectFolderResolution> => {
      if (projectId !== PROJECT) return { ok: false, reason: "No such folder" };
      return { ok: true, projectId, workspace: folder };
    });
    cloud = new FakeCloud();
    link = await createCloudLink({
      userId: USER,
      projectId: PROJECT,
      serverKey: "0123456789abcdef",
      accountId: "account-1",
      cloudProjectId: CLOUD_PROJECT
    });
  });

  afterEach(async () => {
    setProjectFolderResolver(null);
    await rm(root, { recursive: true, force: true });
  });

  /** Writes `bytes` locally and records them as the base of the last exchange. */
  async function exchanged(path: string, bytes: Uint8Array, keepLocal = true): Promise<void> {
    await folder.write(path, bytes);
    const found = await folder.stat(path);
    await setCloudLinkWorkspaceFileBase(link, { path, hash: sha(bytes), size: found!.size, mtimeMs: found!.modifiedAt });
    if (!keepLocal) await folder.delete(path);
  }

  async function local(path: string): Promise<string | null> {
    const bytes = await folder.read(path);
    return bytes ? new TextDecoder().decode(bytes) : null;
  }

  it("compares each cloud file with its base and the local file, and places the chosen ones (RW6, TC127)", async () => {
    // Cloud changed, local unchanged.
    await exchanged("cloud-changed.txt", text("base"));
    cloud.files.set("cloud-changed.txt", text("cloud edit"));
    // New in the cloud.
    cloud.files.set("new.txt", text("new"));
    // Local changed, cloud unchanged: nothing to receive.
    await exchanged("local-changed.txt", text("base"));
    await folder.write("local-changed.txt", text("local edit"));
    cloud.files.set("local-changed.txt", text("base"));
    // Both changed.
    await exchanged("both.txt", text("base"));
    await folder.write("both.txt", text("local edit"));
    cloud.files.set("both.txt", text("cloud edit"));
    // Deleted locally, changed in the cloud.
    await exchanged("deleted.txt", text("base"), false);
    cloud.files.set("deleted.txt", text("cloud edit"));
    // The folder has the cloud bytes already.
    await exchanged("same.txt", text("base"));
    await folder.write("same.txt", text("same bytes"));
    cloud.files.set("same.txt", text("same bytes"));

    const review = await captureReceive(cloud, link);
    const rows = review.workspaceFiles.map((file) => [file.path, file.status, file.included]);
    expect(rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual([
      ["both.txt", "both_changed", false],
      ["cloud-changed.txt", "cloud_changed", false],
      ["deleted.txt", "local_deleted", false],
      ["new.txt", "new", false],
      ["same.txt", "same", true]
    ]);

    const chosen = review.workspaceFiles.filter((file) => file.status !== "same").map(({ path, hash }) => ({ path, hash }));
    const outcome = await runReceive(cloud, review.setId, [], { includeWorkspaceFiles: chosen });
    expect(outcome.status).toBe("finished");
    if (outcome.status !== "finished") return;

    expect(await local("cloud-changed.txt")).toBe("cloud edit");
    expect(await local("new.txt")).toBe("new");
    expect(await local("deleted.txt")).toBe("cloud edit");
    expect(await local("local-changed.txt")).toBe("local edit");
    // Both changed: the local file stays, the received one goes beside it (V11).
    expect(await local("both.txt")).toBe("local edit");
    const kept = outcome.result.workspaceKeptBeside ?? [];
    expect(kept.map((entry) => entry.path)).toEqual(["both.txt"]);
    expect(kept[0]!.keptPath).toMatch(/^both \(cloud \d{4}-\d{2}-\d{2}\)\.txt$/);
    expect(await local(kept[0]!.keptPath)).toBe("cloud edit");
    expect([...(outcome.result.workspaceReceived ?? [])].sort()).toEqual(["cloud-changed.txt", "deleted.txt", "new.txt"]);
    // A file the folder had already is not downloaded.
    expect(cloud.downloads).not.toContain(sha(text("same bytes")));

    // Every base now has the cloud hash. A placed file records its size and time (RW8).
    const bases = await listCloudLinkWorkspaceFiles(link.id);
    for (const path of ["cloud-changed.txt", "new.txt", "deleted.txt", "both.txt", "same.txt"]) {
      expect(bases.get(path)?.base_hash).toBe(sha(cloud.files.get(path)!));
    }
    const placed = await folder.stat("new.txt");
    expect(Number(bases.get("new.txt")!.mtime_ms)).toBe(placed!.modifiedAt);
    expect(Number(bases.get("both.txt")!.size)).toBe(-1);

    // The next receive offers nothing.
    const again = await captureReceive(cloud, link);
    expect(again.workspaceFiles).toEqual([]);
  });

  it("leaves out a file the person did not include and offers it again (RW7, TC128)", async () => {
    await exchanged("notes.txt", text("base"));
    cloud.files.set("notes.txt", text("cloud edit"));

    const review = await captureReceive(cloud, link);
    const outcome = await runReceive(cloud, review.setId, []);
    expect(outcome).toMatchObject({ status: "finished", result: { workspaceNotReceived: ["notes.txt"] } });
    expect(await local("notes.txt")).toBe("base");
    expect(cloud.downloads).toEqual([]);
    expect((await listCloudLinkWorkspaceFiles(link.id)).get("notes.txt")?.base_hash).toBe(sha(text("base")));

    const again = await captureReceive(cloud, link);
    expect(again.workspaceFiles).toMatchObject([{ path: "notes.txt", status: "cloud_changed", included: false }]);
  });

  it("keeps a file edited locally after the review beside the received one", async () => {
    await exchanged("plan.txt", text("base"));
    cloud.files.set("plan.txt", text("cloud edit"));
    const review = await captureReceive(cloud, link);
    expect(review.workspaceFiles).toMatchObject([{ path: "plan.txt", status: "cloud_changed" }]);
    await folder.write("plan.txt", text("edited during the review"));

    const outcome = await runReceive(cloud, review.setId, [], {
      includeWorkspaceFiles: [{ path: "plan.txt", hash: sha(text("cloud edit")) }]
    });
    expect(await local("plan.txt")).toBe("edited during the review");
    expect(outcome).toMatchObject({ status: "finished", result: { workspaceKeptBeside: [{ path: "plan.txt" }] } });
  });

  it("lists a file deleted in the cloud and keeps the local file (OQ14)", async () => {
    await exchanged("old.txt", text("base"));
    const review = await captureReceive(cloud, link);
    expect(review.cloudDeletedWorkspaceFiles).toEqual(["old.txt"]);
    const outcome = await runReceive(cloud, review.setId, []);
    expect(outcome).toMatchObject({ status: "finished", result: { workspaceCloudDeleted: ["old.txt"] } });
    expect(await readFile(join(root, PROJECT, "old.txt"), "utf8")).toBe("base");
  });
});
