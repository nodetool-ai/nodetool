import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { openFilterGraph, openRgbaFrameReader } from "@nodetool-ai/runtime/media";

// Rising edges need a low sample first. A recording that begins inside a
// flash/click therefore cannot invent an onset at the start of the file.
export class Edges {
  constructor(threshold, gapSec) {
    if (!(threshold > 0 && threshold <= 1) || !(gapSec > 0) || !Number.isFinite(gapSec)) {
      throw new Error("Threshold must be in (0, 1], gap must be positive");
    }
    this.threshold = threshold;
    this.gapSec = gapSec;
    this.previous = -Infinity;
    this.armed = false;
    this.times = [];
  }
  sample(time, level) {
    if (!Number.isFinite(time) || time <= this.previous || !Number.isFinite(level)) {
      throw new Error("Samples need finite levels and strictly increasing timestamps");
    }
    this.previous = time;
    if (level < this.threshold * 0.5) this.armed = true;
    if (level >= this.threshold && this.armed) {
      if (time - (this.times.at(-1) ?? -Infinity) >= this.gapSec) this.times.push(time);
      this.armed = false;
    }
  }
}

export function offsets(clicks, flashes, maximumOffsetSec, frameIntervalSec) {
  if (!(maximumOffsetSec > 0) || !(frameIntervalSec > 0) ||
      !Number.isFinite(maximumOffsetSec) || !Number.isFinite(frameIntervalSec)) {
    throw new Error("Pairing window and camera interval must be finite and positive");
  }
  for (const times of [clicks, flashes]) {
    if (times.length < 3 || times.some((time, index) => !Number.isFinite(time) ||
        (index > 0 && time <= times[index - 1]))) {
      throw new Error("Need at least three strictly increasing onsets in each stream");
    }
  }
  if (clicks.length !== flashes.length) throw new Error("Unmatched click/flash counts");
  let low = 0, high = 0;
  const pairs = clicks.map((click, index) => {
    while (low < flashes.length && flashes[low] < click - maximumOffsetSec) ++low;
    high = Math.max(high, low);
    while (high < flashes.length && flashes[high] <= click + maximumOffsetSec) ++high;
    if (high - low !== 1 || low !== index) throw new Error("Missing or ambiguous click/flash pair");
    return { clickSec: click, flashSec: flashes[index], offsetMs: (flashes[index] - click) * 1000 };
  });
  const values = pairs.map(pair => pair.offsetMs).sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    qualification: false,
    convention: "Positive offset means picture follows sound at the camera",
    count: pairs.length,
    meanMs: mean,
    stddevMs: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length),
    medianMs: (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2,
    minimumMs: values[0], maximumMs: values.at(-1),
    cameraFrameIntervalMs: frameIntervalSec * 1000,
    pairs
  };
}

export async function analyze(filePath, config) {
  const { audioThreshold, flashThreshold, gapSec, maximumOffsetSec, roi } = config;
  if (!Array.isArray(roi) || roi.length !== 4 || roi.some(value => !Number.isInteger(value) || value < 0) ||
      roi[2] === 0 || roi[3] === 0) throw new Error("roi must be [x, y, width, height] in oriented video pixels");
  const clicks = new Edges(audioThreshold, gapSec), flashes = new Edges(flashThreshold, gapSec);
  const audio = await openFilterGraph({ filePath, kind: "audio", filter: "aformat=sample_fmts=flt:channel_layouts=mono" });
  if (!audio) throw new Error("Recording has no audio stream");
  try {
    for await (const frame of audio.frames()) {
      try {
        if (frame.timeBase.den <= 0 || frame.sampleRate <= 0 || frame.pts < 0n) throw new Error("Invalid audio timestamp or rate");
        const start = Number(frame.pts) * frame.timeBase.num / frame.timeBase.den;
        const bytes = frame.toBuffer();
        for (let index = 0; index < bytes.length / 4; ++index) {
          clicks.sample(start + index / frame.sampleRate, Math.abs(bytes.readFloatLE(index * 4)));
        }
      } finally { frame.free(); }
    }
  } finally { await audio.close(); }
  const video = await openRgbaFrameReader({ filePath, filter: "format=rgba", readAhead: 1 });
  if (!video) throw new Error("Recording has no video stream");
  let previous, maximumInterval = 0;
  try {
    for (let frame = await video.next(); frame; frame = await video.next()) {
      const [x, y, width, height] = roi;
      if (x + width > frame.width || y + height > frame.height) throw new Error("ROI extends outside recording");
      let level = 0;
      for (let row = y; row < y + height; ++row) {
        for (let column = x; column < x + width; ++column) {
          const pixel = (row * frame.width + column) * 4;
          level += (frame.rgba[pixel] + frame.rgba[pixel + 1] + frame.rgba[pixel + 2]) / (3 * 255);
        }
      }
      flashes.sample(frame.ptsSec, level / (width * height));
      if (previous !== undefined) maximumInterval = Math.max(maximumInterval, frame.ptsSec - previous);
      previous = frame.ptsSec;
    }
  } finally { await video.close(); }
  return { ...offsets(clicks.times, flashes.times, maximumOffsetSec, maximumInterval), config,
    limitations: ["Includes camera A/V skew, exposure, display scanout and acoustic propagation",
      "No correction for camera calibration or speaker distance", "Threshold crossings need visual review"] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , recording, configuration, output] = process.argv;
  if (!recording || !configuration || !output) throw new Error("Usage: node analyze.mjs recording config.json result.json");
  const result = await analyze(recording, JSON.parse(await readFile(configuration, "utf8")));
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
}
