import { describe, expect, it } from "vitest";
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
  it("sizes a shape plate to text and follows a chained relative target regardless of document order", () => {
    const label = clip("label", { mediaType: "text", textStyle: { text: "Logo", fontSizePx: 20, color: "#ffffff" } });
    const logo = clip("logo", { mediaType: "shape", shapeStyle: { kind: "rect", x: 0.1, y: 0.2, width: 0.1, height: 0.2 }, layout: { kind: "relative", targetClipId: "label", side: "left", gapPx: 20 } });
    const plate = clip("plate", { mediaType: "shape", shapeStyle: { kind: "rect", x: 0.25, y: 0.25, width: 0.2, height: 0.2 }, layout: { kind: "relative", targetClipId: "logo", side: "below", gapPx: 10 } });
    const fitted = clip("fitted", { mediaType: "shape", shapeStyle: { kind: "rect", x: 0.1, y: 0.1, width: 0.1, height: 0.1 }, layout: { kind: "relative", targetClipId: "label", side: "center", fitText: { paddingXPx: 10, paddingYPx: 5 } } });
    const { transforms, cycles } = resolveClipLayoutsWithDiagnostics([plate, fitted, logo, label], canvas);
    expect(cycles).toEqual([]);
    const labelBox = clipLayoutBox(label, canvas);
    const logoBox = clipLayoutBox({ ...logo, transform: transforms.get("logo") }, canvas);
    const plateBox = clipLayoutBox({ ...plate, transform: transforms.get("plate") }, canvas);
    const fitBox = clipLayoutBox({ ...fitted, transform: transforms.get("fitted") }, canvas);
    expect(logoBox.x + logoBox.width + 20).toBeCloseTo(labelBox.x);
    expect(plateBox.y).toBeCloseTo(logoBox.y + logoBox.height + 10);
    expect(fitBox.width).toBeCloseTo(labelBox.width + 20);
    expect(fitBox.height).toBeCloseTo(labelBox.height + 10);
  });

  it("reports relative cycles without hanging", () => {
    const a = clip("a", { layout: { kind: "relative", targetClipId: "b" } });
    const b = clip("b", { layout: { kind: "relative", targetClipId: "a" } });
    const follower = clip("follower", { layout: { kind: "relative", targetClipId: "a" } });
    expect(resolveClipLayoutsWithDiagnostics([follower, a, b], canvas).cycles).toEqual(["a", "b"]);
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

  it("sizes a group from its children when placing it in a row", () => {
    const group = clip("mark", { mediaType: "group" });
    const part = clip("part", { mediaType: "shape", parentId: "mark", shapeStyle: { kind: "rect", x: 0.45, y: 0.4, width: 0.1, height: 0.2 } });
    const word = clip("word", { mediaType: "text", textStyle: { text: "Name", fontSizePx: 20, color: "#ffffff" } });
    const row = clip("row", { mediaType: "group", layout: { kind: "row", children: ["mark", "word"], gapPx: 10 } });
    expect(clipLayoutBox(group, canvas).width).toBe(0);
    const { transforms } = resolveClipLayoutsWithDiagnostics([row, group, part, word], canvas);
    const box = clipLayoutBox({ ...group, transform: transforms.get("mark") }, canvas, [group, part]);
    expect(box.width).toBeCloseTo(100);
    expect(box.x + box.width + 10).toBeCloseTo(clipLayoutBox({ ...word, transform: transforms.get("word") }, canvas).x);
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

  it("resolves a long reverse-ordered relative chain", () => {
    const count = 1200;
    const chain = Array.from({ length: count }, (_, index) => clip(`item-${index}`, {
      layout: index === 0 ? undefined : { kind: "relative", targetClipId: `item-${index - 1}`, side: "right", gapPx: 1 }
    })).reverse();
    const { transforms, cycles } = resolveClipLayoutsWithDiagnostics(chain, canvas);
    expect(cycles).toEqual([]);
    expect(transforms.size).toBe(count - 1);
    expect(clipLayoutBox({ ...chain[0], transform: transforms.get(chain[0].id) }, canvas).x).toBeGreaterThan(1000);
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
      layout: { kind: "relative", targetClipId: "other", side: "right" },
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
