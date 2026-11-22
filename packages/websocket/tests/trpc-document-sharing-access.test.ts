/**
 * documentSharing access control: who may call each procedure.
 *
 * trpc-document-sharing.test.ts covers the role a redeemed link carries into
 * the per-kind routers. This file pins the sharing procedures themselves:
 * only the owner manages a document's links and people, a collaborator can
 * only leave, a share id is honoured only on the document it belongs to, and
 * a token admits its holder to that one document.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  DocumentShare,
  ModelObserver,
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

const caller = (userId: string | null) =>
  createCaller({
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context);

const OWNER = "a".repeat(32);
const EDITOR = "b".repeat(32);
const STRANGER = "c".repeat(32);

const owner = () => caller(OWNER);
const editor = () => caller(EDITOR);
const stranger = () => caller(STRANGER);

async function storyboardOf(userId: string, name = "Trailer") {
  return caller(userId).storyboards.create({ name, projectId: "default" });
}

/** A storyboard of OWNER with EDITOR joined through an editor link. */
async function sharedBoard() {
  const board = await storyboardOf(OWNER);
  const link = await owner().documentSharing.createLink({
    type: "storyboard",
    id: board.id,
    role: "editor"
  });
  await editor().documentSharing.accept({ token: link.token });
  return { board, link, ref: { type: "storyboard" as const, id: board.id } };
}

