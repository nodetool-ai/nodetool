/**
 * Sharing by name and sharing administration on a self-hosted SSO server:
 * finding people, inviting them without a link, and an admin reviewing and
 * taking back what one person shares.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  Workflow,
  WorkflowShare,
  initTestDb,
  recordSignIn,
  setPermissionOverrides,
  updateUserAccount
} from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import { forgetPermissions } from "../src/lib/permissions.js";
import { resetUserDirectoryCache } from "../src/lib/user-directory.js";

const createCaller = createCallerFactory(appRouter);

const ADMIN = "a".repeat(32);
const ADA = "b".repeat(32);
const GRACE = "c".repeat(32);
const LIN = "d".repeat(32);

function callerFor(userId: string) {
  const ctx: Context = {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  };
  return createCaller(ctx);
}

const graph = { nodes: [], edges: [] };

describe("sharing by name", () => {
  beforeEach(async () => {
    initTestDb();
    resetUserDirectoryCache();
    forgetPermissions();
    vi.stubEnv(
      "USERS_FILE",
      join(tmpdir(), `nt-share-${randomBytes(6).toString("hex")}.json`)
    );
    vi.stubEnv("ADMIN_USER_IDS", ADMIN);
    await recordSignIn({ userId: ADMIN, email: "root@example.com", authSource: "oidc" });
    await recordSignIn({
      userId: ADA,
      email: "ada@example.com",
      displayName: "Ada Lovelace",
      authSource: "oidc"
    });
    await recordSignIn({
      userId: GRACE,
      email: "grace@example.com",
      displayName: "Grace Hopper",
      authSource: "oidc"
    });
    await recordSignIn({
      userId: LIN,
      email: "lin@example.com",
      displayName: "Lin Gone",
      authSource: "oidc"
    });
    await updateUserAccount(LIN, { status: "disabled" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    forgetPermissions();
    resetUserDirectoryCache();
  });

  it("finds active people by name or email, never the caller or a disabled account", async () => {
    const ada = callerFor(ADA);
    expect((await ada.people.search({ query: "grace" })).people).toEqual([
      { user_id: GRACE, display_name: "Grace Hopper", email: "grace@example.com" }
    ]);
    const all = await ada.people.search({ query: "example.com" });
    expect(all.people.map((person) => person.user_id).sort()).toEqual([ADMIN, GRACE].sort());
  });

  it("needs share_links to search", async () => {
    await setPermissionOverrides(ADA, { share_links: false }, ADMIN);
    forgetPermissions();
    await expect(callerFor(ADA).people.search({ query: "grace" })).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  it("invites a person to a workflow by name and lists them with their name", async () => {
    const ada = callerFor(ADA);
    const workflow = await ada.workflows.create({ name: "Plan", access: "private", graph });
    const invited = await ada.workflows.sharing.invite({
      id: workflow.id,
      user_id: GRACE,
      role: "viewer"
    });
    expect(invited).toMatchObject({
      user_id: GRACE,
      role: "viewer",
      invited_by: ADA,
      display_name: "Grace Hopper",
      email: "grace@example.com"
    });

    // Inviting again sets the role, down as well as up.
    await ada.workflows.sharing.invite({ id: workflow.id, user_id: GRACE, role: "editor" });
    await ada.workflows.sharing.invite({ id: workflow.id, user_id: GRACE, role: "viewer" });
    const { collaborators } = await ada.workflows.sharing.get({ id: workflow.id });
    expect(collaborators).toEqual([
      expect.objectContaining({ user_id: GRACE, role: "viewer", display_name: "Grace Hopper" })
    ]);

    // Grace now opens it.
    expect((await callerFor(GRACE).workflows.get({ id: workflow.id })).id).toBe(workflow.id);
  });

  it("invites a person to a storyboard by name", async () => {
    const ada = callerFor(ADA);
    const board = await ada.storyboards.create({ name: "Trailer", projectId: "default" });
    await expect(
      callerFor(GRACE).storyboards.get({ id: board.id })
    ).rejects.toThrow("Storyboard not found");
    const invited = await ada.documentSharing.invite({
      type: "storyboard",
      id: board.id,
      user_id: GRACE,
      role: "editor"
    });
    expect(invited).toMatchObject({ user_id: GRACE, role: "editor", display_name: "Grace Hopper" });
    expect((await callerFor(GRACE).storyboards.get({ id: board.id })).name).toBe("Trailer");

    const view = await callerFor(ADMIN).admin.sharing.forUser({ user_id: ADA });
    expect(view.granted).toEqual([
      expect.objectContaining({
        role: "editor",
        document: { type: "storyboard", id: board.id, name: "Trailer", owner_id: ADA }
      })
    ]);
    await callerFor(ADMIN).admin.sharing.removeGrant({
      type: "storyboard",
      document_id: board.id,
      user_id: GRACE
    });
    await expect(
      callerFor(GRACE).storyboards.get({ id: board.id })
    ).rejects.toThrow("Storyboard not found");
  });

  it("refuses inviting a disabled account, an unknown id, or the owner", async () => {
    const ada = callerFor(ADA);
    const workflow = await ada.workflows.create({ name: "Plan", access: "private", graph });
    for (const user_id of [LIN, "e".repeat(32), ADA]) {
      await expect(
        ada.workflows.sharing.invite({ id: workflow.id, user_id, role: "viewer" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("lets only the owner invite", async () => {
    const workflow = await callerFor(ADA).workflows.create({
      name: "Plan",
      access: "private",
      graph
    });
    await expect(
      callerFor(GRACE).workflows.sharing.invite({
        id: workflow.id,
        user_id: ADMIN,
        role: "editor"
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  describe("admin review", () => {
    it("shows what one person shares and holds, and takes it back", async () => {
      const ada = callerFor(ADA);
      const plan = await ada.workflows.create({ name: "Plan", access: "public", graph });
      await ada.workflows.sharing.invite({ id: plan.id, user_id: GRACE, role: "editor" });
      const link = await ada.workflows.sharing.createLink({ id: plan.id, role: "viewer" });
      const notes = await callerFor(GRACE).workflows.create({
        name: "Notes",
        access: "private",
        graph
      });
      await callerFor(GRACE).workflows.sharing.invite({
        id: notes.id,
        user_id: ADA,
        role: "viewer"
      });

      const admin = callerFor(ADMIN).admin.sharing;
      const view = await admin.forUser({ user_id: ADA });
      expect(view.links).toEqual([
        expect.objectContaining({
          share_id: link.id,
          role: "viewer",
          document: { type: "workflow", id: plan.id, name: "Plan", owner_id: ADA }
        })
      ]);
      expect(view.granted).toEqual([
        expect.objectContaining({
          person: { user_id: GRACE, display_name: "Grace Hopper", email: "grace@example.com" },
          role: "editor",
          document: expect.objectContaining({ id: plan.id })
        })
      ]);
      expect(view.received).toEqual([
        expect.objectContaining({
          role: "viewer",
          document: { type: "workflow", id: notes.id, name: "Notes", owner_id: GRACE }
        })
      ]);
      expect(view.public_workflows).toEqual([
        { type: "workflow", id: plan.id, name: "Plan", owner_id: ADA }
      ]);

      await admin.revokeLink({ type: "workflow", share_id: link.id });
      expect(((await WorkflowShare.get(link.id)) as WorkflowShare).isRevoked).toBe(true);
      await admin.removeGrant({ type: "workflow", document_id: plan.id, user_id: GRACE });
      await admin.makePrivate({ workflow_id: plan.id });
      expect(((await Workflow.get(plan.id)) as Workflow).access).toBe("private");

      const after = await admin.forUser({ user_id: ADA });
      expect(after).toMatchObject({ links: [], granted: [], public_workflows: [] });
      await expect(
        callerFor(GRACE).workflows.get({ id: plan.id })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("is admin-only", async () => {
      await expect(
        callerFor(ADA).admin.sharing.forUser({ user_id: GRACE })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("answers NOT_FOUND for a link of another kind", async () => {
      const plan = await callerFor(ADA).workflows.create({
        name: "Plan",
        access: "private",
        graph
      });
      const link = await callerFor(ADA).workflows.sharing.createLink({
        id: plan.id,
        role: "viewer"
      });
      await expect(
        callerFor(ADMIN).admin.sharing.revokeLink({ type: "storyboard", share_id: link.id })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
