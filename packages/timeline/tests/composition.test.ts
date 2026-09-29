/**
 * Compositions are copied into a document, so the checks here are about what
 * survives the copy: a round trip through instantiate/extract, and the two
 * authoring mistakes a template can make that are otherwise invisible — a
 * parameter addressing a field no child has, and a value of the wrong type.
 */
import { describe, expect, it } from "vitest";
import {
  extractComposition,
  instantiateComposition,
  validateCompositionParams,
  type TimelineComposition
} from "../src/composition.js";
import { makeClip } from "../src/defaults.js";
import type { TimelineClip } from "../src/types.js";
import { clipLayoutBox, resolveClipLayoutsWithDiagnostics } from "../src/render/layout.js";

const canvas = { width: 1000, height: 500, measureText: (text: string) => text.length * 10 };

function lowerThird(): TimelineComposition {
  return {
    id: "comp-lower-third",
    name: "Lower third",
    params: {
      name: { type: "string", default: "Name", path: "/1/textStyle/text" },
      barColor: { type: "color", default: "#0A84FF", path: "/0/shapeStyle/fill" }
    },
    group: makeClip({
      id: "group-template",
      trackId: "overlay-1",
      name: "Lower third",
      mediaType: "group",
      startMs: 0,
      durationMs: 3000,
      sourceType: "imported",
      status: "generated"
    }),
    children: [
      makeClip({
        id: "bar",
        trackId: "overlay-1",
        name: "Bar",
        mediaType: "shape",
        startMs: 0,
        durationMs: 3000,
        status: "generated",
        shapeStyle: { kind: "rect", fill: "#0A84FF", x: 0.08, y: 0.74, width: 0.5, height: 0.12 }
      }),
      makeClip({
        id: "name",
        trackId: "overlay-1",
        name: "Name",
        mediaType: "text",
        startMs: 200,
        durationMs: 2800,
        status: "generated",
        textStyle: { text: "Name", fontSizePx: 64, color: "#FFFFFF" }
      })
    ]
  };
}

/** Ids the round-trip comparison ignores, replaced with their position. */
function withoutIds(clips: readonly TimelineClip[]): unknown {
  return clips.map((clip, index) => ({
    ...clip,
    id: `#${index}`,
    parentId: clip.parentId === undefined ? undefined : "#group"
  }));
}

describe("instantiateComposition + extractComposition", () => {
  it("round-trips a composition modulo ids", () => {
    const comp = lowerThird();
    let seq = 0;
    const clips = instantiateComposition(comp, {
      startMs: 5000,
      newId: () => `new-${++seq}`
    });

    const back = extractComposition({ clips }, clips[0].id, comp.params, {
      id: comp.id,
      name: comp.name
    });

    expect(back.id).toBe(comp.id);
    expect(back.name).toBe(comp.name);
    expect(back.params).toEqual(comp.params);
    expect(withoutIds([back.group])).toEqual(withoutIds([comp.group]));
    expect(withoutIds(back.children)).toEqual(withoutIds(comp.children));
  });

  it("stamps provenance and rebases child times onto the insertion point", () => {
    const comp = lowerThird();
    const clips = instantiateComposition(comp, {
      startMs: 5000,
      params: { name: "Ada Lovelace" }
    });

    expect(clips).toHaveLength(3);
    expect(clips[0].startMs).toBe(5000);
    // The text child sits 200ms into the group in the template.
    expect(clips[2].startMs).toBe(5200);
    expect(clips[2].parentId).toBe(clips[0].id);
    expect(clips[2].textStyle?.text).toBe("Ada Lovelace");
    // The unset parameter falls back to the template's own default.
    expect(clips[1].shapeStyle?.fill).toBe("#0A84FF");
    for (const clip of clips) {
      expect(clip.compositionId).toBe(comp.id);
      expect(clip.compositionParams).toEqual({
        name: "Ada Lovelace",
        barColor: "#0A84FF"
      });
    }
    // Fresh ids: nothing from the template leaks into the document.
    expect(clips.map((c) => c.id)).not.toContain("group-template");
  });

  it("remaps references between copied clips while preserving external references", () => {
    const template = lowerThird();
    // A flex container/item carries no clip-id references (children come
    // from `parentId`, which the instantiation loop below already remaps),
    // so `layout`/`flexItem` need no remap step of their own — they should
    // just pass through unchanged onto the fresh clips.
    template.group.layout = { display: "flex", flexDirection: "row" };
    template.children[1].flexItem = { grow: 1 };
    template.children[1].animationLinks = [
      { target: "positionX", sourceClipId: "bar", source: "positionX" },
      { target: "positionY", sourceClipId: "external", source: "positionY" }
    ];
    template.children[1].matte = { sourceClipId: "bar", mode: "alpha" };
    template.children[1].sourceClipId = "bar";
    const extracted = extractComposition(
      { clips: [template.group, ...template.children.map((child) => ({ ...child, parentId: template.group.id }))] },
      template.group.id
    );
    let sequence = 0;
    const [group, bar, name] = instantiateComposition(extracted, {
      startMs: 5000, newId: () => `fresh-${++sequence}`
    });
    expect(group.layout).toEqual({ display: "flex", flexDirection: "row" });
    expect(name.flexItem).toEqual({ grow: 1 });
    expect(name.parentId).toBe(group.id);
    expect(bar.parentId).toBe(group.id);
    expect(name.animationLinks?.[0]).toMatchObject({ sourceClipId: bar.id });
    expect(name.animationLinks?.[1]).toMatchObject({ sourceClipId: "external" });
    expect(name.matte?.sourceClipId).toBe(bar.id);
    expect(name.sourceClipId).toBe(bar.id);
  });

  it("refuses a parameter path that addresses no child field", () => {
    const comp = lowerThird();
    comp.params["role"] = {
      type: "string",
      default: "Engineer",
      path: "/4/textStyle/text"
    };

    expect(validateCompositionParams(comp)).toEqual([
      expect.stringContaining("/4/textStyle/text")
    ]);
    expect(() => instantiateComposition(comp, { startMs: 0 })).toThrow(
      /no child has/
    );
  });

  it("refuses a parameter value of the wrong type", () => {
    const comp = lowerThird();
    expect(() =>
      instantiateComposition(comp, {
        startMs: 0,
        params: { barColor: "cornflower" }
      })
    ).toThrow(/color/);
    expect(() =>
      instantiateComposition(comp, {
        startMs: 0,
        // SAFETY: the point of the case is a caller passing the wrong type.
        params: { name: 12 as unknown as string }
      })
    ).toThrow(/string/);
  });

  it("refuses a parameter the template does not declare", () => {
    expect(() =>
      instantiateComposition(lowerThird(), {
        startMs: 0,
        params: { subtitle: "nope" }
      })
    ).toThrow(/no parameter "subtitle"/);
  });

  it("refuses to extract a clip that is not a group", () => {
    const comp = lowerThird();
    const clips = instantiateComposition(comp, { startMs: 0 });
    expect(() => extractComposition({ clips }, clips[1].id)).toThrow(
      /not a group/
    );
    expect(() => extractComposition({ clips }, "nope")).toThrow(/no clip/i);
  });
});

