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
import { createCloudLink, getCloudSend, initTestDb, updateCloudSend, Workflow } from "@nodetool-ai/models";
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
  /** The documents the next revision set lists. */
  documents: [] as unknown[]
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
        return {
          set_id: randomBytes(16).toString("hex"),
          project_id: PROJECT,
          documents: cloud.documents,
          expires_at: new Date().toISOString()
        };
      },
      async document() {
        throw new Error("not used");
      },
      async downloadFile() {
        throw new Error("not used");
      },
      async release() {}
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
    cloud.documents = [];
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
    // The sheet names the document each operation sends.
    expect(review.documents).toEqual([
      expect.objectContaining({ kind: "workflow", local_id: review.operations[0]?.document_id })
    ]);
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

  it("names the cloud revision each received document shows", async () => {
    await createCloudLink({ userId: USER, projectId: PROJECT, serverKey: SERVER_KEY, accountId: "account-a", cloudProjectId: PROJECT });
    const hash = "a".repeat(64);
    cloud.documents = [
      {
        kind: "workflow",
        document_id: "d".repeat(32),
        name: "Flow",
        revision_id: "e".repeat(32),
        content_hash: hash,
        files: [],
        missing_files: []
      }
    ];
    const set = await createCaller(makeCtx(USER)).cloudTransfer.receive.capture({ ...SESSION, project_id: PROJECT });
    expect(set.documents).toEqual([
      expect.objectContaining({ cloud_id: "d".repeat(32), content_hash: hash, status: "new", decision: "receive" })
    ]);
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
});
