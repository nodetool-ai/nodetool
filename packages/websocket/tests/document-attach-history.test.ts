/**
 * The attach rule and the history option on every shared kind beside
 * workflows and timelines (document-refs.test.ts covers those): storyboards,
 * scripts, JS scripts, sketches and apps, against a real database through the
 * tRPC routers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  Application,
  Asset,
  DocumentRefs,
  ImageDocument,
  ImageDocumentVersion,
  JsScript,
  JsScriptVersion,
  ModelObserver,
  Script,
  Storyboard,
  initTestDb,
  recordSignIn
} from "@nodetool-ai/models";
import type { RefDocumentKind } from "@nodetool-ai/protocol";

/** The kinds this suite covers, all shared through documentSharing. */
type SharedKind = Exclude<RefDocumentKind, "workflow" | "timeline">;
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import {
  invalidateSharedAssets,
  isAssetIdSharedWithUser
} from "../src/lib/shared-assets.js";
import { forgetPermissions } from "../src/lib/permissions.js";
import { resetUserDirectoryCache } from "../src/lib/user-directory.js";

const createCaller = createCallerFactory(appRouter);

const OWNER = "a".repeat(32);
const GUEST = "b".repeat(32);
const OTHER = "c".repeat(32);

type Caller = ReturnType<typeof callerFor>;

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

async function assetOf(userId: string): Promise<string> {
  const asset = (await Asset.create({
    user_id: userId,
    name: "still.png",
    content_type: "image/png",
    parent_id: userId
  })) as Asset;
  return asset.id;
}

/** The read rule as the storage routes ask it, without the cache. */
async function guestReads(file: string, ownerId = OWNER): Promise<boolean> {
  invalidateSharedAssets();
  return isAssetIdSharedWithUser(GUEST, ownerId, file);
}

async function share(
  type: SharedKind,
  id: string,
  role: "viewer" | "editor"
) {
  const link = await owner().documentSharing.createLink({ type, id, role });
  await guest().documentSharing.accept({ token: link.token });
  return link;
}

function storyboardDocument(entityIds: readonly string[]) {
  return {
    screenplay: null,
    shots: [],
    brief: "",
    style: "",
    entityIds: [...entityIds],
    aspectRatio: "16:9" as const,
    setupStage: "done" as const,
    genre: "",
    directorModel: null,
    imageModel: null,
    videoModel: null
  };
}

function jsScriptDocument(files: readonly string[]) {
  return {
    ...emptyJsScriptDocument(),
    code: files.map((file) => `// /api/storage/${file}.png`).join("\n")
  };
}

function sketchBindings(files: readonly string[]) {
  return files.map((file, i) => ({
    layerId: `l${i}`,
    status: "draft" as const,
    sourceAssetId: file,
    versions: []
  }));
}

/** How a test creates, saves and reads back one kind through its router. */
interface KindDriver {
  kind: SharedKind;
  create(as: Caller): Promise<string>;
  /** A save by `as` whose content names exactly `files`. */
  save(as: Caller, id: string, files: readonly string[]): Promise<unknown>;
  /** The stored row's content, as text. */
  stored(id: string): Promise<string>;
}

