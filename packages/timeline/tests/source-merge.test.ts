/**
 * `mergeTimelineSource`: which scene's clips survive a merge, and how kept
 * scenes are reflowed in series order afterward so a hand-edited scene whose
 * length changed does not leave the next scene overlapping or gapped.
 */
import { describe, expect, it } from "vitest";

import {
  hashSceneSubtree,
  mergeTimelineSource,
  type SourceMergeScenes,
  type TimelineDocumentLike
} from "../src/source-merge.js";
import type { TimelineClip } from "../src/types.js";

/** A minimal scene group + one child clip, `durationMs` long, starting at `startMs`. */
function scene(
  name: string,
  startMs: number,
  durationMs: number,
  childText = name
): TimelineClip[] {
  const group: TimelineClip = {
    id: name,
    name,
    trackId: "t_scenes",
    startMs,
    durationMs,
    mediaType: "group",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } },
    sourceScene: name
  } as unknown as TimelineClip;
  const child: TimelineClip = {
    id: `${name}_t1`,
    name: "text",
    trackId: "t_A0",
    startMs,
    durationMs,
    mediaType: "text",
    sourceType: "imported",
    status: "generated",
    locked: false,
    versions: [],
    parentId: name,
    textStyle: { text: childText } as unknown
  } as unknown as TimelineClip;
  return [group, child];
}

function doc(clips: TimelineClip[]): TimelineDocumentLike {
  return { clips, tracks: [], markers: [] };
}

function scenesOf(document: TimelineDocumentLike): SourceMergeScenes {
  const groups = document.clips.filter(
    (c) => typeof c.sourceScene === "string" && c.sourceScene !== ""
  );
  const scenesRecord: SourceMergeScenes = {};
  for (const g of groups) {
    scenesRecord[g.sourceScene as string] = {
      groupId: g.id,
      hash: hashSceneSubtree(document.clips, g.id)
    };
  }
  return scenesRecord;
}

