/**
 * @jest-environment jsdom
 *
 * SQ43 Step Pattern Library Folder Operations — Browser library functions & web agent tools.
 */
import { renderHook } from "@testing-library/react";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  STEP_PATTERN_ASSET_CONTENT_TYPE,
  isWithinStepPatternFolder,
  makeClip,
  makeTrack,
  parentStepPatternFolder,
  patternFromText,
  remapStepPatternFolderPath,
  stepPatternFolderName
} from "@nodetool-ai/timeline";
import {
  collectStepPatternFolders,
  resolveRenameStepPatternFolderTarget,
  resolveStepPatternFolderRef
} from "@nodetool-ai/timeline/ops";
import {
  FrontendToolRegistry,
  type FrontendToolState
} from "../../../lib/tools/frontendTools";
import "../../../lib/tools/builtin/timeline";
import {
  createTimelineStore,
  timelineTemporalOf,
  type TimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import {
  createTimelineUIStore,
  type TimelineUIStoreApi
} from "../../../stores/timeline/TimelineUIStore";
import {
  createTimelinePlaybackStore,
  type TimelinePlaybackStoreApi
} from "../../../stores/timeline/TimelinePlaybackStore";
import { useAssetStore } from "../../../stores/AssetStore";
import {
  mockTimelineStepPatternFolderDelete,
  mockTimelineStepPatternFolderRename
} from "../../../__mocks__/trpcClientMock";
import {
  createBrowserStepPatternLibrary,
  useTimelineAgentBridge
} from "../useTimelineAgentBridge";

let mockDoc: TimelineStoreApi;
let mockUi: TimelineUIStoreApi;
let mockPlayback: TimelinePlaybackStoreApi;

jest.mock("../../../stores/timeline/TimelineStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelineStore"),
  useTimelineStoreApi: () => mockDoc
}));
jest.mock("../../../stores/timeline/TimelineUIStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelineUIStore"),
  useTimelineUIStoreApi: () => mockUi
}));
jest.mock("../../../stores/timeline/TimelinePlaybackStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelinePlaybackStore"),
  useTimelinePlaybackStoreApi: () => mockPlayback
}));
jest.mock("../useTimelineDirectGenJob", () => ({
  ...jest.requireActual("../useTimelineDirectGenJob"),
  useTimelineDirectGenJob: () => ({
    start: jest.fn(),
    startEdit: jest.fn()
  })
}));
jest.mock("../useModel3DBake", () => ({
  ...jest.requireActual("../useModel3DBake"),
  useModel3DBake: () => ({ bakeClip: jest.fn() })
}));

const SEQ_ID = "seq-sq43-folders";
const toolCtx = {
  getState: () => ({}) as FrontendToolState,
  abortSignal: new AbortController().signal
};

interface MockAssetRow {
  id: string;
  name: string;
  content_type: string;
  get_url: string;
  project_id?: string;
  parent_id?: string;
  metadata?: Record<string, unknown>;
}

