/**
 * Groups with transform inheritance (D4).
 *
 * The scene model resolves a group before the clips that name it, so these
 * cases assert the three things a child inherits — the matrix, the opacity and
 * the window — plus the two ways a document can name a parent that cannot be
 * resolved. Every matrix expectation is built from `buildTransformMatrix`
 * itself rather than from copied numbers, so a change to the placement math
 * moves the test and the code together.
 */
import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import type { TimelineClip, TimelineTrack } from "../src/index.js";
import {
  computeActiveLayers,
  computeActiveLayersWithHorizon,
  resolveGroups
} from "../src/render/sceneModel.js";
import { buildTransformMatrix } from "../src/render/transform.js";

/** Square, so a rotation is a plain rotation and the aspect term drops out. */
const CANVAS = { width: 1000, height: 1000 };

const transform = (over: {
  x?: number;
  y?: number;
  rotation?: number;
  scale?: number;
  anchor?: { x: number; y: number };
}) => ({
  position: { x: over.x ?? 0, y: over.y ?? 0 },
  scale: { x: over.scale ?? 1, y: over.scale ?? 1 },
  rotation: over.rotation ?? 0,
  anchor: over.anchor ?? { x: 0.5, y: 0.5 }
});

const groupClip = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    mediaType: "group",
    trackId: "video",
    durationMs: 1000,
    status: "generated",
    ...over
  });

const childClip = (over: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    mediaType: "image",
    trackId: "video",
    durationMs: 1000,
    status: "generated",
    currentAssetId: "asset-1",
    ...over
  });

const tracks: TimelineTrack[] = [
  makeTrack({ id: "video", type: "video", index: 0, visible: true })
];

/** The matrix a group with this transform resolves to, with no parent above it. */
const groupMatrix = (t: ReturnType<typeof transform>, parent?: Float32Array) =>
  buildTransformMatrix(t, { x: 1, y: 1 }, CANVAS.width, CANVAS.height, parent);

describe("resolveGroups", () => {
  it("intersects a nested group's window with its parent's", () => {
    const outer = groupClip({ id: "outer", startMs: 0, durationMs: 1000 });
    const inner = groupClip({
      id: "inner",
      parentId: "outer",
      startMs: 500,
      durationMs: 2000
    });
    const groups = resolveGroups([outer, inner], 600, CANVAS);
    expect(groups.get("inner")?.window).toEqual({ startMs: 500, endMs: 1000 });
  });

  it("multiplies a nested group's opacity by its parent's", () => {
    const outer = groupClip({ id: "outer", opacity: 0.5 });
    const inner = groupClip({ id: "inner", parentId: "outer", opacity: 0.5 });
    const groups = resolveGroups([outer, inner], 100, CANVAS);
    expect(groups.get("inner")?.opacity).toBeCloseTo(0.25);
  });

  it("composes a nested group's matrix under its parent's", () => {
    const outer = groupClip({ id: "outer", transform: transform({ x: 100 }) });
    const inner = groupClip({
      id: "inner",
      parentId: "outer",
      transform: transform({ x: 100 })
    });
    const groups = resolveGroups([outer, inner], 100, CANVAS);
    // Each 100px shift is 0.2 of clip space on a 1000px frame, and the inner
    // group carries both.
    expect(groups.get("inner")?.matrix?.[12]).toBeCloseTo(0.4);
  });

  it("refuses a parent cycle instead of following it", () => {
    const a = groupClip({ id: "a", parentId: "b" });
    const b = groupClip({ id: "b", parentId: "a" });
    const groups = resolveGroups([a, b], 100, CANVAS);
    expect(groups.get("a")?.cycle).toBe(true);
    expect(groups.get("b")?.cycle).toBe(true);
    // Refused means unparented, not un-resolved: each group still carries its
    // own transform so the document renders.
    expect(groups.get("a")?.matrix).toEqual(groupMatrix(transform({})));
  });

  it("resolves a group whose parent chain is deep, once per group", () => {
    const chain = Array.from({ length: 20 }, (_, i) =>
      groupClip({
        id: `g${i}`,
        parentId: i === 0 ? undefined : `g${i - 1}`,
        transform: transform({ x: 50 })
      })
    );
    const groups = resolveGroups(chain, 100, CANVAS);
    expect(groups.size).toBe(20);
    // 20 shifts of 50px on a 1000px frame: 20 × 0.1 of clip space.
    expect(groups.get("g19")?.matrix?.[12]).toBeCloseTo(2);
  });
});

