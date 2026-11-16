/**
 * Reference sets, the read rule and the attach rule (WP1.4, WP1.5), against a
 * real database through the tRPC routers.
 *
 * Timelines carry their files as `asset://` locators in marker notes, which
 * the timeline schema keeps and `refsOf` reads like any other field.
 *
 * Router suites that mock `@nodetool-ai/models` stub this module; the rules
 * themselves are covered here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  Asset,
  DocumentRefs,
  ModelObserver,
  TimelineSequence,
  initTestDb,
  recordSignIn
} from "@nodetool-ai/models";
import type { AccessGrantItem } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import {
  combineGrants,
  effectiveAccess,
  invalidateSharedAssets,
  isAssetIdSharedWithUser
} from "../src/lib/document-access.js";
import { forgetPermissions } from "../src/lib/permissions.js";
import { resetUserDirectoryCache } from "../src/lib/user-directory.js";

const createCaller = createCallerFactory(appRouter);

const OWNER = "a".repeat(32);
const GUEST = "b".repeat(32);
const OTHER = "c".repeat(32);

function callerFor(userId: string) {
  return createCaller({
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context);
}

const owner = () => callerFor(OWNER);
const guest = () => callerFor(GUEST);
const other = () => callerFor(OTHER);

async function assetOf(userId: string): Promise<string> {
  const asset = (await Asset.create({
    user_id: userId,
    name: "still.png",
    content_type: "image/png",
    parent_id: userId
  })) as Asset;
  return asset.id;
}

function markers(files: readonly string[]) {
  return files.map((file, i) => ({
    id: `m${i}`,
    timeMs: i * 1000,
    label: `Shot ${i}`,
    note: `asset://${file}.png`
  }));
}

async function timelineOf(
  as: ReturnType<typeof callerFor>,
  files: readonly string[]
) {
  const seq = await as.timeline.create({ name: "Cut", projectId: "default" });
  await as.timeline.update({ id: seq.id, document: { tracks: [], clips: [], markers: markers(files) } });
  return seq;
}

async function shareTimeline(
  as: ReturnType<typeof callerFor>,
  id: string,
  role: "viewer" | "editor",
  redeemer: ReturnType<typeof callerFor>
) {
  const link = await as.documentSharing.createLink({ type: "timeline", id, role });
  await redeemer.documentSharing.accept({ token: link.token });
  return link;
}

/** The read rule as the storage routes ask it, without the cache. */
async function guestReads(file: string, ownerId = OWNER): Promise<boolean> {
  invalidateSharedAssets();
  return isAssetIdSharedWithUser(GUEST, ownerId, file);
}

