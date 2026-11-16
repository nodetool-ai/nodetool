/**
 * Agent tools never store a reference across projects (PRD D10). An asset of
 * another project, Personal included, that a tool writes into a document is
 * copied into the document's project first, and the tool returns the copy's
 * id in `copied_assets`.
 *
 * Each case asserts the persisted document: every asset it references
 * belongs to the document's project. The cases run against a local project
 * folder and a storage-backed one.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  ImageDocument,
  ModelObserver,
  Storyboard,
  TimelineSequence,
  initTestDb
} from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  createWorkspace,
  setProjectFolderResolver,
  type ProcessingContext,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { decodeSketchLayerData } from "@nodetool-ai/protocol/api-schemas/sketch.js";
import { saveProjectAsset } from "@nodetool-ai/asset-services/project-asset";
import { ProjectAssetStorageAdapter } from "@nodetool-ai/asset-services/project-asset-storage";
import { findAssetReferences } from "@nodetool-ai/asset-services/asset-references";
import { getAssetAdapter } from "@nodetool-ai/asset-services/storage";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

vi.mock("@nodetool-ai/asset-services/storage", () => ({
  getAssetAdapter: vi.fn()
}));

const USER = "u1";
const PERSONAL = "personal:u1";
const PROJECT_A = "project-a";
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);

let root: string;
let rawStore: InMemoryStorageAdapter;
let workspaces: Map<string, Workspace>;

const kinds = {
  local: (projectId: string): Workspace =>
    createLocalWorkspace(join(root, encodeURIComponent(projectId))),
  storage: (projectId: string): Workspace =>
    createWorkspace(rawStore, {
      prefix: `workspaces/${USER}/${encodeURIComponent(projectId)}`
    })
} as const;

const run = () =>
  createCapabilityRun({
    context: { userId: USER } as unknown as ProcessingContext,
    gate: UNGATED
  });

beforeEach(async () => {
  initTestDb();
  root = await mkdtemp(join(tmpdir(), "nodetool-agent-copies-"));
  rawStore = new InMemoryStorageAdapter();
  vi.mocked(getAssetAdapter).mockReturnValue(
    new ProjectAssetStorageAdapter(rawStore)
  );
  workspaces = new Map();
});

afterEach(async () => {
  ModelObserver.clear();
  setProjectFolderResolver(null);
  await rm(root, { recursive: true, force: true });
});

function useFolders(kind: keyof typeof kinds): void {
  setProjectFolderResolver(
    async (projectId): Promise<ProjectFolderResolution> => {
      const id = !projectId || projectId === "default" ? PERSONAL : projectId;
      let workspace = workspaces.get(id);
      if (!workspace) {
        workspace = kinds[kind](id);
        workspaces.set(id, workspace);
      }
      return { ok: true, projectId: id, workspace };
    }
  );
}

function personalImage(name = "fox"): Promise<Asset> {
  return saveProjectAsset({
    projectId: PERSONAL,
    userId: USER,
    name,
    contentType: "image/png",
    bytes: PNG
  });
}

/**
 * The project of every asset `document` references. The document must
 * reference at least one, so an empty check never passes.
 */
async function referencedProjects(document: unknown): Promise<string[]> {
  const ids = [...findAssetReferences(document, ["image"])];
  expect(ids.length).toBeGreaterThan(0);
  const assets = await Asset.findMany(USER, ids);
  expect(assets.map((asset) => asset.id).sort()).toEqual(ids.sort());
  return [...new Set(assets.map((asset) => asset.project_id))];
}

async function importedFiles(): Promise<string[]> {
  const workspace = workspaces.get(PROJECT_A);
  if (!workspace) return [];
  return (await workspace.list("Imported")).map((entry) => entry.name);
}