function readFileText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function installMockAssetStore(seed?: {
  rows?: MockAssetRow[];
  bodies?: Record<string, string>;
}) {
  const storedAssets: MockAssetRow[] = [...(seed?.rows ?? [])];
  const storedTextByUrl = new Map<string, string>(
    Object.entries(seed?.bodies ?? {})
  );
  let seq = storedAssets.length;

  const createAssetSpy = jest.fn(
    async (
      file: File,
      _workflowId?: string,
      _parentId?: string,
      _onProgress?: unknown,
      _source?: unknown,
      _projectId?: string,
      _directory?: string
    ) => {
      seq += 1;
      const id = `${seq.toString(16).padStart(8, "0")}b0b000000000000000000000`;
      const url = `https://assets.test/${id}`;
      const text = await readFileText(file);
      storedTextByUrl.set(url, text);
      const row: MockAssetRow = {
        id,
        name: file.name,
        content_type: file.type,
        get_url: url,
        project_id: "proj-browser",
        metadata: {}
      };
      storedAssets.push(row);
      return row;
    }
  );

  const loadSpy = jest.fn(async () => ({
    assets: [...storedAssets],
    next: null
  }));

  const updateSpy = jest.fn(
    async (patch: {
      id: string;
      parent_id?: string;
      metadata?: Record<string, unknown>;
      data?: string;
    }) => {
      const row = storedAssets.find((a) => a.id === patch.id);
      if (!row) throw new Error(`Asset not found: ${patch.id}`);
      if (patch.parent_id !== undefined) row.parent_id = patch.parent_id;
      if (patch.metadata !== undefined) row.metadata = patch.metadata;
      if (patch.data !== undefined) storedTextByUrl.set(row.get_url, patch.data);
      return row;
    }
  );

  const deleteSpy = jest.fn(async (id: string) => {
    const idx = storedAssets.findIndex((a) => a.id === id);
    if (idx < 0) return [];
    const [removed] = storedAssets.splice(idx, 1);
    if (removed) storedTextByUrl.delete(removed.get_url);
    return [id];
  });

  const invalidateQueriesSpy = jest.fn();

  jest.spyOn(useAssetStore, "getState").mockReturnValue({
    ...useAssetStore.getState(),
    createAsset: createAssetSpy as never,
    load: loadSpy as never,
    update: updateSpy as never,
    delete: deleteSpy as never,
    invalidateQueries: invalidateQueriesSpy as never
  });

  globalThis.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const body = storedTextByUrl.get(String(url));
    return {
      ok: body !== undefined,
      text: async () => body ?? "",
      json: async () => JSON.parse(body ?? "{}")
    } as Response;
  }) as typeof fetch;

  const collectFoldersFromStore = () => {
    const explicit: Array<{ id: string; kind: "pattern" | "template"; folder: string }> = [];
    const entries: Array<{ kind: "pattern" | "template"; folder?: string }> = [];
    for (const row of storedAssets) {
      const fMeta = row.metadata?.["step_pattern_folder"] as Record<string, unknown> | undefined;
      if (fMeta && typeof fMeta.folder === "string") {
        explicit.push({
          id: row.id,
          kind: fMeta.kind === "template" ? "template" : "pattern",
          folder: fMeta.folder
        });
        continue;
      }
      const pMeta = row.metadata?.["step_pattern"] as Record<string, unknown> | undefined;
      if (pMeta) {
        entries.push({
          kind: pMeta.kind === "template" ? "template" : "pattern",
          folder: typeof pMeta.folder === "string" ? pMeta.folder : undefined
        });
      }
    }
    return collectStepPatternFolders(explicit, entries);
  };

  // Default server-atomic tRPC stubs backed by the in-memory store
  mockTimelineStepPatternFolderRename.mockImplementation(
    async (args: { folder: string; newName: string; kind?: "pattern" | "template" }) => {
      const plan = resolveRenameStepPatternFolderTarget(collectFoldersFromStore(), args);
      const movedPatterns: Array<{ id: string; name: string; folder: string }> = [];
      for (const row of storedAssets) {
        const fMeta = row.metadata?.["step_pattern_folder"] as Record<string, unknown> | undefined;
        if (
          fMeta &&
          (fMeta.kind === "template" ? "template" : "pattern") === plan.kind &&
          typeof fMeta.folder === "string" &&
          isWithinStepPatternFolder(fMeta.folder, plan.previousFolder)
        ) {
          const nextFolder = remapStepPatternFolderPath(fMeta.folder, plan.previousFolder, plan.folder);
          row.metadata = {
            ...row.metadata,
            step_pattern_folder: { kind: plan.kind, name: stepPatternFolderName(nextFolder), folder: nextFolder }
          };
          continue;
        }
        const pMeta = row.metadata?.["step_pattern"] as Record<string, unknown> | undefined;
        if (
          pMeta &&
          (pMeta.kind === "template" ? "template" : "pattern") === plan.kind &&
          typeof pMeta.folder === "string" &&
          isWithinStepPatternFolder(pMeta.folder, plan.previousFolder)
        ) {
          const nextFolder = remapStepPatternFolderPath(pMeta.folder, plan.previousFolder, plan.folder);
          row.metadata = { ...row.metadata, step_pattern: { ...pMeta, folder: nextFolder } };
          const rawBody = storedTextByUrl.get(row.get_url);
          if (rawBody) {
            const parsed = JSON.parse(rawBody) as Record<string, unknown>;
            storedTextByUrl.set(row.get_url, JSON.stringify({ ...parsed, folder: nextFolder }));
          }
          movedPatterns.push({ id: row.id, name: String(pMeta.name ?? row.name), folder: nextFolder });
        }
      }
      const renamed = {
        name: plan.name,
        kind: plan.kind,
        previousFolder: plan.previousFolder,
        folder: plan.folder,
        parentFolder: plan.parentFolder,
        movedPatternCount: movedPatterns.length,
        movedPatterns
      };
      return plan.current.id !== undefined ? { id: plan.current.id, ...renamed } : renamed;
    }
  );

  mockTimelineStepPatternFolderDelete.mockImplementation(
    async (args: { folder: string; kind?: "pattern" | "template" }) => {
      const target = resolveStepPatternFolderRef(collectFoldersFromStore(), args.folder, args.kind);
      const parentFolder = parentStepPatternFolder(target.kind, target.folder);
      const movedPatterns: Array<{ id: string; name: string; folder: string }> = [];
      for (let i = storedAssets.length - 1; i >= 0; i -= 1) {
        const row = storedAssets[i]!;
        const fMeta = row.metadata?.["step_pattern_folder"] as Record<string, unknown> | undefined;
        if (
          fMeta &&
          (fMeta.kind === "template" ? "template" : "pattern") === target.kind &&
          typeof fMeta.folder === "string" &&
          isWithinStepPatternFolder(fMeta.folder, target.folder)
        ) {
          storedAssets.splice(i, 1);
          storedTextByUrl.delete(row.get_url);
          continue;
        }
        const pMeta = row.metadata?.["step_pattern"] as Record<string, unknown> | undefined;
        if (
          pMeta &&
          (pMeta.kind === "template" ? "template" : "pattern") === target.kind &&
          typeof pMeta.folder === "string" &&
          isWithinStepPatternFolder(pMeta.folder, target.folder)
        ) {
          row.metadata = { ...row.metadata, step_pattern: { ...pMeta, folder: parentFolder } };
          const rawBody = storedTextByUrl.get(row.get_url);
          if (rawBody) {
            const parsed = JSON.parse(rawBody) as Record<string, unknown>;
            storedTextByUrl.set(row.get_url, JSON.stringify({ ...parsed, folder: parentFolder }));
          }
          movedPatterns.push({ id: row.id, name: String(pMeta.name ?? row.name), folder: parentFolder });
        }
      }
      return {
        kind: target.kind,
        deletedFolder: target.folder,
        parentFolder,
        movedPatternCount: movedPatterns.length,
        movedPatterns
      };
    }
  );

  return {
    storedAssets,
    storedTextByUrl,
    createAssetSpy,
    loadSpy,
    updateSpy,
    deleteSpy,
    invalidateQueriesSpy
  };
}

