/**
 * `compare_timeline_frames` measures what moved between two cuts, so every
 * case here is one whose answer is known before the code runs: a document
 * against itself is 0 everywhere, and a clip shifted 500ms differs only where
 * the shift changes which clip is on screen.
 *
 * A test that only asserted "a number came back" would pass on a comparison
 * that always answers 0 — which is the failure mode that matters, because it
 * reads as "nothing changed" rather than as a broken tool.
 */

import { describe, expect, it } from "vitest";
import { loadImage } from "@napi-rs/canvas";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";

function track(index: number): TimelineTrack {
  return {
    id: `track-${index}`,
    name: `Track ${index}`,
    type: "video",
    index,
    visible: true,
    locked: false
  };
}

function shapeClip(
  id: string,
  fill: string,
  startMs: number,
  durationMs: number
): TimelineClip {
  return {
    id,
    trackId: "track-0",
    name: id,
    startMs,
    durationMs,
    mediaType: "shape",
    sourceType: "generated",
    status: "generated",
    shapeStyle: { kind: "rect", fill, x: 0, y: 0, width: 1, height: 1 }
  };
}

/** A red clip cutting to a blue one, with the cut at `cutMs`. */
function document(cutMs: number) {
  return {
    fps: 30,
    width: 640,
    height: 360,
    tracks: [track(0)],
    clips: [
      shapeClip("red", "#ff0000", 0, cutMs),
      shapeClip("blue", "#0000ff", cutMs, 4000 - cutMs)
    ],
    markers: []
  };
}

interface CompareResult {
  error?: string;
  frames: Array<{ time_ms: number; difference: number }>;
  changed_times_ms: number[];
  max_difference: number;
  mean_difference: number;
  sheet: {
    columns: number;
    rows: number;
    cells: number;
    width: number;
    height: number;
    image: { asset_id: string };
  };
}

function harness() {
  const stored = new Map<string, Uint8Array>();
  const context = {
    userId: "u1",
    hasModelInterface: (name: string) => name === "createAsset",
    createAsset: async ({ content }: { content: Uint8Array }) => {
      const id = `asset-${stored.size + 1}`;
      stored.set(id, content);
      return { id };
    }
  } as unknown as ProcessingContext;

  const call = (args: Record<string, unknown>) =>
    toolForCapabilityName("compare_timeline_frames").process(
      context,
      args
    ) as Promise<CompareResult>;

  return { stored, call };
}

describe("compare_timeline_frames", () => {
  it("scores a document against itself as zero at every timecode", async () => {
    const { call } = harness();
    const doc = document(2000);
    const result = await call({
      a: { document: doc },
      b: { document: doc },
      times_ms: [500, 1500, 2500, 3500],
      width: 96
    });

    expect(result.error).toBeUndefined();
    expect(result.frames.map((f) => f.difference)).toEqual([0, 0, 0, 0]);
    expect(result.changed_times_ms).toEqual([]);
    expect(result.max_difference).toBe(0);
  });

  it("scores a shifted cut above zero only where the shift changed the picture", async () => {
    const { call } = harness();
    const result = await call({
      // The cut moves from 2000ms to 2500ms, so only the frames between the
      // two cut points show a different clip.
      a: { document: document(2000) },
      b: { document: document(2500) },
      times_ms: [1000, 2250, 3000],
      width: 96
    });

    expect(result.error).toBeUndefined();
    const [before, between, after] = result.frames;
    expect(before.difference).toBe(0);
    expect(after.difference).toBe(0);
    // Full-frame red against full-frame blue: the change is unmistakable.
    expect(between.difference).toBeGreaterThan(0.3);
    expect(result.changed_times_ms).toEqual([2250]);
  });

  it("tiles the pairs into one side-by-side sheet", async () => {
    const { stored, call } = harness();
    const result = await call({
      a: { document: document(2000) },
      b: { document: document(2500) },
      range: { from_ms: 0, to_ms: 4000, count: 5 },
      width: 96
    });

    expect(result.error).toBeUndefined();
    expect(result.frames.map((f) => f.time_ms)).toEqual([
      0, 1000, 2000, 3000, 4000
    ]);
    expect(result.sheet.columns).toBe(3);
    expect(result.sheet.rows).toBe(2);
    expect(result.sheet.cells).toBe(5);

    const png = stored.get(result.sheet.image.asset_id);
    expect(png).toBeDefined();
    const image = await loadImage(Buffer.from(png as Uint8Array));
    expect(image.width).toBe(result.sheet.width);
    expect(image.height).toBe(result.sheet.height);
    expect(image.width).toBeLessThanOrEqual(1280);
    // Each cell is a pair, so it is wider than one frame.
    expect(result.sheet.width / result.sheet.columns).toBeGreaterThan(96);
  });

  it("refuses times_ms and range together", async () => {
    const { call } = harness();
    const result = await call({
      a: { document: document(2000) },
      b: { document: document(2000) },
      times_ms: [500],
      range: { from_ms: 0, to_ms: 1000, count: 2 }
    });
    expect(String(result.error)).toContain("not both");
  });

  it("refuses more frames than it will render", async () => {
    const { call } = harness();
    const result = await call({
      a: { document: document(2000) },
      b: { document: document(2000) },
      range: { from_ms: 0, to_ms: 4000, count: 25 }
    });
    expect(String(result.error)).toContain("at most 24");
  });

  it("names a side that carries no timeline", async () => {
    const { call } = harness();
    const result = await call({
      a: { document: document(2000) },
      b: { note: "not a timeline" }
    });
    expect(String(result.error)).toContain("b carries no timeline");
  });
});
