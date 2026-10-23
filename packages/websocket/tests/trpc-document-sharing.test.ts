/**
 * documentSharing router and the role checks in the per-kind routers.
 *
 * Real DB, real models: an owner mints a link, another user redeems it, and
 * the storyboard, script, timeline, sketch, app and JS script routers answer
 * that user by the role the link carried.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Asset, ModelObserver, initTestDb } from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

const caller = (userId: string) =>
  createCaller({
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context);

const OWNER = "owner-1";
const GUEST = "guest-1";
const STRANGER = "stranger-1";

const owner = () => caller(OWNER);
const guest = () => caller(GUEST);
const stranger = () => caller(STRANGER);

async function shareStoryboard(role: "viewer" | "editor") {
  const board = await owner().storyboards.create({
    name: "Trailer",
    projectId: "default"
  });
  const link = await owner().documentSharing.createLink({
    type: "storyboard",
    id: board.id,
    role
  });
  return { board, link };
}

describe("documentSharing", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("lets a viewer read a storyboard but not save, delete or manage it", async () => {
    const { board, link } = await shareStoryboard("viewer");

    const accepted = await guest().documentSharing.accept({
      token: link.token
    });
    expect(accepted).toMatchObject({
      type: "storyboard",
      id: board.id,
      name: "Trailer",
      owner_id: OWNER,
      role: "viewer"
    });

    expect((await guest().storyboards.get({ id: board.id })).name).toBe(
      "Trailer"
    );
    await expect(
      guest().storyboards.update({ id: board.id, name: "Mine" })
    ).rejects.toThrow("Storyboard not found");
    await expect(guest().storyboards.delete({ id: board.id })).rejects.toThrow(
      "Storyboard not found"
    );
    await expect(
      guest().documentSharing.get({ type: "storyboard", id: board.id })
    ).rejects.toThrow("Document not found");
  });

  it("lets an editor save but not delete", async () => {
    const { board, link } = await shareStoryboard("editor");
    await guest().documentSharing.accept({ token: link.token });

    const updated = await guest().storyboards.update({
      id: board.id,
      name: "Recut"
    });
    expect(updated.name).toBe("Recut");
    await expect(guest().storyboards.delete({ id: board.id })).rejects.toThrow(
      "Storyboard not found"
    );
  });

  it("hides a document from anyone without a grant", async () => {
    const { board } = await shareStoryboard("editor");

    await expect(stranger().storyboards.get({ id: board.id })).rejects.toThrow(
      "Storyboard not found"
    );
  });

  it("lists collaborators for the owner and lets the owner change roles", async () => {
    const { board, link } = await shareStoryboard("viewer");
    await guest().documentSharing.accept({ token: link.token });

    const sharing = await owner().documentSharing.get({
      type: "storyboard",
      id: board.id
    });
    expect(sharing.collaborators).toEqual([
      expect.objectContaining({ user_id: GUEST, role: "viewer" })
    ]);
    expect(sharing.shares).toEqual([
      expect.objectContaining({ token: link.token, role: "viewer" })
    ]);

    await owner().documentSharing.setRole({
      type: "storyboard",
      id: board.id,
      user_id: GUEST,
      role: "editor"
    });
    expect(
      (await guest().storyboards.update({ id: board.id, name: "Edited" })).name
    ).toBe("Edited");
  });

  it("reuses the active link for a role and refuses a revoked one", async () => {
    const { board, link } = await shareStoryboard("viewer");
    const again = await owner().documentSharing.createLink({
      type: "storyboard",
      id: board.id,
      role: "viewer"
    });
    expect(again.token).toBe(link.token);

    await owner().documentSharing.revokeLink({
      type: "storyboard",
      id: board.id,
      share_id: link.id
    });
    await expect(
      guest().documentSharing.accept({ token: link.token })
    ).rejects.toThrow("Share link is invalid or revoked");
    await expect(
      stranger().documentSharing.createLink({
        type: "storyboard",
        id: board.id,
        role: "editor"
      })
    ).rejects.toThrow("Document not found");
  });

  it("lists shared documents and drops them when the grant goes", async () => {
    const { board, link } = await shareStoryboard("viewer");
    await guest().documentSharing.accept({ token: link.token });

    expect((await guest().documentSharing.sharedWithMe()).documents).toEqual([
      expect.objectContaining({ type: "storyboard", id: board.id })
    ]);

    // A collaborator may leave on their own.
    await guest().documentSharing.removeCollaborator({
      type: "storyboard",
      id: board.id,
      user_id: GUEST
    });
    expect((await guest().documentSharing.sharedWithMe()).documents).toEqual(
      []
    );
    await expect(guest().storyboards.get({ id: board.id })).rejects.toThrow(
      "Storyboard not found"
    );
  });

  it("removes grants and links when the owner deletes the document", async () => {
    const { board, link } = await shareStoryboard("viewer");
    await guest().documentSharing.accept({ token: link.token });

    await owner().storyboards.delete({ id: board.id });

    expect((await guest().documentSharing.sharedWithMe()).documents).toEqual(
      []
    );
    await expect(
      guest().documentSharing.accept({ token: link.token })
    ).rejects.toThrow("Share link is invalid or revoked");
  });

  it("does not grant the owner a role on their own document", async () => {
    const { board, link } = await shareStoryboard("viewer");

    await owner().documentSharing.accept({ token: link.token });

    const sharing = await owner().documentSharing.get({
      type: "storyboard",
      id: board.id
    });
    expect(sharing.collaborators).toEqual([]);
  });

  it("shows a collaborator the owner's media the document names, and nothing else", async () => {
    const shown = "a".repeat(32);
    const hidden = "b".repeat(32);
    for (const id of [shown, hidden]) {
      await new Asset({
        id,
        user_id: OWNER,
        project_id: "default",
        parent_id: OWNER,
        name: `${id}.png`,
        content_type: "image/png"
      }).save();
    }
    const { board, link } = await shareStoryboard("viewer");
    await owner().storyboards.update({
      id: board.id,
      document: {
        screenplay: null,
        shots: [],
        brief: "",
        style: "",
        entityIds: [shown],
        aspectRatio: "16:9",
        setupStage: "done",
        genre: "",
        directorModel: null,
        imageModel: null,
        videoModel: null
      }
    });

    await expect(guest().assets.get({ id: shown })).rejects.toThrow(
      "Asset not found"
    );
    await guest().documentSharing.accept({ token: link.token });

    expect((await guest().assets.get({ id: shown })).id).toBe(shown);
    await expect(guest().assets.get({ id: hidden })).rejects.toThrow(
      "Asset not found"
    );
  });

  describe.each([
    {
      type: "script" as const,
      create: () => owner().scripts.create({ name: "Doc" }),
      read: (id: string) => guest().scripts.get({ id }),
      remove: (id: string) => guest().scripts.delete({ id }),
      ownerRemove: (id: string) => owner().scripts.delete({ id })
    },
    {
      type: "timeline" as const,
      create: () =>
        owner().timeline.create({ name: "Doc", projectId: "default" }),
      read: (id: string) => guest().timeline.get({ id }),
      remove: (id: string) => guest().timeline.delete({ id }),
      ownerRemove: (id: string) => owner().timeline.delete({ id })
    },
    {
      type: "sketch" as const,
      create: () =>
        owner().sketch.create({ name: "Doc", projectId: "default" }),
      read: (id: string) => guest().sketch.get({ id }),
      remove: (id: string) => guest().sketch.delete({ id }),
      ownerRemove: (id: string) => owner().sketch.delete({ id })
    },
    {
      type: "jsscript" as const,
      create: () => owner().jsScripts.create({ name: "Doc" }),
      read: (id: string) => guest().jsScripts.get({ id }),
      remove: (id: string) => guest().jsScripts.delete({ id }),
      ownerRemove: (id: string) => owner().jsScripts.delete({ id })
    },
    {
      type: "application" as const,
      create: () => owner().applications.create({ name: "Doc" }),
      read: (id: string) => guest().applications.get({ id }),
      remove: (id: string) => guest().applications.delete({ id }),
      ownerRemove: (id: string) => owner().applications.delete({ id })
    }
  ])("$type", ({ type, create, read, remove, ownerRemove }) => {
    it("opens to a collaborator only after they redeem a link", async () => {
      const document = await create();

      await expect(read(document.id)).rejects.toThrow("not found");

      const link = await owner().documentSharing.createLink({
        type,
        id: document.id,
        role: "viewer"
      });
      await guest().documentSharing.accept({ token: link.token });

      expect((await read(document.id)).name).toBe("Doc");
      await expect(remove(document.id)).rejects.toThrow("not found");

      // The owner's delete takes the grant with it.
      await ownerRemove(document.id);
      expect((await guest().documentSharing.sharedWithMe()).documents).toEqual(
        []
      );
    });
  });
});