describe("mergeTimelineSource", () => {
  it("replaces an untouched scene outright", () => {
    const current = doc([...scene("a", 0, 1000)]);
    const previousScenes = scenesOf(current);
    const built = doc([...scene("a", 0, 1000, "rebuilt")]);

    const result = mergeTimelineSource(current, built, previousScenes);
    expect(result.conflicts).toEqual([]);
    const textClip = result.document.clips.find((c) => c.mediaType === "text");
    expect((textClip!.textStyle as { text: string }).text).toBe("rebuilt");
  });

  it("keeps a hand-edited scene and reports a conflict", () => {
    const current = doc([...scene("a", 0, 1000)]);
    const previousScenes = scenesOf(current);
    // Hand-edit: change the current document without re-baking, so its hash
    // no longer matches what the last bake recorded.
    const edited = doc([...scene("a", 0, 1000, "hand-edited")]);
    const built = doc([...scene("a", 0, 1000, "rebuilt")]);

    const result = mergeTimelineSource(edited, built, previousScenes);
    expect(result.conflicts).toEqual([{ scene: "a", reason: "edited since the last bake" }]);
    const textClip = result.document.clips.find((c) => c.mediaType === "text");
    expect((textClip!.textStyle as { text: string }).text).toBe("hand-edited");
  });

  it("shifts a later untouched scene when an earlier kept scene's length changed", () => {
    // Two scenes, "a" then "b", originally 1000ms each, placed back to back.
    const current = doc([...scene("a", 0, 1000), ...scene("b", 1000, 1000)]);
    const previousScenes = scenesOf(current);

    // Hand-edit scene "a" to be twice as long (2000ms) — a conflict, kept
    // as-is. The build rebuilds both scenes at their original 1000ms/1000ms
    // lengths, still placed back to back the old way (it has no idea "a"
    // grew).
    const edited = doc([...scene("a", 0, 2000), ...scene("b", 1000, 1000)]);
    const built = doc([...scene("a", 0, 1000, "rebuilt-a"), ...scene("b", 1000, 1000, "rebuilt-b")]);

    const result = mergeTimelineSource(edited, built, previousScenes);
    expect(result.conflicts.map((c) => c.scene)).toEqual(["a"]);

    const aGroup = result.document.clips.find((c) => c.id === "a")!;
    const bGroup = result.document.clips.find((c) => c.id === "b")!;
    // "a" kept its hand-edited 2000ms length, starting at 0.
    expect(aGroup.startMs).toBe(0);
    expect(aGroup.durationMs).toBe(2000);
    // "b" was untouched and replaced by the build, but reflowed to start
    // right after "a" actually ends (2000), not where the build assumed
    // (1000) — otherwise the two scenes would overlap for 1000ms.
    expect(bGroup.startMs).toBe(2000);

    // Every clip in "b"'s subtree moved by the same delta as its group.
    const bChild = result.document.clips.find((c) => c.parentId === "b")!;
    expect(bChild.startMs).toBe(2000);
  });

  it("shifts a scene earlier when a kept scene shrank", () => {
    const current = doc([...scene("a", 0, 1000), ...scene("b", 1000, 1000)]);
    const previousScenes = scenesOf(current);
    const edited = doc([...scene("a", 0, 400), ...scene("b", 1000, 1000)]);
    const built = doc([...scene("a", 0, 1000, "rebuilt-a"), ...scene("b", 1000, 1000, "rebuilt-b")]);

    const result = mergeTimelineSource(edited, built, previousScenes);
    const bGroup = result.document.clips.find((c) => c.id === "b")!;
    expect(bGroup.startMs).toBe(400);
  });

  it("does not shift anything when every scene's length is unchanged", () => {
    const current = doc([...scene("a", 0, 1000), ...scene("b", 1000, 1000)]);
    const previousScenes = scenesOf(current);
    const built = doc([...scene("a", 0, 1000, "rebuilt-a"), ...scene("b", 1000, 1000, "rebuilt-b")]);

    const result = mergeTimelineSource(current, built, previousScenes);
    const aGroup = result.document.clips.find((c) => c.id === "a")!;
    const bGroup = result.document.clips.find((c) => c.id === "b")!;
    expect(aGroup.startMs).toBe(0);
    expect(bGroup.startMs).toBe(1000);
  });
  it("keeps an unresolved edit on every later bake until it is forced", () => {
    const original = doc([...scene("a", 0, 1000)]);
    const baked = scenesOf(original);
    const edited = doc([...scene("a", 0, 1000, "hand-edited")]);
    const built = doc([...scene("a", 0, 1000, "rebuilt")]);

    const first = mergeTimelineSource(edited, built, baked);
    const second = mergeTimelineSource(first.document, built, first.scenes);
    expect(second.conflicts.map((c) => c.scene)).toEqual(["a"]);
    const text = second.document.clips.find((c) => c.mediaType === "text")!;
    expect((text.textStyle as { text: string }).text).toBe("hand-edited");

    const forced = mergeTimelineSource(second.document, built, second.scenes, {
      force: ["a"]
    });
    expect(forced.conflicts).toEqual([]);
    const forcedText = forced.document.clips.find((c) => c.mediaType === "text")!;
    expect((forcedText.textStyle as { text: string }).text).toBe("rebuilt");
  });

  it("keeps a conflicted scene the build removed on every later bake", () => {
    const original = doc([...scene("a", 0, 1000), ...scene("b", 1000, 1000)]);
    const baked = scenesOf(original);
    const edited = doc([...scene("a", 0, 1000), ...scene("b", 1000, 1000, "hand-edited")]);
    const built = doc([...scene("a", 0, 1000)]);

    const first = mergeTimelineSource(edited, built, baked);
    const second = mergeTimelineSource(first.document, built, first.scenes);
    expect(second.conflicts.map((c) => c.scene)).toEqual(["b"]);
    expect(second.document.clips.some((c) => c.id === "b")).toBe(true);
  });

  it("does not start to track a detached scene again", () => {
    const edited = doc([...scene("a", 0, 1000, "hand-edited")]);
    const built = doc([...scene("a", 0, 1000, "rebuilt")]);

    const first = mergeTimelineSource(edited, built, {});
    expect(first.scenes["a"]).toBeUndefined();
    const second = mergeTimelineSource(first.document, built, first.scenes);
    expect(second.conflicts.map((c) => c.scene)).toEqual(["a"]);
  });

  it("records the hash of an accepted scene at the place the reflow moved it to", () => {
    const current = doc([...scene("a", 0, 1000), ...scene("b", 1000, 1000)]);
    const baked = scenesOf(current);
    const edited = doc([...scene("a", 0, 2000), ...scene("b", 1000, 1000)]);
    const built = doc([...scene("a", 0, 1000), ...scene("b", 1000, 1000)]);

    const result = mergeTimelineSource(edited, built, baked);
    expect(result.document.clips.find((c) => c.id === "b")!.startMs).toBe(2000);
    expect(result.scenes["b"]!.hash).toBe(hashSceneSubtree(result.document.clips, "b"));

    const again = mergeTimelineSource(result.document, built, result.scenes);
    expect(again.conflicts.map((c) => c.scene)).toEqual(["a"]);
  });
});

it("preserves storyboard ownership when authored code rebuilds the document", () => {
  const ledger = [{ boardId: "board", elementKeys: ["shot/product"] }];
  const result = mergeTimelineSource({ clips: [], storyboardMaterializations: ledger }, { clips: [] }, {});
  expect(result.document.storyboardMaterializations).toEqual(ledger);
});
