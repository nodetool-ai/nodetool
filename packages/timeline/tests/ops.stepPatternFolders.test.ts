/**
 * SQ43 Step Pattern Library Folder Operations — Timeline pure helpers & ops.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  makeClip,
  makeTrack,
  patternFromText
} from "../src/index.js";
import * as stepPatternLib from "../src/midi/stepPatternLibrary.js";
import {
  applyTimelineOp,
  createMemoryStepPatternLibrary,
  timelineOpFromToolArgs,
  type TimelineOpState
} from "../src/ops/index.js";
import { directContext } from "../src/testing/ops.js";

function makeState(): TimelineOpState {
  const pat = patternFromText("Kick: x... x... x... x...", { name: "Club Beat", seed: 1 });
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tempo: DEFAULT_TEMPO,
    tracks: [
      makeTrack({
        id: "t-drums",
        name: "Drums",
        type: "midi",
        index: 0,
        instrument: DEFAULT_MIDI_INSTRUMENT
      })
    ],
    clips: [
      makeClip({
        id: "c1",
        trackId: "t-drums",
        name: "Beat",
        startMs: 0,
        durationMs: 2000,
        mediaType: "midi",
        sourceType: "imported",
        status: "generated",
        pattern: pat
      })
    ],
    markers: [],
    playheadMs: 0,
    selectedClipIds: []
  };
}

describe("SQ43 step pattern folder path helpers", () => {
  it("normalizes, validates, computes parents, and remaps step pattern folders", () => {
    const lib = stepPatternLib as Record<string, (...args: unknown[]) => unknown>;
    expect(lib["stepPatternRootFolder"]).toBeTypeOf("function");
    expect(lib["normalizeStepPatternFolderPath"]!("pattern", "Drums/Trap")).toBe(
      "Step Patterns/Patterns/Drums/Trap"
    );
    expect(
      lib["normalizeStepPatternFolderPath"]!("template", "Step Patterns/Templates/Kits")
    ).toBe("Step Patterns/Templates/Kits");
    expect(lib["normalizeStepPatternFolderPath"]!("pattern", "")).toBe(
      "Step Patterns/Patterns"
    );
    expect(() => lib["normalizeStepPatternFolderPath"]!("pattern", "../Escape")).toThrow(
      /\.\./
    );
    expect(() =>
      lib["normalizeStepPatternFolderPath"]!("pattern", "Step Patterns/Templates/Wrong")
    ).toThrow(/template/i);
    expect(() =>
      lib["normalizeStepPatternSubfolderPath"]!("pattern", "Step Patterns/Patterns")
    ).toThrow(/root/i);
    expect(
      lib["parentStepPatternFolder"]!("pattern", "Step Patterns/Patterns/Drums/Trap")
    ).toBe("Step Patterns/Patterns/Drums");
    expect(lib["parentStepPatternFolder"]!("pattern", "Step Patterns/Patterns/Drums")).toBe(
      "Step Patterns/Patterns"
    );
    expect(
      lib["remapStepPatternFolderPath"]!(
        "Step Patterns/Patterns/Drums/Trap",
        "Step Patterns/Patterns/Drums",
        "Step Patterns/Patterns/Percussion"
      )
    ).toBe("Step Patterns/Patterns/Percussion/Trap");
    expect(
      lib["stepPatternAncestorFolders"]!("pattern", "Step Patterns/Patterns/Drums/Trap/808")
    ).toEqual([
      "Step Patterns/Patterns/Drums",
      "Step Patterns/Patterns/Drums/Trap",
      "Step Patterns/Patterns/Drums/Trap/808"
    ]);
  });
});

describe("SQ43 step pattern folder ops", () => {
  it("creates, lists, renames, moves patterns between, and deletes folders with 12-char ID prefixes", async () => {
    const state = makeState();
    const library = createMemoryStepPatternLibrary();
    const ctx = { ...directContext(state), stepPatternLibrary: library };

    // 1. Create top-level folder and nested child using 12-char parentFolder ID prefix
    const createdDrums = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("create_step_pattern_folder" as never, {
        kind: "pattern",
        name: "Drums"
      }),
      ctx
    );
    expect(createdDrums.error).toBeUndefined();
    const drumsId = String(createdDrums.result.id);
    expect(drumsId).toMatch(/^[0-9a-f]{32}$/);
    expect(createdDrums.result).toMatchObject({
      ok: true,
      name: "Drums",
      kind: "pattern",
      folder: "Step Patterns/Patterns/Drums",
      parentFolder: "Step Patterns/Patterns"
    });

    const createdTrap = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("create_step_pattern_folder" as never, {
        name: "Trap",
        parentFolder: drumsId.slice(0, 12)
      }),
      ctx
    );
    expect(createdTrap.error).toBeUndefined();
    const trapId = String(createdTrap.result.id);
    expect(createdTrap.result).toMatchObject({
      ok: true,
      kind: "pattern",
      name: "Trap",
      folder: "Step Patterns/Patterns/Drums/Trap",
      parentFolder: "Step Patterns/Patterns/Drums"
    });

    // Duplicate folder is refused
    const dup = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("create_step_pattern_folder" as never, {
        kind: "pattern",
        name: "drums"
      }),
      ctx
    );
    expect(dup.error).toMatch(/already exists/i);

    // 2. Empty folders appear in list_step_patterns
    const listedEmpty = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("list_step_patterns" as never, { kind: "pattern" }),
      ctx
    );
    expect(listedEmpty.error).toBeUndefined();
    const folders = listedEmpty.result.folders as Array<{
      id?: string;
      folder: string;
      name: string;
    }>;
    expect(folders.map((f) => f.folder)).toContain("Step Patterns/Patterns/Drums");
    expect(folders.map((f) => f.folder)).toContain("Step Patterns/Patterns/Drums/Trap");

    // 3. Save a pattern using 12-char folder ID prefix and filter list_step_patterns by folder ID
    const saved = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("save_step_pattern" as never, {
        clipId: "c1",
        name: "Trap Beat",
        kind: "pattern",
        folder: trapId.slice(0, 12)
      }),
      ctx
    );
    expect(saved.error).toBeUndefined();
    expect(saved.result.folder).toBe("Step Patterns/Patterns/Drums/Trap");
    const savedPatternId = String(saved.result.id);

    const filtered = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("list_step_patterns" as never, {
        folder: trapId.slice(0, 12)
      }),
      ctx
    );
    expect(filtered.error).toBeUndefined();
    const filteredEntries = filtered.result.entries as Array<{
      id: string;
      name: string;
      folder?: string;
    }>;
    expect(filteredEntries).toHaveLength(1);
    expect(filteredEntries[0]!.name).toBe("Trap Beat");

    // 4. Rename parent folder via 12-char ID prefix -> updates nested folder & patterns inside
    const renamed = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("rename_step_pattern_folder" as never, {
        folder: drumsId.slice(0, 12),
        newName: "Percussion"
      }),
      ctx
    );
    expect(renamed.error).toBeUndefined();
    expect(renamed.result).toMatchObject({
      ok: true,
      name: "Percussion",
      previousFolder: "Step Patterns/Patterns/Drums",
      folder: "Step Patterns/Patterns/Percussion",
      movedPatternCount: 1
    });
    const afterRename = await library.list();
    expect(afterRename[0]!.folder).toBe("Step Patterns/Patterns/Percussion/Trap");

    // 5. Move pattern to another folder and back to root using 12-char pattern ID prefix
    const createdBass = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("create_step_pattern_folder" as never, {
        kind: "pattern",
        name: "Bass"
      }),
      ctx
    );
    const bassId = String(createdBass.result.id);

    const movedToBass = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("move_step_pattern" as never, {
        pattern: savedPatternId.slice(0, 12),
        folder: bassId.slice(0, 12)
      }),
      ctx
    );
    expect(movedToBass.error).toBeUndefined();
    expect(movedToBass.result).toMatchObject({
      ok: true,
      id: savedPatternId,
      previousFolder: "Step Patterns/Patterns/Percussion/Trap",
      folder: "Step Patterns/Patterns/Bass"
    });

    const movedToRoot = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("move_step_pattern" as never, {
        pattern: savedPatternId.slice(0, 12),
        folder: null
      }),
      ctx
    );
    expect(movedToRoot.error).toBeUndefined();
    expect(movedToRoot.result.folder).toBe("Step Patterns/Patterns");

    // 6. Move back into Percussion/Trap and delete Percussion -> pattern moves to parent (root)
    await applyTimelineOp(
      state,
      timelineOpFromToolArgs("move_step_pattern" as never, {
        pattern: savedPatternId.slice(0, 12),
        folder: "Percussion/Trap"
      }),
      ctx
    );

    const deleted = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("delete_step_pattern_folder" as never, {
        folder: drumsId.slice(0, 12)
      }),
      ctx
    );
    expect(deleted.error).toBeUndefined();
    expect(deleted.result).toMatchObject({
      ok: true,
      deletedFolder: "Step Patterns/Patterns/Percussion",
      parentFolder: "Step Patterns/Patterns",
      movedPatternCount: 1
    });
    expect((await library.list())[0]!.folder).toBe("Step Patterns/Patterns");
    const remainingFolders = (await library.listFolders?.()) ?? [];
    expect(
      remainingFolders.some((f) => f.folder.startsWith("Step Patterns/Patterns/Percussion"))
    ).toBe(false);
  });

  it("refuses ambiguous 12-char prefixes, root modifications, factory moves, and cross-kind moves", async () => {
    const state = makeState();
    const sharedPrefix = "deadbeef1234";
    const library = createMemoryStepPatternLibrary({
      folders: [
        {
          id: `${sharedPrefix}00000000000000000001`,
          kind: "pattern",
          folder: "Step Patterns/Patterns/Alpha"
        },
        {
          id: `${sharedPrefix}00000000000000000002`,
          kind: "pattern",
          folder: "Step Patterns/Patterns/Beta"
        },
        {
          id: "cafe0000000100000000000000000001",
          kind: "template",
          folder: "Step Patterns/Templates/Kits"
        }
      ],
      entries: [
        {
          id: `${sharedPrefix}11111111111111111111`,
          name: "Beat One",
          kind: "pattern",
          folder: "Step Patterns/Patterns/Alpha",
          pattern: patternFromText("Kick: x... .... .... ....")
        },
        {
          id: `${sharedPrefix}22222222222222222222`,
          name: "Beat Two",
          kind: "pattern",
          folder: "Step Patterns/Patterns/Beta",
          pattern: patternFromText("Snare: .... x... .... ....")
        }
      ]
    });
    const ctx = { ...directContext(state), stepPatternLibrary: library };

    // Ambiguous 12-char folder prefix
    const ambigRename = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("rename_step_pattern_folder" as never, {
        folder: sharedPrefix,
        newName: "Gamma"
      }),
      ctx
    );
    expect(ambigRename.error).toMatch(/matches 2 folders/i);

    const ambigDelete = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("delete_step_pattern_folder" as never, {
        folder: sharedPrefix
      }),
      ctx
    );
    expect(ambigDelete.error).toMatch(/matches 2 folders/i);

    // Ambiguous 12-char pattern prefix
    const ambigMove = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("move_step_pattern" as never, {
        pattern: sharedPrefix,
        folder: "Alpha"
      }),
      ctx
    );
    expect(ambigMove.error).toMatch(/matches 2 user patterns/i);

    // Factory pattern cannot be moved
    const factoryMove = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("move_step_pattern" as never, {
        pattern: "Boom Bap",
        folder: "Alpha"
      }),
      ctx
    );
    expect(factoryMove.error).toMatch(/factory/i);

    // Cross-kind destination folder refused (moving pattern into template folder ID)
    const crossKind = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("move_step_pattern" as never, {
        pattern: "Beat One",
        folder: "cafe00000001"
      }),
      ctx
    );
    expect(crossKind.error).toMatch(/template/i);

    // Root folder cannot be renamed or deleted
    const rootDel = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("delete_step_pattern_folder" as never, {
        folder: "Step Patterns/Patterns"
      }),
      ctx
    );
    expect(rootDel.error).toMatch(/root/i);

    // Slash in newName refused
    const badRename = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("rename_step_pattern_folder" as never, {
        folder: "Alpha",
        newName: "Sub/Bad"
      }),
      ctx
    );
    expect(badRename.error).toMatch(/slash|segment|valid/i);

    // Nonexistent 12-char folder ID in move_step_pattern refused (not created as literal folder)
    const missingFolderId = await applyTimelineOp(
      state,
      timelineOpFromToolArgs("move_step_pattern" as never, {
        pattern: "Beat One",
        folder: "999988887777"
      }),
      ctx
    );
    expect(missingFolderId.error).toMatch(/not found|no step pattern folder/i);
  });
});
