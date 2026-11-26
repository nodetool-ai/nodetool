import { describe, it, expect, vi, beforeEach } from "vitest";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { MIDI_PPQ } from "@nodetool-ai/timeline";
import {
  mediaCalls,
  mixInputPaths,
  resetFakeMedia
} from "./_fixtures/fake-media.js";

vi.mock("@nodetool-ai/runtime/media", async (importOriginal) =>
  (await import("./_fixtures/fake-media.js")).fakeMediaModule(await importOriginal())
);

vi.mock("../src/nodes/timeline/compositeRender.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    renderTimelineComposited: async (opts: { outPath: string }) => {
      fsSync.writeFileSync(opts.outPath, Buffer.from("fake:composited"));
      return { totalFrames: 1, skippedClips: [], fontsUnavailable: [] };
    }
  };
});

const { RenderTimelineNode } = await import("../src/nodes/timeline.js");

function contextFor(seq: unknown) {
  return {
    getTimelineSequence: vi.fn().mockResolvedValue(seq),
    localPath: vi.fn(async () => null),
    resolveAssetBytes: vi
      .fn()
      .mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]) }),
    postMessage: vi.fn(),
    workflowId: "wf-sec",
    signal: new AbortController().signal
  };
}

async function render(seq: unknown) {
  const node = new RenderTimelineNode();
  Object.assign(node, {
    timeline: { type: "timeline", id: "seq-sec" },
    __node_id: "node-sec"
  });
  return node.process(contextFor(seq) as never);
}

beforeEach(() => {
  resetFakeMedia();
});

describe("Timeline render security regressions", () => {
  it("confines rendered MIDI WAV files inside the render workDir even with traversal clip IDs", async () => {
    const escapedTarget = path.join(os.tmpdir(), "nodetool-escaped-midi-test.wav");
    fsSync.rmSync(escapedTarget, { force: true });

    try {
      await render({
        id: "seq-sec",
        name: "MIDI traversal",
        width: 320,
        height: 180,
        fps: 30,
        durationMs: 1000,
        tracks: [{ id: "t-midi", type: "midi", index: 0, visible: true }],
        clips: [
          {
            id: "/../../nodetool-escaped-midi-test",
            trackId: "t-midi",
            name: "Bad ID",
            startMs: 0,
            durationMs: 1000,
            mediaType: "midi",
            sourceType: "generated",
            notes: [
              { id: "n0", pitch: 60, velocity: 100, startTick: 0, durationTick: MIDI_PPQ }
            ]
          }
        ],
        transcript: []
      });

      expect(fsSync.existsSync(escapedTarget)).toBe(false);
      const inputs = mixInputPaths();
      expect(inputs.length).toBe(1);
      expect(path.dirname(inputs[0]!)).toMatch(/nodetool-timeline-/);
    } finally {
      fsSync.rmSync(escapedTarget, { force: true });
    }
  });

  it("does not interpolate unvalidated audio filter modes into the FFmpeg filtergraph", async () => {
    await render({
      id: "seq-sec",
      name: "Filter mode injection",
      width: 320,
      height: 180,
      fps: 30,
      durationMs: 1000,
      tracks: [
        {
          id: "t-audio",
          type: "audio",
          index: 0,
          visible: true,
          effects: [
            {
              id: "fx1",
              type: "filter",
              enabled: true,
              mode: "anull,amovie=/etc/passwd",
              frequency: 1000,
              q: 1
            }
          ]
        }
      ],
      clips: [
        {
          id: "clip-a",
          trackId: "t-audio",
          name: "Tone",
          startMs: 0,
          durationMs: 1000,
          mediaType: "audio",
          currentAssetId: "asset-a",
          status: "generated"
        }
      ],
      transcript: []
    });

    const mix = mediaCalls.find((call) => call.fn === "openFilterComplex");
    expect(mix).toBeDefined();
    if (mix?.fn === "openFilterComplex") {
      expect(mix.graph).not.toContain("amovie=");
    }
  });
});