const DRIVERS: KindDriver[] = [
  {
    kind: "storyboard",
    create: async (as) =>
      (await as.storyboards.create({ name: "Trailer", projectId: "default" })).id,
    save: (as, id, files) =>
      as.storyboards.update({ id, document: storyboardDocument(files) }),
    stored: async (id) => (await Storyboard.findById(id))!.document
  },
  {
    kind: "script",
    create: async (as) =>
      (await as.scripts.create({ name: "Voiceover", projectId: "default" })).id,
    save: (as, id, files) =>
      as.scripts.update({
        id,
        document: {
          cast: files.map((file, i) => ({ id: `s${i}`, name: `Speaker ${i}`, entityId: file })),
          sections: []
        }
      }),
    stored: async (id) => (await Script.findById(id))!.document
  },
  {
    kind: "jsscript",
    create: async (as) =>
      (await as.jsScripts.create({ name: "Helper", projectId: "default" })).id,
    save: (as, id, files) =>
      as.jsScripts.update({ id, document: jsScriptDocument(files) }),
    stored: async (id) => (await JsScript.findById(id))!.document
  },
  {
    kind: "sketch",
    create: async (as) =>
      (await as.sketch.create({ name: "Poster", projectId: "default", width: 8, height: 8 })).id,
    save: async (as, id, files) => {
      const current = await as.sketch.get({ id });
      return as.sketch.update({
        id,
        document: { ...current.document, layerBindings: sketchBindings(files) }
      });
    },
    stored: async (id) => {
      const row = (await ImageDocument.findById(id))!;
      return `${row.document} ${row.thumbnail_asset_id ?? ""}`;
    }
  },
  {
    kind: "application",
    create: async (as) => (await as.applications.create({ name: "Tool" })).id,
    save: async (as, id, files) => {
      const current = await as.applications.get({ id });
      return as.applications.update({
        id,
        document: {
          ...current.document,
          ui: { ...current.document.ui, root: { props: { assetIds: [...files] } } }
        }
      });
    },
    stored: async (id) => (await Application.findById(id))!.document
  }
];

