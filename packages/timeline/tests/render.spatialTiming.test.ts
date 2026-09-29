import { describe, expect, it, vi } from "vitest";
import { timelineClip, timelineSequenceResponse } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { makeClip, makeSequence, makeTrack } from "../src/defaults.js";
import type { TimelineClip } from "../src/types.js";
import { beatAnimationDelayMs, staggerClipAnimations } from "../src/animation/beat.js";
import { resolveClipLayoutsWithDiagnostics, clipLayoutBox } from "../src/render/layout.js";
import { resolveSceneMotionBlur, layerShutterTime } from "../src/render/motionBlur.js";
import { computeActiveLayers, computeActiveLayersWithHorizon, resolveAnimatedLayerProps } from "../src/render/sceneModel.js";
import { resolveCamera2D, sampleCamera2D } from "../src/render/spatial.js";
import { expandTemporalClips, clipSteppedTime } from "../src/render/temporal.js";
import { IDENTITY_TRANSFORM, buildTransformMatrix } from "../src/render/transform.js";

const canvas = { width: 1000, height: 500, measureText: (text: string) => text.length * 10 };
const clip = (id: string, overrides: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({ id, trackId: "track", mediaType: "image", sourceType: "imported", status: "generated", currentAssetId: "asset", durationMs: 1000, ...overrides });

describe("spatial timeline layout", () => {
  it("rotates positive angles clockwise in canvas coordinates", () => {
    const matrix = buildTransformMatrix({ ...IDENTITY_TRANSFORM, rotation: Math.PI / 2 }, { x: 1, y: 1 }, 1000, 500);
    expect(matrix[1]).toBeLessThan(0);
  });
  it("lays out a row with a gap, in document order", () => {
    const logo = clip("logo", { mediaType: "shape", parentId: "row", shapeStyle: { kind: "rect", width: 0.1, height: 0.2 } });
    const label = clip("label", { mediaType: "text", parentId: "row", textStyle: { text: "Logo", fontSizePx: 20, color: "#ffffff" } });
    const row = clip("row", { mediaType: "group", layout: { display: "flex", flexDirection: "row", gap: 20, alignItems: "flex-start" } });
    const { transforms, cycles } = resolveClipLayoutsWithDiagnostics([row, logo, label], canvas);
    expect(cycles).toEqual([]);
    const logoBox = clipLayoutBox({ ...logo, transform: transforms.get("logo") }, canvas);
    const labelBox = clipLayoutBox({ ...label, transform: transforms.get("label") }, canvas);
    expect(logoBox.x + logoBox.width + 20).toBeCloseTo(labelBox.x);
  });

  it("stacks a column with a gap and centers the cross axis", () => {
    const a = clip("a", { mediaType: "shape", parentId: "col", shapeStyle: { kind: "rect", width: 0.4, height: 0.1 } });
    const b = clip("b", { mediaType: "shape", parentId: "col", shapeStyle: { kind: "rect", width: 0.1, height: 0.1 } });
    const col = clip("col", { mediaType: "group", layout: { display: "flex", flexDirection: "column", gap: 10, alignItems: "center" } });
    const { transforms } = resolveClipLayoutsWithDiagnostics([col, a, b], canvas);
    const aBox = clipLayoutBox({ ...a, transform: transforms.get("a") }, canvas);
    const bBox = clipLayoutBox({ ...b, transform: transforms.get("b") }, canvas);
    expect(bBox.y).toBeCloseTo(aBox.y + aBox.height + 10);
    // Centered cross axis: both children share the same horizontal center.
    expect(aBox.x + aBox.width / 2).toBeCloseTo(bBox.x + bBox.width / 2);
  });

  it("pads a container and justifies its content to the far edge", () => {
    const item = clip("item", { mediaType: "shape", parentId: "box", shapeStyle: { kind: "rect", width: 0.1, height: 0.1 } });
    const box = clip("box", {
      mediaType: "group",
      transform: { ...IDENTITY_TRANSFORM, anchor: { x: 0, y: 0 }, position: { x: -500, y: -250 } },
      layout: { display: "flex", flexDirection: "row", width: 400, height: 200, padding: 20, justifyContent: "flex-end", alignItems: "flex-end" }
    });
    const { transforms } = resolveClipLayoutsWithDiagnostics([box, item], canvas);
    const itemBox = clipLayoutBox({ ...item, transform: transforms.get("item") }, canvas);
    // `transforms` is parent-local (AGENTS.md): the container's own
    // `position`/`anchor` (its real placement in the frame) composes through
    // the renderer's normal `parentMatrix`, entirely outside what
    // `clipLayoutBox` checks here — see the ancestor-composition tests in
    // render.flexPixels.test.ts for that half. Parent-local, the container's
    // own box starts at (0, 0) regardless of `anchor` (`layout.ts`'s
    // `originX`/`originY` already resolve anchor into that), so the padded,
    // end-justified item sits against its bottom-right inset from there.
    expect(itemBox.x + itemBox.width).toBeCloseTo(400 - 20);
    expect(itemBox.y + itemBox.height).toBeCloseTo(200 - 20);
  });

  it("resolves a nested container: a column of [kicker, row[a,b], title]", () => {
    const kicker = clip("kicker", { mediaType: "shape", parentId: "outer", shapeStyle: { kind: "rect", width: 0.06, height: 0.02 } });
    const a = clip("nested-a", { mediaType: "shape", parentId: "innerRow", shapeStyle: { kind: "rect", width: 0.06, height: 0.02 } });
    const b = clip("nested-b", { mediaType: "shape", parentId: "innerRow", shapeStyle: { kind: "rect", width: 0.06, height: 0.02 } });
    const innerRow = clip("innerRow", { mediaType: "group", parentId: "outer", layout: { display: "flex", flexDirection: "row", gap: 10 } });
    const title = clip("title", { mediaType: "text", parentId: "outer", textStyle: { text: "Title", fontSizePx: 20, color: "#fff" } });
    const outer = clip("outer", { mediaType: "group", layout: { display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" } });
    const { transforms } = resolveClipLayoutsWithDiagnostics([outer, kicker, innerRow, a, b, title], canvas);
    const kickerBox = clipLayoutBox({ ...kicker, transform: transforms.get("kicker") }, canvas);
    const aBox = clipLayoutBox({ ...a, transform: transforms.get("nested-a") }, canvas);
    const bBox = clipLayoutBox({ ...b, transform: transforms.get("nested-b") }, canvas);
    const titleBox = clipLayoutBox({ ...title, transform: transforms.get("title") }, canvas);
    // Every leaf, nested two deep, still ends up strictly below its sibling above it.
    expect(aBox.y).toBeCloseTo(kickerBox.y + kickerBox.height + 10);
    expect(bBox.x).toBeCloseTo(aBox.x + aBox.width + 10);
    expect(titleBox.y).toBeGreaterThan(aBox.y + aBox.height);
  });

  it("wraps text to a fixed-width container and grows the container's height", () => {
    const narrow = clip("wrap-narrow", {
      mediaType: "text", parentId: "narrow-box",
      textStyle: { text: "A fairly long title that should wrap across several lines", fontSizePx: 20, color: "#fff" }
    });
    const narrowBox = clip("narrow-box", { mediaType: "group", layout: { display: "flex", width: 120 } });
    const wide = clip("wrap-wide", {
      mediaType: "text", parentId: "wide-box",
      textStyle: { text: "A fairly long title that should wrap across several lines", fontSizePx: 20, color: "#fff" }
    });
    const wideBox = clip("wide-box", { mediaType: "group", layout: { display: "flex", width: 900 } });
    const narrowResult = resolveClipLayoutsWithDiagnostics([narrowBox, narrow], canvas);
    const wideResult = resolveClipLayoutsWithDiagnostics([wideBox, wide], canvas);
    const narrowSize = narrowResult.sizes.get("wrap-narrow");
    const wideSize = wideResult.sizes.get("wrap-wide");
    expect(narrowSize?.width).toBeLessThanOrEqual(120 + 0.5);
    // Wrapping to a narrower box means more lines, i.e. a taller box.
    expect(narrowSize!.height).toBeGreaterThan(wideSize!.height);
  });

  it("fills its container with an absolute inset:0 child (a plate behind text)", () => {
    const plate = clip("plate", {
      mediaType: "shape", parentId: "card", shapeStyle: { kind: "rect", fill: "#000000" },
      flexItem: { position: "absolute", inset: 0 }
    });
    const title = clip("card-title", { mediaType: "text", parentId: "card", textStyle: { text: "Card", fontSizePx: 20, color: "#fff" } });
    const card = clip("card", { mediaType: "group", layout: { display: "flex", padding: 16 } });
    const { resolvedBoxes } = resolveClipLayoutsWithDiagnostics([card, plate, title], canvas);
    const cardBox = resolvedBoxes.get("card")!;
    const plateBox = resolvedBoxes.get("plate")!;
    expect(plateBox.x).toBeCloseTo(cardBox.x);
    expect(plateBox.y).toBeCloseTo(cardBox.y);
    expect(plateBox.width).toBeCloseTo(cardBox.width);
    expect(plateBox.height).toBeCloseTo(cardBox.height);
  });

  it("places a root container by transform.position + anchor over its computed box", () => {
    const item = clip("anchored-item", { mediaType: "shape", parentId: "anchored", shapeStyle: { kind: "rect", width: 0.1, height: 0.1 } });
    const anchored = clip("anchored", {
      mediaType: "group",
      transform: { ...IDENTITY_TRANSFORM, position: { x: -700, y: 100 }, anchor: { x: 0, y: 0 } },
      layout: { display: "flex", width: 200, height: 80 }
    });
    const { transforms } = resolveClipLayoutsWithDiagnostics([anchored, item], canvas);
    // `transforms` is parent-local: `position` (-700, 100) is the root's own
    // real-frame placement, entirely the renderer's `parentMatrix`'s job
    // (see render.flexPixels.test.ts's ancestor-composition tests, which
    // render through the full pipeline and check actual screen pixels).
    // What `clipLayoutBox` can check here is `anchor`'s own effect, in
    // isolation: anchor (0,0) puts the container's own top-left at the
    // parent-local origin (0, 0) — `layout.ts`'s `originX`/`originY` resolve
    // anchor into that regardless of `position` — so its first
    // (flex-start/flex-start, unpadded) child's top-left box edge coincides
    // with parent-local (0, 0) too.
    const itemBox = clipLayoutBox({ ...item, transform: transforms.get("anchored-item") }, canvas);
    expect(itemBox.x).toBeCloseTo(0);
    expect(itemBox.y).toBeCloseTo(0);
  });

  it("distributes free space by flexGrow and resolves a percentage width", () => {
    const grower = clip("grower", { mediaType: "shape", parentId: "grow-row", shapeStyle: { kind: "rect" }, flexItem: { grow: 1 } });
    const fixed = clip("fixed", { mediaType: "shape", parentId: "grow-row", shapeStyle: { kind: "rect" }, flexItem: { width: 100 } });
    const row = clip("grow-row", { mediaType: "group", layout: { display: "flex", flexDirection: "row", width: 500, height: 100 } });
    const { sizes } = resolveClipLayoutsWithDiagnostics([row, grower, fixed], canvas);
    expect(sizes.get("grower")?.width).toBeCloseTo(400);
    expect(sizes.get("fixed")?.width).toBeCloseTo(100);

    const half = clip("half", { mediaType: "shape", parentId: "pct-row", shapeStyle: { kind: "rect" }, flexItem: { width: "50%" } });
    const pctRow = clip("pct-row", { mediaType: "group", layout: { display: "flex", width: 600, height: 100 } });
    const { sizes: pctSizes } = resolveClipLayoutsWithDiagnostics([pctRow, half], canvas);
    expect(pctSizes.get("half")?.width).toBeCloseTo(300);
  });

  it("returns no cycles for an ordinary nested document", () => {
    const child = clip("cycle-child", { mediaType: "shape", parentId: "cycle-root", shapeStyle: { kind: "rect" } });
    const root = clip("cycle-root", { mediaType: "group", layout: { display: "flex" } });
    expect(resolveClipLayoutsWithDiagnostics([root, child], canvas).cycles).toEqual([]);
  });

  it("caches by clips-array identity, canvas size, and measurer — an unchanged document never rebuilds the Yoga tree twice", async () => {
    const { default: Yoga } = await import("yoga-layout");
    const buildSpy = vi.spyOn(Yoga.Node, "create");
    const item = clip("cache-item", { mediaType: "shape", parentId: "cache-root", shapeStyle: { kind: "rect", width: 0.1, height: 0.1 } });
    const root = clip("cache-root", { mediaType: "group", layout: { display: "flex" } });
    const docClips = [root, item];

    buildSpy.mockClear();
    const first = resolveClipLayoutsWithDiagnostics(docClips, canvas);
    const callsAfterFirst = buildSpy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // Same array, same canvas dims, same (absent) measurer: no rebuild, and
    // the exact same Map instances come back.
    const second = resolveClipLayoutsWithDiagnostics(docClips, canvas);
    expect(buildSpy.mock.calls.length).toBe(callsAfterFirst);
    expect(second.transforms).toBe(first.transforms);
    expect(second).toBe(first);

    // A resized canvas misses the cache.
    resolveClipLayoutsWithDiagnostics(docClips, { ...canvas, width: 1200 });
    expect(buildSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    const callsAfterResize = buildSpy.mock.calls.length;

    // A new `clips` array (what an edit produces) misses the cache even when
    // every clip in it is unchanged.
    resolveClipLayoutsWithDiagnostics([...docClips], canvas);
    expect(buildSpy.mock.calls.length).toBeGreaterThan(callsAfterResize);

    buildSpy.mockRestore();
  });

  it("projects offset text and rotated shapes through their authored transforms", () => {
    const text = clip("text", {
      mediaType: "text",
      textStyle: { text: "Label", fontSizePx: 20, color: "#ffffff", x: 0.1, y: 0.2 },
      transform: { ...IDENTITY_TRANSFORM, scale: { x: 2, y: 1 } }
    });
    const unscaled = clipLayoutBox({ ...text, transform: IDENTITY_TRANSFORM }, canvas);
    const scaled = clipLayoutBox(text, canvas);
    expect(scaled.width).toBeCloseTo(unscaled.width * 2);
    expect(scaled.x).not.toBeCloseTo(unscaled.x);
    const shape = clip("shape", {
      mediaType: "shape",
      shapeStyle: { kind: "rect", x: 0.1, y: 0.2, width: 0.1, height: 0.2 },
      transform: { ...IDENTITY_TRANSFORM, rotation: Math.PI / 2 }
    });
    const rotated = clipLayoutBox(shape, canvas);
    expect(rotated.width).toBeCloseTo(100);
    expect(rotated.height).toBeCloseTo(100);
  });

  it("sizes a non-flex group leaf from its children when placing it in a flex row", () => {
    const group = clip("mark", { mediaType: "group", parentId: "row" });
    const part = clip("part", { mediaType: "shape", parentId: "mark", shapeStyle: { kind: "rect", x: 0.45, y: 0.4, width: 0.1, height: 0.2 } });
    const word = clip("word", { mediaType: "text", parentId: "row", textStyle: { text: "Name", fontSizePx: 20, color: "#ffffff" } });
    const row = clip("row", { mediaType: "group", layout: { display: "flex", flexDirection: "row", gap: 10 } });
    expect(clipLayoutBox(group, canvas).width).toBe(0);
    const { transforms } = resolveClipLayoutsWithDiagnostics([row, group, part, word], canvas);
    const box = clipLayoutBox({ ...group, transform: transforms.get("mark") }, canvas, [group, part]);
    expect(box.width).toBeCloseTo(100);
    expect(box.x + box.width + 10).toBeCloseTo(clipLayoutBox({ ...word, transform: transforms.get("word") }, canvas).x);
  });

  it("aligns a column's cross axis to flex-start / flex-end, by each child's own size", () => {
    const wide = clip("wide", { mediaType: "shape", parentId: "stack", shapeStyle: { kind: "rect", width: 0.4, height: 0.1 } });
    const narrow = clip("narrow", { mediaType: "shape", parentId: "stack", shapeStyle: { kind: "rect", width: 0.1, height: 0.1 } });
    const stackFor = (alignItems?: "flex-start" | "flex-end") =>
      clip("stack", {
        mediaType: "group",
        transform: { ...IDENTITY_TRANSFORM, anchor: { x: 0, y: 0 }, position: { x: -500, y: -250 } },
        layout: { display: "flex", flexDirection: "column", gap: 0, ...(alignItems ? { alignItems } : {}) }
      });

    const started = resolveClipLayoutsWithDiagnostics([stackFor("flex-start"), wide, narrow], canvas);
    const wideStartBox = clipLayoutBox({ ...wide, transform: started.transforms.get("wide") }, canvas);
    const narrowStartBox = clipLayoutBox({ ...narrow, transform: started.transforms.get("narrow") }, canvas);
    // Parent-local: the container's own `position` (-500, -250) is the
    // renderer's `parentMatrix` job, not `clipLayoutBox`'s — anchor (0, 0)
    // alone puts the container's own left edge at the parent-local origin.
    expect(wideStartBox.x).toBeCloseTo(0);
    expect(narrowStartBox.x).toBeCloseTo(0);

    const ended = resolveClipLayoutsWithDiagnostics([stackFor("flex-end"), wide, narrow], canvas);
    const wideEndBox = clipLayoutBox({ ...wide, transform: ended.transforms.get("wide") }, canvas);
    const narrowEndBox = clipLayoutBox({ ...narrow, transform: ended.transforms.get("narrow") }, canvas);
    expect(wideEndBox.x + wideEndBox.width).toBeCloseTo(narrowEndBox.x + narrowEndBox.width);
  });

  it("resolves a staggered text child of a column to its layout position, not its raw pre-layout one", () => {
    // Guards the property the sandbox-timeline authoring API depends on: a
    // staggered (per-word) entrance on a text clip living inside a flex
    // container must not opt that clip out of layout resolution. The
    // block-level base transform (`resolveAnimatedLayerProps`'s `base`) comes
    // from the layout-resolved `ActiveLayer.transform`, and a staggered
    // animation's block-level fold only touches effect/mask curves
    // (AGENTS.md), so the resolved position should ride through untouched for
    // both a staggered and a plain clip.
    const staggerAnim = (id: string) => [{
      id,
      role: "in" as const,
      preset: "custom" as const,
      delayMs: 0,
      durationMs: 300,
      custom: {
        curves: [
          { property: "offsetY", keyframes: [{ t: 0, value: 40 }, { t: 1, value: 0, easing: "easeOut" }] },
          { property: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1, easing: "easeOut" }] }
        ]
      },
      stagger: { unit: "word" as const, offsetMs: 90 }
    }];
    const title = clip("title", {
      mediaType: "text", parentId: "stack", trackId: "t1", durationMs: 2000,
      textStyle: { text: "Title line", fontSizePx: 80, color: "#fff" },
      animations: staggerAnim("a1")
    });
    const sub = clip("sub", {
      mediaType: "text", parentId: "stack", trackId: "t2", durationMs: 2000,
      textStyle: { text: "Subtitle line below", fontSizePx: 80, color: "#fff" },
      animations: staggerAnim("a2")
    });
    const stack = clip("stack", {
      mediaType: "group", trackId: "t0", durationMs: 2000,
      layout: { display: "flex", flexDirection: "column", gap: 24, alignItems: "flex-start" }
    });
    const tracks = ["t0", "t1", "t2"].map((id, index) => makeTrack({ id, type: "video", index, visible: true }));
    const timeMs = 1000; // well past the 300ms entrance window
    const layers = computeActiveLayers(tracks, [stack, title, sub], timeMs, { canvas });
    const byId = new Map(layers.map((layer) => [layer.clipId, layer]));
    const titleLayer = byId.get("title")!;
    const subLayer = byId.get("sub")!;
    const titleResolved = resolveAnimatedLayerProps({ clip: title, transform: titleLayer.transform, opacity: titleLayer.opacity }, timeMs, canvas);
    const subResolved = resolveAnimatedLayerProps({ clip: sub, transform: subLayer.transform, opacity: subLayer.opacity }, timeMs, canvas);
    // The column put them apart (not both at the group's raw y:0); a bug that
    // dropped layout resolution for staggered text would leave both at 0.
    expect(titleResolved.transform?.position.y).not.toBe(subResolved.transform?.position.y);
    expect(Math.abs((subResolved.transform?.position.y ?? 0) - (titleResolved.transform?.position.y ?? 0))).toBeGreaterThan(40);
  });

  it("tiles a repeater into rows and columns", () => {
    const source = clip("tile", { transform: IDENTITY_TRANSFORM, repeater: { count: 6, positionStep: { x: 20, y: 0 }, rowStep: { x: 0, y: 30 }, columns: 3, timeStepMs: 0 } });
    expect(timelineClip.parse(source).repeater).toEqual(source.repeater);
    const copies = expandTemporalClips([source]);
    expect(copies.map((item) => item.transform?.position)).toEqual([
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 0 },
      { x: 0, y: 30 }, { x: 20, y: 30 }, { x: 40, y: 30 }
    ]);
  });

  it("resolves a wide flex row with many siblings without cycling", () => {
    const count = 1200;
    const children = Array.from({ length: count }, (_, index) =>
      clip(`item-${index}`, { mediaType: "shape", parentId: "long-row", shapeStyle: { kind: "rect", width: 0.01, height: 0.01 } })
    );
    const row = clip("long-row", { mediaType: "group", layout: { display: "flex", flexDirection: "row", gap: 1 } });
    const { transforms, cycles } = resolveClipLayoutsWithDiagnostics([row, ...children], canvas);
    expect(cycles).toEqual([]);
    expect(transforms.size).toBe(count);
    const firstBox = clipLayoutBox({ ...children[0], transform: transforms.get(children[0].id) }, canvas);
    const lastBox = clipLayoutBox({ ...children[count - 1], transform: transforms.get(children[count - 1].id) }, canvas);
    expect(lastBox.x).toBeGreaterThan(firstBox.x + firstBox.width);
  });

  it("interpolates camera motion, parallax, and focus blur", () => {
    const camera = { position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1000, focusDepthPx: 0, aperturePx: 12,
      keyframes: [
        { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0, focusDepthPx: 0 },
        { timeMs: 1000, position: { x: 100, y: 0 }, depthPx: 0, focusDepthPx: 0 }
      ] };
    const sampled = sampleCamera2D(camera, 500);
    expect(sampled.position.x).toBe(50);
    const far = resolveCamera2D({ ...IDENTITY_TRANSFORM, position: { x: 200, y: 0 }, depthPx: -500 }, sampled);
    const near = resolveCamera2D({ ...IDENTITY_TRANSFORM, position: { x: 200, y: 0 }, depthPx: 500 }, sampled);
    expect(near.transform.position.x).toBeGreaterThan(far.transform.position.x);
    expect(near.effects?.some((effect) => effect.type === "blur")).toBe(true);
  });

  it("applies a grouped card's camera depth to all of its children", () => {
    const group = clip("card", { mediaType: "group", transform: { ...IDENTITY_TRANSFORM, position: { x: 200, y: 0 }, depthPx: -300 } });
    const shape = clip("card-shape", { mediaType: "shape", parentId: "card", shapeStyle: { kind: "rect", x: 0.4, y: 0.4, width: 0.2, height: 0.2 } });
    const text = clip("card-text", { mediaType: "text", parentId: "card", textStyle: { text: "Card", fontSizePx: 20, color: "#ffffff" } });
    const track = makeTrack({ id: "track", type: "video", visible: true });
    const camera = { position: { x: 100, y: 0 }, depthPx: 260, focalLengthPx: 1000 };
    const layers = computeActiveLayers([track], [group, shape, text], 100, { canvas, camera2d: camera });
    const flat = computeActiveLayers([track], [{ ...group, transform: { ...IDENTITY_TRANSFORM, position: { x: 200, y: 0 }, depthPx: 0 } }, shape, text], 100, { canvas, camera2d: camera });
    expect(layers).toHaveLength(2);
    expect(layers[0].parentMatrix).toEqual(layers[1].parentMatrix);
    expect(layers.every((layer) => layer.camera2d === null)).toBe(true);
    expect(layers[0].parentMatrix?.[0]).not.toBeCloseTo(flat[0].parentMatrix?.[0] ?? 0);
    const focused = computeActiveLayersWithHorizon([track], [group, shape, text], 100, { canvas, camera2d: { ...camera, aperturePx: 12, focusDepthPx: 0 } });
    expect(focused.precomposites[0]?.effects?.some((effect) => effect.id === "camera-dof")).toBe(true);
  });
});

describe("temporal timeline authoring", () => {
  it("persists repeat, echo, shutter, stepped time, layout, and camera fields", () => {
    const source = clip("source", {
      transform: { ...IDENTITY_TRANSFORM, depthPx: 100 },
      layout: { display: "flex", flexDirection: "row", gap: 8 },
      repeater: { count: 3, positionStep: { x: 20, y: 0 }, timeStepMs: 40, colorStep: { hueDegrees: 30 } },
      temporalEcho: { copies: 2, intervalMs: 50, opacityDecay: 0.5 },
      motionBlur: { samplesPerFrame: 8, shutterAngle: 270 },
      steppedTime: { fps: 12 }
    });
    expect(timelineClip.parse(source)).toMatchObject({ repeater: source.repeater, temporalEcho: source.temporalEcho, motionBlur: source.motionBlur, steppedTime: source.steppedTime });
    const sequence = makeSequence({ id: "sequence", tracks: [makeTrack({ id: "track", type: "video" })], clips: [source], camera2d: { position: { x: 0, y: 0 }, depthPx: 0, focalLengthPx: 1000 } });
    expect(timelineSequenceResponse.parse(sequence).camera2d).toEqual(sequence.camera2d);
  });

  it("expands repeats and echoes with distinct clocks, positions, and hues", () => {
    const source = clip("source", { repeater: { count: 3, positionStep: { x: 20, y: 0 }, timeStepMs: 40, colorStep: { hueDegrees: 30 } }, temporalEcho: { copies: 2, intervalMs: 50, opacityDecay: 0.5 } });
    const expanded = expandTemporalClips([source]);
    expect(expanded).toHaveLength(9);
    expect(expanded.map((entry) => entry.id)).toContain("source:repeat:2:echo:1");
    expect(expanded[6].transform?.position.x).toBe(40);
    expect(expanded[6].startMs).toBe(80);
    expect(expanded[6].effects?.at(-1)).toMatchObject({ type: "color", hue: 60 });
    expect(expanded[1].opacity).toBeCloseTo(0.25);
    const track = makeTrack({ id: "track", type: "video", visible: true });
    expect(computeActiveLayers([track], [source], 120).map((layer) => layer.clipId)).toContain("source:repeat:2");
  });

  it("samples each layer's shutter independently and quantizes only stepped clips", () => {
    const blurred = clip("blurred", { motionBlur: { samplesPerFrame: 4, shutterAngle: 180 }, steppedTime: { fps: 12 } });
    const staticClip = clip("still");
    const scene = resolveSceneMotionBlur([blurred, staticClip], undefined);
    expect(scene.samplesPerFrame).toBe(4);
    expect(layerShutterTime(staticClip, 100, 2, 4, 40, undefined)).toBe(100);
    expect(layerShutterTime(blurred, 100, 2, 4, 40, undefined)).toBeCloseTo(112.5);
    expect(clipSteppedTime(blurred, 125)).toBeCloseTo(83.333, 2);
    expect(clipSteppedTime(staticClip, 125)).toBe(125);
    const track = makeTrack({ id: "track", type: "video", visible: true });
    const entering = clip("entering", { startMs: 110, motionBlur: { samplesPerFrame: 4, shutterAngle: 360 } });
    const frameMs = 40;
    const first = computeActiveLayers([track], [entering], 105, {
      layerTimeMs: (candidate) => layerShutterTime(candidate, 100, 0, 4, frameMs, undefined)
    });
    const last = computeActiveLayers([track], [entering], 135, {
      layerTimeMs: (candidate) => layerShutterTime(candidate, 100, 3, 4, frameMs, undefined)
    });
    expect(first).toHaveLength(0);
    expect(last).toHaveLength(1);
  });

  it("moves a clip animation to beat three and staggers peers without moving media", () => {
    const animation = { id: "in", role: "in" as const, preset: "fade", durationMs: 100, beat: { index: 3, scope: "clip" as const } };
    const first = clip("first", { durationMs: 1500, animations: [animation] });
    expect(beatAnimationDelayMs(animation, first, { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } })).toBe(1000);
    const second = clip("second", { animations: [{ ...animation, beat: undefined }] });
    const staggered = staggerClipAnimations([second, first], ["first", "second"], 4 * 1000 / 30);
    expect(staggered[0].startMs).toBe(second.startMs);
    expect(staggered[0].animations?.[0].delayMs).toBeCloseTo(133.333, 2);
    expect(staggered[1].animations?.[0].delayMs).toBe(0);
    const props = resolveAnimatedLayerProps({ clip: first, opacity: 1 }, 1000, canvas, undefined, { clips: [first], mediaTracks: [], tempo: { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } } });
    expect(props.opacity).toBeLessThan(1);
  });
});
