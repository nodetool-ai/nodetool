/**
 * Exports read a local asset file in place instead of loading it: the
 * timeline zip route streams it into the archive, the storyboard/workflow
 * resolver answers its path, and a project copy copies file to file (or keeps
 * an external asset as an in-place reference). None of them calls the
 * adapter's `retrieve`, and the bytes that come out match the file.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  Asset,
  ModelObserver,
  Project,
  Storyboard,
  TimelineSequence,
  initTestDb,
  type StoryboardDocument
} from "@nodetool-ai/models";
import { FileStorageAdapter, type StorageAdapter } from "@nodetool-ai/storage";

const mocks = vi.hoisted(() => ({ adapter: null as StorageAdapter | null }));
vi.mock("../src/lib/storage.js", async (orig) => ({
  ...(await orig<typeof import("../src/lib/storage.js")>()),
  getAssetAdapter: () => mocks.adapter,
  getTempAdapter: () => mocks.adapter
}));

const timelinesRoutes = (await import("../src/routes/timelines.js")).default;
const { unpackTimelineBundle } = await import("../src/lib/timeline-bundle.js");
const { resolveExportSource, resolveAssetBytesForExport } =
  await import("../src/lib/asset-export.js");
const { copyProjectDocument } =
  await import("../src/lib/project-document-copy.js");
const { lookupExternalAssetPath } =
  await import("../src/lib/external-asset-lookup.js");

const USER_ID = "user-1";

let tmp: string;
let externalFile: string;
/** Larger than one fs read chunk, so the archive is written in pieces. */
const EXTERNAL_BYTES = new Uint8Array(200_000).map((_, i) => (i * 31) % 251);
const MANAGED_BYTES = new Uint8Array([5, 6, 7, 8, 9]);

beforeAll(async () => {
  tmp = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "export-streaming-"))
  );
  externalFile = path.join(tmp, "media", "long take.mp4");
  await fs.mkdir(path.dirname(externalFile), { recursive: true });
  await fs.writeFile(externalFile, EXTERNAL_BYTES);
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

let root: string;
let adapter: FileStorageAdapter;
let retrieve: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  initTestDb();
  root = await fs.mkdtemp(path.join(tmp, "store-"));
  adapter = new FileStorageAdapter(root, {
    externalPathLookup: lookupExternalAssetPath
  });
  retrieve = vi.spyOn(adapter, "retrieve");
  mocks.adapter = adapter;
});

async function externalAsset(projectId = "p1"): Promise<Asset> {
  return (await Asset.create({
    user_id: USER_ID,
    name: "long take.mp4",
    content_type: "video/mp4",
    parent_id: USER_ID,
    project_id: projectId,
    size: EXTERNAL_BYTES.byteLength,
    external_path: externalFile
  })) as Asset;
}

async function managedAsset(projectId = "p1"): Promise<Asset> {
  const asset = (await Asset.create({
    user_id: USER_ID,
    name: "still.png",
    content_type: "image/png",
    parent_id: USER_ID,
    project_id: projectId,
    size: MANAGED_BYTES.byteLength
  })) as Asset;
  await adapter.store(`${USER_ID}/${asset.id}.png`, MANAGED_BYTES);
  return asset;
}

