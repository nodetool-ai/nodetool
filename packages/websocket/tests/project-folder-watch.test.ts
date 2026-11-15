/**
 * A project folder stays in step with its asset index while the project is
 * open (PRD D4, T3, T4, US5), through the server's own surfaces: the
 * `set_open_project` command starts and stops the folder watcher, the asset
 * response versions the thumbnail by the file's mtime, a changed video gets
 * its proxy remade, waveform peaks miss their cache, and the folder carries
 * `.nodetool/assets.json`.
 *
 * Cases that touch project files run with project folders as local
 * directories and as key prefixes in the object store the assets live in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  Asset,
  ModelObserver,
  Workspace as WorkspaceRow,
  initTestDb
} from "@nodetool-ai/models";
import {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import type { Workspace } from "@nodetool-ai/runtime";
import { encodeWav, sineSamples } from "@nodetool-ai/runtime/media/testing";

const mocks = vi.hoisted(() => ({
  adapter: null as StorageAdapter | null,
  discardVideoProxy: vi.fn(async () => undefined),
  scheduleVideoProxy: vi.fn()
}));

vi.mock("@nodetool-ai/asset-services/storage", async (orig) => {
  const actual =
    await orig<typeof import("@nodetool-ai/asset-services/storage")>();
  return { ...actual, getAssetAdapter: () => mocks.adapter };
});

vi.mock("../src/lib/video-proxy.js", async (orig) => {
  const actual = await orig<typeof import("../src/lib/video-proxy.js")>();
  return {
    ...actual,
    discardVideoProxy: mocks.discardVideoProxy,
    scheduleVideoProxy: mocks.scheduleVideoProxy
  };
});

import {
  nodetoolDirFromRow,
  setWorkspaceChangeNotifier,
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "@nodetool-ai/execution/service";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { saveProjectAsset } from "@nodetool-ai/asset-services/project-asset";
import { partialContentHash } from "@nodetool-ai/asset-services/project-asset-file";
import {
  flushProjectReconciles,
  reconcileProjectIndex,
  scheduleProjectReconcile
} from "@nodetool-ai/project-services/project-index";
import { projectFolderWatchers } from "@nodetool-ai/project-services/project-watch";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import { isAppSessionCommandAllowed } from "../src/lib/app-session-scope.js";
import { lookupExternalAssetPath } from "../src/lib/external-asset-lookup.js";
import { toAssetResponse } from "../src/lib/asset-response.js";
import { handleAssetPeaks } from "../src/lib/audio-peaks.js";
import { initWorkspaceChangeEvents } from "../src/lib/workflow-workspace.js";
import {
  projectWithFolder,
  useProjectFolders,
  type ProjectFolderFixture
} from "./project-folder-fixture.js";

const USER = "1";
const OTHER_USER = "2";

/** A 1x1 PNG, so the thumbnail generator has a real image. */
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);
const EDITED = Uint8Array.from([...PNG, 4, 2]);

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";

  async accept(): Promise<void> {
    return;
  }

  async receive(): Promise<WebSocketReceiveFrame> {
    return { type: "websocket.disconnect" };
  }

  async sendBytes(): Promise<void> {
    return;
  }

  async sendText(): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const resolveExecutor = () => ({
  async process() {
    return {};
  }
});

let folders: ProjectFolderFixture;
let tmpDir: string;
let storageRoot: string;
let sessions: WebSocketClientSession[];
const savedCacheDir = process.env["NODETOOL_CACHE_DIR"];

async function connect(userId = USER): Promise<WebSocketClientSession> {
  const session = new WebSocketClientSession({ resolveExecutor });
  await session.connect(new MockWebSocket(), userId);
  sessions.push(session);
  return session;
}

function openProject(
  session: WebSocketClientSession,
  projectId: unknown
): Promise<Record<string, unknown> | null> {
  return session.handleCommand({
    command: "set_open_project",
    data: { project_id: projectId }
  });
}

/** The project's folder, unobserved: writes through it are another app's. */
function folderOf(row: WorkspaceRow): Workspace {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return workspace;
}

async function reload(asset: Asset): Promise<Asset> {
  const found = await Asset.find(USER, asset.id);
  if (!found) throw new Error(`asset ${asset.id} is gone`);
  return found;
}

function save(
  projectId: string,
  name: string,
  contentType: string,
  bytes: Uint8Array
): Promise<Asset> {
  return saveProjectAsset({ projectId, userId: USER, name, contentType, bytes });
}

async function until(
  what: string,
  timeoutMs: number,
  check: () => Promise<boolean>
): Promise<void> {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function useLocalFolders(): void {
  vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", "local");
  mocks.adapter = new FileStorageAdapter(storageRoot, {
    externalPathLookup: lookupExternalAssetPath
  });
  setWorkspaceCloudStorage(null);
}

function useCloudFolders(): void {
  vi.stubEnv("NODETOOL_WORKSPACE_STORAGE", "cloud");
  const adapter = new ProjectAssetStorageAdapter(new InMemoryStorageAdapter());
  mocks.adapter = adapter;
  setWorkspaceCloudStorage(adapter);
}

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER, OTHER_USER]);
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "project-watch-"))
  );
  storageRoot = path.join(tmpDir, "storage");
  sessions = [];
  process.env["NODETOOL_CACHE_DIR"] = path.join(tmpDir, "cache");
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_STORAGE_BACKEND", "file");
  mocks.discardVideoProxy.mockClear();
  mocks.scheduleVideoProxy.mockClear();
});

