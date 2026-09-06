/**
 * The static early-out on the preview path (A5.2).
 *
 * With nothing moving, 8 samples average 8 copies of one picture. The
 * composite is counted by wrapping `drawTimelineFrame`, which is the call that
 * costs the work — and the animated case proves the check still says "moving".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TimelineSequence } from "@nodetool-ai/timeline";

const draws: number[] = [];

vi.mock("@nodetool-ai/timeline/scene", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const drawTimelineFrame = original["drawTimelineFrame"] as (
    ...args: unknown[]
  ) => unknown;
  return {
    ...original,
    drawTimelineFrame: (...args: unknown[]) => {
      draws.push(1);
      return drawTimelineFrame(...args);
    }
  };
});

const { renderTimelineFrames } = await import(
  "../src/timeline-preview/frames.js"
);

function sequence(animated: boolean): TimelineSequence {
  return {
    id: "seq",
    name: "Static",
    width: 320,
    height: 180,
    fps: 25,
    durationMs: 2000,
    tracks: [{ id: "t1", type: "video", index: 0, visible: true }],
    clips: [
      {
        id: "c1",
        trackId: "t1",
        name: "Card",
        startMs: 0,
        durationMs: 2000,
        mediaType: "text",
        status: "generated",
        textStyle: { text: "hold", fontSize: 40, color: "#ffffff" },
        ...(animated
          ? {
              animations: [
                {
                  id: "a1",
                  role: "in",
                  preset: "slide",
                  durationMs: 1000,
                  easing: "linear"
                }
              ]
            }
          : {})
      }
    ],
    transcript: []
  } as unknown as TimelineSequence;
}

async function render(animated: boolean) {
  return renderTimelineFrames({
    sequence: sequence(animated),
    timesMs: [400],
    width: 320,
    loadAsset: async () => null,
    motionBlur: { samplesPerFrame: 8, shutterAngle: 180 }
  } as never);
}

beforeEach(() => {
  draws.length = 0;
});

describe("preview motion blur — static frames", () => {
  it("composites a still frame once at 8 samples", async () => {
    const result = await render(false);
    expect(result.frames).toHaveLength(1);
    expect(draws).toHaveLength(1);
  });

  it("still composites 8 times while an animation is in flight", async () => {
    await render(true);
    expect(draws).toHaveLength(8);
  });
});