/**
 * A flex container is a group whose real children carry `parentId` (AS6 in
 * `packages/timeline/AGENTS.md`), so a component with a nested container —
 * a card holding a row of two icons — has grandchildren under the group a
 * composition extracts. Before this fix, `extractComposition` only kept
 * direct children, silently dropping the row's own contents; the fixture
 * below is the exact nested shape `render.spatialTiming.test.ts` already
 * proves Yoga resolves correctly, so the round trip is checked against that
 * same resolver rather than against a hand-computed geometry.
 */
function nestedFlexDocument(): TimelineClip[] {
  const kicker = makeClip({
    id: "kicker", trackId: "t", parentId: "outer", mediaType: "shape",
    startMs: 0, durationMs: 1000, status: "generated",
    shapeStyle: { kind: "rect", width: 0.06, height: 0.02 }
  });
  const a = makeClip({
    id: "nested-a", trackId: "t", parentId: "innerRow", mediaType: "shape",
    startMs: 0, durationMs: 1000, status: "generated",
    shapeStyle: { kind: "rect", width: 0.06, height: 0.02 }
  });
  const b = makeClip({
    id: "nested-b", trackId: "t", parentId: "innerRow", mediaType: "shape",
    startMs: 0, durationMs: 1000, status: "generated",
    shapeStyle: { kind: "rect", width: 0.06, height: 0.02 }
  });
  const innerRow = makeClip({
    id: "innerRow", trackId: "t", parentId: "outer", mediaType: "group",
    startMs: 0, durationMs: 1000, status: "generated",
    layout: { display: "flex", flexDirection: "row", gap: 10 }
  });
  const title = makeClip({
    id: "title", trackId: "t", parentId: "outer", mediaType: "text",
    startMs: 100, durationMs: 900, status: "generated",
    textStyle: { text: "Title", fontSizePx: 20, color: "#fff" }
  });
  const outer = makeClip({
    id: "outer", trackId: "t", mediaType: "group",
    startMs: 5000, durationMs: 1000, status: "generated",
    layout: { display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }
  });
  return [outer, kicker, innerRow, a, b, title];
}

