#!/usr/bin/env node
/** Run short deterministic real-media cases through the server compositor. */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { resolveTimelineOutput } from "../../../packages/video-nodes/src/nodes/timeline/outputFormats.ts";
import { validateTimelinePerfReport } from "../../src/components/timeline/perf/report.ts";

const rendererModule = process.env.TIMELINE_SERVER_RENDERER_MODULE
  ? await import(pathToFileURL(resolve(process.env.TIMELINE_SERVER_RENDERER_MODULE)).href)
  : await import("../../../packages/video-nodes/src/nodes/timeline/compositeRender.ts");
const { renderTimelineComposited } = rendererModule;

const mediaDir = process.argv[2] ?? join(tmpdir(), "nodetool-timeline-perf");
const reportDir = process.env.TIMELINE_PERF_REPORT_DIR ?? mediaDir;
const baseReportPath = join(reportDir, "timeline-preview-cold.json");
const reportPath = join(reportDir, "timeline-server-export.json");
mkdirSync(reportDir, { recursive: true });
const EXPECTED_FRAMES = 24;
const CHECK_FRAMES = [0, 12, 23];
const fourStreamSources = new Map();

function runFfmpeg(args, label, maxBuffer = 64 * 1024 * 1024) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
    encoding: "buffer",
    maxBuffer
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label}: ${result.stderr?.toString() || `ffmpeg exit ${result.status}`}`);
  }
  return result.stdout;
}

function sourcesFor(scenario) {
  const original = join(mediaDir, scenario.source);
  if (scenario.streams === 1) return [original];
  const key = `${scenario.width}x${scenario.height}`;
  const cached = fourStreamSources.get(key);
  if (cached) return cached;
  // Each source keeps the moving test pattern outside its centre marker. The
  // marker changes at all three checked times and has a distinct colour per
  // layer, so a missing or stale quadrant cannot match the output oracle.
  const markerColors = [
    ["red", "green", "blue"],
    ["cyan", "magenta", "yellow"],
    ["orange", "purple", "lime"],
    ["white", "gray", "pink"]
  ];
  const sources = [];
  for (let index = 0; index < 4; index++) {
    const path = join(reportDir, `server-source-${key}-${index}.mp4`);
    const [first, middle, last] = markerColors[index];
    const box = (color, enable) =>
      `drawbox=x=iw/4:y=ih/4:w=iw/2:h=ih/2:color=${color}:t=fill:enable='${enable}'`;
    const filter = [
      box(first, "lt(t,0.333)"),
      box(middle, "between(t,0.333,0.666)"),
      box(last, "gt(t,0.666)")
    ].join(",");
    runFfmpeg([
      "-y", "-i", original, "-frames:v", String(EXPECTED_FRAMES),
      "-vf", filter, "-an", "-c:v", "libx264",
      "-preset", "ultrafast", "-pix_fmt", "yuv420p", path
    ], `Could not generate ${path}`);
    sources.push(path);
  }
  fourStreamSources.set(key, sources);
  return sources;
}

function rgbSamples(path, x, y) {
  const selection = CHECK_FRAMES.map((frame) => `eq(n\\,${frame})`).join("+");
  const side = 16;
  const bytes = runFfmpeg([
    "-i", path,
    "-vf", `select=${selection},crop=${side}:${side}:${Math.round(x) - side / 2}:${Math.round(y) - side / 2},format=rgb24`,
    "-frames:v", String(CHECK_FRAMES.length), "-fps_mode", "passthrough",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-"
  ], `Could not decode reference pixels from ${path}`);
  const frameBytes = side * side * 3;
  if (bytes.length !== CHECK_FRAMES.length * frameBytes) {
    throw new Error(`${path} yielded ${bytes.length} reference bytes; expected ${CHECK_FRAMES.length * frameBytes}`);
  }
  return CHECK_FRAMES.map((_, frame) => [0, 1, 2].map((channel) => {
    let total = 0;
    for (let pixel = 0; pixel < side * side; pixel++) {
      total += bytes[frame * frameBytes + pixel * 3 + channel];
    }
    return Math.round(total / (side * side));
  }));
}

const report = JSON.parse(readFileSync(baseReportPath, "utf8"));
const scenarios = [
  { key: "serverExport1080pOneStream", width: 1920, height: 1080, streams: 1, source: "one-1080p.mp4" },
  { key: "serverExport1080pFourStreams", width: 1920, height: 1080, streams: 4, source: "one-1080p.mp4" },
  { key: "serverExport4kOneStream", width: 3840, height: 2160, streams: 1, source: "one-4k.mp4" },
  { key: "serverExport4kFourStreams", width: 3840, height: 2160, streams: 4, source: "one-4k.mp4" }
];

for (const scenario of scenarios) {
  const sourcePaths = sourcesFor(scenario);
  const trackIds = Array.from({ length: scenario.streams }, (_, index) => `track-${index}`);
  const assetIds = Array.from({ length: scenario.streams }, (_, index) => `asset-${index}`);
  const sequence = {
    id: `server-${scenario.key}`,
    name: scenario.key,
    width: scenario.width,
    height: scenario.height,
    fps: 24,
    durationMs: 1_000,
    tracks: trackIds.map((id, index) => ({ id, type: "video", index, visible: true })),
    clips: trackIds.map((trackId, index) => ({
      id: `clip-${index}`,
      trackId,
      name: `Stream ${index + 1}`,
      startMs: 0,
      durationMs: 1_000,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      currentAssetId: assetIds[index],
      ...(scenario.streams === 4 ? {
        transform: {
          position: {
            x: (index % 2 === 0 ? -1 : 1) * scenario.width / 4,
            y: (index < 2 ? -1 : 1) * scenario.height / 4
          },
          scale: { x: 0.5, y: 0.5 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 }
        }
      } : {})
    })),
    transcript: []
  };
  const outputPath = join(reportDir, `${scenario.key}.mp4`);
  const samples = [];
  const peakMemory = { bytes: process.memoryUsage().rss };
  const sampleTimer = setInterval(() => {
    peakMemory.bytes = Math.max(peakMemory.bytes, process.memoryUsage().rss);
  }, 100);
  const start = performance.now();
  let result;
  try {
    result = await renderTimelineComposited({
      sequence,
      width: scenario.width,
      height: scenario.height,
      fps: 24,
      durationMs: 1_000,
      resolveAssetPath: async (assetId) => {
        const index = assetIds.indexOf(assetId);
        return index < 0 ? null : sourcePaths[index];
      },
      outPath: outputPath,
      onProgress: (frame) => samples.push(frame)
    });
  } finally {
    clearInterval(sampleTimer);
  }
  const elapsedMs = performance.now() - start;
  const outputSize = statSync(outputPath).size;
  const probe = spawnSync("ffprobe", [
    "-v", "error", "-count_frames", "-select_streams", "v:0",
    "-show_entries", "stream=nb_read_frames,width,height", "-of", "json", outputPath
  ], { encoding: "utf8" });
  if (probe.error) throw probe.error;
  if (probe.status !== 0) throw new Error(probe.stderr || `ffprobe failed for ${outputPath}`);
  const stream = JSON.parse(probe.stdout).streams?.[0];
  const frameCount = Number(stream?.nb_read_frames);
  if (frameCount !== EXPECTED_FRAMES || frameCount !== result.totalFrames || frameCount !== samples.length) {
    throw new Error(`${scenario.key} encoded ${frameCount} frames, expected ${EXPECTED_FRAMES}`);
  }
  if (Number(stream?.width) !== scenario.width || Number(stream?.height) !== scenario.height) {
    throw new Error(`${scenario.key} encoded ${stream?.width}x${stream?.height}, expected ${scenario.width}x${scenario.height}`);
  }
  for (let index = 0; index < scenario.streams; index++) {
    const x = scenario.streams === 4
      ? (index % 2 === 0 ? 0.25 : 0.75) * scenario.width
      : scenario.width / 2;
    const y = scenario.streams === 4
      ? (index < 2 ? 0.25 : 0.75) * scenario.height
      : scenario.height / 2;
    const expected = rgbSamples(sourcePaths[index], scenario.width / 2, scenario.height / 2);
    const actual = rgbSamples(outputPath, x, y);
    for (let sample = 0; sample < CHECK_FRAMES.length; sample++) {
      if (!expected[sample].every((value, channel) => Math.abs(value - actual[sample][channel]) <= 35)) {
        throw new Error(`${scenario.key} layer ${index} frame ${CHECK_FRAMES[sample]} pixel mismatch: expected ${expected[sample]}, got ${actual[sample]}`);
      }
    }
  }
  const oraclePassed = true;
  report.scenarios[scenario.key] = {
    measurementPath: "server-export",
    elapsedMs,
    frameOraclePassed: oraclePassed,
    scenarioConfig: { width: scenario.width, height: scenario.height, videoStreams: scenario.streams },
    sampleCount: frameCount,
    sourceUploads: null,
    compositorSubmissions: null,
    presentedFrames: null,
    heldFrames: null,
    droppedVideoFrames: null,
    duplicateVideoFrames: null,
    correctFrameMatches: oraclePassed,
    p50PresentationIntervalMs: null,
    p95PresentationIntervalMs: null,
    p99PresentationIntervalMs: null,
    cutToCorrectFrameMs: null,
    cutSourceTimeSeconds: null,
    extendedMetrics: {
      mainThreadTimeMs: null,
      gpuCompletionTimeMs: null,
      audioDriftMs: null,
      queueDepth: null,
      estimatedAllocatedBytes: null,
      peakProcessMemoryBytes: peakMemory.bytes,
      exportFramesPerSecond: frameCount / (elapsedMs / 1000),
      cancellationMs: null,
      scrubToCorrectFrameMs: null
    },
    outputSizeBytes: outputSize,
    encodedDimensions: { width: Number(stream?.width), height: Number(stream?.height) }
  };
}

const alphaScenario = {
  id: "serverAlphaOutput1080p",
  width: 1920,
  height: 1080,
  fps: 24,
  durationMs: 1_000,
  tracks: [{ id: "alpha-title", type: "overlay", index: 0, visible: true }],
  clips: [{
    id: "alpha-title-clip",
    trackId: "alpha-title",
    name: "Alpha title",
    startMs: 0,
    durationMs: 1_000,
    mediaType: "shape",
    sourceType: "generated",
    status: "generated",
    shapeStyle: { kind: "rect", fill: "#ff0000", x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
  }],
  transcript: []
};
const alphaPath = join(reportDir, "serverAlphaOutput1080p.zip");
const alphaStart = performance.now();
const alphaProgress = [];
const alphaPeak = { bytes: process.memoryUsage().rss };
const alphaTimer = setInterval(() => {
  alphaPeak.bytes = Math.max(alphaPeak.bytes, process.memoryUsage().rss);
}, 100);
let alphaResult;
try {
  alphaResult = await renderTimelineComposited({
    sequence: alphaScenario,
    width: alphaScenario.width,
    height: alphaScenario.height,
    fps: alphaScenario.fps,
    durationMs: alphaScenario.durationMs,
    resolveAssetPath: async () => null,
    outPath: alphaPath,
    output: resolveTimelineOutput({ format: "png_sequence", alpha: true }),
    onProgress: (frame) => alphaProgress.push(frame)
  });
} finally {
  clearInterval(alphaTimer);
}
const alphaElapsedMs = performance.now() - alphaStart;
const zipList = spawnSync("unzip", ["-Z1", alphaPath], { encoding: "utf8" });
if (zipList.error) throw zipList.error;
if (zipList.status !== 0) throw new Error(zipList.stderr || "Could not inspect alpha PNG sequence");
const pngNames = zipList.stdout.split(/\r?\n/).filter((name) => /^frame_\d+\.png$/.test(name));
if (pngNames.length !== EXPECTED_FRAMES || alphaResult.totalFrames !== EXPECTED_FRAMES || alphaProgress.length !== EXPECTED_FRAMES) {
  throw new Error(`Server alpha export encoded ${pngNames.length} frames, expected ${EXPECTED_FRAMES}`);
}
let alphaInfo;
for (const frame of CHECK_FRAMES) {
  const name = `frame_${String(frame + 1).padStart(6, "0")}.png`;
  if (!pngNames.includes(name)) throw new Error(`Server alpha export is missing ${name}`);
  const png = spawnSync("unzip", ["-p", alphaPath, name], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  if (png.error) throw png.error;
  if (png.status !== 0) throw new Error(png.stderr?.toString() ?? `Could not read ${name}`);
  const { data, info } = await sharp(png.stdout).raw().toBuffer({ resolveWithObject: true });
  alphaInfo = info;
  if (info.width !== alphaScenario.width || info.height !== alphaScenario.height || info.channels !== 4) {
    throw new Error(`${name} is ${info.width}x${info.height} with ${info.channels} channels, expected ${alphaScenario.width}x${alphaScenario.height} RGBA`);
  }
  const at = (x, y) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 4));
  const corner = at(20, 20);
  const center = at(Math.floor(info.width / 2), Math.floor(info.height / 2));
  if (corner[3] !== 0 || center[3] !== 255 || center[0] < 220 || center[1] > 35 || center[2] > 35) {
    throw new Error(`${name} alpha/color mismatch: corner ${corner}, center ${center}`);
  }
}
const alphaOraclePassed = true;
report.scenarios.serverAlphaOutput1080p = {
  measurementPath: "server-export",
  elapsedMs: alphaElapsedMs,
  frameOraclePassed: alphaOraclePassed,
  scenarioConfig: { width: alphaScenario.width, height: alphaScenario.height, videoStreams: 0 },
  sampleCount: pngNames.length,
  sourceUploads: null,
  compositorSubmissions: null,
  presentedFrames: null,
  heldFrames: null,
  droppedVideoFrames: null,
  duplicateVideoFrames: null,
  correctFrameMatches: alphaOraclePassed,
  p50PresentationIntervalMs: null,
  p95PresentationIntervalMs: null,
  p99PresentationIntervalMs: null,
  cutToCorrectFrameMs: null,
  cutSourceTimeSeconds: null,
  extendedMetrics: {
    mainThreadTimeMs: null,
    gpuCompletionTimeMs: null,
    audioDriftMs: null,
    queueDepth: null,
    estimatedAllocatedBytes: null,
    peakProcessMemoryBytes: alphaPeak.bytes,
    exportFramesPerSecond: pngNames.length / (alphaElapsedMs / 1000),
    cancellationMs: null,
    scrubToCorrectFrameMs: null
  },
  outputSizeBytes: statSync(alphaPath).size,
  encodedDimensions: { width: alphaInfo.width, height: alphaInfo.height }
};

if (!validateTimelinePerfReport(report)) throw new Error("Server export report failed validation");
writeFileSync(reportPath, JSON.stringify(report, null, 2));
process.stdout.write(`${reportPath}\n`);
process.exit(0);
