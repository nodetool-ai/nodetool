import { createCanvas, loadImage } from "@napi-rs/canvas";
import { makeClip, makeSequence, makeTrack } from "@nodetool-ai/timeline";
import { expect, it } from "vitest";
import { renderTimelineFrames } from "../src/timeline-preview/frames.js";

it("renders different pixel displacement for two depth planes under a camera push", async () => {
  const tracks = [
    makeTrack({ id: "far", type: "video", index: 0 }),
    makeTrack({ id: "near", type: "video", index: 1 })
  ];
  const clips = [-400, 200].map((depthPx, i) =>
    makeClip({
      id: "plane" + i,
      trackId: tracks[i].id,
      mediaType: "shape",
      status: "generated",
      durationMs: 2000,
      transform: {
        position: { x: 40, y: i === 0 ? -40 : 40 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0.5, y: 0.5 },
        depthPx
      },
      shapeStyle: {
        kind: "rect",
        x: 0.475,
        y: 0.45,
        width: 0.05,
        height: 0.1,
        fill: i === 0 ? "#ff0000" : "#00ff00"
      }
    })
  );
  const sequence = makeSequence({
    width: 400,
    height: 200,
    tracks,
    clips,
    camera2d: {
      position: { x: 0, y: 0 },
      depthPx: 0,
      focalLengthPx: 1000,
      keyframes: [
        { timeMs: 0, position: { x: 0, y: 0 }, depthPx: 0 },
        { timeMs: 1000, position: { x: 0, y: 0 }, depthPx: 200 }
      ]
    }
  });
  const { frames } = await renderTimelineFrames({
    sequence,
    timesMs: [0, 1000],
    width: 400,
    loadAsset: async () => null
  });
  expect(frames).toHaveLength(2);
  const centers = [];
  for (const frame of frames) {
    const image = await loadImage(Buffer.from(frame.png));
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, image.width, image.height);
    const sums = [0, 0];
    const weights = [0, 0];
    for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
      for (let channel = 0; channel < 2; channel += 1) {
        const weight = data[pixel * 4 + channel];
        sums[channel] += (pixel % image.width) * weight;
        weights[channel] += weight;
      }
    }
    expect(weights[0]).toBeGreaterThan(0);
    expect(weights[1]).toBeGreaterThan(0);
    centers.push(sums.map((sum, i) => sum / weights[i]));
  }
  const farMove = centers[1][0] - centers[0][0];
  const nearMove = centers[1][1] - centers[0][1];
  expect(farMove).toBeGreaterThan(0);
  expect(nearMove).toBeGreaterThan(farMove);
});