afterEach(async () => {
  for (const session of sessions) await session.disconnect();
  projectFolderWatchers.closeAll();
  await flushProjectReconciles();
  if (savedCacheDir === undefined) delete process.env["NODETOOL_CACHE_DIR"];
  else process.env["NODETOOL_CACHE_DIR"] = savedCacheDir;
  vi.unstubAllEnvs();
  ModelObserver.clear();
  setWorkspaceChangeNotifier(null);
  setWorkspaceCloudStorage(null);
  mocks.adapter = null;
  await folders.cleanup();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("set_open_project", () => {
  it("watches the folder of the project a connection has open, and stops when the connection closes", async () => {
    useLocalFolders();
    const { project, folder } = await projectWithFolder(USER, "Film");
    const asset = await save(project.id, "fox", "image/png", PNG);
    const session = await connect();
    expect(projectFolderWatchers.watching).toBe(0);

    const reply = await openProject(session, project.id);

    expect(reply).toEqual({
      message: "Open project set",
      project_id: project.id
    });
    expect(projectFolderWatchers.isWatching(project.id, USER)).toBe(true);
    await flushProjectReconciles();

    // Another app saves over the file. The asset follows within seconds.
    await fs.writeFile(path.join(folder.path, "Generated", "fox.png"), EDITED);
    await until("the changed file to be indexed", 5_000, async () => {
      const row = await reload(asset);
      return row.metadata?.["workspace_hash"] === partialContentHash(EDITED);
    });
    expect((await Asset.listProjectFiles(USER, project.id)).map((row) => row.id)).toEqual([
      asset.id
    ]);

    await session.disconnect();
    expect(projectFolderWatchers.isWatching(project.id, USER)).toBe(false);
    expect(projectFolderWatchers.watching).toBe(0);
  }, 30_000);

  it("keeps watching while another connection has the project open", async () => {
    useLocalFolders();
    const { project } = await projectWithFolder(USER, "Film");
    const first = await connect();
    const second = await connect();
    await openProject(first, project.id);
    await openProject(second, project.id);

    await first.disconnect();
    expect(projectFolderWatchers.isWatching(project.id, USER)).toBe(true);

    await openProject(second, null);
    expect(projectFolderWatchers.isWatching(project.id, USER)).toBe(false);
  });

  it("moves the watcher when the connection opens another project", async () => {
    useLocalFolders();
    const film = await projectWithFolder(USER, "Film");
    const series = await projectWithFolder(USER, "Series");
    const session = await connect();

    await openProject(session, film.project.id);
    await openProject(session, series.project.id);

    expect(projectFolderWatchers.isWatching(film.project.id, USER)).toBe(false);
    expect(projectFolderWatchers.isWatching(series.project.id, USER)).toBe(true);
    expect(projectFolderWatchers.watching).toBe(1);
  });

  it("starts no watcher for a cloud folder, and still reconciles it on open", async () => {
    useCloudFolders();
    const { project, folder } = await projectWithFolder(USER, "Film");
    await folderOf(folder).write("art/fox.png", PNG);
    const session = await connect();

    const reply = await openProject(session, project.id);

    expect(reply).toMatchObject({ project_id: project.id });
    expect(projectFolderWatchers.isWatching(project.id, USER)).toBe(false);
    expect(projectFolderWatchers.watching).toBe(0);
    await flushProjectReconciles();
    expect(
      (await Asset.listProjectFiles(USER, project.id)).map((row) => row.workspace_path)
    ).toEqual(["art/fox.png"]);
  });

  it("starts no watcher for another user's project", async () => {
    useLocalFolders();
    const { project } = await projectWithFolder(OTHER_USER, "Theirs");
    const session = await connect(USER);

    await openProject(session, project.id);

    expect(projectFolderWatchers.watching).toBe(0);
  });

  it.each([[undefined], [""], [7], [{}]])(
    "refuses project_id %j",
    async (projectId) => {
      useLocalFolders();
      const session = await connect();
      expect(await openProject(session, projectId)).toEqual({
        error: "project_id must be a project id or null"
      });
      expect(projectFolderWatchers.watching).toBe(0);
    }
  );

  it("is not available to a published app's visitor", () => {
    expect(isAppSessionCommandAllowed("set_open_project")).toBe(false);
  });
});

describe.each(["local", "cloud"] as const)(
  "what a changed project file invalidates (%s)",
  (mode) => {
    beforeEach(() => {
      if (mode === "local") useLocalFolders();
      else useCloudFolders();
    });

    it("the thumbnail URL carries the file's mtime, so a changed file gets a new one", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const asset = await save(project.id, "fox", "image/png", PNG);
      const before = await toAssetResponse(asset);
      const mtime = asset.metadata?.["workspace_mtime"];
      expect(typeof mtime).toBe("number");
      expect(before.thumb_url).toMatch(
        new RegExp(`\\?v=${Math.trunc(mtime as number)}$`)
      );

      await new Promise((resolve) => setTimeout(resolve, 20));
      await folderOf(folder).write("Generated/fox.png", EDITED);
      await reconcileProjectIndex(project.id, USER);

      const after = await toAssetResponse(await reload(asset));
      expect(after.id).toBe(asset.id);
      expect(after.thumb_url).not.toBe(before.thumb_url);
      expect(after.thumb_url).toMatch(
        new RegExp(
          `\\?v=${Math.trunc((await reload(asset)).metadata?.["workspace_mtime"] as number)}$`
        )
      );
    });

    it("remakes the proxy of a changed video, and of nothing else", async () => {
      initWorkspaceChangeEvents();
      const { project, folder } = await projectWithFolder(USER, "Film");
      const video = await save(project.id, "take", "video/mp4", PNG);
      await save(project.id, "still", "image/png", PNG);
      await save(project.id, "untouched", "video/mp4", PNG);
      const workspace = folderOf(folder);
      await workspace.write("Generated/take.mp4", EDITED);
      await workspace.write("Generated/still.png", EDITED);

      await reconcileProjectIndex(project.id, USER);

      expect(mocks.discardVideoProxy.mock.calls.map(([asset]) => asset.id)).toEqual([
        video.id
      ]);
      expect(mocks.scheduleVideoProxy.mock.calls.map(([asset]) => asset.id)).toEqual([
        video.id
      ]);
      // The stale proxy is removed before the new one is queued.
      expect(mocks.discardVideoProxy.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.scheduleVideoProxy.mock.invocationCallOrder[0]!
      );
    });

    it("waveform peaks of a changed audio file are computed again", async () => {
      const tone = (frequency: number): Uint8Array =>
        new Uint8Array(
          encodeWav(
            sineSamples({
              sampleRate: 8000,
              channels: 1,
              durationSec: 1,
              frequency,
              amplitude: frequency === 440 ? 1 : 0.25
            }),
            8000,
            1
          )
        );
      const { project, folder } = await projectWithFolder(USER, "Film");
      const asset = await save(project.id, "tone", "audio/wav", tone(440));
      const query = new URLSearchParams("count=10");

      const first = await handleAssetPeaks(USER, asset.id, query);
      expect(first.status).toBe(200);
      expect(first.headers.get("x-peaks-cache")).toBe("miss");
      const loud = (await first.json()) as { peaks: number[] };
      const cached = await handleAssetPeaks(USER, asset.id, query);
      expect(cached.headers.get("x-peaks-cache")).toBe("hit");

      await new Promise((resolve) => setTimeout(resolve, 20));
      await folderOf(folder).write("Generated/tone.wav", tone(220));
      await reconcileProjectIndex(project.id, USER);

      const again = await handleAssetPeaks(USER, asset.id, query);
      expect(again.headers.get("x-peaks-cache")).toBe("miss");
      const quiet = (await again.json()) as { peaks: number[] };
      expect(Math.max(...quiet.peaks)).toBeLessThan(Math.max(...loud.peaks) / 2);
    }, 60_000);
  }
);

describe.each(["local", "cloud"] as const)(
  "the asset manifest in the project folder (%s)",
  (mode) => {
    beforeEach(() => {
      if (mode === "local") useLocalFolders();
      else useCloudFolders();
    });

    it("is written next to the project manifest after a reconcile, and lists every indexed asset", async () => {
      const { project, folder } = await projectWithFolder(USER, "Film");
      const saved = await save(project.id, "fox", "image/png", PNG);
      await folderOf(folder).write("art/added.png", EDITED);

      scheduleProjectReconcile(project.id, USER);
      await flushProjectReconciles();

      const rows = await Asset.listProjectFiles(USER, project.id);
      expect(rows).toHaveLength(2);
      const nodetoolDir = nodetoolDirFromRow(folder);
      expect(await nodetoolDir!.exists("project.json")).toBe(true);
      const manifest = JSON.parse(
        (await nodetoolDir!.readText("assets.json"))!
      ) as { assets: Array<{ id: string; path: string }> };
      expect(manifest.assets.map((entry) => entry.path)).toEqual([
        "Generated/fox.png",
        "art/added.png"
      ]);
      expect(manifest.assets.map((entry) => entry.id).sort()).toEqual(
        rows.map((row) => row.id).sort()
      );
      expect(manifest.assets[0]).toMatchObject({
        id: saved.id,
        size: PNG.byteLength,
        partial_hash: partialContentHash(PNG)
      });
      // The manifest is no asset and no file of the project.
      expect(
        (await folderOf(folder).list("", { recursive: true })).map((entry) => entry.path).sort()
      ).toEqual(["Generated/fox.png", "art/added.png"]);
    });
  }
);