describe("attach rule and history option on every shared kind", () => {
  beforeEach(async () => {
    initTestDb();
    invalidateSharedAssets();
    resetUserDirectoryCache();
    forgetPermissions();
    vi.stubEnv(
      "USERS_FILE",
      join(tmpdir(), `nt-attach-${randomBytes(6).toString("hex")}.json`)
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

  describe.each(DRIVERS)("attach rule: $kind", (driver) => {
    it("editor cannot attach an owner's asset they cannot read, and nothing is written", async () => {
      const shown = await assetOf(OWNER);
      const hidden = await assetOf(OWNER);
      const id = await driver.create(owner());
      await driver.save(owner(), id, [shown]);
      await share(driver.kind, id, "editor");
      expect(await guestReads(hidden)).toBe(false);

      await expect(driver.save(guest(), id, [shown, hidden])).rejects.toMatchObject({
        code: "FORBIDDEN"
      });

      expect(await driver.stored(id)).not.toContain(hidden);
      expect(await guestReads(hidden)).toBe(false);
    });

    it("editor cannot attach another person's asset", async () => {
      const id = await driver.create(owner());
      await share(driver.kind, id, "editor");
      const foreign = await assetOf(OTHER);

      await expect(driver.save(guest(), id, [foreign])).rejects.toMatchObject({
        code: "FORBIDDEN"
      });
      expect(await DocumentRefs.admitted(driver.kind, id)).toEqual(new Set());
    });

    it("editor attaches an asset they own, which is admitted and shown to the owner's set", async () => {
      const id = await driver.create(owner());
      await share(driver.kind, id, "editor");
      const mine = await assetOf(GUEST);

      await driver.save(guest(), id, [mine]);

      expect(await DocumentRefs.admitted(driver.kind, id)).toEqual(new Set([mine]));
      expect(await driver.stored(id)).toContain(mine);
    });

    it("owner keeps saving files the document already holds", async () => {
      const shown = await assetOf(OWNER);
      const id = await driver.create(owner());
      await driver.save(owner(), id, [shown]);
      await share(driver.kind, id, "editor");

      await expect(driver.save(guest(), id, [shown])).resolves.toBeDefined();
      expect(await driver.stored(id)).toContain(shown);
    });
  });

  describe("attach rule on sketch layer and thumbnail writes", () => {
    async function sharedSketchWithLayer(): Promise<string> {
      const id = await DRIVERS.find((d) => d.kind === "sketch")!.create(owner());
      const row = (await ImageDocument.findById(id))!;
      const data = row.toDocumentData();
      data.layerBindings.push({ layerId: "l1", status: "draft", versions: [] });
      row.document = JSON.stringify(data);
      await row.save();
      await share("sketch", id, "editor");
      return id;
    }

    it("editor cannot append a layer version whose asset they cannot read", async () => {
      const id = await sharedSketchWithLayer();
      const hidden = await assetOf(OWNER);

      await expect(
        guest().sketch.versions.append({
          id,
          layerId: "l1",
          jobId: "job-1",
          assetId: hidden,
          dependencyHash: "h",
          workflowUpdatedAt: new Date().toISOString()
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await ImageDocument.findById(id))!.document).not.toContain(hidden);
      expect(await guestReads(hidden)).toBe(false);
    });

    it("editor appends a layer version with an asset they own", async () => {
      const id = await sharedSketchWithLayer();
      const mine = await assetOf(GUEST);

      await guest().sketch.versions.append({
        id,
        layerId: "l1",
        jobId: "job-1",
        assetId: mine,
        dependencyHash: "h",
        workflowUpdatedAt: new Date().toISOString()
      });
      expect(await DocumentRefs.admitted("sketch", id)).toEqual(new Set([mine]));
    });

    it("editor cannot set a thumbnail they cannot read", async () => {
      const id = await sharedSketchWithLayer();
      const hidden = await assetOf(OWNER);

      await expect(
        guest().sketch.update({ id, thumbnailAssetId: hidden })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await ImageDocument.findById(id))!.thumbnail_asset_id ?? null).not.toBe(hidden);
    });
  });

  describe("attach rule on restore", () => {
    it("editor cannot restore a JS script version holding a file they cannot read", async () => {
      const id = await DRIVERS.find((d) => d.kind === "jsscript")!.create(owner());
      const foreign = await assetOf(OTHER);
      const row = (await JsScript.findById(id))!;
      const version = await JsScriptVersion.snapshot(
        { ...row, document: JSON.stringify(jsScriptDocument([foreign])) } as JsScript,
        { saveType: "manual" }
      );
      await share("jsscript", id, "editor");
      const versionsBefore = (await JsScriptVersion.listForScript(id, { limit: 100 })).length;

      await expect(
        guest().jsScripts.documentVersions.restore({ id, version: version.version })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await JsScript.findById(id))!.document).not.toContain(foreign);
      expect((await JsScriptVersion.listForScript(id, { limit: 100 })).length).toBe(versionsBefore);
    });

    it("editor restores a JS script version holding the owner's files", async () => {
      const id = await DRIVERS.find((d) => d.kind === "jsscript")!.create(owner());
      const old = await assetOf(OWNER);
      await owner().jsScripts.update({ id, document: jsScriptDocument([old]) });
      const version = await owner().jsScripts.documentVersions.create({ id });
      await owner().jsScripts.update({ id, document: jsScriptDocument([]) });
      await share("jsscript", id, "editor");

      await guest().jsScripts.documentVersions.restore({ id, version: version.version });
      expect((await JsScript.findById(id))!.document).toContain(old);
      expect(await guestReads(old)).toBe(true);
    });

    it("editor cannot restore a sketch version holding a file they cannot read", async () => {
      const id = await DRIVERS.find((d) => d.kind === "sketch")!.create(owner());
      const foreign = await assetOf(OTHER);
      const row = (await ImageDocument.findById(id))!;
      const data = row.toDocumentData();
      data.layerBindings = sketchBindings([foreign]);
      const version = await ImageDocumentVersion.snapshot(
        { ...row, document: JSON.stringify(data) } as ImageDocument,
        { saveType: "manual" }
      );
      await share("sketch", id, "editor");
      const versionsBefore = (await ImageDocumentVersion.listForDocument(id, { limit: 100 })).length;

      await expect(
        guest().sketch.documentVersions.restore({ id, version: version.version })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await ImageDocument.findById(id))!.document).not.toContain(foreign);
      expect((await ImageDocumentVersion.listForDocument(id, { limit: 100 })).length).toBe(
        versionsBefore
      );
    });
  });

  describe("history option", () => {
    async function jsScriptWithVersion() {
      const id = await DRIVERS.find((d) => d.kind === "jsscript")!.create(owner());
      const version = await owner().jsScripts.documentVersions.create({ id, name: "draft" });
      return { id, version: version.version };
    }

    async function sketchWithVersion() {
      const id = await DRIVERS.find((d) => d.kind === "sketch")!.create(owner());
      const row = (await ImageDocument.findById(id))!;
      const data = row.toDocumentData();
      data.layerBindings.push({
        layerId: "l1",
        status: "generated",
        versions: [
          {
            id: "v1",
            createdAt: new Date().toISOString(),
            jobId: "job-1",
            assetId: await assetOf(OWNER),
            workflowUpdatedAt: new Date().toISOString(),
            dependencyHash: "h",
            paramOverridesSnapshot: {},
            status: "success"
          }
        ]
      });
      row.document = JSON.stringify(data);
      await row.save();
      const version = await owner().sketch.documentVersions.create({ id, name: "draft" });
      return { id, version: version.version };
    }

    it("viewer without the history option cannot list or read JS script versions", async () => {
      const { id, version } = await jsScriptWithVersion();
      await share("jsscript", id, "viewer");

      await expect(guest().jsScripts.get({ id })).resolves.toBeDefined();
      await expect(guest().jsScripts.documentVersions.list({ id })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
      await expect(guest().jsScripts.documentVersions.get({ id, version })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
    });

    it("viewer with the history option lists and reads JS script versions", async () => {
      const { id, version } = await jsScriptWithVersion();
      const link = await share("jsscript", id, "viewer");
      await owner().documentSharing.setLinkOptions({
        type: "jsscript",
        id,
        share_id: link.id,
        options: { allow_history: true }
      });

      expect((await guest().jsScripts.documentVersions.list({ id })).length).toBeGreaterThan(0);
      expect((await guest().jsScripts.documentVersions.get({ id, version })).version).toBe(version);
    });

    it("editor lists JS script versions without the history option", async () => {
      const { id } = await jsScriptWithVersion();
      await share("jsscript", id, "editor");
      expect((await guest().jsScripts.documentVersions.list({ id })).length).toBeGreaterThan(0);
    });

    it("viewer without the history option cannot list or read sketch versions or layer generations", async () => {
      const { id, version } = await sketchWithVersion();
      await share("sketch", id, "viewer");

      await expect(guest().sketch.get({ id })).resolves.toBeDefined();
      await expect(guest().sketch.documentVersions.list({ id })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
      await expect(guest().sketch.documentVersions.get({ id, version })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
      await expect(guest().sketch.versions.list({ id, layerId: "l1" })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
    });

    it("viewer with the history option lists and reads sketch versions and layer generations", async () => {
      const { id, version } = await sketchWithVersion();
      const link = await share("sketch", id, "viewer");
      await owner().documentSharing.setLinkOptions({
        type: "sketch",
        id,
        share_id: link.id,
        options: { allow_history: true }
      });

      expect((await guest().sketch.documentVersions.list({ id })).length).toBeGreaterThan(0);
      expect((await guest().sketch.documentVersions.get({ id, version })).version).toBe(version);
      expect(await guest().sketch.versions.list({ id, layerId: "l1" })).toHaveLength(1);
    });

    it("editor lists sketch versions and layer generations without the history option", async () => {
      const { id } = await sketchWithVersion();
      await share("sketch", id, "editor");
      expect((await guest().sketch.documentVersions.list({ id })).length).toBeGreaterThan(0);
      expect(await guest().sketch.versions.list({ id, layerId: "l1" })).toHaveLength(1);
    });
  });
});
