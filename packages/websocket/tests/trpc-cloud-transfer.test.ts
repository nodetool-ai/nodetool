/**
 * The local transfer router (WP2.7): the app names the cloud origin and
 * account and hands the access token, and the router derives the server key,
 * continues a send or receive only for the server and account it was captured
 * for, and maps what the cloud answered to errors the app can act on. The
 * cloud is a recording fake behind the transport factory.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, createCloudLink, getCloudReceive, getCloudSend, initTestDb, updateCloudSend, Workflow } from "@nodetool-ai/models";
import { createLocalWorkspace, setProjectFolderResolver, type ProjectFolderResolution } from "@nodetool-ai/runtime";
import { CloudRequestError, CloudSignedOutError } from "@nodetool-ai/project-services/cloud-http-transport";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

/** What the fake cloud does on the next call, and every token it was handed. */
const cloud = {
  tokens: [] as Array<{ origin: string; token: string }>,
  fail: null as Error | null,
  commits: 0,
  captures: 0,
  lastCommit: null as { manifest: { operations: Array<Record<string, unknown>> }; missing_files: unknown[] } | null,
  released: [] as string[]
};

vi.mock("../src/lib/cloud-transfer-transport.js", () => ({
  cloudTransport: (origin: string, token: string) => {
    cloud.tokens.push({ origin, token });
    const guard = () => {
      if (cloud.fail) throw cloud.fail;
    };
    return {
      async open(input: { manifest: { required_files: Array<{ hash: string }> } }) {
        guard();
        return { needed_hashes: [], allowance_bytes: null, used_bytes: 0 };
      },
      async stageFile() {
        guard();
      },
      async commit(input: { manifest: { operations: Array<{ op: string; kind: string; document_id: string; captured_hash: string }> } }) {
        guard();
        cloud.commits += 1;
        cloud.lastCommit = input as never;
        return {
          outcome: "committed" as const,
          project_id: PROJECT,
          documents: input.manifest.operations.map((operation) => ({
            kind: operation.kind,
            document_id: operation.document_id,
            hash: operation.captured_hash
          }))
        };
      },
      async status() {
        guard();
        return { state: "open" as const, project_id: PROJECT, attempts: [] };
      },
      async cancel() {
        guard();
        return { state: "cancelled" as const };
      },
      async capture() {
        guard();
        cloud.captures += 1;
        return { set_id: randomBytes(16).toString("hex"), project_id: PROJECT, documents: [], expires_at: new Date().toISOString() };
      },
      async document() {
        throw new Error("not used");
      },
      async downloadFile() {
        throw new Error("not used");
      },
      async release(input: { set_id: string }) {
        cloud.released.push(input.set_id);
      }
    };
  }
}));

const createCaller = createCallerFactory(appRouter);

const USER = "1";
const PROJECT = "c".repeat(32);
const ORIGIN = "https://cloud.example";
const ACCOUNT = { origin: ORIGIN, account_id: "account-a" };
const SESSION = { ...ACCOUNT, access_token: "token-a" };
const SERVER_KEY = createHash("sha256").update(ORIGIN).digest("hex").slice(0, 16);

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

async function apiCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(TRPCError);
  return ((error as TRPCError).cause as { apiCode?: string } | undefined)?.apiCode;
}

