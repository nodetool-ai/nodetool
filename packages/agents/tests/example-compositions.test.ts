/**
 * The six compositions NodeTool ships.
 *
 * A shipped template is only worth shipping if it lands as a valid document and
 * actually draws, so both are checked here rather than assumed: every one is
 * inserted through the real `insert_composition` op into a scratch document and
 * validated, and the lower third is rendered and read pixel by pixel. The count
 * is asserted too — a check that found no compositions would otherwise pass by
 * examining nothing.
 */

import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { validateTimelineSequence } from "@nodetool-ai/execution/timeline-debug";
import type {
  TimelineComposition,
  TimelineSequence
} from "@nodetool-ai/timeline";
import { loadShippedCompositions } from "../src/capabilities/compositions.js";
import { createTimelineToolBridge } from "../src/evals/surfaces/timeline.js";
import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

const SHIPPED = loadShippedCompositions();

const SLUGS = [
  "callout",
  "caption-bar",
  "cta-end-card",
  "logo-sting",
  "lower-third",
  "title-card"
];

/** Insert one composition into an empty sequence and hand back the document. */
async function insertInto(
  composition: TimelineComposition,
  size: { width: number; height: number }
): Promise<ReturnType<ReturnType<typeof createTimelineToolBridge>["finalState"]>> {
  const bridge = createTimelineToolBridge({
    width: size.width,
    height: size.height,
    loadComposition: {
      get: async (id) => (id === composition.id ? composition : null),
      listIds: async () => [composition.id]
    }
  });
  const tool = bridge.tools.find(
    (t) => t.name === "ui_timeline_insert_composition"
  );
  if (!tool) throw new Error("the bridge has no insert_composition op");
  await tool.execute({ composition_id: composition.id, startMs: 0 });
  return bridge.finalState();
}

describe("the shipped compositions", () => {
  it("ships all six, each with parameters", () => {
    expect(SHIPPED.map((c) => c.id).sort()).toEqual(SLUGS);
    for (const composition of SHIPPED) {
      expect(Object.keys(composition.params).length).toBeGreaterThan(0);
      expect(composition.children.length).toBeGreaterThan(1);
    }
  });

  for (const slug of SLUGS) {
    it(`validates clean once ${slug} is inserted`, async () => {
      const composition = SHIPPED.find((c) => c.id === slug);
      expect(composition).toBeDefined();
      const document = await insertInto(composition!, {
        width: 1920,
        height: 1080
      });
      const validation = validateTimelineSequence(
        {
          tracks: document.documentTracks,
          clips: document.documentClips,
          markers: document.markers
        },
        { fps: 30, width: 1920, height: 1080 }
      );
      expect(validation.errors).toEqual([]);
      expect(validation.warnings).toEqual([]);
    });
  }
});

/** Bright, near-white pixels in a PNG, as fractions of the frame. */
async function whiteInk(
  png: Uint8Array
): Promise<{ points: { x: number; y: number }[]; width: number; height: number }> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;
  const points: { x: number; y: number }[] = [];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const i = (y * image.width + x) * 4;
      if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) {
        points.push({ x: x / image.width, y: y / image.height });
      }
    }
  }
  return { points, width: image.width, height: image.height };
}

describe("insert lower-third and look at it", () => {
  it("draws the name inside the text clip's own bounds", async () => {
    const composition = SHIPPED.find((c) => c.id === "lower-third");
    expect(composition).toBeDefined();
    const document = await insertInto(composition!, {
      width: 1280,
      height: 720
    });

    const sequence: TimelineSequence = {
      id: "seq",
      projectId: "proj",
      name: "scratch",
      fps: 30,
      width: 1280,
      height: 720,
      durationMs: 4000,
      tracks: document.documentTracks,
      clips: document.documentClips,
      markers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const nameClip = sequence.clips.find((clip) => clip.name === "Name");
    expect(nameClip?.textStyle?.text).toBe("Name");

    const { frames } = await renderTimelineFrames({
      sequence,
      // 1500ms: past the 450ms entrance, well before the tail.
      timesMs: [1500],
      width: 1280,
      loadAsset: async () => null
    });
    const { points } = await whiteInk(frames[0].png);

    // The bounds each text clip declares for itself: its transform offset from
    // the frame centre, in sequence pixels, plus a line of its own type either
    // side and a generous run of it across.
    const bounds = sequence.clips
      .filter((clip) => clip.mediaType === "text")
      .map((clip) => {
        const style = clip.textStyle!;
        return {
          name: clip.name,
          centerX: 0.5 + (clip.transform?.position.x ?? 0) / sequence.width,
          centerY: 0.5 + (clip.transform?.position.y ?? 0) / sequence.height,
          halfHeight: style.fontSizePx / sequence.height,
          halfWidth: (style.fontSizePx * 6) / sequence.width
        };
      });
    const inside = (box: (typeof bounds)[number], p: { x: number; y: number }) =>
      Math.abs(p.y - box.centerY) <= box.halfHeight &&
      Math.abs(p.x - box.centerX) <= box.halfWidth;

    const nameBox = bounds.find((box) => box.name === "Name")!;
    expect(points.filter((p) => inside(nameBox, p)).length).toBeGreaterThan(50);
    expect(points.filter((p) => !bounds.some((box) => inside(box, p)))).toEqual(
      []
    );
  });
});