describe("nested flex containers round-trip through a composition", () => {
  it("extracts the whole subtree, not just direct children", () => {
    const composition = extractComposition({ clips: nestedFlexDocument() }, "outer");
    expect(composition.children.map((c) => c.id).sort()).toEqual(
      ["innerRow", "kicker", "nested-a", "nested-b", "title"].sort()
    );
    const inner = composition.children.find((c) => c.id === "innerRow")!;
    const nestedA = composition.children.find((c) => c.id === "nested-a")!;
    const kicker = composition.children.find((c) => c.id === "kicker")!;
    // Direct children of the group: the group is implicit, so no parentId.
    expect(inner.parentId).toBeUndefined();
    expect(kicker.parentId).toBeUndefined();
    // A grandchild keeps its real (still-original) parent.
    expect(nestedA.parentId).toBe("innerRow");
  });

  it("remaps the nested parentId onto the fresh instance, not the top group", () => {
    const composition = extractComposition({ clips: nestedFlexDocument() }, "outer");
    const originalOrder = ["outer", ...composition.children.map((c) => c.id)];
    let index = 0;
    const idMap = new Map<string, string>();
    const minted = instantiateComposition(composition, {
      startMs: 0,
      newId: () => {
        const fresh = `fresh-${index}`;
        idMap.set(originalOrder[index]!, fresh);
        index += 1;
        return fresh;
      }
    });
    const byOriginal = (originalId: string) =>
      minted.find((c) => c.id === idMap.get(originalId))!;
    // Every child minted from a direct-child template parents onto the fresh
    // group; the row's own children parent onto the fresh row, never the
    // group directly — the nesting depth survives the copy.
    expect(byOriginal("innerRow").parentId).toBe(idMap.get("outer"));
    expect(byOriginal("kicker").parentId).toBe(idMap.get("outer"));
    expect(byOriginal("nested-a").parentId).toBe(idMap.get("innerRow"));
    expect(byOriginal("nested-b").parentId).toBe(idMap.get("innerRow"));
  });

  it("resolves to the same layout geometry after a full extract/instantiate round trip", () => {
    const original = nestedFlexDocument();
    const before = resolveClipLayoutsWithDiagnostics(original, canvas).transforms;
    const kickerBoxBefore = clipLayoutBox({ ...find(original, "kicker"), transform: before.get("kicker") }, canvas);
    const aBoxBefore = clipLayoutBox({ ...find(original, "nested-a"), transform: before.get("nested-a") }, canvas);
    const bBoxBefore = clipLayoutBox({ ...find(original, "nested-b"), transform: before.get("nested-b") }, canvas);
    const titleBoxBefore = clipLayoutBox({ ...find(original, "title"), transform: before.get("title") }, canvas);

    const composition = extractComposition({ clips: original }, "outer");
    // Track which original id each minted clip corresponds to: the group
    // first, then one per `composition.children`, in that exact order —
    // the same order `instantiateComposition` mints ids in.
    const originalOrder = ["outer", ...composition.children.map((c) => c.id)];
    let index = 0;
    const idMap = new Map<string, string>();
    const minted = instantiateComposition(composition, {
      startMs: 5000,
      newId: () => {
        const fresh = `fresh-${index}`;
        idMap.set(originalOrder[index]!, fresh);
        index += 1;
        return fresh;
      }
    });

    const after = resolveClipLayoutsWithDiagnostics(minted, canvas).transforms;
    const byFreshId = (originalId: string) => minted.find((c) => c.id === idMap.get(originalId))!;
    const kickerBoxAfter = clipLayoutBox({ ...byFreshId("kicker"), transform: after.get(idMap.get("kicker")) }, canvas);
    const aBoxAfter = clipLayoutBox({ ...byFreshId("nested-a"), transform: after.get(idMap.get("nested-a")) }, canvas);
    const bBoxAfter = clipLayoutBox({ ...byFreshId("nested-b"), transform: after.get(idMap.get("nested-b")) }, canvas);
    const titleBoxAfter = clipLayoutBox({ ...byFreshId("title"), transform: after.get(idMap.get("title")) }, canvas);

    for (const [beforeBox, afterBox] of [
      [kickerBoxBefore, kickerBoxAfter],
      [aBoxBefore, aBoxAfter],
      [bBoxBefore, bBoxAfter],
      [titleBoxBefore, titleBoxAfter]
    ] as const) {
      expect(afterBox.x).toBeCloseTo(beforeBox.x);
      expect(afterBox.y).toBeCloseTo(beforeBox.y);
      expect(afterBox.width).toBeCloseTo(beforeBox.width);
      expect(afterBox.height).toBeCloseTo(beforeBox.height);
    }
    // The row's own two children are still strictly side by side, exactly as
    // `render.spatialTiming.test.ts` proves for the un-round-tripped fixture —
    // the nested container's internal layout survived the copy too.
    expect(bBoxAfter.x).toBeCloseTo(aBoxAfter.x + aBoxAfter.width + 10);
  });
});

function find(clips: readonly TimelineClip[], id: string): TimelineClip {
  const clip = clips.find((c) => c.id === id);
  if (!clip) throw new Error(`fixture is missing clip "${id}"`);
  return clip;
}