describe("documentSharing access control", () => {
  beforeEach(async () => {
    initTestDb();
    invalidateSharedAssets();
    resetUserDirectoryCache();
    forgetPermissions();
    vi.stubEnv(
      "USERS_FILE",
      join(tmpdir(), `nt-share-acl-${randomBytes(6).toString("hex")}.json`)
    );
    for (const [userId, email] of [
      [OWNER, "owner@example.com"],
      [EDITOR, "editor@example.com"],
      [STRANGER, "stranger@example.com"]
    ]) {
      await recordSignIn({ userId, email, authSource: "oidc" });
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    ModelObserver.clear();
    forgetPermissions();
    resetUserDirectoryCache();
  });

  it("refuses every procedure without a session", async () => {
    const anonymous = caller(null);
    const ref = { type: "storyboard" as const, id: "x".repeat(32) };
    const calls: Array<() => Promise<unknown>> = [
      () => anonymous.documentSharing.get(ref),
      () => anonymous.documentSharing.createLink({ ...ref, role: "viewer" }),
      () => anonymous.documentSharing.revokeLink({ ...ref, share_id: "s" }),
      () =>
        anonymous.documentSharing.setLinkOptions({
          ...ref,
          share_id: "s",
          options: { allow_download: true }
        }),
      () => anonymous.documentSharing.dismissNotice({ ...ref, share_id: "s" }),
      () =>
        anonymous.documentSharing.invite({
          ...ref,
          user_id: EDITOR,
          role: "viewer"
        }),
      () =>
        anonymous.documentSharing.setInvitationOptions({
          ...ref,
          user_id: EDITOR,
          options: { allow_history: true }
        }),
      () =>
        anonymous.documentSharing.setRole({
          ...ref,
          user_id: EDITOR,
          role: "editor"
        }),
      () =>
        anonymous.documentSharing.removeCollaborator({
          ...ref,
          user_id: EDITOR
        }),
      () => anonymous.documentSharing.accept({ token: "t".repeat(32) }),
      () => anonymous.documentSharing.access(ref),
      () => anonymous.documentSharing.sharedWithMe()
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("keeps link and people management to the owner, even for an editor", async () => {
    const { board, link, ref } = await sharedBoard();
    await DocumentShare.get(link.id).then(async (share) => {
      share!.owner_notice = "Someone joined";
      await share!.save();
    });

    for (const who of [editor(), stranger()]) {
      await expect(who.documentSharing.get(ref)).rejects.toThrow(
        "Document not found"
      );
      await expect(
        who.documentSharing.createLink({ ...ref, role: "editor" })
      ).rejects.toThrow("Document not found");
      await expect(
        who.documentSharing.revokeLink({ ...ref, share_id: link.id })
      ).rejects.toThrow("Document not found");
      await expect(
        who.documentSharing.setLinkOptions({
          ...ref,
          share_id: link.id,
          options: { allow_download: true }
        })
      ).rejects.toThrow("Document not found");
      await expect(
        who.documentSharing.dismissNotice({ ...ref, share_id: link.id })
      ).rejects.toThrow("Document not found");
      await expect(
        who.documentSharing.invite({
          ...ref,
          user_id: STRANGER,
          role: "editor"
        })
      ).rejects.toThrow("Document not found");
      await expect(
        who.documentSharing.setInvitationOptions({
          ...ref,
          user_id: EDITOR,
          options: { allow_history: true }
        })
      ).rejects.toThrow("Document not found");
      await expect(
        who.documentSharing.setRole({ ...ref, user_id: EDITOR, role: "viewer" })
      ).rejects.toThrow("Document not found");
    }

    // Nothing the refused calls asked for took effect.
    const sharing = await owner().documentSharing.get(ref);
    expect(sharing.shares).toEqual([
      expect.objectContaining({
        id: link.id,
        role: "editor",
        disabled_at: null,
        owner_notice: "Someone joined",
        options: {
          allow_history: false,
          allow_download: false,
          allow_duplicate: false
        }
      })
    ]);
    expect(sharing.collaborators).toEqual([
      expect.objectContaining({ user_id: EDITOR, role: "editor" })
    ]);

    // The owner can do each of them.
    await owner().documentSharing.dismissNotice({ ...ref, share_id: link.id });
    await owner().documentSharing.setLinkOptions({
      ...ref,
      share_id: link.id,
      options: { allow_download: true }
    });
    await owner().documentSharing.setRole({
      ...ref,
      user_id: EDITOR,
      role: "viewer"
    });
    await owner().documentSharing.revokeLink({ ...ref, share_id: link.id });
    const after = await owner().documentSharing.get(ref);
    expect(after.shares[0]).toMatchObject({
      owner_notice: null,
      options: { allow_download: true }
    });
    expect(after.shares[0].disabled_at).not.toBeNull();
    expect(after.collaborators[0]).toMatchObject({ role: "viewer" });
    expect((await editor().storyboards.get({ id: board.id })).name).toBe(
      "Trailer"
    );
  });

  it("lets a collaborator leave but not remove anyone else", async () => {
    const { board, ref } = await sharedBoard();
    const viewerLink = await owner().documentSharing.createLink({
      ...ref,
      role: "viewer"
    });
    await stranger().documentSharing.accept({ token: viewerLink.token });

    await expect(
      editor().documentSharing.removeCollaborator({ ...ref, user_id: STRANGER })
    ).rejects.toThrow("Document not found");
    await expect(
      stranger().documentSharing.removeCollaborator({ ...ref, user_id: EDITOR })
    ).rejects.toThrow("Document not found");
    expect((await stranger().storyboards.get({ id: board.id })).id).toBe(
      board.id
    );

    await editor().documentSharing.removeCollaborator({
      ...ref,
      user_id: EDITOR
    });
    await expect(editor().storyboards.get({ id: board.id })).rejects.toThrow(
      "Storyboard not found"
    );
    expect(await editor().documentSharing.access(ref)).toEqual({
      access: null
    });

    await owner().documentSharing.removeCollaborator({
      ...ref,
      user_id: STRANGER
    });
    expect(await stranger().documentSharing.sharedWithMe()).toEqual({
      documents: []
    });
  });

  it("honours a share id only on the document it belongs to", async () => {
    const { link, ref } = await sharedBoard();
    const ownersOther = await storyboardOf(OWNER, "Other");
    const strangersOwn = await storyboardOf(STRANGER, "Mine");

    // The owner naming the right link under the wrong document.
    await expect(
      owner().documentSharing.revokeLink({
        type: "storyboard",
        id: ownersOther.id,
        share_id: link.id
      })
    ).rejects.toThrow("Share not found");
    // The same link under another type of document with the same id.
    await expect(
      owner().documentSharing.revokeLink({
        type: "script",
        id: ref.id,
        share_id: link.id
      })
    ).rejects.toThrow("Document not found");
    // Another user passing ownership with their own document.
    for (const call of [
      () =>
        stranger().documentSharing.revokeLink({
          type: "storyboard",
          id: strangersOwn.id,
          share_id: link.id
        }),
      () =>
        stranger().documentSharing.setLinkOptions({
          type: "storyboard",
          id: strangersOwn.id,
          share_id: link.id,
          options: { allow_download: true, allow_duplicate: true }
        }),
      () =>
        stranger().documentSharing.dismissNotice({
          type: "storyboard",
          id: strangersOwn.id,
          share_id: link.id
        })
    ]) {
      await expect(call()).rejects.toThrow("Share not found");
    }

    const share = await DocumentShare.get(link.id);
    expect(share?.isRevoked).toBe(false);
    expect(share?.allow_download).not.toBe(true);
    expect(share?.allow_duplicate).not.toBe(true);
  });

  it("admits a token holder to that document only", async () => {
    const { board, ref } = await sharedBoard();
    const sibling = await storyboardOf(OWNER, "Sibling");

    expect(await editor().documentSharing.access(ref)).toMatchObject({
      access: { role: "editor" }
    });
    expect(
      await editor().documentSharing.access({
        type: "storyboard",
        id: sibling.id
      })
    ).toEqual({ access: null });
    await expect(editor().storyboards.get({ id: sibling.id })).rejects.toThrow(
      "Storyboard not found"
    );
    expect(await editor().documentSharing.sharedWithMe()).toEqual({
      documents: [
        expect.objectContaining({ id: board.id, owner_id: OWNER, role: "editor" })
      ]
    });
    expect(await stranger().documentSharing.access(ref)).toEqual({
      access: null
    });
    await expect(
      stranger().documentSharing.accept({ token: "not-a-real-token" })
    ).rejects.toThrow("Share link is invalid or revoked");
  });

  it("lets only the owner change an invitation's options", async () => {
    const board = await storyboardOf(OWNER);
    const ref = { type: "storyboard" as const, id: board.id };
    await owner().documentSharing.invite({
      ...ref,
      user_id: EDITOR,
      role: "viewer"
    });

    await expect(
      editor().documentSharing.setInvitationOptions({
        ...ref,
        user_id: EDITOR,
        options: { allow_download: true }
      })
    ).rejects.toThrow("Document not found");
    await expect(
      owner().documentSharing.setInvitationOptions({
        ...ref,
        user_id: STRANGER,
        options: { allow_download: true }
      })
    ).rejects.toThrow("Invitation not found");

    const updated = await owner().documentSharing.setInvitationOptions({
      ...ref,
      user_id: EDITOR,
      options: { allow_download: true }
    });
    expect(updated).toMatchObject({
      user_id: EDITOR,
      role: "viewer",
      options: { allow_download: true }
    });
    expect(await editor().documentSharing.access(ref)).toMatchObject({
      access: { role: "viewer", options: { allow_download: true } }
    });
  });

  it("refuses an invite of the owner or an unknown account", async () => {
    const board = await storyboardOf(OWNER);
    const ref = { type: "storyboard" as const, id: board.id };
    for (const user_id of [OWNER, "d".repeat(32)]) {
      await expect(
        owner().documentSharing.invite({ ...ref, user_id, role: "viewer" })
      ).rejects.toThrow("Person not found");
    }
  });
});