async function runTool(
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const tool = FrontendToolRegistry.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return (await tool.execute(args as never, toolCtx)) as Record<string, unknown>;
}

describe("SQ43 step pattern library folder operations (browser)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockTimelineStepPatternFolderRename.mockReset();
    mockTimelineStepPatternFolderDelete.mockReset();
    mockDoc = createTimelineStore();
    mockDoc.setState({
      sequenceId: SEQ_ID,
      tempo: DEFAULT_TEMPO,
      tracks: [
        makeTrack({
          id: "t-drums",
          type: "midi",
          name: "Drums",
          index: 0,
          instrument: DEFAULT_MIDI_INSTRUMENT
        })
      ],
      clips: [
        makeClip({
          id: "c-beat",
          trackId: "t-drums",
          name: "Beat",
          startMs: 0,
          durationMs: 2000,
          mediaType: "midi",
          sourceType: "imported",
          status: "generated",
          pattern: patternFromText("Kick: x... x... x... x...", {
            name: "Club Beat"
          })
        })
      ]
    });
    mockUi = createTimelineUIStore();
    mockPlayback = createTimelinePlaybackStore();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("delegates renameFolder and deleteFolder to a single atomic tRPC call without per-asset store loops", async () => {
    const storeMock = installMockAssetStore();
    const lib = createBrowserStepPatternLibrary();

    // 1. Create folder + nested subfolder via 12-char parent ID
    const drums = await lib.createFolder({ kind: "pattern", name: "Drums" });
    expect(drums.id).toMatch(/^[0-9a-f]{32}$/);
    expect(drums.folder).toBe("Step Patterns/Patterns/Drums");
    expect((storeMock.createAssetSpy.mock.calls[0]![0] as File).type).toBe(
      STEP_PATTERN_ASSET_CONTENT_TYPE
    );

    const trap = await lib.createFolder({
      name: "Trap",
      parentFolder: drums.id!.slice(0, 12)
    });
    expect(trap.folder).toBe("Step Patterns/Patterns/Drums/Trap");

    // Empty folders appear in listFolders(), NOT in list()
    const folders = await lib.listFolders();
    expect(folders.map((f) => f.folder)).toEqual([
      "Step Patterns/Patterns/Drums",
      "Step Patterns/Patterns/Drums/Trap"
    ]);
    expect(await lib.list()).toEqual([]);

    // 2. Save pattern into Drums/Trap and verify movePattern via 12-char prefixes
    const saved = await lib.save({
      name: "808 Bounce",
      kind: "pattern",
      folder: "Drums/Trap",
      pattern: patternFromText("Kick: x... x... x... x...", { name: "808 Bounce" })
    });
    const bass = await lib.createFolder({ kind: "pattern", name: "Bass" });

    const movedToBass = await lib.movePattern({
      pattern: saved.id.slice(0, 12),
      folder: bass.id!.slice(0, 12)
    });
    expect(movedToBass).toMatchObject({
      id: saved.id,
      previousFolder: "Step Patterns/Patterns/Drums/Trap",
      folder: "Step Patterns/Patterns/Bass"
    });

    // Move back into Drums/Trap, then rename Drums -> Percussion in one tRPC call
    await lib.movePattern({
      pattern: saved.id.slice(0, 12),
      folder: trap.id!.slice(0, 12)
    });
    storeMock.loadSpy.mockClear();
    storeMock.updateSpy.mockClear();
    storeMock.deleteSpy.mockClear();
    storeMock.invalidateQueriesSpy.mockClear();

    const renamed = await lib.renameFolder({
      folder: drums.id!.slice(0, 12),
      newName: "Percussion"
    });
    expect(mockTimelineStepPatternFolderRename).toHaveBeenCalledTimes(1);
    expect(mockTimelineStepPatternFolderRename).toHaveBeenCalledWith({
      folder: drums.id!.slice(0, 12),
      newName: "Percussion"
    });
    expect(storeMock.loadSpy).not.toHaveBeenCalled();
    expect(storeMock.updateSpy).not.toHaveBeenCalled();
    expect(storeMock.invalidateQueriesSpy).toHaveBeenCalledWith(["assets"]);
    expect(renamed).toMatchObject({
      previousFolder: "Step Patterns/Patterns/Drums",
      folder: "Step Patterns/Patterns/Percussion",
      movedPatternCount: 1
    });
    expect((await lib.list())[0]!.folder).toBe(
      "Step Patterns/Patterns/Percussion/Trap"
    );

    // Delete Percussion via 12-char ID in one tRPC call
    storeMock.loadSpy.mockClear();
    storeMock.updateSpy.mockClear();
    storeMock.deleteSpy.mockClear();
    storeMock.invalidateQueriesSpy.mockClear();

    const deleted = await lib.deleteFolder({ folder: drums.id!.slice(0, 12) });
    expect(mockTimelineStepPatternFolderDelete).toHaveBeenCalledTimes(1);
    expect(mockTimelineStepPatternFolderDelete).toHaveBeenCalledWith({
      folder: drums.id!.slice(0, 12)
    });
    expect(storeMock.loadSpy).not.toHaveBeenCalled();
    expect(storeMock.updateSpy).not.toHaveBeenCalled();
    expect(storeMock.deleteSpy).not.toHaveBeenCalled();
    expect(storeMock.invalidateQueriesSpy).toHaveBeenCalledWith(["assets"]);
    expect(deleted).toMatchObject({
      deletedFolder: "Step Patterns/Patterns/Percussion",
      parentFolder: "Step Patterns/Patterns",
      movedPatternCount: 1
    });
    expect((await lib.list())[0]!.folder).toBe("Step Patterns/Patterns");
    expect((await lib.listFolders()).map((f) => f.folder)).toEqual([
      "Step Patterns/Patterns/Bass"
    ]);
  });

  it("propagates server atomic failures on renameFolder and deleteFolder with zero client-side mutations or undo writes", async () => {
    const storeMock = installMockAssetStore();
    const lib = createBrowserStepPatternLibrary();
    await lib.createFolder({ kind: "pattern", name: "Drums" });
    const pattern = patternFromText("Kick: x... x... x... x...", { name: "A" });
    await lib.save({ name: "A", kind: "pattern", folder: "Drums", pattern });
    await lib.save({ name: "B", kind: "pattern", folder: "Drums", pattern });

    storeMock.loadSpy.mockClear();
    storeMock.updateSpy.mockClear();
    storeMock.deleteSpy.mockClear();
    storeMock.invalidateQueriesSpy.mockClear();

    mockTimelineStepPatternFolderRename.mockRejectedValueOnce(new Error("HTTP 500"));
    await expect(
      lib.renameFolder({ folder: "Drums", newName: "Perc" })
    ).rejects.toThrow("HTTP 500");
    expect(mockTimelineStepPatternFolderRename).toHaveBeenCalledTimes(1);
    expect(storeMock.updateSpy).not.toHaveBeenCalled();
    expect(storeMock.deleteSpy).not.toHaveBeenCalled();
    expect(storeMock.invalidateQueriesSpy).not.toHaveBeenCalled();

    mockTimelineStepPatternFolderDelete.mockRejectedValueOnce(new Error("DB rollback"));
    await expect(lib.deleteFolder({ folder: "Drums" })).rejects.toThrow("DB rollback");
    expect(mockTimelineStepPatternFolderDelete).toHaveBeenCalledTimes(1);
    expect(storeMock.updateSpy).not.toHaveBeenCalled();
    expect(storeMock.deleteSpy).not.toHaveBeenCalled();
    expect(storeMock.invalidateQueriesSpy).not.toHaveBeenCalled();

    expect((await lib.list()).map((p) => p.folder)).toEqual([
      "Step Patterns/Patterns/Drums",
      "Step Patterns/Patterns/Drums"
    ]);
    expect((await lib.listFolders()).map((f) => f.folder)).toEqual([
      "Step Patterns/Patterns/Drums"
    ]);
  });

  it("refuses ambiguous 12-char IDs, root modifications, factory moves, and cross-kind moves on browser library", async () => {
    const sharedPrefix = "deadbeef1234";
    installMockAssetStore({
      rows: [
        {
          id: `${sharedPrefix}00000000000000000001`,
          name: "folder-a.step-pattern.json",
          content_type: STEP_PATTERN_ASSET_CONTENT_TYPE,
          get_url: "https://assets.test/f1",
          metadata: {
            step_pattern_folder: {
              kind: "pattern",
              name: "Alpha",
              folder: "Step Patterns/Patterns/Alpha"
            }
          }
        },
        {
          id: `${sharedPrefix}00000000000000000002`,
          name: "folder-b.step-pattern.json",
          content_type: STEP_PATTERN_ASSET_CONTENT_TYPE,
          get_url: "https://assets.test/f2",
          metadata: {
            step_pattern_folder: {
              kind: "pattern",
              name: "Beta",
              folder: "Step Patterns/Patterns/Beta"
            }
          }
        },
        {
          id: "cafe0000000100000000000000000001",
          name: "folder-t.step-pattern.json",
          content_type: STEP_PATTERN_ASSET_CONTENT_TYPE,
          get_url: "https://assets.test/ft",
          metadata: {
            step_pattern_folder: {
              kind: "template",
              name: "Kits",
              folder: "Step Patterns/Templates/Kits"
            }
          }
        }
      ],
      bodies: {}
    });

    const lib = createBrowserStepPatternLibrary();
    await expect(
      lib.renameFolder({ folder: sharedPrefix, newName: "Gamma" })
    ).rejects.toThrow(/matches 2 folders/i);
    await expect(
      lib.deleteFolder({ folder: "Step Patterns/Patterns" })
    ).rejects.toThrow(/root/i);
    await expect(
      lib.movePattern({ pattern: "Boom Bap", folder: "Alpha" })
    ).rejects.toThrow(/factory/i);

    const saved = await lib.save({
      name: "User Beat",
      kind: "pattern",
      pattern: patternFromText("Kick: x... .... .... ....")
    });
    await expect(
      lib.movePattern({
        pattern: saved.id.slice(0, 12),
        folder: "cafe00000001"
      })
    ).rejects.toThrow(/template/i);
  });

  it("registers web ui_timeline_* folder tools, routes through bridge with 12-char prefixes, and adds no timeline undo entry", async () => {
    installMockAssetStore();
    const { unmount } = renderHook(() => useTimelineAgentBridge(SEQ_ID));
    try {
      const undoBefore = timelineTemporalOf(mockDoc).pastStates.length;

      const created = await runTool("ui_timeline_create_step_pattern_folder", {
        timeline_id: SEQ_ID,
        kind: "pattern",
        name: "House"
      });
      expect(created.ok).toBe(true);
      const folderId = String(created.id);

      const saved = await runTool("ui_timeline_save_step_pattern", {
        timeline_id: SEQ_ID,
        clipId: "c-beat",
        name: "Four Floor",
        kind: "pattern",
        folder: folderId.slice(0, 12)
      });
      expect(saved.ok).toBe(true);
      const patternId = String(saved.id);

      const renamed = await runTool("ui_timeline_rename_step_pattern_folder", {
        timeline_id: SEQ_ID,
        folder: folderId.slice(0, 12),
        newName: "Deep House"
      });
      expect(renamed.ok).toBe(true);
      expect(renamed.folder).toBe("Step Patterns/Patterns/Deep House");

      const moved = await runTool("ui_timeline_move_step_pattern", {
        timeline_id: SEQ_ID,
        pattern: patternId.slice(0, 12),
        folder: null
      });
      expect(moved.ok).toBe(true);
      expect(moved.folder).toBe("Step Patterns/Patterns");

      await runTool("ui_timeline_move_step_pattern", {
        timeline_id: SEQ_ID,
        pattern: patternId.slice(0, 12),
        folder: folderId.slice(0, 12)
      });

      const deleted = await runTool("ui_timeline_delete_step_pattern_folder", {
        timeline_id: SEQ_ID,
        folder: folderId.slice(0, 12)
      });
      expect(deleted.ok).toBe(true);
      expect(deleted.parentFolder).toBe("Step Patterns/Patterns");
      expect(deleted.movedPatternCount).toBe(1);

      // Library folder operations must never push a timeline undo entry.
      expect(timelineTemporalOf(mockDoc).pastStates.length).toBe(undoBefore);
    } finally {
      unmount();
    }
  });
});
