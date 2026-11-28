/**
 * An owner's demotion or removal of a collaborator holds when that person
 * redeems a link again, and only a current editor (or the owner) deletes a
 * workflow version. Real DB, real models, the real tRPC router.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  ModelObserver,
  WorkflowVersion,
  initTestDb,
  recordSignIn
} from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { forgetPermissions } from "../src/lib/permissions.js";
import { invalidateSharedAssets } from "../src/lib/shared-assets.js";
import { resetUserDirectoryCache } from "../src/lib/user-directory.js";

const createCaller = createCallerFactory(appRouter);

const caller = (userId: string) =>
  createCaller({
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context);

const OWNER = "a".repeat(32);
const GUEST = "b".repeat(32);

const owner = () => caller(OWNER);
const guest = () => caller(GUEST);

async function sharedStoryboard() {
  const board = await owner().storyboards.create({
    name: "Trailer",
    projectId: "default"
  });
  const link = await owner().documentSharing.createLink({
    type: "storyboard",
    id: board.id,
    role: "editor"
  });
  await guest().documentSharing.accept({ token: link.token });
  return { board, link, ref: { type: "storyboard" as const, id: board.id } };
}

async function sharedWorkflow() {
  const wf = await owner().workflows.create({
    name: "W",
    access: "private",
    graph: { nodes: [], edges: [] }
  } as never);
  const link = await owner().workflows.sharing.createLink({
    id: wf.id,
    role: "editor"
  });
  await guest().workflows.sharing.accept({ token: link.token });
  return { wf, link };
}

/** A fresh database with both people in the directory, so they can be invited. */
async function setUp() {
  initTestDb();
  invalidateSharedAssets();
  resetUserDirectoryCache();
  forgetPermissions();
  vi.stubEnv(
    "USERS_FILE",
    join(tmpdir(), `nt-role-limit-${randomBytes(6).toString("hex")}.json`)
  );
  for (const [userId, email] of [
    [OWNER, "owner@example.com"],
    [GUEST, "guest@example.com"]
  ]) {
    await recordSignIn({ userId, email, authSource: "oidc" });
  }
}

function tearDown() {
  vi.unstubAllEnvs();
  ModelObserver.clear();
}

describe("owner's sharing decisions hold against a kept link", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("keeps a demoted collaborator a viewer when they leave and redeem the link again", async () => {
    const { link, ref } = await sharedStoryboard();
    await owner().documentSharing.setRole({
      ...ref,
      user_id: GUEST,
      role: "viewer"
    });

    await guest().documentSharing.removeCollaborator({
      ...ref,
      user_id: GUEST
    });
    const accepted = await guest().documentSharing.accept({
      token: link.token
    });

    expect(accepted.role).toBe("viewer");
    expect((await guest().documentSharing.access(ref)).access?.role).toBe(
      "viewer"
    );
    await expect(
      guest().storyboards.update({ id: ref.id, name: "Mine" })
    ).rejects.toThrow("Storyboard not found");
  });

  it("refuses the link to a collaborator the owner removed", async () => {
    const { link, ref } = await sharedStoryboard();
    await owner().documentSharing.removeCollaborator({
      ...ref,
      user_id: GUEST
    });

    await expect(
      guest().documentSharing.accept({ token: link.token })
    ).rejects.toThrow("Share link is invalid or revoked");
    expect((await guest().documentSharing.access(ref)).access).toBeNull();
  });

  it("lets the owner's new invitation or role change lift the limit", async () => {
    const { link, ref } = await sharedStoryboard();
    await owner().documentSharing.removeCollaborator({
      ...ref,
      user_id: GUEST
    });
    await owner().documentSharing.invite({
      ...ref,
      user_id: GUEST,
      role: "viewer"
    });
    expect(
      (await guest().documentSharing.accept({ token: link.token })).role
    ).toBe("editor");

    await owner().documentSharing.setRole({
      ...ref,
      user_id: GUEST,
      role: "viewer"
    });
    await owner().documentSharing.setRole({
      ...ref,
      user_id: GUEST,
      role: "editor"
    });
    await guest().documentSharing.removeCollaborator({
      ...ref,
      user_id: GUEST
    });
    expect(
      (await guest().documentSharing.accept({ token: link.token })).role
    ).toBe("editor");
  });

  it("sets no limit when a collaborator leaves on their own", async () => {
    const { link, ref } = await sharedStoryboard();
    await guest().documentSharing.removeCollaborator({
      ...ref,
      user_id: GUEST
    });
    expect(
      (await guest().documentSharing.accept({ token: link.token })).role
    ).toBe("editor");
  });

  it("holds a workflow owner's demotion and removal against the link", async () => {
    const { wf, link } = await sharedWorkflow();
    await owner().workflows.sharing.setRole({
      id: wf.id,
      user_id: GUEST,
      role: "viewer"
    });
    await guest().workflows.sharing.removeCollaborator({
      id: wf.id,
      user_id: GUEST
    });
    expect(
      (await guest().workflows.sharing.accept({ token: link.token })).role
    ).toBe("viewer");

    await owner().workflows.sharing.removeCollaborator({
      id: wf.id,
      user_id: GUEST
    });
    await expect(
      guest().workflows.sharing.accept({ token: link.token })
    ).rejects.toThrow("Share link is invalid or revoked");

    await owner().workflows.sharing.invite({
      id: wf.id,
      user_id: GUEST,
      role: "viewer"
    });
    expect(
      (await guest().workflows.sharing.accept({ token: link.token })).role
    ).toBe("editor");
  });
});

describe("workflow version delete", () => {
  beforeEach(setUp);
  afterEach(tearDown);

  it("only a current editor can delete a workflow version", async () => {
    const { wf } = await sharedWorkflow();
    const kept = await guest().workflows.versions.create({
      id: wf.id,
      name: "kept"
    } as never);
    const pruned = await guest().workflows.versions.create({
      id: wf.id,
      name: "pruned"
    } as never);

    // While an editor, the author deletes their own version.
    await expect(
      guest().workflows.versions.delete({
        id: wf.id,
        version_id: pruned.id
      } as never)
    ).resolves.toEqual({ ok: true });

    await owner().workflows.sharing.setRole({
      id: wf.id,
      user_id: GUEST,
      role: "viewer"
    });
    await expect(
      guest().workflows.versions.delete({
        id: wf.id,
        version_id: kept.id
      } as never)
    ).rejects.toThrow("Version not found");

    await owner().workflows.sharing.removeCollaborator({
      id: wf.id,
      user_id: GUEST
    });
    await expect(
      guest().workflows.versions.delete({
        id: wf.id,
        version_id: kept.id
      } as never)
    ).rejects.toThrow("Version not found");

    expect(await WorkflowVersion.get(kept.id)).not.toBeNull();
    await expect(
      owner().workflows.versions.delete({
        id: wf.id,
        version_id: kept.id
      } as never)
    ).resolves.toEqual({ ok: true });
  });
});
