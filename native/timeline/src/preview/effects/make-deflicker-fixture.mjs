import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { writeRgbaVideo } from "@nodetool-ai/runtime/media/testing";
import { deflickerCurve } from "@nodetool-ai/timeline/render";

const directory = fileURLToPath(new URL("./fixtures/", import.meta.url));
const width = 64, height = 36, fps = 30, count = 90;
const measurements = [];
const encode = linear => Math.round(255 * (linear <= .0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - .055));
await writeRgbaVideo({outPath: `${directory}/source-flicker.mp4`, width, height, fps, frames: count,
  spec: {codec: "libx264", pixelFormat: "yuv420p", options: {crf: "0", preset: "ultrafast", bf: "0"}},
  frameAt: index => {
    const frame = new Uint8Array(width * height * 4);
    const green = index >= 30 && index < 60;
    const base = index < 30 ? .12 : .18;
    const exposure = index < 60 ? (index % 2 ? .5 : -.5) : -4 * ((index - 60) / 29) ** 2;
    measurements.push({timeMs: index * 1000 / fps, logLuma: Math.log2(base * (green ? .7152 : 1)) + exposure, cut: index === 30 || index === 60});
    for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) {
      const value = encode(base * 2 ** exposure * ((Math.floor(x / 8) + Math.floor(y / 6)) % 2 ? 1.4 : .6));
      frame.set(green ? [0, value, 0, 255] : [value, value, value, 255], (y * width + x) * 4);
    } }
    return frame;
  }
});
const analysis = {version: 1, source: {assetId: "", mediaPath: "source-flicker.mp4"}, rangeStartMs: 0, rangeEndMs: 3000,
  frameRate: fps, windowMs: 500, maxCorrection: 1, samples: deflickerCurve(measurements, 500, 1)};
const document = {
  id: "seq-clip-deflicker", projectId: "native-prototype", name: "clip-deflicker", fps, width, height, durationMs: 3000,
  tracks: [{id: "t0", name: "Video", type: "video", index: 0, visible: true, locked: false}],
  clips: [{id: "deflicker", trackId: "t0", name: "Deflicker", startMs: 0, durationMs: 3000, inPointMs: 0,
    mediaType: "video", sourceType: "imported", status: "generated", locked: false, versions: [], width, height,
    mediaPath: "source-flicker.mp4", effects: [{id: "deflicker", type: "deflicker", enabled: true, analysis}]}],
  markers: [], createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z",
  goldenFrames: [10, 11, 30, 31, 70].map(frame => ({frame, criterion: "F54 cached source-time corrections and fade preservation, PSNR >= 40 dB"}))
};
fs.writeFileSync(`${directory}/clip-deflicker.json`, JSON.stringify(document, null, 2) + "\n");