describe("timeline zip export", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = Fastify({ logger: false });
    server.decorateRequest("userId", null);
    server.addHook("onRequest", async (req) => {
      req.userId = USER_ID;
    });
    await server.register(timelinesRoutes, { apiOptions: {} });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    ModelObserver.clear();
  });

  it("streams local files into the zip without reading them into memory", async () => {
    const video = await externalAsset();
    const still = await managedAsset();
    const seq = new TimelineSequence({
      user_id: USER_ID,
      project_id: "p1",
      name: "Long Cut",
      fps: 30,
      width: 1920,
      height: 1080
    });
    const clip = (id: string, assetId: string, mediaType: string) => ({
      id,
      trackId: "t1",
      name: id,
      startMs: 0,
      durationMs: 1000,
      mediaType,
      sourceType: "generated",
      status: "generated",
      locked: false,
      versions: [],
      currentAssetId: assetId
    });
    seq.fromDocument({
      tracks: [
        {
          id: "t1",
          name: "V1",
          type: "video",
          index: 0,
          visible: true,
          locked: false
        }
      ],
      clips: [clip("c1", video.id, "video"), clip("c2", still.id, "image")],
      markers: [],
      transcript: []
    } as never);
    await seq.save();

    const res = await server.inject({
      url: `/api/timelines/${seq.id}/export-zip`
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    // Streamed: the length is not known up front.
    expect(res.headers["content-length"]).toBeUndefined();
    const bundle = unpackTimelineBundle(new Uint8Array(res.rawPayload));
    expect(bundle.manifest.missing_assets).toEqual([]);
    const byId = new Map(
      bundle.manifest.assets.map((a) => [a.asset_id, a] as const)
    );
    const videoEntry = byId.get(video.id)!;
    expect(videoEntry.bytes).toBe(EXTERNAL_BYTES.byteLength);
    expect(bundle.assets.get(videoEntry.file.slice("assets/".length))).toEqual(
      EXTERNAL_BYTES
    );
    const stillEntry = byId.get(still.id)!;
    expect(bundle.assets.get(stillEntry.file.slice("assets/".length))).toEqual(
      MANAGED_BYTES
    );
    expect(retrieve).not.toHaveBeenCalled();
  });
});

describe("resolveExportSource", () => {
  it("answers an external asset's file by path", async () => {
    const video = await externalAsset();
    expect(await resolveExportSource(`asset://${video.id}.mp4`)).toEqual({
      path: externalFile,
      size: EXTERNAL_BYTES.byteLength
    });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("answers a managed file and a storage URL by path", async () => {
    const still = await managedAsset();
    const expected = {
      path: path.join(root, USER_ID, `${still.id}.png`),
      size: MANAGED_BYTES.byteLength
    };
    expect(await resolveExportSource(`asset://${still.id}`)).toEqual(expected);
    expect(
      await resolveExportSource(`/api/storage/${USER_ID}/${still.id}.png`)
    ).toEqual(expected);
    expect(retrieve).not.toHaveBeenCalled();
    // The workflow bundle still gets bytes, read from the same file.
    expect(await resolveAssetBytesForExport(`asset://${still.id}`)).toEqual(
      MANAGED_BYTES
    );
  });
});

describe("copyProjectDocument with a local store", () => {
  const boardDocument = (entityIds: string[]): StoryboardDocument => ({
    screenplay: null,
    shots: [],
    brief: "",
    style: "",
    entityIds,
    aspectRatio: "16:9",
    setupStage: "done",
    genre: "",
    directorModel: null,
    imageModel: null,
    videoModel: null
  });

  it("copies a managed file on disk and keeps an external asset in place", async () => {
    await Project.create<Project>({ id: "src", user_id: USER_ID, name: "S" });
    await Project.create<Project>({ id: "dst", user_id: USER_ID, name: "D" });
    const still = await managedAsset("src");
    const video = await externalAsset("src");
    const board = new Storyboard({
      user_id: USER_ID,
      project_id: "src",
      name: "Board",
      document: JSON.stringify(boardDocument([still.id, video.id]))
    });
    await board.save();

    const copied = await copyProjectDocument({
      userId: USER_ID,
      type: "storyboard",
      id: board.id,
      destinationProjectId: "dst",
      storage: adapter
    });

    expect(copied.copiedAssets).toBe(2);
    const [stillCopyId, videoCopyId] = (await Storyboard.findById(
      copied.id
    ))!.toDocument().entityIds;
    const stillCopy = (await Asset.find(USER_ID, stillCopyId))!;
    expect(stillCopy.size).toBe(MANAGED_BYTES.byteLength);
    expect(
      new Uint8Array(
        await fs.readFile(path.join(root, USER_ID, `${stillCopyId}.png`))
      )
    ).toEqual(MANAGED_BYTES);

    const videoCopy = (await Asset.find(USER_ID, videoCopyId))!;
    expect(videoCopy.project_id).toBe("dst");
    expect(videoCopy.external_path).toBe(externalFile);
    // Nothing was copied into the store for the external asset.
    expect(await fs.readdir(path.join(root, USER_ID))).not.toContain(
      `${videoCopyId}.mp4`
    );
    expect(retrieve).not.toHaveBeenCalled();
  });
});