describe("computeActiveLayers — groups", () => {
  it("draws no layer for the group clip itself", () => {
    const layers = computeActiveLayers(
      tracks,
      [groupClip({ id: "g" }), childClip({ id: "c", parentId: "g" })],
      100,
      { canvas: CANVAS }
    );
    expect(layers.map((l) => l.clipId)).toEqual(["c"]);
  });

  it("hands a child its parent's matrix", () => {
    const t = transform({ x: 100, y: -50 });
    const layers = computeActiveLayers(
      tracks,
      [groupClip({ id: "g", transform: t }), childClip({ id: "c", parentId: "g" })],
      100,
      { canvas: CANVAS }
    );
    expect(layers[0]?.parentMatrix).toEqual(groupMatrix(t));
  });

  it("turns a child about the group's anchor, not its own", () => {
    // The group rotates a quarter turn about the frame's left edge, mid-height.
    // A child sitting at the frame centre (clip-space origin) therefore lands
    // one clip-space unit left and one up — the corner — while a child rotated
    // about its own anchor would not move at all.
    const t = transform({ rotation: Math.PI / 2, anchor: { x: 0, y: 0.5 } });
    const layers = computeActiveLayers(
      tracks,
      [groupClip({ id: "g", transform: t }), childClip({ id: "c", parentId: "g" })],
      100,
      { canvas: CANVAS }
    );
    const composed = buildTransformMatrix(
      transform({}),
      { x: 1, y: 1 },
      CANVAS.width,
      CANVAS.height,
      layers[0]?.parentMatrix
    );
    expect(composed[12]).toBeCloseTo(-1);
    expect(composed[13]).toBeCloseTo(1);
  });

  it("multiplies the group's opacity into the child's", () => {
    const layers = computeActiveLayers(
      tracks,
      [
        groupClip({ id: "g", opacity: 0.5 }),
        childClip({ id: "c", parentId: "g", opacity: 0.5 })
      ],
      100,
      { canvas: CANVAS }
    );
    expect(layers[0]?.opacity).toBeCloseTo(0.25);
  });

  it("leaves out a child sitting outside its parent's window", () => {
    const clips = [
      groupClip({ id: "g", startMs: 0, durationMs: 1000 }),
      childClip({ id: "c", parentId: "g", startMs: 500, durationMs: 2000 })
    ];
    expect(
      computeActiveLayers(tracks, clips, 600, { canvas: CANVAS })
    ).toHaveLength(1);
    expect(
      computeActiveLayers(tracks, clips, 1500, { canvas: CANVAS })
    ).toHaveLength(0);
  });

  it("moves the change horizon to a group window edge", () => {
    const { nextChangeMs } = computeActiveLayersWithHorizon(
      tracks,
      [
        groupClip({ id: "g", startMs: 0, durationMs: 400 }),
        childClip({ id: "c", parentId: "g", startMs: 0, durationMs: 5000 })
      ],
      100,
      { canvas: CANVAS }
    );
    expect(nextChangeMs).toBe(400);
  });

  it("renders a child unparented when its parent is missing or is not a group", () => {
    const media = childClip({ id: "not-a-group" });
    const layers = computeActiveLayers(
      tracks,
      [
        media,
        childClip({ id: "orphan", parentId: "gone" }),
        childClip({ id: "misparented", parentId: "not-a-group" })
      ],
      100,
      { canvas: CANVAS }
    );
    expect(layers).toHaveLength(3);
    for (const layer of layers) {
      expect(layer.parentMatrix).toBeUndefined();
    }
  });

  it("clips a child by a nested group's intersected window", () => {
    const clips = [
      groupClip({ id: "outer", startMs: 0, durationMs: 1000 }),
      groupClip({ id: "inner", parentId: "outer", startMs: 0, durationMs: 5000 }),
      childClip({ id: "c", parentId: "inner", startMs: 0, durationMs: 5000 })
    ];
    expect(
      computeActiveLayers(tracks, clips, 900, { canvas: CANVAS })
    ).toHaveLength(1);
    expect(
      computeActiveLayers(tracks, clips, 1200, { canvas: CANVAS })
    ).toHaveLength(0);
  });

  it("composes unparented when no canvas is supplied, and still clips", () => {
    const clips = [
      groupClip({ id: "g", startMs: 0, durationMs: 400, transform: transform({ x: 100 }) }),
      childClip({ id: "c", parentId: "g", startMs: 0, durationMs: 5000 })
    ];
    const inside = computeActiveLayers(tracks, clips, 100);
    expect(inside[0]?.parentMatrix).toBeUndefined();
    expect(computeActiveLayers(tracks, clips, 500)).toHaveLength(0);
  });
});