describe("cloudTransfer router", () => {
  let root: string;

  beforeEach(async () => {
    initTestDb();
    cloud.tokens = [];
    cloud.fail = null;
    cloud.commits = 0;
    cloud.captures = 0;
    cloud.lastCommit = null;
    cloud.released = [];
    root = await mkdtemp(join(tmpdir(), "nodetool-cloud-transfer-"));
    const folder = createLocalWorkspace(join(root, PROJECT));
    await folder.mkdir("");
    setProjectFolderResolver(async (projectId): Promise<ProjectFolderResolution> =>
      projectId === PROJECT ? { ok: true, projectId, workspace: folder } : { ok: false, reason: "No such folder" }
    );
    await Workflow.create<Workflow>({
      user_id: USER,
      project_id: PROJECT,
      name: "Edit",
      access: "private",
      graph: { nodes: [{ id: "n0", type: "nodetool.constant.String", data: { value: "one" } }], edges: [] }
    });
  });

  afterEach(async () => {
    setProjectFolderResolver(null);
    await rm(root, { recursive: true, force: true });
  });

  it("captures a first publication under the origin's server key and sends it with the token", async () => {
    const caller = createCaller(makeCtx(USER));
    const review = await caller.cloudTransfer.send.capture({ ...ACCOUNT, project_id: PROJECT, project_name: "Film" });
    if (review.status !== "captured") throw new Error("expected a capture");
    expect(review.first_publication).toBe(true);
    expect(review.operations).toHaveLength(1);
    // The capture is local: nothing reached the cloud.
    expect(cloud.tokens).toEqual([]);
    expect((await getCloudSend(review.transfer_id))?.server_key).toBe(SERVER_KEY);

    const outcome = await caller.cloudTransfer.send.run({ ...SESSION, transfer_id: review.transfer_id });
    expect(outcome.status).toBe("committed");
    expect(cloud.tokens).toEqual([{ origin: ORIGIN, token: "token-a" }]);
  });

  it("continues a send only for its own server, account and local user", async () => {
    const caller = createCaller(makeCtx(USER));
    const review = await caller.cloudTransfer.send.capture({ ...ACCOUNT, project_id: PROJECT });
    if (review.status !== "captured") throw new Error("expected a capture");
    const others = [
      caller.cloudTransfer.send.run({ ...SESSION, origin: "https://other.example", transfer_id: review.transfer_id }),
      caller.cloudTransfer.send.run({ ...SESSION, account_id: "account-b", transfer_id: review.transfer_id }),
      createCaller(makeCtx("2")).cloudTransfer.send.run({ ...SESSION, transfer_id: review.transfer_id }),
      caller.cloudTransfer.send.cancel({ ...SESSION, account_id: "account-b", transfer_id: review.transfer_id })
    ];
    for (const attempt of others) expect(await apiCodeOf(attempt)).toBe("NOT_FOUND");
    expect(cloud.tokens).toEqual([]);
    expect(cloud.commits).toBe(0);
  });

  it("refuses an origin the token must not go to", async () => {
    const caller = createCaller(makeCtx(USER));
    for (const origin of ["http://cloud.example", "https://cloud.example/api", "https://user@cloud.example"]) {
      expect(await apiCodeOf(caller.cloudTransfer.resume({ ...SESSION, origin })), origin).toBe("INVALID_INPUT");
    }
    expect(cloud.tokens).toEqual([]);
  });

  it("refuses to send a project linked to another account", async () => {
    await createCloudLink({
      userId: USER,
      projectId: PROJECT,
      serverKey: SERVER_KEY,
      accountId: "account-b",
      cloudProjectId: PROJECT
    });
    const caller = createCaller(makeCtx(USER));
    expect(await apiCodeOf(caller.cloudTransfer.send.capture({ ...ACCOUNT, project_id: PROJECT }))).toBe("ALREADY_EXISTS");
  });

  it("receives only into a project linked to this account", async () => {
    const caller = createCaller(makeCtx(USER));
    expect(await apiCodeOf(caller.cloudTransfer.receive.capture({ ...SESSION, project_id: PROJECT }))).toBe("NOT_FOUND");
    await createCloudLink({ userId: USER, projectId: PROJECT, serverKey: SERVER_KEY, accountId: "account-a", cloudProjectId: PROJECT });
    const set = await caller.cloudTransfer.receive.capture({ ...SESSION, project_id: PROJECT });
    expect(set.documents).toEqual([]);
    expect(cloud.captures).toBe(1);
    expect(await apiCodeOf(caller.cloudTransfer.receive.run({ ...SESSION, account_id: "account-b", set_id: set.set_id }))).toBe(
      "NOT_FOUND"
    );
  });

  it("reports a stale token as signed out and a cloud failure as retryable or not", async () => {
    const caller = createCaller(makeCtx(USER));
    const review = await caller.cloudTransfer.send.capture({ ...ACCOUNT, project_id: PROJECT });
    if (review.status !== "captured") throw new Error("expected a capture");
    const cases: Array<[Error, string]> = [
      [new CloudSignedOutError(), "CLOUD_SIGNED_OUT"],
      [new CloudRequestError(0, "OFFLINE", "connect ECONNREFUSED"), "CLOUD_UNREACHABLE"],
      [new CloudRequestError(503, "HTTP_503", "down"), "CLOUD_UNREACHABLE"],
      [new CloudRequestError(403, "FORBIDDEN", "not an editor"), "CLOUD_REFUSED"]
    ];
    for (const [failure, code] of cases) {
      cloud.fail = failure;
      expect(await apiCodeOf(caller.cloudTransfer.send.run({ ...SESSION, transfer_id: review.transfer_id })), code).toBe(code);
    }
    // The send is still there for the next try.
    cloud.fail = null;
    expect((await caller.cloudTransfer.send.run({ ...SESSION, transfer_id: review.transfer_id })).status).toBe("committed");
  });

  it("resumes only this account's interrupted sends", async () => {
    const caller = createCaller(makeCtx(USER));
    const review = await caller.cloudTransfer.send.capture({ ...ACCOUNT, project_id: PROJECT });
    if (review.status !== "captured") throw new Error("expected a capture");
    // A send whose commit answer was lost is in state committing with its attempt id.
    await updateCloudSend(review.transfer_id, { state: "committing", attemptId: randomBytes(16).toString("hex") });

    const other = await caller.cloudTransfer.resume({ ...SESSION, account_id: "account-b" });
    expect(other).toEqual({ sends: [], receives: [] });
    // The cloud has no record of the lost attempt, so the resume sends a new one.
    const own = await caller.cloudTransfer.resume(SESSION);
    expect(own.sends).toMatchObject([{ status: "committed", transfer_id: review.transfer_id }]);
    expect(cloud.commits).toBe(1);
    expect(await getCloudSend(review.transfer_id)).toBeNull();
  });

  it("sends without a missing file only once the app confirms it (review F36)", async () => {
    const asset = await Asset.create<Asset>({
      user_id: USER,
      project_id: PROJECT,
      parent_id: USER,
      name: "gone.png",
      content_type: "image/png",
      workspace_path: "media/gone.png",
      size: 4
    });
    await Workflow.create<Workflow>({
      user_id: USER,
      project_id: PROJECT,
      name: "Uses a missing file",
      access: "private",
      graph: { nodes: [{ id: "n1", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: asset.id } } }], edges: [] }
    });
    const caller = createCaller(makeCtx(USER));
    const review = await caller.cloudTransfer.send.capture({ ...ACCOUNT, project_id: PROJECT });
    if (review.status !== "captured") throw new Error("expected a capture");
    expect(review.missing_files).toMatchObject([{ asset_id: asset.id, reason: "missing_locally" }]);

    expect(await caller.cloudTransfer.send.run({ ...SESSION, transfer_id: review.transfer_id })).toMatchObject({
      status: "missing_files_unconfirmed",
      missing_files: review.missing_files
    });
    expect(cloud.commits).toBe(0);
    const confirmed = await caller.cloudTransfer.send.run({
      ...SESSION,
      transfer_id: review.transfer_id,
      confirm_missing_files: review.missing_files
    });
    expect(confirmed.status).toBe("committed");
    expect(cloud.lastCommit?.missing_files).toMatchObject([{ asset_id: asset.id }]);
  });

  it("deletes on the cloud with the cloud hash the review confirmed (review F40)", async () => {
    const caller = createCaller(makeCtx(USER));
    const first = await caller.cloudTransfer.send.capture({ ...ACCOUNT, project_id: PROJECT });
    if (first.status !== "captured") throw new Error("expected a capture");
    await caller.cloudTransfer.send.run({ ...SESSION, transfer_id: first.transfer_id });
    const [workflow] = await Workflow.listForProjects(USER, [PROJECT]);
    await Workflow.deleteOwned(USER, workflow!.id);

    const review = await caller.cloudTransfer.send.capture({ ...ACCOUNT, project_id: PROJECT });
    if (review.status !== "captured") throw new Error("expected a capture");
    const [deleted] = review.deleted_locally;
    const reviewed = "e".repeat(64);
    const outcome = await caller.cloudTransfer.send.run({
      ...SESSION,
      transfer_id: review.transfer_id,
      confirm_deletes: [{ kind: deleted!.kind, cloud_id: deleted!.cloud_id, cloud_hash: reviewed }]
    });
    expect(outcome.status).toBe("committed");
    expect(cloud.lastCommit?.manifest.operations).toMatchObject([
      { op: "delete_document", document_id: deleted!.cloud_id, base_hash: reviewed, confirmed: true }
    ]);
  });

  it("cancels a send the cloud never opened without calling it, and releases a closed receive (review F41)", async () => {
    const caller = createCaller(makeCtx(USER));
    const review = await caller.cloudTransfer.send.capture({ ...ACCOUNT, project_id: PROJECT });
    if (review.status !== "captured") throw new Error("expected a capture");
    cloud.fail = new CloudRequestError(404, "NOT_FOUND", "Transfer not found");
    expect(await caller.cloudTransfer.send.cancel({ ...SESSION, transfer_id: review.transfer_id })).toEqual({ state: "cancelled" });
    expect(await getCloudSend(review.transfer_id)).toBeNull();
    cloud.fail = null;

    await createCloudLink({ userId: USER, projectId: PROJECT, serverKey: SERVER_KEY, accountId: "account-a", cloudProjectId: PROJECT });
    const set = await caller.cloudTransfer.receive.capture({ ...SESSION, project_id: PROJECT });
    expect(
      await apiCodeOf(caller.cloudTransfer.receive.cancel({ ...SESSION, account_id: "account-b", set_id: set.set_id }))
    ).toBe("NOT_FOUND");
    expect(await caller.cloudTransfer.receive.cancel({ ...SESSION, set_id: set.set_id })).toEqual({ state: "cancelled" });
    expect(cloud.released).toEqual([set.set_id]);
    expect(await getCloudReceive(set.set_id)).toBeNull();
  });
});