describe("reference sets and file authorization", () => {
  beforeEach(async () => {
    initTestDb();
    invalidateSharedAssets();
    resetUserDirectoryCache();
    forgetPermissions();
    vi.stubEnv(
      "USERS_FILE",
      join(tmpdir(), `nt-refs-${randomBytes(6).toString("hex")}.json`)
    );
    await recordSignIn({ userId: OWNER, email: "owner@example.com", authSource: "oidc" });
    await recordSignIn({ userId: GUEST, email: "guest@example.com", authSource: "oidc" });
    await recordSignIn({ userId: OTHER, email: "other@example.com", authSource: "oidc" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    ModelObserver.clear();
    forgetPermissions();
    resetUserDirectoryCache();
  });

  it("serves a viewer the current files only, and versions once history is on (TC11)", async () => {
    const old = await assetOf(OWNER);
    const current = await assetOf(OWNER);
    const unshared = await assetOf(OWNER);
    const seq = await timelineOf(owner(), [old]);
    await owner().timeline.versions.create({ id: seq.id });
    await owner().timeline.update({
      id: seq.id,
      document: { tracks: [], clips: [], markers: markers([current]) }
    });
    await timelineOf(owner(), [unshared]);
    const link = await shareTimeline(owner(), seq.id, "viewer", guest());

    expect(await guestReads(current)).toBe(true);
    expect(await guestReads(old)).toBe(false);
    expect(await guestReads(unshared)).toBe(false);

    await owner().documentSharing.setLinkOptions({
      type: "timeline",
      id: seq.id,
      share_id: link.id,
      options: { allow_history: true }
    });

    expect(await guestReads(current)).toBe(true);
    expect(await guestReads(old)).toBe(true);
    expect(await guestReads(unshared)).toBe(false);
  });

  it("serves an editor the files of saved versions without the history option", async () => {
    const old = await assetOf(OWNER);
    const seq = await timelineOf(owner(), [old]);
    await owner().timeline.versions.create({ id: seq.id });
    await owner().timeline.update({ id: seq.id, document: { tracks: [], clips: [], markers: [] } });
    await shareTimeline(owner(), seq.id, "editor", guest());

    expect(await guestReads(old)).toBe(true);
  });

  it("stops serving files once the grant is removed", async () => {
    const file = await assetOf(OWNER);
    const seq = await timelineOf(owner(), [file]);
    await shareTimeline(owner(), seq.id, "viewer", guest());
    expect(await guestReads(file)).toBe(true);

    await owner().documentSharing.removeCollaborator({
      type: "timeline",
      id: seq.id,
      user_id: GUEST
    });
    expect(await guestReads(file)).toBe(false);
  });

  it("computes a stale set again after a write that skipped the routers", async () => {
    const first = await assetOf(OWNER);
    const second = await assetOf(OWNER);
    const seq = await timelineOf(owner(), [first]);
    await shareTimeline(owner(), seq.id, "viewer", guest());
    expect(await guestReads(second)).toBe(false);

    const row = (await TimelineSequence.findById(seq.id)) as TimelineSequence;
    const document = JSON.parse(row.document as string) as Record<string, unknown>;
    await TimelineSequence.updateFieldsIfUnchanged(seq.id, row.updated_at, {
      document: JSON.stringify({ ...document, markers: markers([second]) })
    });

    expect(await guestReads(second)).toBe(true);
    expect(await guestReads(first)).toBe(false);
  });

  it("leaves another person's file out of a set unless the attach rule admitted it", async () => {
    const foreign = await assetOf(OTHER);
    const seq = await owner().timeline.create({ name: "Cut", projectId: "default" });
    const row = (await TimelineSequence.findById(seq.id)) as TimelineSequence;
    const document = JSON.parse(row.document as string) as Record<string, unknown>;
    await TimelineSequence.updateFieldsIfUnchanged(seq.id, row.updated_at, {
      document: JSON.stringify({ ...document, markers: markers([foreign]) })
    });
    await shareTimeline(owner(), seq.id, "viewer", guest());

    expect(await guestReads(foreign, OTHER)).toBe(false);
    expect(await DocumentRefs.filesOf("timeline", seq.id, "viewer")).toEqual([]);
  });

  describe("attach rule (TC19)", () => {
    it("lets an editor add a file they own and admits it to the document", async () => {
      const seq = await timelineOf(owner(), []);
      await shareTimeline(owner(), seq.id, "editor", guest());
      const mine = await assetOf(GUEST);

      await guest().timeline.update({
        id: seq.id,
        document: { tracks: [], clips: [], markers: markers([mine]) }
      });

      expect(await DocumentRefs.admitted("timeline", seq.id)).toEqual(
        new Set([mine])
      );
      expect(await DocumentRefs.filesOf("timeline", seq.id, "viewer")).toEqual([
        mine
      ]);
    });

    it("refuses a file the writer cannot read, and writes nothing", async () => {
      const seq = await timelineOf(owner(), []);
      await shareTimeline(owner(), seq.id, "editor", guest());
      const foreign = await assetOf(OTHER);

      await expect(
        guest().timeline.update({
          id: seq.id,
          document: { tracks: [], clips: [], markers: markers([foreign]) }
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      const row = (await TimelineSequence.findById(seq.id)) as TimelineSequence;
      expect(row.document).not.toContain(foreign);
      expect(await DocumentRefs.admitted("timeline", seq.id)).toEqual(new Set());
    });

    it("needs the duplicate option on the document the file is read through", async () => {
      const seq = await timelineOf(owner(), []);
      await shareTimeline(owner(), seq.id, "editor", guest());
      const foreign = await assetOf(OTHER);
      const source = await timelineOf(other(), [foreign]);
      const link = await shareTimeline(other(), source.id, "viewer", guest());

      // The guest can read the file, but may not copy it out.
      expect(await guestReads(foreign, OTHER)).toBe(true);
      await expect(
        guest().timeline.update({
          id: seq.id,
          document: { tracks: [], clips: [], markers: markers([foreign]) }
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      await other().documentSharing.setLinkOptions({
        type: "timeline",
        id: source.id,
        share_id: link.id,
        options: { allow_duplicate: true }
      });
      await guest().timeline.update({
        id: seq.id,
        document: { tracks: [], clips: [], markers: markers([foreign]) }
      });
      expect(await DocumentRefs.admitted("timeline", seq.id)).toEqual(
        new Set([foreign])
      );
    });

    it("lets the owner keep files the document already held", async () => {
      const foreign = await assetOf(OTHER);
      const seq = await owner().timeline.create({ name: "Cut", projectId: "default" });
      const row = (await TimelineSequence.findById(seq.id)) as TimelineSequence;
      const document = JSON.parse(row.document as string) as Record<string, unknown>;
      await TimelineSequence.updateFieldsIfUnchanged(seq.id, row.updated_at, {
        document: JSON.stringify({ ...document, markers: markers([foreign]) })
      });

      // A save that keeps an existing reference adds nothing.
      await owner().timeline.update({
        id: seq.id,
        name: "Recut",
        document: { tracks: [], clips: [], markers: markers([foreign]) }
      });
      expect((await owner().timeline.get({ id: seq.id })).name).toBe("Recut");
    });
  });

  describe("history (AC26)", () => {
    it("hides versions from a viewer until the history option is on", async () => {
      const seq = await timelineOf(owner(), []);
      await owner().timeline.versions.create({ id: seq.id });
      const link = await shareTimeline(owner(), seq.id, "viewer", guest());

      await expect(guest().timeline.versions.list({ id: seq.id })).rejects.toThrow(
        "Timeline sequence not found"
      );

      await owner().documentSharing.setLinkOptions({
        type: "timeline",
        id: seq.id,
        share_id: link.id,
        options: { allow_history: true }
      });
      expect(
        (await guest().timeline.versions.list({ id: seq.id })).length
      ).toBeGreaterThan(0);
    });

    it("shows versions to an editor", async () => {
      const seq = await timelineOf(owner(), []);
      await owner().timeline.versions.create({ id: seq.id });
      await shareTimeline(owner(), seq.id, "editor", guest());
      expect(
        (await guest().timeline.versions.list({ id: seq.id })).length
      ).toBeGreaterThan(0);
    });
  });

  describe("effective access (TC12)", () => {
    it("combines invitations and links and reads link options at each request", async () => {
      const seq = await timelineOf(owner(), []);
      const access = async () =>
        (await guest().documentSharing.access({ type: "timeline", id: seq.id }))
          .access;

      expect(await access()).toBeNull();

      const viewerLink = await shareTimeline(owner(), seq.id, "viewer", guest());
      let now = await access();
      expect(now?.role).toBe("viewer");
      expect(now?.options).toEqual({
        allow_history: false,
        allow_download: false,
        allow_duplicate: false
      });
      expect(now?.grants.map((g) => g.source)).toEqual(["link"]);

      // An option change on the link applies to the next request.
      await owner().documentSharing.setLinkOptions({
        type: "timeline",
        id: seq.id,
        share_id: viewerLink.id,
        options: { allow_download: true }
      });
      now = await access();
      expect(now?.options.allow_download).toBe(true);
      expect(now?.given_by.allow_download).toEqual([0]);

      // An invitation adds its own options (P2).
      await owner().documentSharing.invite({
        type: "timeline",
        id: seq.id,
        user_id: GUEST,
        role: "viewer",
        options: { allow_history: true }
      });
      now = await access();
      expect(now?.role).toBe("viewer");
      expect(now?.grants).toHaveLength(2);
      const invitation = now?.grants.findIndex((g) => g.source === "invitation");
      expect(now?.given_by.allow_history).toEqual([invitation]);
      expect(now?.options).toEqual({
        allow_history: true,
        allow_download: true,
        allow_duplicate: false
      });

      // A disabled link keeps its grant and options (P3).
      await owner().documentSharing.revokeLink({
        type: "timeline",
        id: seq.id,
        share_id: viewerLink.id
      });
      now = await access();
      const linkGrant = now?.grants.find((g) => g.source === "link");
      expect(linkGrant?.link_disabled).toBe(true);
      expect(now?.options.allow_download).toBe(true);

      // An editor link raises the role, and an editor has every option (P1).
      await shareTimeline(owner(), seq.id, "editor", guest());
      now = await access();
      expect(now?.role).toBe("editor");
      expect(now?.options).toEqual({
        allow_history: true,
        allow_download: true,
        allow_duplicate: true
      });
      expect(now?.grants).toHaveLength(3);
    });

    it("gives the owner every option and a stranger nothing", async () => {
      const seq = await timelineOf(owner(), []);
      const mine = await effectiveAccess(OWNER, "timeline", seq.id);
      expect(mine?.role).toBe("owner");
      expect(mine?.grants.map((g) => g.source)).toEqual(["owner"]);
      expect(mine?.options.allow_duplicate).toBe(true);
      expect(await effectiveAccess(OTHER, "timeline", seq.id)).toBeNull();
    });
  });
});

describe("combineGrants", () => {
  const grant = (
    role: AccessGrantItem["role"],
    options: Partial<AccessGrantItem["options"]> = {}
  ): AccessGrantItem => ({
    source: "link",
    grant_id: null,
    share_id: null,
    role,
    options: {
      allow_history: false,
      allow_download: false,
      allow_duplicate: false,
      ...options
    },
    link_disabled: false
  });

  it("returns null without grants", () => {
    expect(combineGrants([])).toBeNull();
  });

  it("takes the highest role and names every grant that gives it", () => {
    const access = combineGrants([
      grant("viewer"),
      grant("editor"),
      grant("editor")
    ]);
    expect(access?.role).toBe("editor");
    expect(access?.given_by.role).toEqual([1, 2]);
  });

  it("turns an option on when any grant does, and names those grants", () => {
    const access = combineGrants([
      grant("viewer", { allow_history: true }),
      grant("viewer", { allow_download: true }),
      grant("viewer")
    ]);
    expect(access?.options).toEqual({
      allow_history: true,
      allow_download: true,
      allow_duplicate: false
    });
    expect(access?.given_by).toMatchObject({
      allow_history: [0],
      allow_download: [1],
      allow_duplicate: []
    });
  });
});