describe.each(["local", "storage"] as const)(
  "agent tools in project A with %s folders",
  (kind) => {
    beforeEach(() => useFolders(kind));

    it("edit_storyboard stores a copy of a Personal image as a shot's keyframe", async () => {
      const original = await personalImage();
      const board = await Storyboard.create<Storyboard>({
        user_id: USER,
        project_id: PROJECT_A,
        name: "Board",
        document: JSON.stringify({
          shots: [{ type: "shot", id: "s1", index: 0, action: "beat", status: "planned" }]
        })
      });

      const result = (await run().invoke("edit_storyboard", {
        storyboard_id: board.id,
        ops: [{ op: "add_keyframe_version", target: "s1", asset_id: original.id }]
      })) as {
        applied: number;
        ops: Array<{ result?: { asset_id?: string } }>;
        copied_assets?: Array<{ source_asset_id: string; asset_id: string }>;
      };

      expect(result.applied).toBe(1);
      const copyId = result.copied_assets?.[0]?.asset_id;
      expect(result.copied_assets).toEqual([
        { source_asset_id: original.id, asset_id: expect.any(String) }
      ]);
      expect(result.ops[0]?.result?.asset_id).toBe(copyId);
      const stored = (await Storyboard.findById(board.id))?.toDocument();
      expect(stored?.shots[0]?.keyframe).toMatchObject({ asset_id: copyId });
      expect(await referencedProjects(stored)).toEqual([PROJECT_A]);
      expect(await importedFiles()).toEqual(["fox.png"]);
      expect((await Asset.find(USER, original.id))?.project_id).toBe(PERSONAL);
    });

    it("set_timeline_document stores a copy of a Personal image on a clip", async () => {
      const original = await personalImage();
      const sequence = await TimelineSequence.create<TimelineSequence>({
        user_id: USER,
        project_id: PROJECT_A,
        name: "Cut",
        fps: 30,
        width: 1920,
        height: 1080,
        duration_ms: 2000,
        document: JSON.stringify({ tracks: [], clips: [], markers: [] })
      });

      const result = (await run().invoke("set_timeline_document", {
        timeline_id: sequence.id,
        document: {
          tracks: [
            { id: "t1", name: "Video 1", type: "video", index: 0, visible: true, locked: false }
          ],
          clips: [
            {
              id: "c1",
              trackId: "t1",
              name: "Still",
              startMs: 0,
              durationMs: 2000,
              mediaType: "image",
              sourceType: "imported",
              status: "generated",
              locked: false,
              currentAssetId: original.id,
              versions: []
            }
          ],
          markers: []
        }
      })) as {
        written: boolean;
        copied_assets?: Array<{ source_asset_id: string; asset_id: string }>;
      };

      expect(result.written).toBe(true);
      const copyId = result.copied_assets?.[0]?.asset_id;
      expect(copyId).toBeDefined();
      expect(copyId).not.toBe(original.id);
      const stored = (await TimelineSequence.findById(sequence.id))?.toDocument();
      expect(stored?.clips[0]?.currentAssetId).toBe(copyId);
      expect(await referencedProjects(stored)).toEqual([PROJECT_A]);
    });

    it("edit_timeline places a copy of a Personal image and reuses it for a second clip", async () => {
      const original = await personalImage();
      const sequence = await TimelineSequence.create<TimelineSequence>({
        user_id: USER,
        project_id: PROJECT_A,
        name: "Cut",
        fps: 30,
        width: 1920,
        height: 1080,
        duration_ms: 0,
        document: JSON.stringify({
          tracks: [
            { id: "t1", name: "Video 1", type: "video", index: 0, visible: true, locked: false }
          ],
          clips: [],
          markers: []
        })
      });

      const result = (await run().invoke("edit_timeline", {
        timeline_id: sequence.id,
        ops: [
          { op: "add_media_clip", asset: `asset://${original.id}.png`, durationMs: 1000 },
          { op: "add_media_clip", asset: original.id, durationMs: 1000 }
        ]
      })) as {
        applied: number;
        failed: number;
        copied_assets?: Array<{ source_asset_id: string; asset_id: string }>;
      };

      expect(result).toMatchObject({ applied: 2, failed: 0 });
      expect(result.copied_assets).toHaveLength(1);
      const copyId = result.copied_assets?.[0]?.asset_id;
      const stored = (await TimelineSequence.findById(sequence.id))?.toDocument();
      expect(stored?.clips.map((clip) => clip.currentAssetId)).toEqual([
        copyId,
        copyId
      ]);
      expect(await referencedProjects(stored)).toEqual([PROJECT_A]);
      expect(await importedFiles()).toEqual(["fox.png"]);
    });

    it("edit_sketch places a copy of a Personal image as a layer", async () => {
      const original = await personalImage();
      const created = (await run().invoke("create_sketch", {
        name: "Poster",
        width: 64,
        height: 64,
        project_id: PROJECT_A
      })) as { image_document_id: string };

      const result = (await run().invoke("edit_sketch", {
        image_document_id: created.image_document_id,
        ops: [{ op: "add_layer", name: "Photo", image: original.id }]
      })) as {
        applied: number;
        copied_assets?: Array<{ source_asset_id: string; asset_id: string }>;
      };

      expect(result.applied).toBe(1);
      expect(result.copied_assets).toEqual([
        { source_asset_id: original.id, asset_id: expect.any(String) }
      ]);
      const stored = await ImageDocument.findById(created.image_document_id);
      const document = JSON.parse(stored?.document ?? "null") as {
        sketch: { layers: Array<{ data: string | null }> };
      };
      // A layer stores its image inside its encoded data.
      const images = document.sketch.layers
        .map((layer) => decodeSketchLayerData(layer.data, 64, 64).image)
        .filter((image): image is string => image !== null);
      expect(images).toEqual([`asset://${result.copied_assets?.[0]?.asset_id}`]);
      expect(await referencedProjects(images)).toEqual([PROJECT_A]);
    });

    it("stores an asset of the document's own project as it is", async () => {
      const own = await saveProjectAsset({
        projectId: PROJECT_A,
        userId: USER,
        name: "own",
        contentType: "image/png",
        bytes: PNG
      });
      const board = await Storyboard.create<Storyboard>({
        user_id: USER,
        project_id: PROJECT_A,
        name: "Board",
        document: JSON.stringify({
          shots: [{ type: "shot", id: "s1", index: 0, action: "beat", status: "planned" }]
        })
      });

      const result = (await run().invoke("edit_storyboard", {
        storyboard_id: board.id,
        ops: [{ op: "add_keyframe_version", target: "s1", asset_id: own.id }]
      })) as Record<string, unknown>;

      expect(result).not.toHaveProperty("copied_assets");
      const stored = (await Storyboard.findById(board.id))?.toDocument();
      expect(stored?.shots[0]?.keyframe).toMatchObject({ asset_id: own.id });
      expect(await importedFiles()).toEqual([]);
    });
  }
);
