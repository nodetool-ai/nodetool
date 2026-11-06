import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import type { TimelineSequence } from "@nodetool-ai/timeline";
import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

const sequence: TimelineSequence = {
  id: "preview", projectId: "project", name: "Shared preview", width: 160, height: 90,
  fps: 30, durationMs: 1000, markers: [], createdAt: "", updatedAt: "",
  tracks: [{ id: "track", name: "Track", type: "video", index: 0, visible: true, locked: false }],
  clips: [{ id: "shape", name: "Shape", trackId: "track", startMs: 0, durationMs: 1000,
    mediaType: "shape", sourceType: "generated", status: "generated",
    shapeStyle: { kind: "rect", fill: "#ff0000", x: 0, y: 0, width: 1, height: 1 } }]
};

async function rgba(png: Uint8Array) {
  const canvas = createCanvas(160, 90);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(await loadImage(Buffer.from(png)), 0, 0);
  return ctx.getImageData(0, 0, 160, 90).data;
}

describe("shared preview qualification", () => {
  it("preserves opaque geometry, timecodes and diagnostics on a real adapter", async () => {
    const options = { sequence, width: 160, timesMs: [0, 500], loadAsset: async () => null };
    const before = await renderTimelineFrames(options, false);
    const after = await renderTimelineFrames(options, true);
    expect(after.complete).toBe(true);
    expect(after.effectsNotApplied).toEqual(before.effectsNotApplied);
    for (let i = 0; i < before.frames.length; i++) {
      expect({ ...after.frames[i], png: undefined }).toEqual({ ...before.frames[i], png: undefined });
      expect(await rgba(after.frames[i].png)).toEqual(await rgba(before.frames[i].png));
    }
  });

  it("preserves the agent-facing unknown-effect report", async () => {
    const options = { sequence: { ...sequence, clips: sequence.clips.map(clip => ({ ...clip, effects: [{ id: "future", type: "future-look", enabled: true }] })) }, width: 160, timesMs: [0], loadAsset: async () => null };
    const cpu = await renderTimelineFrames(options, false);
    const gpu = await renderTimelineFrames(options, true);
    expect(gpu.effectsNotApplied).toEqual(["future-look"]);
    expect(gpu.effectsNotApplied).toEqual(cpu.effectsNotApplied);
    expect(gpu.complete).toBe(cpu.complete);
    expect({ ...gpu.frames[0], png: undefined }).toEqual({ ...cpu.frames[0], png: undefined });
  });

  it("completes two concurrent passes without sharing frame targets", async () => {
    const passes = await Promise.all([0, 500].map((time) => renderTimelineFrames({
      sequence, width: 160, timesMs: [time], loadAsset: async () => null
    }, true)));
    expect(passes.map((pass) => pass.frames[0].time_ms)).toEqual([0, 500]);
    expect(await rgba(passes[0].frames[0].png)).toEqual(await rgba(passes[1].frames[0].png));
  });
});
