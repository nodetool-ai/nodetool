import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { trackZ } from "@nodetool-ai/timeline/render";
import { validateTimelinePerfReport, type TimelinePerfReport, type TimelinePerfRun } from "../../src/components/timeline/perf/report";
import { readTrpcBatchId } from "../../src/components/timeline/perf/trpcInput";

type RecordValue = Record<string, unknown>;
type FrameSample = { now: number; mediaTime: number; presentedFrames: number; source: string; timelineMs: number | null; clipId?: string };
type PreviewEvent = { kind: string; at: number; sourceId?: string; width?: number; height?: number; mediaTime?: number; layerCount?: number; drawnLayers?: number };
type BatchItem = RecordValue & {
  result?: { data?: unknown };
};

const FIXTURE_DIR = process.env.TIMELINE_PERF_FIXTURE_DIR ?? join(tmpdir(), "nodetool-timeline-perf-fixtures", String(process.pid));
const REPORT_DIR = process.env.TIMELINE_PERF_REPORT_DIR ?? join(tmpdir(), "nodetool-timeline-perf-reports");
const SEQUENCE_ID = "timeline-perf-l0";
const LEAD_ID = "timeline-perf-lead";
const INCOMING_ID = "timeline-perf-incoming";
const CUT_IN_POINT_MS = 7_250;
const SAMPLE_MS = 5_000;

const sequence = {
  id: SEQUENCE_ID,
  projectId: "default",
  name: "Timeline performance fixture",
  fps: 24,
  width: 640,
  height: 360,
  durationMs: 64_000,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  tracks: [
    {
      id: "timeline-perf-video-track",
      name: "Video",
      type: "video",
      index: 0,
      visible: true,
      locked: false
    }
  ],
  clips: [
    {
      id: "timeline-perf-lead-clip",
      trackId: "timeline-perf-video-track",
      name: "60 second lead",
      startMs: 0,
      durationMs: 60_000,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      currentAssetId: LEAD_ID
    },
    {
      id: "timeline-perf-incoming-clip",
      trackId: "timeline-perf-video-track",
      name: "Trimmed incoming clip",
      startMs: 60_000,
      durationMs: 4_000,
      inPointMs: CUT_IN_POINT_MS,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      currentAssetId: INCOMING_ID
    }
  ],
  markers: []
};

type ScenarioFixture = {
  id: string;
  sequence: typeof sequence;
  assets: Map<string, string>;
};

function makeScenarioFixture(
  scenarioName: string,
  width: number,
  height: number,
  mediaName: string,
  streamCount = 1,
  overlay: "none" | "dissolve" | "animated-text" | "matte" = "none",
  motionBlur = false,
  reverse = false
): ScenarioFixture {
  const id = `timeline-perf-${scenarioName}`;
  const trackCount = overlay === "dissolve" ? 1 : Math.max(streamCount, overlay === "animated-text" ? 2 : 1);
  const tracks = Array.from({ length: trackCount }, (_, index) => ({
    id: `${id}-track-${index}`,
    name: `Video ${index + 1}`,
    type: "video",
    index,
    visible: true,
    locked: false
  }));
  const assets = new Map<string, string>();
  const clips: Array<Record<string, unknown>> = [];
  const mediaSuffix = height >= 2160 ? "4k" : "1080p";
  const layerColors = ["red", "green", "blue", "yellow"];
  for (let index = 0; index < streamCount; index += 1) {
    const assetId = `${id}-asset-${index}`;
    const streamMedia = scenarioName.startsWith("fourStreams")
      ? `solid-${layerColors[index] ?? "red"}-${mediaSuffix}.mp4`
      : overlay === "dissolve" && index === 1
        ? `solid-red-${mediaSuffix}.mp4`
        : mediaName;
    assets.set(assetId, streamMedia);
    clips.push({
      id: `${id}-clip-${index}`,
      trackId: tracks[overlay === "dissolve" ? 0 : index]?.id,
      name: `Stream ${index + 1}`,
      startMs: overlay === "dissolve" && index === 1 ? 1_000 : 0,
      durationMs: overlay === "dissolve" ? 3_000 : 2_000,
      mediaType: "video",
      sourceType: "imported",
      status: "generated",
      currentAssetId: assetId,
      ...(scenarioName.startsWith("fourStreams") ? {
        transform: {
          position: { x: index % 2 === 0 ? -width / 4 : width / 4, y: index < 2 ? -height / 4 : height / 4 },
          scale: { x: 0.5, y: 0.5 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 }
        }
      } : {}),
      ...(overlay === "animated-text" && index === 0 ? {
        caption: {
          words: [{ word: "Caption", startMs: 0, endMs: 2000 }],
          style: { fontSizeFrac: 0.06, color: "#ffffff", activeColor: "#ffff00" }
        }
      } : {}),
      ...(scenarioName.includes("effectHeavy") ? {
        effects: [
          { id: `${id}-blur`, type: "blur", enabled: true, radius: 18 },
          { id: `${id}-glow`, type: "glow", enabled: true, radius: 16, intensity: 0.8, color: "#ffffff" },
          { id: `${id}-shadow`, type: "dropShadow", enabled: true, offsetX: 12, offsetY: 8, blur: 14, color: "#000000" }
        ]
      } : {}),
      ...(overlay === "dissolve" && index === 1
        ? { transitionIn: { type: "crossfade", durationMs: 1_000 } }
        : {}),
      ...(motionBlur ? { motionBlur: { samplesPerFrame: 3, shutterAngle: 180 } } : {}),
      ...(reverse ? { timeRemap: { keyframes: [{ t: 0, sourceMs: 4_000 }, { t: 1, sourceMs: 2_000 }] } } : {})
    });
  }
  if (overlay === "animated-text") {
    clips.push({
      id: `${id}-text`,
      trackId: tracks[1]?.id,
      name: "Animated title",
      startMs: 0,
      durationMs: 2_000,
      mediaType: "text",
      sourceType: "generated",
      status: "generated",
      textStyle: { text: "Timeline performance", fontSizePx: Math.round(height / 12), color: "#ffffff", align: "center" },
      animations: [{ id: `${id}-text-fade`, role: "in", preset: "fade", durationMs: 1_000 }]
    });
  }
  if (overlay === "matte") {
    const matteId = `${id}-matte`;
    assets.set(matteId, mediaName.startsWith("matte") ? mediaName : `matte-${mediaName.includes("4k") ? "4k" : "1080p"}.mp4`);
    const baseClip = clips[0];
    if (baseClip) {
      baseClip.generatedMatte = {
        assetId: matteId,
        sourceAssetId: String(baseClip.currentAssetId),
        sourceRange: { fromMs: 0, toMs: 5_000 },
        settings: { fixture: "deterministic-luma" }
      };
    }
  }
  const scenarioSequence = {
    ...sequence,
    id,
    name: `Timeline performance ${scenarioName}`,
    width,
    height,
    durationMs: overlay === "dissolve" ? 3_000 : 2_000,
    tracks,
    clips,
    markers: []
  } as unknown as typeof sequence;
  return { id, sequence: scenarioSequence, assets };
}

function makeOversizedShapeFixture(): ScenarioFixture {
  const id = "timeline-perf-oversized-shapes";
  const tracks = [0, 1].map((index) => ({
    id: `${id}-track-${index}`,
    name: `Shape ${index + 1}`,
    type: "video",
    index,
    visible: true,
    locked: false
  }));
  const clips = ["#ff0000", "#0000ff"].map((fill, index) => ({
    id: `${id}-shape-${index}`,
    trackId: tracks[index]?.id,
    name: `Oversized ${fill} shape`,
    startMs: 0,
    durationMs: 42,
    mediaType: "shape",
    sourceType: "generated",
    status: "generated",
    shapeStyle: {
      kind: "rect",
      x: index === 0 ? 0 : 0.25,
      y: index === 0 ? 0 : 0.25,
      width: index === 0 ? 1 : 0.5,
      height: index === 0 ? 1 : 0.5,
      fill
    }
  }));
  return {
    id,
    sequence: {
      ...sequence,
      id,
      name: "Oversized bitmap cache fixture",
      width: 4096,
      height: 4096,
      durationMs: 42,
      tracks,
      clips,
      markers: []
    } as unknown as typeof sequence,
    assets: new Map()
  };
}

const asset = (id: string, name: string) => ({
  id,
  user_id: "timeline-perf",
  parent_id: null,
  name,
  content_type: "video/mp4",
  size: null,
  workflow_id: null,
  project_id: "default",
  created_at: "2026-01-01T00:00:00.000Z",
  get_url: `/__timeline_perf/${name}`,
  thumb_url: null
});

test.beforeAll(() => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const result = spawnSync(
    "node",
    ["tests/benchmarks/timeline-perf-fixture.mjs", FIXTURE_DIR],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "Fixture generation failed");
});

async function interceptPerfApi(page: Page, fixture: ScenarioFixture = {
  id: SEQUENCE_ID,
  sequence,
  assets: new Map([[LEAD_ID, "lead.mp4"], [INCOMING_ID, "incoming.mp4"]])
}): Promise<void> {
  await page.route(/\/trpc\/[^?]*(timeline\.get|assets\.get)/, async (route) => {
    const response = await route.fetch();
    const payload = await response.json() as unknown;
    const isBatch = Array.isArray(payload);
    const body = (isBatch ? payload : [payload]) as BatchItem[];
    const operations = new URL(route.request().url()).pathname
      .split("/")
      .pop()
      ?.split(",") ?? [];
    const requestUrl = new URL(route.request().url());
    const rawInput = route.request().postData() ?? requestUrl.searchParams.get("input");
    const input: unknown = rawInput ? JSON.parse(rawInput) as unknown : {};

    for (let index = 0; index < operations.length; index += 1) {
      const operation = operations[index];
      const id = readTrpcBatchId(input, index);
      if (operation === "timeline.get" && id === fixture.id) {
        body[index] = { result: { data: fixture.sequence } };
      } else if (operation === "assets.get" && id && fixture.assets.has(id)) {
        const name = fixture.assets.get(id);
        if (name) body[index] = { result: { data: asset(id, name) } };
      }
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: isBatch ? body : body[0]
    });
  });

  await page.route("**/__timeline_perf/*.mp4", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "lead.mp4";
    const filePath = join(FIXTURE_DIR, name);
    const bytes = readFileSync(filePath);
    const size = statSync(filePath).size;
    const range = route.request().headers().range;
    const baseHeaders = { "Accept-Ranges": "bytes", "Content-Type": "video/mp4" };
    if (!range) {
      await route.fulfill({ status: 200, body: bytes, headers: { ...baseHeaders, "Content-Length": String(size) } });
      return;
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      await route.fulfill({ status: 416, headers: { "Content-Range": `bytes */${size}` } });
      return;
    }
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = Math.min(size - 1, match[2] ? Number(match[2]) : size - 1);
    if (start > end || start >= size) {
      await route.fulfill({ status: 416, headers: { "Content-Range": `bytes */${size}` } });
      return;
    }
    const partial = bytes.subarray(start, end + 1);
    await route.fulfill({
      status: 206,
      body: partial,
      headers: {
        ...baseHeaders,
        "Content-Length": String(partial.byteLength),
        "Content-Range": `bytes ${start}-${end}/${size}`
      }
    });
  });
}

async function readRun(page: Page): Promise<{
  events: PreviewEvent[];
  frames: FrameSample[];
  rafTicks: number;
  rafTimes: number[];
  droppedVideoFrames: number | null;
  previewWidth: number;
  previewHeight: number;
  bitmapCacheResidentBytes: { textBytes: number | null; shapeBytes: number | null };
  bitmapCachePeakFrameBytes: { textBytes: number | null; shapeBytes: number | null };
}> {
  return page.evaluate(() => {
    const state = (window as Window & {
      __timelinePerf?: {
        events: PreviewEvent[];
        frames: FrameSample[];
        rafTicks: number;
        rafTimes: number[];
      };
    }).__timelinePerf;
    const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-text-bitmap-cache-bytes]");
    const cache = (window as Window & {
      __timelineBitmapCache?: { textBytes: number; shapeBytes: number; peakTextBytes: number; peakShapeBytes: number };
    }).__timelineBitmapCache;
    const videos = Array.from(document.querySelectorAll("video"));
    const quality = videos.find((video) => video.readyState >= 2)?.getVideoPlaybackQuality?.();
    return {
      events: state?.events ?? [],
      frames: state?.frames ?? [],
      rafTicks: state?.rafTicks ?? 0,
      rafTimes: state?.rafTimes ?? [],
      droppedVideoFrames: quality ? quality.droppedVideoFrames : null,
      previewWidth: canvas?.width ?? 0,
      previewHeight: canvas?.height ?? 0,
      bitmapCacheResidentBytes: {
        textBytes: canvas?.dataset.textBitmapCacheBytes === undefined ? cache?.textBytes ?? null : Number(canvas.dataset.textBitmapCacheBytes),
        shapeBytes: canvas?.dataset.shapeBitmapCacheBytes === undefined ? cache?.shapeBytes ?? null : Number(canvas.dataset.shapeBitmapCacheBytes)
      },
      bitmapCachePeakFrameBytes: {
        textBytes: canvas?.dataset.textBitmapCachePeakBytes === undefined ? cache?.peakTextBytes ?? null : Number(canvas.dataset.textBitmapCachePeakBytes),
        shapeBytes: canvas?.dataset.shapeBitmapCachePeakBytes === undefined ? cache?.peakShapeBytes ?? null : Number(canvas.dataset.shapeBitmapCachePeakBytes)
      }
    };
  });
}

async function runFixture(page: Page, cache: "cold" | "warm"): Promise<TimelinePerfReport> {
  await page.addInitScript(() => {
    const perfWindow = window as Window & {
      __timelinePerf?: {
        events: PreviewEvent[];
        frames: FrameSample[];
        rafTicks: number;
        rafTimes: number[];
      };
      __nodetoolTimelinePerf?: (event: PreviewEvent) => void;
    };
    const state = { events: [] as PreviewEvent[], frames: [] as FrameSample[], rafTicks: 0, rafTimes: [] as number[] };
    perfWindow.__timelinePerf = state;
    perfWindow.__nodetoolTimelinePerf = (event) => state.events.push(event);
    const watchedVideos = new WeakSet<HTMLVideoElement>();
    const watchVideo = (video: HTMLVideoElement) => {
      if (watchedVideos.has(video)) return;
      watchedVideos.add(video);
      if (!video.requestVideoFrameCallback) return;
      const callback = (now: number, metadata: VideoFrameCallbackMetadata) => {
        const timelineValue = Number(document.querySelector('[aria-label="Playhead"]')?.getAttribute("aria-valuenow"));
        state.frames.push({ now, mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames, source: video.currentSrc, timelineMs: Number.isFinite(timelineValue) ? timelineValue : null, clipId: video.dataset.clipId ?? "" });
        video.requestVideoFrameCallback(callback);
      };
      video.requestVideoFrameCallback?.(callback);
    };
    const observer = new MutationObserver(() => {
      document.querySelectorAll("video").forEach(watchVideo);
    });
    observer.observe(document, { childList: true, subtree: true });
    const tick = (timestamp: number) => {
      state.rafTicks += 1;
      state.rafTimes.push(timestamp);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await interceptPerfApi(page);
  await page.goto(`/timeline/${SEQUENCE_ID}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Play" }).waitFor({ state: "visible" });
  await expect.poll(async () => page.locator("video").count()).toBeGreaterThan(0);
  await expect.poll(async () => page.locator("video").evaluateAll((videos) =>
    videos.some((element) => element instanceof HTMLVideoElement && element.readyState >= 2)
  )).toBe(true);

  const before = await readRun(page);
  const beforeEventCounts = {
    uploads: before.events.filter((event) => event.kind === "source-upload").length,
    submissions: before.events.filter((event) => event.kind === "compositor-submit").length
  };
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(SAMPLE_MS);
  await page.getByRole("button", { name: "Pause" }).click();
  const steady = await readRun(page);

  // The clip-boundary control seeks directly to 60 seconds. Play then tests
  // that the incoming video starts at its trimmed 7.25 second source in-point.
  const cutStartedAt = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Next clip boundary" }).click();
  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(async () => page.locator("video").evaluateAll((videos) =>
    videos.some((element) =>
      element instanceof HTMLVideoElement &&
      element.currentSrc.endsWith("/incoming.mp4") &&
      element.readyState >= 2 &&
      !element.paused
    )
  ), { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Pause" }).click();
  const afterCut = await readRun(page);
  const cutFrames = afterCut.frames.filter((frame) => frame.source.endsWith("/incoming.mp4"));
  const cutFirst = cutFrames[0];
  const correctCutFrame = cutFrames.find(
    (frame) => frame.timelineMs !== null && Math.abs(
      frame.mediaTime - (CUT_IN_POINT_MS / 1000 + Math.max(0, frame.timelineMs - 60_000) / 1000)
    ) <= 1 / 24
  );
  const firstIncomingUpload = afterCut.events
    .filter((event) => event.kind === "source-upload" && event.sourceId === "v:timeline-perf-incoming-clip" && event.at >= cutStartedAt)
    .sort((left, right) => left.at - right.at)[0];
  const firstCompositorSubmitAfterUpload = firstIncomingUpload
    ? afterCut.events.some((event) => event.kind === "compositor-submit" && event.at >= firstIncomingUpload.at)
    : false;
  const currentTimelineMs = Number(await page.getByRole("slider", { name: "Playhead", exact: true }).getAttribute("aria-valuenow"));
  if (!Number.isFinite(currentTimelineMs) || currentTimelineMs < 60_000) {
    throw new Error(`Cut preview did not reach the incoming clip: ${currentTimelineMs}ms`);
  }
  const expectedPresentedSourceTime = CUT_IN_POINT_MS / 1000 + (currentTimelineMs - 60_000) / 1000;
  const expectedFrameIndex = Math.floor(expectedPresentedSourceTime * 24);
  const decodedReference = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", join(FIXTURE_DIR, "incoming.mp4"),
    "-vf", `select=eq(n\\,${expectedFrameIndex}),format=rgb24`,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"
  ], { encoding: "buffer", maxBuffer: 1024 * 1024 });
  if (decodedReference.error) throw decodedReference.error;
  if (decodedReference.status !== 0 || decodedReference.stdout.length !== 640 * 360 * 3) {
    throw new Error(decodedReference.stderr?.toString() || `Could not decode incoming reference frame ${expectedFrameIndex}`);
  }
  const previewShot = await page.locator('[aria-label="Preview area"] canvas').first().screenshot();
  const previewPixels = await sharp(previewShot).raw().toBuffer({ resolveWithObject: true });
  const points = [0.15, 0.325, 0.5, 0.675, 0.85];
  const referenceGrid = points.flatMap((y) => points.map((x) => {
    const offset = (Math.floor(360 * y) * 640 + Math.floor(640 * x)) * 3;
    return Array.from(decodedReference.stdout.subarray(offset, offset + 3));
  }));
  const previewGrid = points.flatMap((y) => points.map((x) => {
    const offset = (Math.floor(previewPixels.info.height * y) * previewPixels.info.width + Math.floor(previewPixels.info.width * x)) * previewPixels.info.channels;
    return Array.from(previewPixels.data.subarray(offset, offset + previewPixels.info.channels));
  }));
  const pixelMatches = referenceGrid.filter((source, index) => source.every((value, channel) =>
    Math.abs(value - (previewGrid[index]?.[channel] ?? 0)) <= 70
  )).length;
  const pixelMatchesDisplayedFrame = pixelMatches >= 20;
  const latestIncomingUpload = afterCut.events.filter((event) => event.kind === "source-upload" && event.sourceId === "v:timeline-perf-incoming-clip").at(-1);
  const uploadedFrameTimeMatches = latestIncomingUpload?.mediaTime !== undefined &&
    Math.abs(Math.floor(latestIncomingUpload.mediaTime * 24) - expectedFrameIndex) <= 1;
  const correctFrameMatches = Boolean(firstIncomingUpload && firstCompositorSubmitAfterUpload && uploadedFrameTimeMatches && correctCutFrame && pixelMatchesDisplayedFrame);
  writeFileSync(join(REPORT_DIR, `timeline-l0-cut-oracle-${cache}.json`), JSON.stringify({
    currentTimelineMs, expectedFrameIndex, firstUploadMediaTime: firstIncomingUpload?.mediaTime ?? null,
    latestUploadMediaTime: latestIncomingUpload?.mediaTime ?? null, correctCutFrame: correctCutFrame?.mediaTime ?? null,
    pixelMatches, uploadedFrameTimeMatches
  }, null, 2));
  const cutToCorrectFrameMs = correctCutFrame
    ? Math.max(0, correctCutFrame.now - cutStartedAt)
    : null;
  const frameTimes = steady.frames.map((frame) => frame.now);
  const intervals = frameTimes.slice(1).map((time, index) => time - frameTimes[index]).sort((a, b) => a - b);
  const presentation = (p: number) => intervals.length
    ? intervals[Math.min(intervals.length - 1, Math.floor(p * intervals.length))]
    : null;
  const gpu = await page.evaluate(async () => {
    const navigatorGpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: { description?: string } } | null> } }).gpu;
    const adapter = await navigatorGpu?.requestAdapter().catch(() => null);
    return adapter?.info?.description ?? null;
  });
  const report: TimelinePerfReport = {
    schemaVersion: 2,
    fixtureVersion: "timeline-preview-l0-v1",
    environment: {
      browser: await page.evaluate(() => navigator.userAgent),
      os: platform(),
      renderBackend: "webgpu",
      gpuAdapter: gpu,
      codec: "H.264 / AVC",
      mediaWidth: 640,
      mediaHeight: 360,
      displayRefreshHz: (() => {
        const rAFIntervals = steady.rafTimes.slice(1).map((time, index) => time - steady.rafTimes[index]).sort((a, b) => a - b);
        return rAFIntervals.length
          ? Math.round(1000 / (rAFIntervals[Math.floor(rAFIntervals.length / 2)] || 1))
          : null;
      })(),
      previewWidth: steady.previewWidth,
      previewHeight: steady.previewHeight,
      cache
    },
    scenarios: {
      steady24Fps: {
        sampleCount: steady.frames.length - before.frames.length,
        sourceUploads: steady.events.filter((event) => event.kind === "source-upload").length - beforeEventCounts.uploads,
        compositorSubmissions: steady.events.filter((event) => event.kind === "compositor-submit").length - beforeEventCounts.submissions,
        decodedVideoFrames: steady.frames.length - before.frames.length,
        presentedFrames: null,
        decodedFrameIntervalsMs: presentation(0.50) === null ? null : { p50: presentation(0.50)!, p95: presentation(0.95)!, p99: presentation(0.99)! },
        heldFrames: null,
        droppedVideoFrames: steady.droppedVideoFrames,
        duplicateVideoFrames: null,
        correctFrameMatches: null,
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
          peakProcessMemoryBytes: null,
          exportFramesPerSecond: null,
          cancellationMs: null,
          scrubToCorrectFrameMs: null
        }
      },
      trimmedCut: {
        sampleCount: cutFrames.length,
        sourceUploads: afterCut.events.filter((event) => event.kind === "source-upload").length - steady.events.filter((event) => event.kind === "source-upload").length,
        compositorSubmissions: afterCut.events.filter((event) => event.kind === "compositor-submit").length - steady.events.filter((event) => event.kind === "compositor-submit").length,
        decodedVideoFrames: cutFrames.length,
        presentedFrames: null,
        heldFrames: null,
        droppedVideoFrames: afterCut.droppedVideoFrames,
        duplicateVideoFrames: null,
        correctFrameMatches,
        p50PresentationIntervalMs: null,
        p95PresentationIntervalMs: null,
        p99PresentationIntervalMs: null,
        cutToCorrectFrameMs,
        cutSourceTimeSeconds: firstIncomingUpload?.mediaTime ?? cutFirst?.mediaTime ?? null,
        cutFrameEvidence: {
          firstDecodedMediaTimeSeconds: cutFirst?.mediaTime ?? null,
          firstUploadedMediaTimeSeconds: firstIncomingUpload?.mediaTime ?? null,
          expectedSourceTimeSeconds: expectedPresentedSourceTime,
          sourceUploadObserved: firstIncomingUpload !== undefined && firstCompositorSubmitAfterUpload
        },
        extendedMetrics: {
          mainThreadTimeMs: null,
          gpuCompletionTimeMs: null,
          audioDriftMs: null,
          queueDepth: null,
          estimatedAllocatedBytes: null,
          peakProcessMemoryBytes: null,
          exportFramesPerSecond: null,
          cancellationMs: null,
          scrubToCorrectFrameMs: null
        }
      }
    }
  };
  if (!validateTimelinePerfReport(report)) {
    throw new Error("Timeline performance run produced an invalid or empty report");
  }
  return report;
}

async function installScenarioInstrumentation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { events: [] as PreviewEvent[], frames: [] as FrameSample[], rafTicks: 0, rafTimes: [] as number[] };
    const pageWindow = window as Window & {
      __timelinePerf?: typeof state;
      __nodetoolTimelinePerf?: (event: PreviewEvent) => void;
    };
    pageWindow.__timelinePerf = state;
    pageWindow.__nodetoolTimelinePerf = (event) => state.events.push(event);
    const watched = new WeakSet<HTMLVideoElement>();
    const watch = (video: HTMLVideoElement) => {
      if (watched.has(video)) return;
      watched.add(video);
      if (!video.requestVideoFrameCallback) return;
      const callback = (now: number, metadata: VideoFrameCallbackMetadata) => {
        const timelineValue = Number(document.querySelector('[aria-label="Playhead"]')?.getAttribute("aria-valuenow"));
        state.frames.push({ now, mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames, source: video.currentSrc, timelineMs: Number.isFinite(timelineValue) ? timelineValue : null, clipId: video.dataset.clipId ?? "" });
        video.requestVideoFrameCallback(callback);
      };
      video.requestVideoFrameCallback(callback);
    };
    new MutationObserver(() => document.querySelectorAll("video").forEach(watch)).observe(document, { childList: true, subtree: true });
    const tick = (timestamp: number) => {
      state.rafTicks += 1;
      state.rafTimes.push(timestamp);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const PREVIEW_SCENARIOS = [
  { key: "oneStream1080p", media: "one-1080p.mp4", width: 1920, height: 1080, streams: 1 },
  { key: "fourStreams1080p", media: "one-1080p.mp4", width: 1920, height: 1080, streams: 4 },
  { key: "oneStream4k", media: "one-4k.mp4", width: 3840, height: 2160, streams: 1 },
  { key: "fourStreams4k", media: "one-4k.mp4", width: 3840, height: 2160, streams: 4 },
  { key: "dissolve1080p", media: "one-1080p.mp4", width: 1920, height: 1080, streams: 2, overlay: "dissolve" as const, action: "scrub" as const },
  { key: "animatedText1080p", media: "one-1080p.mp4", width: 1920, height: 1080, streams: 1, overlay: "animated-text" as const },
  { key: "matte1080p", media: "one-1080p.mp4", width: 1920, height: 1080, streams: 1, overlay: "matte" as const },
  { key: "effectHeavy1080p", media: "one-1080p.mp4", width: 1920, height: 1080, streams: 1 },
  { key: "scrub1080p", media: "one-1080p.mp4", width: 1920, height: 1080, streams: 1, action: "scrub" as const },
  { key: "reverse1080p", media: "one-1080p.mp4", width: 1920, height: 1080, streams: 1, action: "reverse" as const },
  { key: "motionBlur1080p", media: "one-1080p.mp4", width: 1920, height: 1080, streams: 1, motionBlur: true }
];

async function runPreviewScenario(
  page: Page,
  scenario: (typeof PREVIEW_SCENARIOS)[number],
  cache: "cold" | "warm"
): Promise<TimelinePerfRun> {
  const fixture = makeScenarioFixture(
    `${scenario.key}-${cache}`,
    scenario.width,
    scenario.height,
    scenario.media,
    scenario.streams,
    scenario.overlay ?? "none",
    scenario.motionBlur ?? false,
    scenario.action === "reverse"
  );
  await page.unrouteAll({ behavior: "wait" });
  await interceptPerfApi(page, fixture);
  await page.goto(`/timeline/${fixture.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Play" }).waitFor({ state: "visible" });
  await expect.poll(async () => page.locator("video").evaluateAll((videos) =>
    videos.filter((element) => element instanceof HTMLVideoElement && element.readyState >= 2).length
  )).toBeGreaterThanOrEqual(scenario.streams);

  const primaryClipId = `${fixture.id}-clip-0`;
  if (scenario.motionBlur) {
    await page.evaluate((clipId) => {
      const video = Array.from(document.querySelectorAll("video")).find((element) => element.dataset.clipId === clipId);
      if (!video) throw new Error(`Missing motion blur video ${clipId}`);
      const probe: { phase: "seeking" | "seeked"; at: number; mediaTime: number }[] = [];
      const record = (phase: "seeking" | "seeked") => {
        probe.push({ phase, at: performance.now(), mediaTime: video.currentTime });
      };
      video.addEventListener("seeking", () => record("seeking"));
      video.addEventListener("seeked", () => record("seeked"));
      (window as Window & { __timelineBlurSeeks?: typeof probe }).__timelineBlurSeeks = probe;
    }, primaryClipId);
  }
  const before = await readRun(page);
  const start = await page.evaluate(() => performance.now());
  let scrubTargetMs: number | null = null;
  if (scenario.action === "scrub") {
    const playhead = page.getByRole("slider", { name: "Playhead", exact: true });
    await playhead.focus();
    const frameSteps = scenario.overlay === "dissolve" ? 36 : 30;
    for (let step = 0; step < frameSteps; step += 1) await playhead.press("ArrowRight");
    scrubTargetMs = Number(await playhead.getAttribute("aria-valuenow"));
    if (!(scrubTargetMs > 0)) throw new Error(`${scenario.key} keyboard scrub did not move the playhead: ${scrubTargetMs}`);
    if (scenario.overlay === "dissolve" && !(scrubTargetMs > 1_000 && scrubTargetMs < 2_000)) {
      throw new Error(`Dissolve oracle requires a playhead inside the 1–2s overlap, got ${scrubTargetMs}ms`);
    }
  } else {
    await page.getByRole("button", { name: "Play" }).click();
  }
  await page.waitForTimeout(750);
  const pause = page.getByRole("button", { name: "Pause" });
  if (await pause.isVisible()) await pause.click();
  const after = await readRun(page);
  const scenarioFrames = after.frames.filter((frame) => frame.now >= start && frame.clipId === primaryClipId);
  let videoPixels: number[][] | null = null;
  let incomingPixels: number[][] | null = null;
  let lastPreviewGrid: number[][] | null = null;
  let oracleAtMs: number | null = null;
  let lastPreviewPixel: number[] | null = null;
  let lastPixelMatchCount = 0;
  let blurSeekEvidence = { completed: 0, uploadedAndSubmitted: 0 };
  let oracleFailure: unknown;
  const fourStreamScenario = scenario.key.startsWith("fourStreams");
  try {
    await expect.poll(async () => {
    const sourceGrids = await page.evaluate(({ clipId, sourceMedia }) => {
      const points = [0.2, 0.35, 0.5, 0.65, 0.8];
      const readGrid = (video: HTMLVideoElement | undefined): number[][] | null => {
        if (!video || video.readyState < 2) return null;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return null;
        context.drawImage(video, 0, 0);
        return points.flatMap((y) => points.map((x) => Array.from(context.getImageData(
          Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1
        ).data)));
      };
      const videos = Array.from(document.querySelectorAll("video"));
      const primary = videos.find((video) => video.dataset.clipId === clipId && video.currentSrc.endsWith(`/${sourceMedia}`));
      const incoming = videos.find((video) => video.dataset.clipId === `${clipId.slice(0, -1)}1`);
      return { primary: readGrid(primary), incoming: readGrid(incoming) };
    }, { clipId: primaryClipId, sourceMedia: fixture.assets.get(`${fixture.id}-asset-0`) ?? scenario.media });
    videoPixels = sourceGrids.primary;
    incomingPixels = sourceGrids.incoming;
    if (!videoPixels) return false;
    const previewBytes = await page.locator('[aria-label="Preview area"] canvas').first().screenshot();
    const pixels = await sharp(previewBytes).raw().toBuffer({ resolveWithObject: true });
    const centerOffset = (Math.floor(pixels.info.height / 2) * pixels.info.width + Math.floor(pixels.info.width / 2)) * pixels.info.channels;
    lastPreviewPixel = Array.from(pixels.data.subarray(centerOffset, centerOffset + pixels.info.channels));
    const points = [0.2, 0.35, 0.5, 0.65, 0.8];
    const previewGrid = points.flatMap((y) => points.map((x) => {
      const offset = (Math.floor(pixels.info.height * y) * pixels.info.width + Math.floor(pixels.info.width * x)) * pixels.info.channels;
      return Array.from(pixels.data.subarray(offset, offset + pixels.info.channels));
    }));
    lastPreviewGrid = previewGrid;
    const submit = (await readRun(page)).events
      .filter((event) => event.kind === "compositor-submit" && event.at >= start)
      .at(-1);
    const matchCount = videoPixels.filter((source, index) => {
      const x = points[index % points.length] ?? 0.5;
      const y = points[Math.floor(index / points.length)] ?? 0.5;
      const offset = (Math.floor(pixels.info.height * y) * pixels.info.width + Math.floor(pixels.info.width * x)) * pixels.info.channels;
      return source.slice(0, 3).every((channel, channelIndex) => Math.abs(channel - (pixels.data[offset + channelIndex] ?? 0)) <= 35) &&
        (pixels.info.channels < 4 || (pixels.data[offset + 3] ?? 0) > 0);
    }).length;
    lastPixelMatchCount = matchCount;
    const matches = matchCount >= 10;
    if (fourStreamScenario) {
      const expected = [
        { x: 0.25, y: 0.25, rgb: [253, 0, 0] },
        { x: 0.75, y: 0.25, rgb: [0, 127, 0] },
        { x: 0.25, y: 0.75, rgb: [0, 0, 254] },
        { x: 0.75, y: 0.75, rgb: [253, 253, 0] }
      ];
      const quadrantMatches = expected.filter((point) => {
        const offset = (Math.floor(pixels.info.height * point.y) * pixels.info.width + Math.floor(pixels.info.width * point.x)) * pixels.info.channels;
        return point.rgb.every((channel, channelIndex) => Math.abs(channel - (pixels.data[offset + channelIndex] ?? 0)) <= 45);
      }).length;
      lastPixelMatchCount = quadrantMatches;
      const passed = quadrantMatches === 4 && (submit?.drawnLayers ?? 0) >= 4;
      if (passed) oracleAtMs = await page.evaluate(() => performance.now());
      return passed;
    }
    if (scenario.overlay === "dissolve") {
      if (!incomingPixels) return false;
      const blendFraction = Math.max(0, Math.min(1, ((scrubTargetMs ?? 1_500) - 1_000) / 1_000));
      const blendedPoints = videoPixels.filter((source, index) => {
        const output = previewGrid[index] ?? [];
        const incoming = incomingPixels?.[index] ?? [];
        const sourceRgb = source.slice(0, 3);
        const incomingRgb = incoming.slice(0, 3);
        const separation = sourceRgb.reduce((total, channel, c) => total + Math.abs(channel - (incomingRgb[c] ?? 0)), 0);
        const expected = sourceRgb.map((channel, c) => channel * (1 - blendFraction) + (incomingRgb[c] ?? 0) * blendFraction);
        const sourceDistance = output.slice(0, 3).reduce((total, channel, c) => total + Math.abs(channel - (sourceRgb[c] ?? 0)), 0);
        const incomingDistance = output.slice(0, 3).reduce((total, channel, c) => total + Math.abs(channel - (incomingRgb[c] ?? 0)), 0);
        return separation >= 120 && sourceDistance >= 45 && incomingDistance >= 45 &&
          expected.every((channel, c) => Math.abs(channel - (output[c] ?? 0)) <= 35);
      }).length;
      lastPixelMatchCount = blendedPoints;
      const passed = blendedPoints >= 5 && (submit?.drawnLayers ?? 0) >= 2;
      if (passed) oracleAtMs = await page.evaluate(() => performance.now());
      return passed;
    }
    if (scenario.overlay === "matte") {
      const outside = [0, 4, 20, 24];
      const inside = [6, 8, 11, 13, 16, 18];
      const outsideDark = outside.every((index) => (previewGrid[index] ?? []).slice(0, 3).every((channel) => channel < 50));
      const outsideSourceVisible = outside.filter((index) => (videoPixels[index] ?? []).slice(0, 3).some((channel) => channel > 80)).length >= 2;
      const insideMatches = inside.filter((index) => {
        const source = videoPixels[index]?.slice(0, 3) ?? [];
        return source.length === 3 && source.every((channel, c) =>
          Math.abs(channel - (previewGrid[index]?.[c] ?? 0)) <= 45
        );
      }).length;
      lastPixelMatchCount = insideMatches;
      const passed = (submit?.drawnLayers ?? 0) >= 1 &&
        outsideDark && outsideSourceVisible && insideMatches >= 4;
      if (passed) oracleAtMs = await page.evaluate(() => performance.now());
      return passed;
    }
    if (scenario.overlay === "animated-text") {
      const changed = videoPixels.filter((source, index) => source.slice(0, 3).some(
        (channel, channelIndex) => Math.abs(channel - (previewGrid[index]?.[channelIndex] ?? 0)) > 45
      )).length;
      lastPixelMatchCount = changed;
      const passed = changed >= 2 && (submit?.drawnLayers ?? 0) >= 3;
      if (passed) oracleAtMs = await page.evaluate(() => performance.now());
      return passed;
    }
    if (scenario.motionBlur) {
      const seeks = await page.evaluate(() =>
        (window as Window & { __timelineBlurSeeks?: { phase: "seeking" | "seeked"; at: number; mediaTime: number }[] }).__timelineBlurSeeks ?? []
      );
      const events = (await readRun(page)).events;
      let completed = 0;
      let uploadedAndSubmitted = 0;
      for (let index = 0; index < seeks.length - 1; index += 1) {
        const seek = seeks[index]!;
        if (seek.phase !== "seeking" || seek.at < start) continue;
        const nextSeekingAt = seeks.slice(index + 1).find((event) => event.phase === "seeking")?.at ?? Infinity;
        const seeked = seeks.slice(index + 1).find((event) => event.phase === "seeked" && event.at < nextSeekingAt);
        if (!seeked || nextSeekingAt === Infinity) continue;
        completed += 1;
        const upload = events.find((event) => event.kind === "source-upload" && event.sourceId === `v:${primaryClipId}` &&
          event.at >= seeked.at && event.at < nextSeekingAt && event.mediaTime !== undefined &&
          Math.abs(event.mediaTime - seeked.mediaTime) <= 1 / 24 + 0.005);
        if (!upload) continue;
        const submitted = events.some((event) => event.kind === "compositor-submit" && event.at >= upload.at &&
          event.at < nextSeekingAt && (event.drawnLayers ?? 0) >= 1);
        if (submitted) uploadedAndSubmitted += 1;
      }
      blurSeekEvidence = { completed, uploadedAndSubmitted };
      const changed = videoPixels.filter((source, index) => source.slice(0, 3).some(
        (channel, channelIndex) => Math.abs(channel - (previewGrid[index]?.[channelIndex] ?? 0)) > 35
      )).length;
      lastPixelMatchCount = changed;
      const passed = completed >= 2 && uploadedAndSubmitted === completed && changed >= 3 && (submit?.drawnLayers ?? 0) >= 1;
      if (passed) oracleAtMs = await page.evaluate(() => performance.now());
      return passed;
    }
    if (scenario.key.includes("effectHeavy")) {
      const changed = videoPixels.filter((source, index) => source.slice(0, 3).some(
        (channel, channelIndex) => Math.abs(channel - (previewGrid[index]?.[channelIndex] ?? 0)) > 35
      )).length;
      lastPixelMatchCount = changed;
      const passed = changed >= 3 && (submit?.drawnLayers ?? 0) >= 1;
      if (passed) oracleAtMs = await page.evaluate(() => performance.now());
      return passed;
    }
    if (scenario.action === "reverse") {
      const observedTimes = scenarioFrames.map((frame) => frame.mediaTime).filter(Number.isFinite);
      const passed = observedTimes.length >= 3 && observedTimes[0]! > observedTimes.at(-1)! &&
        observedTimes[0]! <= 4.1 && observedTimes.at(-1)! >= 1.9 && matches;
      if (passed) oracleAtMs = await page.evaluate(() => performance.now());
      return passed;
    }
    const passed = matches;
    if (passed) oracleAtMs = await page.evaluate(() => performance.now());
    return passed;
    }, { timeout: 10_000, intervals: [100, 200, 300, 500] }).toBe(true);
  } catch (error) {
    oracleFailure = error;
  }
  if (oracleFailure) {
    const videoState = await page.locator("video").evaluateAll((videos, clipId) => videos.map((element) => {
      const video = element as HTMLVideoElement;
      return { asset: video.currentSrc, clipId: video.dataset.clipId ?? "", currentTime: video.currentTime, paused: video.paused, seeking: video.seeking, readyState: video.readyState, matchesScenario: video.dataset.clipId === clipId };
    }), primaryClipId);
    const diagnostics = await readRun(page);
    const submitDiagnostics = diagnostics.events.filter((event) => event.kind === "compositor-submit").slice(-4);
    const previewGrid = await page.locator('[aria-label="Preview area"] canvas').first().screenshot().then(async (shot) => {
      const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
      return [
        [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]
      ].map(([x, y]) => {
        const offset = (Math.floor(info.height * y!) * info.width + Math.floor(info.width * x!)) * info.channels;
        return Array.from(data.subarray(offset, offset + info.channels));
      });
    });
    throw new Error(`${scenario.key} scenario oracle timed out: targetMs=${scrubTargetMs} videoFrames=${scenarioFrames.length} uploads=${diagnostics.events.filter((event) => event.kind === "source-upload").length - before.events.filter((event) => event.kind === "source-upload").length} submissions=${diagnostics.events.filter((event) => event.kind === "compositor-submit").length - before.events.filter((event) => event.kind === "compositor-submit").length} blurSeekEvidence=${JSON.stringify(blurSeekEvidence)} submitDiagnostics=${JSON.stringify(submitDiagnostics)} videos=${JSON.stringify(videoState)} sourcePixels=${JSON.stringify(videoPixels)} incomingPixels=${JSON.stringify(incomingPixels)} previewCenter=${JSON.stringify(lastPreviewPixel)} previewGrid=${JSON.stringify(lastPreviewGrid)} evidenceCount=${lastPixelMatchCount}`);
  }
  const oracleMethod = fourStreamScenario
    ? "known-composite-color-grid" as const
    : scenario.overlay === "matte"
      ? "matte-center-corner-pixel-check" as const
      : scenario.overlay === "dissolve"
        ? "dissolve-overlap-pixel-check" as const
        : scenario.overlay === "animated-text"
          ? "caption-and-title-pixel-check" as const
          : scenario.action === "reverse"
            ? "reverse-source-time-check" as const
            : scenario.motionBlur
              ? "motion-blur-signal-diagnostic" as const
              : scenario.key.includes("effectHeavy")
                ? "effect-signal-diagnostic" as const
              : "decoded-source-pixel-grid" as const;
  const frameOraclePassed = true;
  const steadyIntervals = scenarioFrames.slice(1).map((frame, index) => frame.now - scenarioFrames[index]!.now).sort((a, b) => a - b);
  const percentile = (p: number): number | null => steadyIntervals.length
    ? steadyIntervals[Math.min(steadyIntervals.length - 1, Math.floor(p * steadyIntervals.length))] ?? null
    : null;
  const uploadCount = after.events.filter((event) => event.kind === "source-upload").length - before.events.filter((event) => event.kind === "source-upload").length;
  const submissionCount = after.events.filter((event) => event.kind === "compositor-submit").length - before.events.filter((event) => event.kind === "compositor-submit").length;
  if (submissionCount < 1) throw new Error(`${scenario.key} observed no WebGPU compositor submissions`);
  const elapsedMs = await page.evaluate((startAt) => performance.now() - startAt, start);
  const report: TimelinePerfRun = {
    measurementPath: "browser-preview",
    oracleMethod,
    elapsedMs,
    frameOraclePassed,
    scenarioConfig: { width: scenario.width, height: scenario.height, videoStreams: scenario.streams },
    sampleCount: scenarioFrames.length,
    sourceUploads: Math.max(0, uploadCount),
    compositorSubmissions: submissionCount,
    decodedVideoFrames: scenarioFrames.length,
    presentedFrames: null,
    decodedFrameIntervalsMs: percentile(0.5) === null ? null : { p50: percentile(0.5)!, p95: percentile(0.95)!, p99: percentile(0.99)! },
    heldFrames: null,
    droppedVideoFrames: after.droppedVideoFrames,
    duplicateVideoFrames: null,
    correctFrameMatches: frameOraclePassed,
    bitmapCacheResidentBytes: after.bitmapCacheResidentBytes,
    bitmapCachePeakFrameBytes: after.bitmapCachePeakFrameBytes,
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
      peakProcessMemoryBytes: null,
      exportFramesPerSecond: null,
      cancellationMs: null,
      scrubToCorrectFrameMs: scenario.action === "scrub" && frameOraclePassed && oracleAtMs !== null ? oracleAtMs - start : null
    }
  };
  return report;
}

async function measurePreparedCutHandoff(page: Page): Promise<TimelinePerfRun> {
  await page.unrouteAll({ behavior: "wait" });
  await page.addInitScript(() => {
    const state = {
      nextId: 0,
      loadCalls: 0,
      cutBoundaryAt: null as number | null,
      events: [] as PreviewEvent[],
      frames: [] as Array<{ elementId: string; clipId: string; now: number; mediaTime: number; timelineMs: number | null }>
    };
    (window as Window & { __timelineHandoff?: typeof state }).__timelineHandoff = state;
    (window as Window & { __nodetoolTimelinePerf?: (event: PreviewEvent) => void }).__nodetoolTimelinePerf = (event) => state.events.push(event);
    const originalLoad = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function (this: HTMLMediaElement): void {
      if (this instanceof HTMLVideoElement && this.dataset.clipId === "timeline-perf-incoming-clip") {
        state.loadCalls += 1;
      }
      originalLoad.call(this);
    };
    const watched = new WeakSet<HTMLVideoElement>();
    const watch = (video: HTMLVideoElement) => {
      if (watched.has(video)) return;
      watched.add(video);
      video.dataset.perfElementId = `video-${state.nextId++}`;
      if (!video.requestVideoFrameCallback) return;
      const callback = (now: number, metadata: VideoFrameCallbackMetadata) => {
        const leadVideo = Array.from(document.querySelectorAll("video")).find((candidate) => candidate.currentSrc.endsWith("/lead.mp4"));
        const playheadValue = Number(document.querySelector('[aria-label="Playhead"]')?.getAttribute("aria-valuenow"));
        const timelineValue = leadVideo && leadVideo.currentTime >= 59.5 ? leadVideo.currentTime * 1000 : playheadValue;
        state.frames.push({
          elementId: video.dataset.perfElementId ?? "",
          clipId: video.dataset.clipId ?? "",
          now,
          mediaTime: metadata.mediaTime,
          timelineMs: Number.isFinite(timelineValue) ? timelineValue : null
        });
        video.requestVideoFrameCallback(callback);
      };
      video.requestVideoFrameCallback(callback);
    };
    const observer = new MutationObserver(() => document.querySelectorAll("video").forEach(watch));
    observer.observe(document, { childList: true, subtree: true });
    const watchCutBoundary = () => {
      const timelineMs = Number(document.querySelector('[aria-label="Playhead"]')?.getAttribute("aria-valuenow"));
      if (state.cutBoundaryAt === null && Number.isFinite(timelineMs) && timelineMs >= 60_000) {
        state.cutBoundaryAt = performance.now();
      }
      requestAnimationFrame(watchCutBoundary);
    };
    requestAnimationFrame(watchCutBoundary);
  });
  await interceptPerfApi(page);
  await page.goto(`/timeline/${SEQUENCE_ID}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Play" }).waitFor({ state: "visible" });
  await expect.poll(async () => page.locator("video").evaluateAll((videos) =>
    videos.some((video) => video instanceof HTMLVideoElement && video.readyState >= 2)
  )).toBe(true);
  const playhead = page.getByRole("slider", { name: "Playhead", exact: true });
  await playhead.focus();
  await playhead.press("Home");
  for (let step = 0; step < 68; step += 1) {
    await playhead.press("Shift+ArrowRight");
  }
  await expect.poll(async () => Number(await playhead.getAttribute("aria-valuenow")), { timeout: 5_000 }).toBeGreaterThanOrEqual(28_000);
  await expect.poll(async () => Number(await playhead.getAttribute("aria-valuenow")), { timeout: 5_000 }).toBeLessThan(29_000);
  const preThresholdSnapshot = await page.locator("video").evaluateAll((videos, cutInMs) => videos.map((element) => {
    const video = element as HTMLVideoElement;
    return {
      clipId: video.dataset.clipId ?? "",
      asset: video.currentSrc,
      paused: video.paused,
      readyState: video.readyState,
      currentTime: video.currentTime,
      matchesIncomingPrep: video.dataset.clipId === "timeline-perf-incoming-clip" && video.currentSrc.endsWith("/incoming.mp4") &&
        video.readyState >= 2 && Math.abs(video.currentTime - cutInMs / 1000) <= 1 / 24
    };
  }), CUT_IN_POINT_MS);
  const preparedAt28s = preThresholdSnapshot.some((video) => video.matchesIncomingPrep);
  if (preparedAt28s) throw new Error(`Incoming clip was already prepared before playback crossed the 30-second lookahead threshold: ${JSON.stringify(preThresholdSnapshot)}`);
  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(async () => page.locator("video").evaluateAll((videos) => videos.some((element) => {
    const video = element as HTMLVideoElement;
    return video.currentSrc.endsWith("/lead.mp4") && video.currentTime >= 30 && video.currentTime < 60 && !video.paused;
  })), { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => page.locator("video").evaluateAll((videos, cutInMs) => videos.some((element) => {
    const video = element as HTMLVideoElement;
    return video.dataset.clipId === "timeline-perf-incoming-clip" && video.currentSrc.endsWith("/incoming.mp4") &&
      video.readyState >= 2 && Math.abs(video.currentTime - cutInMs / 1000) <= 1 / 24;
  }), CUT_IN_POINT_MS), { timeout: 5_000 }).toBe(true);
  const prepared = await page.locator("video").evaluateAll((videos) => videos
    .filter((element) => {
      const video = element as HTMLVideoElement;
      return video.dataset.clipId === "timeline-perf-incoming-clip" && video.currentSrc.endsWith("/incoming.mp4") && video.readyState >= 2;
    })
    .map((element) => ({ elementId: (element as HTMLVideoElement).dataset.perfElementId ?? "", loadCalls: (window as Window & { __timelineHandoff?: { loadCalls: number } }).__timelineHandoff?.loadCalls ?? 0 }))
  );
  if (prepared.length === 0) throw new Error("No trimmed incoming video was prepared during the 30-second lookahead");
  const preparedIds = prepared.map((item) => item.elementId);
  const loadCallsAt30s = prepared[0]?.loadCalls ?? 0;
  await page.getByRole("button", { name: "Pause" }).click();
  await playhead.focus();
  for (let step = 0; step < 70; step += 1) {
    await playhead.press("Shift+ArrowRight");
  }
  await expect.poll(async () => page.locator("video").evaluateAll((videos) => videos.some((element) => {
    const video = element as HTMLVideoElement;
    return video.currentSrc.endsWith("/lead.mp4") && video.paused && video.currentTime >= 59 && video.currentTime < 60;
  })), { timeout: 5_000 }).toBe(true);
  const beforeCutEvents = await page.evaluate(() => {
    const events = (window as Window & { __timelineHandoff?: { events: PreviewEvent[] } }).__timelineHandoff?.events ?? [];
    return {
      uploads: events.filter((event) => event.kind === "source-upload").length,
      submissions: events.filter((event) => event.kind === "compositor-submit").length,
      events
    };
  });
  const leadStartTimeSeconds = await page.locator("video").evaluateAll((videos) => {
    const lead = videos.find((element) => (element as HTMLVideoElement).currentSrc.endsWith("/lead.mp4")) as HTMLVideoElement | undefined;
    return lead?.currentTime ?? null;
  });
  if (leadStartTimeSeconds === null || leadStartTimeSeconds < 59 || leadStartTimeSeconds >= 60) {
    throw new Error(`Near-cut seek did not position lead video in the expected range: ${leadStartTimeSeconds}`);
  }
  const cutStartedAt = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(async () => page.evaluate((startAt) => {
    const state = (window as Window & { __timelineHandoff?: { events: PreviewEvent[]; frames: Array<{ now: number; clipId: string }> } }).__timelineHandoff;
    const upload = state?.events.find((event) => event.kind === "source-upload" && event.sourceId === "v:timeline-perf-incoming-clip" && event.at >= startAt);
    const submitted = upload && state?.events.some((event) => event.kind === "compositor-submit" && event.at >= upload.at);
    const frame = state?.frames.some((sample) => sample.clipId === "timeline-perf-incoming-clip" && sample.now >= startAt);
    return Boolean(upload && submitted && frame);
  }, cutStartedAt), { timeout: 10_000 }).toBe(true);
  const firstDisplayCapture = await page.evaluate((startAt) => {
    const state = (window as Window & { __timelineHandoff?: { events: PreviewEvent[] } }).__timelineHandoff;
    const upload = state?.events.filter((event) => event.kind === "source-upload" && event.sourceId === "v:timeline-perf-incoming-clip" && event.at >= startAt).sort((a, b) => a.at - b.at)[0];
    const submit = upload ? state?.events.find((event) => event.kind === "compositor-submit" && event.at >= upload.at) : undefined;
    const video = Array.from(document.querySelectorAll("video")).find((candidate) => candidate.dataset.clipId === "timeline-perf-incoming-clip" && candidate.currentSrc.endsWith("/incoming.mp4"));
    let pixels: number[][] | null = null;
    let sourcePng: string | null = null;
    if (video instanceof HTMLVideoElement && video.readyState >= 2) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.drawImage(video, 0, 0);
        const points = [0.15, 0.325, 0.5, 0.675, 0.85];
        pixels = points.flatMap((y) => points.map((x) => Array.from(context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data)));
        sourcePng = canvas.toDataURL("image/png");
      }
    }
    const timelineMs = Number(document.querySelector('[aria-label="Playhead"]')?.getAttribute("aria-valuenow"));
    return {
      upload: upload ?? null,
      submit: submit ?? null,
      video: video instanceof HTMLVideoElement ? { readyState: video.readyState, currentTime: video.currentTime, paused: video.paused, seeking: video.seeking, width: video.videoWidth, height: video.videoHeight } : null,
      pixels,
      sourcePng,
      timelineMs: Number.isFinite(timelineMs) ? timelineMs : null
    };
  }, cutStartedAt);
  const previewCanvas = page.locator('[aria-label="Preview area"] canvas').first();
  const capturePreviewCanvas = async (): Promise<Buffer> => {
    const bounds = await previewCanvas.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, dpr: window.devicePixelRatio };
    });
    const fullPage = await page.screenshot();
    return sharp(fullPage).extract({
      left: Math.max(0, Math.floor(bounds.x * bounds.dpr)),
      top: Math.max(0, Math.floor(bounds.y * bounds.dpr)),
      width: Math.min(Math.ceil(bounds.width * bounds.dpr), await sharp(fullPage).metadata().then((info) => info.width ?? 0)),
      height: Math.min(Math.ceil(bounds.height * bounds.dpr), await sharp(fullPage).metadata().then((info) => info.height ?? 0))
    }).png().toBuffer();
  };
  const previewBytes = await capturePreviewCanvas();
  const immediateCapturedAt = await page.evaluate(() => performance.now());
  const preview = await sharp(previewBytes).raw().toBuffer({ resolveWithObject: true });
  const samplePoints = [0.15, 0.325, 0.5, 0.675, 0.85];
  const readPreviewGrid = async (bytes: Buffer): Promise<number[][]> => {
    const pixels = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    return samplePoints.flatMap((y) => samplePoints.map((x) => {
      const offset = (Math.floor(pixels.info.height * y) * pixels.info.width + Math.floor(pixels.info.width * x)) * pixels.info.channels;
      return Array.from(pixels.data.subarray(offset, offset + pixels.info.channels));
    }));
  };
  const previewGridAtSubmit = await readPreviewGrid(previewBytes);
  const countPixelMatches = (sourceGrid: number[][] | null, previewGrid: number[][]): number => sourceGrid?.filter((source, index) => source.slice(0, 3).every((value, channel) =>
    Math.abs(value - (previewGrid[index]?.[channel] ?? 0)) <= 70
  )).length ?? 0;
  const immediatePixelMatches = countPixelMatches(firstDisplayCapture.pixels, previewGridAtSubmit);
  const immediatePreviewPath = join(REPORT_DIR, "timeline-prepared-cut-first-submit-preview.png");
  const immediateSourcePath = join(REPORT_DIR, "timeline-prepared-cut-first-submit-source.png");
  const pixelSamplesPath = join(REPORT_DIR, "timeline-prepared-cut-pixel-samples.json");
  writeFileSync(immediatePreviewPath, previewBytes);
  if (firstDisplayCapture.sourcePng) writeFileSync(immediateSourcePath, Buffer.from(firstDisplayCapture.sourcePng.split(",")[1] ?? "", "base64"));
  writeFileSync(pixelSamplesPath, JSON.stringify({
    sourceDimensions: firstDisplayCapture.video ? { width: firstDisplayCapture.video.width, height: firstDisplayCapture.video.height } : null,
    previewBackingDimensions: await page.locator('[aria-label="Preview area"] canvas').first().evaluate((element) => { const canvas = element as HTMLCanvasElement; return { width: canvas.width, height: canvas.height }; }),
    previewCssBounds: await page.locator('[aria-label="Preview area"] canvas').first().evaluate((canvas) => { const rect = canvas.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, devicePixelRatio: window.devicePixelRatio }; }),
    normalizedCoordinates: samplePoints,
    sourceRgba: firstDisplayCapture.pixels,
    previewRgba: previewGridAtSubmit,
    immediatePixelMatches
  }, null, 2));
  const pixelSamples: Array<{ delayMs: number; capturedAt: number; timelineMs: number | null; mediaTime: number | null; sourceRgba: number[][] | null; previewRgba: number[][]; matches: number; previewPath: string; sourcePath: string | null }> = [{
    delayMs: 0,
    capturedAt: immediateCapturedAt,
    timelineMs: firstDisplayCapture.timelineMs,
    mediaTime: firstDisplayCapture.video?.currentTime ?? null,
    sourceRgba: firstDisplayCapture.pixels,
    previewRgba: previewGridAtSubmit,
    matches: immediatePixelMatches,
    previewPath: immediatePreviewPath,
    sourcePath: firstDisplayCapture.sourcePng ? immediateSourcePath : null
  }];
  let firstMatchingCapture = immediatePixelMatches >= 20 ? pixelSamples[0] ?? null : null;
  let waitedMs = 0;
  for (const delayMs of [16, 33, 67, 100, 200, 400, 800, 1200]) {
    if (firstMatchingCapture) break;
    await page.waitForTimeout(delayMs - waitedMs);
    waitedMs = delayMs;
    const sourceSample = await page.evaluate(() => {
      const video = Array.from(document.querySelectorAll("video")).find((candidate) => candidate.dataset.clipId === "timeline-perf-incoming-clip" && candidate.currentSrc.endsWith("/incoming.mp4"));
      if (!(video instanceof HTMLVideoElement) || video.readyState < 2) return null;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(video, 0, 0);
      const points = [0.15, 0.325, 0.5, 0.675, 0.85];
      const timelineMs = Number(document.querySelector('[aria-label="Playhead"]')?.getAttribute("aria-valuenow"));
      return { mediaTime: video.currentTime, timelineMs: Number.isFinite(timelineMs) ? timelineMs : null, pixels: points.flatMap((y) => points.map((x) => Array.from(context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data))), png: canvas.toDataURL("image/png") };
    });
    const nextPreviewBytes = await capturePreviewCanvas();
    const capturedAt = await page.evaluate(() => performance.now());
    const nextPreviewGrid = await readPreviewGrid(nextPreviewBytes);
    const matches = countPixelMatches(sourceSample?.pixels ?? null, nextPreviewGrid);
    const previewPath = join(REPORT_DIR, `timeline-prepared-cut-preview-${delayMs}ms.png`);
    const sourcePath = sourceSample?.png ? join(REPORT_DIR, `timeline-prepared-cut-source-${delayMs}ms.png`) : null;
    writeFileSync(previewPath, nextPreviewBytes);
    if (sourcePath && sourceSample?.png) writeFileSync(sourcePath, Buffer.from(sourceSample.png.split(",")[1] ?? "", "base64"));
    const capture = { delayMs, capturedAt, timelineMs: sourceSample?.timelineMs ?? null, mediaTime: sourceSample?.mediaTime ?? null, sourceRgba: sourceSample?.pixels ?? null, previewRgba: nextPreviewGrid, matches, previewPath, sourcePath };
    pixelSamples.push(capture);
    if (matches >= 20) firstMatchingCapture = capture;
  }
  writeFileSync(pixelSamplesPath, JSON.stringify({
    sourceDimensions: firstDisplayCapture.video ? { width: firstDisplayCapture.video.width, height: firstDisplayCapture.video.height } : null,
    previewBackingDimensions: await page.locator('[aria-label="Preview area"] canvas').first().evaluate((element) => { const canvas = element as HTMLCanvasElement; return { width: canvas.width, height: canvas.height }; }),
    previewCssBounds: await page.locator('[aria-label="Preview area"] canvas').first().evaluate((canvas) => { const rect = canvas.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, devicePixelRatio: window.devicePixelRatio }; }),
    normalizedCoordinates: samplePoints,
    captures: pixelSamples
  }, null, 2));
  await page.getByRole("button", { name: "Pause" }).click();
  const afterState = await page.evaluate(() => {
    const state = (window as Window & { __timelineHandoff?: { loadCalls: number; cutBoundaryAt: number | null; events: PreviewEvent[]; frames: Array<{ elementId: string; clipId: string; now: number; mediaTime: number; timelineMs: number | null }> } }).__timelineHandoff;
    const events = state?.events ?? [];
    const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-text-bitmap-cache-bytes]");
    const cache = (window as Window & { __timelineBitmapCache?: { textBytes: number; shapeBytes: number; peakTextBytes: number; peakShapeBytes: number } }).__timelineBitmapCache;
    return {
      loadCalls: state?.loadCalls ?? 0,
      cutBoundaryAt: state?.cutBoundaryAt ?? null,
      frames: state?.frames ?? [],
      uploads: events.filter((event) => event.kind === "source-upload").length,
      submissions: events.filter((event) => event.kind === "compositor-submit").length,
      bitmapCacheResidentBytes: {
        textBytes: canvas?.dataset.textBitmapCacheBytes === undefined ? cache?.textBytes ?? null : Number(canvas.dataset.textBitmapCacheBytes),
        shapeBytes: canvas?.dataset.shapeBitmapCacheBytes === undefined ? cache?.shapeBytes ?? null : Number(canvas.dataset.shapeBitmapCacheBytes)
      },
      bitmapCachePeakFrameBytes: {
        textBytes: canvas?.dataset.textBitmapCachePeakBytes === undefined ? cache?.peakTextBytes ?? null : Number(canvas.dataset.textBitmapCachePeakBytes),
        shapeBytes: canvas?.dataset.shapeBitmapCachePeakBytes === undefined ? cache?.peakShapeBytes ?? null : Number(canvas.dataset.shapeBitmapCachePeakBytes)
      },
      events
    };
  });
  const firstCutFrame = afterState.frames.find((frame) => frame.clipId === "timeline-perf-incoming-clip" && frame.now >= cutStartedAt);
  if (!firstCutFrame) throw new Error("No incoming decoded frame was observed after the cut");
  const sameElement = preparedIds.includes(firstCutFrame.elementId);
  const noReload = afterState.loadCalls === loadCallsAt30s;
  const mediaElementSnapshot = await page.locator("video").evaluateAll((videos) => videos.map((element) => {
    const video = element as HTMLVideoElement;
    return { clipId: video.dataset.clipId ?? "", mediaTime: video.currentTime, asset: video.currentSrc, paused: video.paused, seeking: video.seeking, width: video.videoWidth, height: video.videoHeight };
  }));
  const activeIncoming = mediaElementSnapshot.find((video) => video.clipId === "timeline-perf-incoming-clip" && video.asset.endsWith("/incoming.mp4"));
  const currentPixels = firstDisplayCapture.pixels;
  const points = [0.15, 0.325, 0.5, 0.675, 0.85];
  const previewPixels = points.flatMap((y) => points.map((x) => {
    const offset = (Math.floor(preview.info.height * y) * preview.info.width + Math.floor(preview.info.width * x)) * preview.info.channels;
    return Array.from(preview.data.subarray(offset, offset + 3));
  }));
  const pixelMatches = immediatePixelMatches;
  const pixelOraclePassed = firstMatchingCapture !== null;
  const incomingUploads = afterState.events
    .filter((event) => event.kind === "source-upload" && event.sourceId === "v:timeline-perf-incoming-clip" && event.at >= cutStartedAt)
    .sort((left, right) => left.at - right.at);
  const firstUpload = incomingUploads[0];
  const lastUpload = incomingUploads[incomingUploads.length - 1];
  const submitTimesAfterUploads = incomingUploads.map((upload) => afterState.events.find((event) => event.kind === "compositor-submit" && event.at >= upload.at)?.at ?? null);
  const firstSubmitAtMs = submitTimesAfterUploads[0] ?? null;
  const lastUploadSubmitAtMs = submitTimesAfterUploads[submitTimesAfterUploads.length - 1] ?? null;
  const firstMatchingDelayMs = firstMatchingCapture?.delayMs ?? null;
  const firstMatchingMediaTime = firstMatchingCapture?.mediaTime ?? null;
  const firstMatchingTimelineMs = firstMatchingCapture?.timelineMs ?? null;
  const expectedSourceTimeAtMatch = firstMatchingTimelineMs === null
    ? null
    : CUT_IN_POINT_MS / 1000 + (firstMatchingTimelineMs - 60_000) / 1000;
  const frameIndexAtMatch = firstMatchingMediaTime === null ? null : Math.floor(firstMatchingMediaTime * 24);
  const expectedFrameIndex = expectedSourceTimeAtMatch === null ? null : Math.floor(expectedSourceTimeAtMatch * 24);
  if (expectedSourceTimeAtMatch !== null && expectedFrameIndex !== null) {
    expect(Math.abs(Math.floor((expectedSourceTimeAtMatch - 0.25) * 24) - expectedFrameIndex) <= 1).toBe(false);
  }
  const frameOraclePassed = frameIndexAtMatch !== null && expectedFrameIndex !== null
    && Math.abs(frameIndexAtMatch - expectedFrameIndex) <= 1;
  const passed = frameOraclePassed && sameElement && noReload && pixelOraclePassed && Boolean(activeIncoming) && afterState.cutBoundaryAt !== null;
  const cutToCorrectFrameMs = firstMatchingCapture === null || afterState.cutBoundaryAt === null
    ? null
    : Math.max(0, firstMatchingCapture.capturedAt - afterState.cutBoundaryAt);
  const report: TimelinePerfRun = {
    measurementPath: "browser-preview",
    elapsedMs: cutToCorrectFrameMs,
    frameOraclePassed: passed,
    scenarioConfig: { width: 640, height: 360, videoStreams: 1 },
    sampleCount: afterState.frames.filter((frame) => frame.clipId === "timeline-perf-incoming-clip").length,
    sourceUploads: Math.max(0, afterState.uploads - beforeCutEvents.uploads),
    compositorSubmissions: Math.max(0, afterState.submissions - beforeCutEvents.submissions),
    decodedVideoFrames: afterState.frames.filter((frame) => frame.clipId === "timeline-perf-incoming-clip").length,
    presentedFrames: null,
    heldFrames: null,
    droppedVideoFrames: null,
    duplicateVideoFrames: null,
    correctFrameMatches: passed,
    bitmapCacheResidentBytes: afterState.bitmapCacheResidentBytes,
    bitmapCachePeakFrameBytes: afterState.bitmapCachePeakFrameBytes,
    preparedCutEvidence: {
      preparedElementPromoted: sameElement,
      additionalLoadCalls: Math.max(0, afterState.loadCalls - loadCallsAt30s),
      decodedPixelMatchesPreview: pixelOraclePassed,
      timelineAtFirstFrameMs: firstMatchingTimelineMs,
      firstUploadMediaTimeSeconds: firstUpload?.mediaTime ?? null,
      lastUploadMediaTimeSeconds: lastUpload?.mediaTime ?? null,
      firstUploadAtMs: firstUpload?.at ?? null,
      firstSubmitAtMs,
      lastUploadSubmitAtMs,
      currentMediaTimeAtScreenshotSeconds: firstDisplayCapture.video?.currentTime ?? null,
      pixelMatches,
      sourceDimensions: firstDisplayCapture.video ? { width: firstDisplayCapture.video.width, height: firstDisplayCapture.video.height } : null,
      previewDimensions: { width: preview.info.width, height: preview.info.height },
      firstSubmitLayerCount: firstDisplayCapture.submit?.layerCount ?? null,
      firstSubmitDrawnLayers: firstDisplayCapture.submit?.drawnLayers ?? null,
      firstMatchingPreviewDelayMs: firstMatchingDelayMs,
      sourceMediaTimeAtFirstMatchSeconds: firstMatchingMediaTime,
      immediatePreviewScreenshotPath: immediatePreviewPath,
      firstMatchingPreviewScreenshotPath: firstMatchingCapture?.previewPath ?? null,
      pixelSamplesPath
    },
    p50PresentationIntervalMs: null,
    p95PresentationIntervalMs: null,
    p99PresentationIntervalMs: null,
    cutToCorrectFrameMs,
    cutSourceTimeSeconds: firstCutFrame.mediaTime,
    extendedMetrics: {
      mainThreadTimeMs: null,
      gpuCompletionTimeMs: null,
      audioDriftMs: null,
      queueDepth: null,
      estimatedAllocatedBytes: null,
      peakProcessMemoryBytes: null,
      exportFramesPerSecond: null,
      cancellationMs: null,
      scrubToCorrectFrameMs: null
    }
  };
  return report;
}

test("real timeline preview reports steady playback and trimmed-cut baseline twice", async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(process.env.CI === "true", "browser performance numbers are machine-specific");
  mkdirSync(REPORT_DIR, { recursive: true });
  const cold = await runFixture(page, "cold");
  writeFileSync(join(REPORT_DIR, "timeline-preview-cold.json"), JSON.stringify(cold, null, 2));
  const warm = await runFixture(page, "warm");
  writeFileSync(join(REPORT_DIR, "timeline-preview-warm.json"), JSON.stringify(warm, null, 2));
  expect(validateTimelinePerfReport(JSON.parse(readFileSync(join(REPORT_DIR, "timeline-preview-cold.json"), "utf8")))).toBe(true);
  expect(validateTimelinePerfReport(JSON.parse(readFileSync(join(REPORT_DIR, "timeline-preview-warm.json"), "utf8")))).toBe(true);
  expect(cold.scenarios.trimmedCut.correctFrameMatches).toBe(true);
  expect(warm.scenarios.trimmedCut.correctFrameMatches).toBe(true);
});

test("28-to-30-second live lookahead prepares the 60-second cut without reloading", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(process.env.CI === "true", "browser performance numbers are machine-specific");
  mkdirSync(REPORT_DIR, { recursive: true });
  const handoff = await measurePreparedCutHandoff(page);
  const report = await runFixture(page, "warm");
  report.scenarios.trimmedCut58sHandoff = handoff;
  const reportPath = join(REPORT_DIR, "timeline-preview-prepared-cut.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  expect(validateTimelinePerfReport(JSON.parse(readFileSync(reportPath, "utf8")))).toBe(true);
  expect(handoff.frameOraclePassed).toBe(true);
});

test("reverse remap continues uploading frames while seek targets advance", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(process.env.CI === "true", "browser performance numbers are machine-specific");
  mkdirSync(REPORT_DIR, { recursive: true });
  const report = await runFixture(page, "warm");
  const reverse = PREVIEW_SCENARIOS.find((scenario) => scenario.key === "reverse1080p");
  if (!reverse) throw new Error("Reverse preview scenario is not registered");
  const run = await runPreviewScenario(page, reverse, "warm");
  report.scenarios.reverse1080p = run;
  const reportPath = join(REPORT_DIR, "timeline-preview-reverse.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  expect(run.sourceUploads).toBeGreaterThan(0);
  expect(run.compositorSubmissions).toBeGreaterThan(0);
  expect(run.frameOraclePassed).toBe(true);
});

test("rapid scrub reports request latency and only accepts the latest requested frame", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(process.env.CI === "true", "browser performance numbers are machine-specific");
  mkdirSync(REPORT_DIR, { recursive: true });
  const basePath = join(REPORT_DIR, "timeline-preview-cold.json");
  const report = JSON.parse(readFileSync(basePath, "utf8")) as TimelinePerfReport;
  const fixture = makeScenarioFixture("rapid-scrub1080p", 1920, 1080, "one-1080p.mp4");
  await page.addInitScript(() => {
    const state = { events: [] as PreviewEvent[], frames: [] as FrameSample[], rafTicks: 0, rafTimes: [] as number[] };
    const perfWindow = window as Window & {
      __timelinePerf?: typeof state;
      __nodetoolTimelinePerf?: (event: PreviewEvent) => void;
      __rapidScrubSeeks?: Array<{ at: number; currentTime: number; seeking: boolean }>;
    };
    perfWindow.__timelinePerf = state;
    perfWindow.__nodetoolTimelinePerf = (event) => state.events.push(event);
    const seeks: Array<{ at: number; currentTime: number; seeking: boolean }> = [];
    perfWindow.__rapidScrubSeeks = seeks;
    document.addEventListener("seeked", (event) => {
      const video = event.target;
      if (video instanceof HTMLVideoElement) seeks.push({ at: performance.now(), currentTime: video.currentTime, seeking: video.seeking });
    }, true);
  });
  await interceptPerfApi(page, fixture);
  await page.goto(`/timeline/${fixture.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Play" }).waitFor({ state: "visible" });
  await expect.poll(async () => page.locator("video").evaluateAll((videos) =>
    videos.some((video) => video instanceof HTMLVideoElement && video.readyState >= 2)
  )).toBe(true);
  const playhead = page.getByRole("slider", { name: "Playhead", exact: true });
  await playhead.focus();
  const startedAt = await page.evaluate(() => performance.now());
  const requests = await page.evaluate(async (keys) => {
    const target = document.querySelector<HTMLElement>('[aria-label="Playhead"]');
    if (!target) throw new Error("Rapid scrub Playhead disappeared");
    target.focus();
    const requested: Array<{ at: number; timelineMs: number }> = [];
    for (const key of keys) {
      const at = performance.now();
      target.dispatchEvent(new KeyboardEvent("keydown", {
        key: key.endsWith("Left") ? "ArrowLeft" : "ArrowRight",
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }));
      await new Promise((resolve) => setTimeout(resolve, 10));
      requested.push({ at, timelineMs: Number(target.getAttribute("aria-valuenow")) });
    }
    return requested;
  }, ["Shift+ArrowRight", "Shift+ArrowRight", "Shift+ArrowLeft", "Shift+ArrowRight", "Shift+ArrowRight"]);
  if (new Set(requests.map((request) => request.timelineMs)).size < 3) {
    throw new Error(`Dense scrub key events did not produce distinct targets: ${JSON.stringify(requests)}`);
  }
  const finalRequest = requests.at(-1);
  if (!finalRequest) throw new Error("Rapid scrub produced no target requests");
  const latestFrameMatch: { value: { sourceTime: number; sourcePixels: number[][]; previewPixels: number[][]; matchCount: number; matches: boolean } | null } = { value: null };
  let latestOracleError: unknown;
  try {
    await expect.poll(async () => {
    const sourceState = await page.evaluate((targetMs) => {
      const video = Array.from(document.querySelectorAll("video")).find((element) => element instanceof HTMLVideoElement && element.readyState >= 2) as HTMLVideoElement | undefined;
      if (!video || video.seeking || Math.abs(video.currentTime * 1000 - targetMs) > 1000 / 24) return null;
      const source = document.createElement("canvas");
      source.width = video.videoWidth;
      source.height = video.videoHeight;
      const sourceContext = source.getContext("2d", { willReadFrequently: true });
      if (!sourceContext) return null;
      sourceContext.drawImage(video, 0, 0);
      const points = [0.2, 0.35, 0.5, 0.65, 0.8];
      const sourcePixels = points.flatMap((y) => points.map((x) => Array.from(sourceContext.getImageData(
        Math.floor(source.width * x), Math.floor(source.height * y), 1, 1
      ).data).slice(0, 3)));
      return { sourceTime: video.currentTime, sourcePixels };
    }, finalRequest.timelineMs);
    if (!sourceState) return null;
    const previewShot = await page.locator('[aria-label="Preview area"] canvas').first().screenshot();
    const previewRaw = await sharp(previewShot).raw().toBuffer({ resolveWithObject: true });
    const points = [0.2, 0.35, 0.5, 0.65, 0.8];
    const previewPixels = points.flatMap((y) => points.map((x) => {
      const offset = (Math.floor(previewRaw.info.height * y) * previewRaw.info.width + Math.floor(previewRaw.info.width * x)) * previewRaw.info.channels;
      return Array.from(previewRaw.data.subarray(offset, offset + 3));
    }));
    const matchCount = sourceState.sourcePixels.filter((sourcePixel, index) =>
      sourcePixel.every((channel, channelIndex) => Math.abs(channel - (previewPixels[index]?.[channelIndex] ?? 0)) <= 35)
    ).length;
    latestFrameMatch.value = {
      ...sourceState,
      previewPixels,
      matchCount,
      matches: matchCount >= 10
    };
    return latestFrameMatch.value;
    }, { timeout: 10_000, intervals: [50, 100, 200] }).toMatchObject({ matches: true });
  } catch (error) {
    latestOracleError = error;
  }
  const frameMatch = latestFrameMatch.value;
  if (!frameMatch?.matches) {
    const lastVideoState = await page.locator("video").evaluateAll((videos) => videos.map((candidate) => {
      const video = candidate as HTMLVideoElement;
      return { currentTime: video.currentTime, paused: video.paused, seeking: video.seeking, readyState: video.readyState };
    }));
    const diagnostics = await page.evaluate(() => {
      const pageWindow = window as Window & {
        __timelinePerf?: { events: PreviewEvent[] };
        __rapidScrubSeeks?: Array<{ at: number; currentTime: number; seeking: boolean }>;
      };
      return { events: pageWindow.__timelinePerf?.events ?? [], seeks: pageWindow.__rapidScrubSeeks ?? [] };
    });
    const screenshotPath = join(REPORT_DIR, "rapid-scrub-final-preview.png");
    const screenshot = await page.locator('[aria-label="Preview area"] canvas').first().screenshot();
    writeFileSync(screenshotPath, screenshot);
    throw new Error(`Latest rapid-scrub frame did not match after 10s: target=${finalRequest.timelineMs}ms, oracle=${JSON.stringify(frameMatch)}, videos=${JSON.stringify(lastVideoState)}, requests=${JSON.stringify(requests)}, seeked=${JSON.stringify(diagnostics.seeks)}, uploads=${JSON.stringify(diagnostics.events.filter((event) => event.kind === "source-upload"))}, screenshot=${screenshotPath}, cause=${String(latestOracleError)}`);
  }
  const finalState = await page.evaluate(() => {
    const windowState = window as Window & {
      __timelinePerf?: { events: PreviewEvent[] };
      __rapidScrubSeeks?: Array<{ at: number; currentTime: number; seeking: boolean }>;
    };
    return { events: windowState.__timelinePerf?.events ?? [], seeks: windowState.__rapidScrubSeeks ?? [] };
  });
  const finalSubmit = finalState.events.filter((event) => event.kind === "source-upload" && event.mediaTime !== undefined).at(-1);
  const postRequestUploads = finalState.events
    .filter((event) => event.kind === "source-upload" && event.at >= finalRequest.at)
    .map((event) => ({ at: event.at, mediaTime: event.mediaTime ?? null, sourceId: event.sourceId ?? null }));
  const matchAt = await page.evaluate(() => performance.now());
  const latencyMs = Math.max(0, matchAt - finalRequest.at);
  const run: TimelinePerfRun = {
    measurementPath: "browser-preview",
    elapsedMs: await page.evaluate((start) => performance.now() - start, startedAt),
    frameOraclePassed: true,
    scenarioConfig: { width: 1920, height: 1080, videoStreams: 1 },
    sampleCount: requests.length,
    sourceUploads: finalState.events.filter((event) => event.kind === "source-upload").length,
    compositorSubmissions: finalState.events.filter((event) => event.kind === "compositor-submit").length,
    presentedFrames: null,
    heldFrames: null,
    droppedVideoFrames: null,
    duplicateVideoFrames: null,
    correctFrameMatches: true,
    bitmapCacheResidentBytes: (await readRun(page)).bitmapCacheResidentBytes,
    bitmapCachePeakFrameBytes: (await readRun(page)).bitmapCachePeakFrameBytes,
    p50PresentationIntervalMs: null,
    p95PresentationIntervalMs: null,
    p99PresentationIntervalMs: null,
    cutToCorrectFrameMs: latencyMs,
    cutSourceTimeSeconds: finalSubmit?.mediaTime ?? frameMatch.sourceTime,
    extendedMetrics: {
      mainThreadTimeMs: null,
      gpuCompletionTimeMs: null,
      audioDriftMs: null,
      queueDepth: null,
      estimatedAllocatedBytes: null,
      peakProcessMemoryBytes: null,
      exportFramesPerSecond: null,
      cancellationMs: null,
      scrubToCorrectFrameMs: latencyMs
    }
  };
  const result = {
    ...run,
    rapidScrubEvidence: {
      cache: testInfo.repeatEachIndex === 0 ? "cold" : "warm",
      spacingTargetMs: 10,
      latestRequestAt: finalRequest.at,
      requestedTargets: requests,
      seekedTransitions: finalState.seeks,
      uploadsAfterLatestRequest: postRequestUploads,
      latestRequestedTimelineMs: finalRequest.timelineMs,
      finalMediaTimeSeconds: frameMatch.sourceTime,
      lastSourceUploadMediaTimeSeconds: finalSubmit?.mediaTime ?? null,
      latencyMs
    }
  };
  report.scenarios.rapidScrub1080p = result;
  const path = join(REPORT_DIR, "timeline-preview-rapid-scrub-dense.json");
  writeFileSync(path, JSON.stringify(report, null, 2));
  appendFileSync(join(REPORT_DIR, "timeline-preview-rapid-scrub-dense-repeats.jsonl"), `${JSON.stringify(result.rapidScrubEvidence)}\n`);
  expect(validateTimelinePerfReport(report)).toBe(true);
});

test("L2 quality modes preserve crop, placement, mask, and caption rendering", async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(process.env.CI === "true", "browser performance numbers are machine-specific");
  mkdirSync(REPORT_DIR, { recursive: true });
  const basePath = join(REPORT_DIR, "timeline-preview-cold.json");
  const report = JSON.parse(readFileSync(basePath, "utf8")) as TimelinePerfReport;
  const fixture = makeScenarioFixture("quality-modes-1080p", 1920, 1080, "one-1080p.mp4");
  const clips = fixture.sequence.clips as unknown as Array<RecordValue>;
  const videoClip = clips[0];
  if (!videoClip) throw new Error("Quality-mode fixture has no video clip");
  videoClip.crop = { left: 0.08, right: 0.08, top: 0.04, bottom: 0.04 };
  videoClip.transform = {
    position: { x: 0.04, y: -0.03 },
    scale: { x: 0.82, y: 0.82 },
    rotation: 0,
    anchor: { x: 0.5, y: 0.5 }
  };
  videoClip.mask = { kind: "ellipse" };
  videoClip.caption = {
    words: [{ word: "Quality", startMs: 0, endMs: 1800 }],
    style: { fontSizeFrac: 0.06, color: "#ffffff", activeColor: "#ffff00", background: { color: "#000000", paddingPx: 8 } }
  };
  await page.addInitScript(() => {
    const state = { events: [] as PreviewEvent[], frames: [] as FrameSample[], rafTicks: 0, rafTimes: [] as number[] };
    const perfWindow = window as Window & {
      __timelinePerf?: typeof state;
      __nodetoolTimelinePerf?: (event: PreviewEvent) => void;
    };
    perfWindow.__timelinePerf = state;
    perfWindow.__nodetoolTimelinePerf = (event) => state.events.push(event);
  });
  await interceptPerfApi(page, fixture);
  await page.goto(`/timeline/${fixture.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Play" }).waitFor({ state: "visible" });
  await expect.poll(async () => page.locator("video").evaluateAll((videos) =>
    videos.some((video) => video instanceof HTMLVideoElement && video.readyState >= 2)
  )).toBe(true);
  const quality = page.getByRole("combobox", { name: "Preview quality" });
  const canvas = page.locator('[aria-label="Preview area"] canvas').first();
  const selectQuality = async (mode: "auto" | "full" | "half" | "quarter") => {
    await quality.click();
    const label = mode === "auto" ? /^Auto/ : mode[0]!.toUpperCase() + mode.slice(1);
    await page.getByRole("option", { name: label, exact: mode !== "auto" }).click();
  };
  const dimensions = async () => canvas.evaluate((element) => {
    const preview = element as HTMLCanvasElement;
    return { width: preview.width, height: preview.height };
  });
  await selectQuality("full");
  await expect.poll(async () => (await dimensions()).width).toBeGreaterThan(0);
  const fullSize = await dimensions();
  const fullShot = await canvas.screenshot();
  const fullPixels = await sharp(fullShot).raw().toBuffer({ resolveWithObject: true });
  const points = [0.2, 0.35, 0.5, 0.65, 0.8];
  const grid = (pixels: { data: Buffer; info: { width: number; height: number; channels: number } }) => points.flatMap((y) => points.map((x) => {
    const offset = (Math.floor(pixels.info.height * y) * pixels.info.width + Math.floor(pixels.info.width * x)) * pixels.info.channels;
    return Array.from(pixels.data.subarray(offset, offset + 3));
  }));
  const referenceGrid = grid(fullPixels);
  const sourceGrid = await page.evaluate((samplePoints) => {
    const video = Array.from(document.querySelectorAll("video")).find((candidate) => candidate instanceof HTMLVideoElement && candidate.readyState >= 2) as HTMLVideoElement | undefined;
    if (!video) return null;
    const source = document.createElement("canvas");
    source.width = video.videoWidth;
    source.height = video.videoHeight;
    const context = source.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, 0, 0);
    const crop = { left: 0.08, right: 0.08, top: 0.04, bottom: 0.04 };
    const position = { x: 0.04, y: -0.03 };
    const scale = 0.82;
    return samplePoints.flatMap((y) => samplePoints.map((x) => {
      const localX = (x - (0.5 + position.x)) / scale + 0.5;
      const localY = (y - (0.5 + position.y)) / scale + 0.5;
      const sourceX = crop.left + localX * (1 - crop.left - crop.right);
      const sourceY = crop.top + localY * (1 - crop.top - crop.bottom);
      if (Math.hypot((localX - 0.5) * 2, (localY - 0.5) * 2) > 1 || localX < 0 || localX > 1 || localY < 0 || localY > 1) return null;
      const pixel = context.getImageData(Math.floor(source.width * sourceX), Math.floor(source.height * sourceY), 1, 1).data;
      return Array.from(pixel).slice(0, 3);
    }));
  }, points);
  if (!sourceGrid) throw new Error("Quality visual fixture has no decoded source pixel grid");
  const fullSourceMatches = referenceGrid.filter((pixel, index) =>
    (sourceGrid[index] ?? []).every((channel, channelIndex) => Math.abs(channel - (pixel[channelIndex] ?? 0)) <= 50)
  ).length;
  if (fullSourceMatches < 8) throw new Error(`Full quality did not match the transformed/cropped/masked source grid: ${fullSourceMatches}/25 points`);
  const modeEvidence: Record<string, { width: number; height: number; matches: number }> = {
    full: { ...fullSize, matches: 25 }
  };
  for (const mode of ["half", "quarter", "auto"] as const) {
    await selectQuality(mode);
    const expectedScale = mode === "half" ? 0.5 : mode === "quarter" ? 0.25 : 1;
    await expect.poll(async () => {
      const current = await dimensions();
      return Math.abs(current.width / fullSize.width - expectedScale) < 0.02 && Math.abs(current.height / fullSize.height - expectedScale) < 0.02;
    }, { timeout: 10_000 }).toBe(true);
    const current = await dimensions();
    const screenshot = await canvas.screenshot();
    const raw = await sharp(screenshot).raw().toBuffer({ resolveWithObject: true });
    const currentGrid = grid(raw);
    const matches = currentGrid.filter((pixel, index) =>
      (referenceGrid[index] ?? []).every((channel, channelIndex) => Math.abs(channel - (pixel[channelIndex] ?? 0)) <= 50)
    ).length;
    if (matches < 10) throw new Error(`${mode} preview diverged from Full crop/placement/mask/caption pixels: ${matches}/25 matched`);
    modeEvidence[mode] = { ...current, matches };
  }
  await selectQuality("auto");
  await expect.poll(async () => dimensions(), { timeout: 10_000 }).toEqual(fullSize);
  const autoLabel = await quality.innerText();
  const measurement = await readRun(page);
  const events = measurement.events;
  const run: TimelinePerfRun = {
    measurementPath: "browser-preview",
    elapsedMs: null,
    frameOraclePassed: Object.values(modeEvidence).every((mode) => mode.matches >= 10),
    scenarioConfig: { width: 1920, height: 1080, videoStreams: 1 },
    sampleCount: 5,
    sourceUploads: events.filter((event) => event.kind === "source-upload").length,
    compositorSubmissions: events.filter((event) => event.kind === "compositor-submit").length,
    presentedFrames: null,
    heldFrames: null,
    droppedVideoFrames: null,
    duplicateVideoFrames: null,
    correctFrameMatches: true,
    bitmapCacheResidentBytes: measurement.bitmapCacheResidentBytes,
    bitmapCachePeakFrameBytes: measurement.bitmapCachePeakFrameBytes,
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
      peakProcessMemoryBytes: null,
      exportFramesPerSecond: null,
      cancellationMs: null,
      scrubToCorrectFrameMs: null
    }
  };
  const qualityRun = {
    ...run,
    qualityEvidence: { modes: modeEvidence, autoPausedSize: await dimensions(), autoLabel, fullSourceMatches }
  };
  report.scenarios.previewQualityVisualMatrix = qualityRun;
  const reportPath = join(REPORT_DIR, "timeline-preview-quality-matrix.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  expect(validateTimelinePerfReport(report)).toBe(true);
});

test("L3 Auto uses half-size backing during 4K playback", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(process.env.CI === "true", "browser performance numbers are machine-specific");
  mkdirSync(REPORT_DIR, { recursive: true });
  const fixture = makeScenarioFixture("auto-backing-4k", 3840, 2160, "one-4k.mp4");
  await installScenarioInstrumentation(page);
  await interceptPerfApi(page, fixture);
  await page.goto(`/timeline/${fixture.id}`, { waitUntil: "domcontentloaded" });
  const play = page.getByRole("button", { name: "Play" });
  await play.waitFor({ state: "visible" });
  const quality = page.getByRole("combobox", { name: "Preview quality" });
  await quality.click();
  await page.getByRole("option", { name: /^Auto/ }).click();
  const canvas = page.locator('[aria-label="Preview area"] canvas').first();
  const dimensions = async () => canvas.evaluate((element) => {
    const preview = element as HTMLCanvasElement;
    return { width: preview.width, height: preview.height };
  });
  await expect.poll(async () => (await dimensions()).width).toBeGreaterThan(0);
  const pausedSize = await dimensions();
  await play.click();
  await expect.poll(async () => {
    const playingSize = await dimensions();
    return Math.abs(playingSize.width / pausedSize.width - 0.5) < 0.02
      && Math.abs(playingSize.height / pausedSize.height - 0.5) < 0.02;
  }, { timeout: 10_000 }).toBe(true);
  const playingSize = await dimensions();
  await expect.poll(async () => (await readRun(page)).events.some((event) =>
    event.kind === "source-upload" && event.width === 3840 && event.height === 2160
  ), { timeout: 10_000 }).toBe(true);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect.poll(dimensions, { timeout: 10_000 }).toEqual(pausedSize);
  const evidence = { pausedSize, playingSize, restoredSize: await dimensions(), sourceUpload4k: true };
  writeFileSync(join(REPORT_DIR, "timeline-preview-auto-backing-4k.json"), JSON.stringify(evidence, null, 2));
});

test("L3 preview scenario matrix reports independent named runs", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(process.env.CI === "true", "browser performance numbers are machine-specific");
  mkdirSync(REPORT_DIR, { recursive: true });
  const cold = await runFixture(page, "cold");
  cold.fixtureVersion = "timeline-preview-l3-v1";
  for (const scenario of PREVIEW_SCENARIOS) {
    cold.scenarios[scenario.key] = await runPreviewScenario(page, scenario, "cold");
  }
  expect(cold.scenarios.trimmedCut.correctFrameMatches).toBe(true);
  writeFileSync(join(REPORT_DIR, "timeline-preview-l3-cold.json"), JSON.stringify(cold, null, 2));
  const warm = await runFixture(page, "warm");
  warm.fixtureVersion = "timeline-preview-l3-v1";
  for (const scenario of PREVIEW_SCENARIOS) {
    warm.scenarios[scenario.key] = await runPreviewScenario(page, scenario, "warm");
  }
  expect(warm.scenarios.trimmedCut.correctFrameMatches).toBe(true);
  writeFileSync(join(REPORT_DIR, "timeline-preview-l3-warm.json"), JSON.stringify(warm, null, 2));
  expect(validateTimelinePerfReport(cold)).toBe(true);
  expect(validateTimelinePerfReport(warm)).toBe(true);
});

for (const scenario of PREVIEW_SCENARIOS) {
  test(`L3 isolated ${scenario.key} preview oracle`, async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(process.env.CI === "true", "browser performance numbers are machine-specific");
    mkdirSync(REPORT_DIR, { recursive: true });
    const basePath = join(REPORT_DIR, "timeline-preview-cold.json");
    const baseline = JSON.parse(readFileSync(basePath, "utf8")) as TimelinePerfReport;
    await installScenarioInstrumentation(page);
    const run = await runPreviewScenario(page, scenario, "warm");
    const previewSize = await page.locator('[aria-label="Preview area"] canvas').first().evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      return { width: canvas.width, height: canvas.height };
    });
    const report: TimelinePerfReport = {
      ...baseline,
      fixtureVersion: "timeline-preview-l3-v1",
      reportKind: "isolatedScenario",
      inheritedBaselinePath: basePath,
      environment: {
        ...baseline.environment,
        cache: "warm",
        mediaWidth: scenario.width,
        mediaHeight: scenario.height,
        previewWidth: previewSize.width,
        previewHeight: previewSize.height
      },
      scenarios: { [scenario.key]: run }
    };
    const reportPath = join(REPORT_DIR, `timeline-preview-${scenario.key}-isolated.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    expect(validateTimelinePerfReport(report)).toBe(true);
    expect(run.frameOraclePassed).toBe(true);
    expect(run.compositorSubmissions).toBeGreaterThan(0);
  });
}

test("L3 browser export records complete frames and independent pixel identity", async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(process.env.CI === "true", "browser performance numbers are machine-specific");
  const basePath = join(REPORT_DIR, "timeline-preview-cold.json");
  if (!readFileSync(basePath, "utf8")) throw new Error("Run the L0 baseline first to create timeline-preview-cold.json");
  const report = JSON.parse(readFileSync(basePath, "utf8")) as TimelinePerfReport;
  report.fixtureVersion = "timeline-preview-l3-v1";
  const fixture = makeScenarioFixture("browser-export-1080p", 1920, 1080, "one-1080p.mp4");
  await page.addInitScript(() => {
    const events: Array<{ kind: string }> = [];
    (window as Window & {
      __nodetoolTimelinePerf?: (event: { kind: string }) => void;
      __timelineExportEvents?: Array<{ kind: string }>;
    }).__timelineExportEvents = events;
    (window as Window & { __nodetoolTimelinePerf?: (event: { kind: string }) => void }).__nodetoolTimelinePerf = (event) => events.push(event);
  });
  await interceptPerfApi(page, fixture);
  await page.goto(`/timeline/${fixture.id}`, { waitUntil: "domcontentloaded" });
  await expect.poll(async () => page.locator("video").evaluateAll((videos) =>
    videos.some((video) => video instanceof HTMLVideoElement && video.readyState >= 2)
  )).toBe(true);
  const checkFrames = [0, 24, 47];
  const sourceReference = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", join(FIXTURE_DIR, "one-1080p.mp4"),
    "-vf", `select=${checkFrames.map((frame) => `eq(n\\,${frame})`).join("+")},crop=16:16:952:532,format=rgb24`,
    "-frames:v", String(checkFrames.length), "-fps_mode", "passthrough",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-"
  ], { encoding: "buffer", maxBuffer: 1024 * 1024 });
  if (sourceReference.error) throw sourceReference.error;
  if (sourceReference.status !== 0 || sourceReference.stdout.length !== checkFrames.length * 16 * 16 * 3) {
    throw new Error(sourceReference.stderr?.toString() || "Could not decode independent browser export reference frames");
  }
  const averageRgb = (data: Uint8Array, frame: number, width: number, channels: number, x: number, y: number): number[] => {
    const rgb = [0, 0, 0];
    for (let row = 0; row < 16; row++) {
      for (let column = 0; column < 16; column++) {
        const offset = frame * 16 * 16 * channels + ((y + row) * width + x + column) * channels;
        for (let channel = 0; channel < 3; channel++) rgb[channel]! += data[offset + channel] ?? 0;
      }
    }
    return rgb.map((value) => Math.round(value / 256));
  };
  const start = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Export video" }).click();
  await page.getByRole("combobox", { name: "Format" }).click();
  await page.getByRole("option", { name: "PNG sequence (.zip)" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloaded = await download;
  const outputPath = join(REPORT_DIR, "browserExport1080p.zip");
  await downloaded.saveAs(outputPath);
  const elapsedMs = await page.evaluate((startAt) => performance.now() - startAt, start);
  const entries = spawnSync("unzip", ["-Z1", outputPath], { encoding: "utf8" });
  if (entries.error) throw entries.error;
  if (entries.status !== 0) throw new Error(entries.stderr || "Could not inspect browser export zip");
  const entryNames = entries.stdout.split(/\r?\n/);
  const frameNames = entryNames.filter((name) => /^frame_\d+\.png$/.test(name));
  const manifestResult = spawnSync("unzip", ["-p", outputPath, "manifest.json"], { encoding: "utf8" });
  if (manifestResult.error) throw manifestResult.error;
  if (manifestResult.status !== 0) throw new Error(manifestResult.stderr || "Browser export has no frame manifest");
  const manifest = JSON.parse(manifestResult.stdout) as { count?: number; width?: number; height?: number };
  const expectedCount = 2 * 24;
  if (frameNames.length !== expectedCount || manifest.count !== expectedCount || manifest.width !== 1920 || manifest.height !== 1080) {
    throw new Error(`Browser export has ${frameNames.length} PNG frames and manifest ${JSON.stringify(manifest)}, expected ${expectedCount} frames at 1920x1080`);
  }
  for (const [sample, frame] of checkFrames.entries()) {
    const name = `frame_${String(frame + 1).padStart(6, "0")}.png`;
    if (!frameNames.includes(name)) throw new Error(`Browser export is missing ${name}`);
    const png = spawnSync("unzip", ["-p", outputPath, name], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
    if (png.error) throw png.error;
    if (png.status !== 0) throw new Error(png.stderr?.toString() ?? `Could not read ${name}`);
    const { data, info } = await sharp(png.stdout).raw().toBuffer({ resolveWithObject: true });
    if (info.width !== 1920 || info.height !== 1080) throw new Error(`${name} is ${info.width}x${info.height}`);
    const expected = averageRgb(sourceReference.stdout, sample, 16, 3, 0, 0);
    const actual = averageRgb(data, 0, info.width, info.channels, 952, 532);
    if (!expected.every((value, channel) => Math.abs(value - (actual[channel] ?? 0)) <= 35)) {
      throw new Error(`${name} pixel mismatch: expected ${expected}, got ${actual}`);
    }
  }
  const frameOraclePassed = true;
  const events = await page.evaluate(() => (window as Window & { __timelineExportEvents?: Array<{ kind: string }> }).__timelineExportEvents ?? []);
  const sourceUploads = events.filter((event) => event.kind === "source-upload").length;
  const compositorSubmissions = events.filter((event) => event.kind === "compositor-submit").length;
  const exportRenderState = await readRun(page);
  if (frameNames.length < 1 || frameNames.length !== manifest.count || compositorSubmissions < 1) {
    throw new Error("Browser export produced no complete frames or compositor submissions");
  }
  report.scenarios.browserExport1080p = {
    measurementPath: "browser-export",
    elapsedMs,
    frameOraclePassed,
    scenarioConfig: { width: 1920, height: 1080, videoStreams: 1 },
    sampleCount: frameNames.length,
    sourceUploads,
    compositorSubmissions,
    presentedFrames: null,
    heldFrames: null,
    droppedVideoFrames: null,
    duplicateVideoFrames: null,
    correctFrameMatches: frameOraclePassed,
    bitmapCacheResidentBytes: exportRenderState.bitmapCacheResidentBytes,
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
      peakProcessMemoryBytes: null,
      exportFramesPerSecond: frameNames.length / (elapsedMs / 1000),
      cancellationMs: null,
      scrubToCorrectFrameMs: null
    },
    outputSizeBytes: readFileSync(outputPath).byteLength,
    encodedDimensions: { width: manifest.width ?? 0, height: manifest.height ?? 0 }
  };
  expect(validateTimelinePerfReport(report)).toBe(true);
  writeFileSync(join(REPORT_DIR, "timeline-preview-browser-export.json"), JSON.stringify(report, null, 2));
});

test("L1 oversized live shape bitmaps render above the cache budget and evict after use", async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(process.env.CI === "true", "browser performance numbers are machine-specific");
  mkdirSync(REPORT_DIR, { recursive: true });
  const basePath = join(REPORT_DIR, "timeline-preview-cold.json");
  if (!readFileSync(basePath, "utf8")) throw new Error("Run the L0 baseline first to create timeline-preview-cold.json");
  const report = JSON.parse(readFileSync(basePath, "utf8")) as TimelinePerfReport;
  const fixture = makeOversizedShapeFixture();
  await page.addInitScript(() => {
    const state = { events: [] as PreviewEvent[], frames: [] as FrameSample[], rafTicks: 0, rafTimes: [] as number[] };
    const perfWindow = window as Window & {
      __timelinePerf?: typeof state;
      __nodetoolTimelinePerf?: (event: PreviewEvent) => void;
    };
    perfWindow.__timelinePerf = state;
    perfWindow.__nodetoolTimelinePerf = (event) => state.events.push(event);
  });
  await interceptPerfApi(page, fixture);
  await page.goto(`/timeline/${fixture.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Play" }).waitFor({ state: "visible" });
  await page.getByRole("combobox", { name: "Preview quality" }).selectOption("full").catch(() => undefined);
  await expect.poll(async () => {
    const run = await readRun(page);
    return run.events.some((event) => event.kind === "compositor-submit" && (event.drawnLayers ?? 0) >= 2);
  }, { timeout: 30_000 }).toBe(true);
  const previewCanvas = page.locator('[aria-label="Preview area"] canvas').first();
  await expect.poll(async () => (await readRun(page)).bitmapCachePeakFrameBytes.shapeBytes ?? 0, { timeout: 30_000 }).toBeGreaterThan(64 * 1024 * 1024);
  const immediate = await previewCanvas.screenshot();
  const pixels = await sharp(immediate).raw().toBuffer({ resolveWithObject: true });
  const sample = (x: number, y: number) => {
    const offset = (Math.floor(pixels.info.height * y) * pixels.info.width + Math.floor(pixels.info.width * x)) * pixels.info.channels;
    return Array.from(pixels.data.subarray(offset, offset + 4));
  };
  const corner = sample(0.1, 0.1);
  const center = sample(0.5, 0.5);
  const trackDepth = new Map(fixture.sequence.tracks.map((track) => [track.id, trackZ(track.index)]));
  const fixtureClips = fixture.sequence.clips as unknown as Array<{ trackId: string; shapeStyle: { fill: string } }>;
  const topShape = fixtureClips
    .slice()
    .sort((left, right) => (trackDepth.get(left.trackId) ?? 0) - (trackDepth.get(right.trackId) ?? 0))
    .at(-1);
  const expectedFill = String(topShape?.shapeStyle.fill ?? "");
  const expectedRgb = expectedFill.match(/^#([0-9a-f]{6})$/i)?.[1]
    ? expectedFill.match(/^#([0-9a-f]{6})$/i)![1]!.match(/.{2}/g)!.map((channel) => Number.parseInt(channel, 16))
    : null;
  const pixelOraclePassed = expectedRgb !== null && [corner, center].every((pixel) =>
    expectedRgb.every((channel, index) => Math.abs(channel - pixel[index]!) <= 20)
  );
  if (!pixelOraclePassed) {
    const screenshotPath = join(REPORT_DIR, "oversized-shapes-preview.png");
    writeFileSync(screenshotPath, immediate);
    throw new Error(`Oversized preview pixel oracle failed (${pixels.info.width}x${pixels.info.height}): corner=${corner}, center=${center}, screenshot=${screenshotPath}`);
  }
  await expect.poll(async () => (await readRun(page)).bitmapCacheResidentBytes.shapeBytes ?? Infinity, { timeout: 30_000 }).toBeLessThanOrEqual(64 * 1024 * 1024);
  const run = await readRun(page);
  report.scenarios.oversizedPreviewShapes = {
    measurementPath: "browser-preview",
    elapsedMs: null,
    frameOraclePassed: pixelOraclePassed,
    scenarioConfig: { width: 4096, height: 4096, videoStreams: 0 },
    sampleCount: 1,
    sourceUploads: 0,
    compositorSubmissions: run.events.filter((event) => event.kind === "compositor-submit").length,
    presentedFrames: null,
    heldFrames: null,
    droppedVideoFrames: null,
    duplicateVideoFrames: null,
    correctFrameMatches: pixelOraclePassed,
    bitmapCacheResidentBytes: run.bitmapCacheResidentBytes,
    bitmapCachePeakFrameBytes: run.bitmapCachePeakFrameBytes,
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
      peakProcessMemoryBytes: null,
      exportFramesPerSecond: null,
      cancellationMs: null,
      scrubToCorrectFrameMs: null
    }
  };
  const exportStartedAt = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Export video" }).click();
  await page.getByRole("combobox", { name: "Format" }).click();
  await page.getByRole("option", { name: "PNG sequence (.zip)" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloaded = await download;
  const exportPath = join(REPORT_DIR, "oversized-shapes-browser-export.zip");
  await downloaded.saveAs(exportPath);
  const exportElapsedMs = await page.evaluate((startedAt) => performance.now() - startedAt, exportStartedAt);
  const firstFrame = spawnSync("unzip", ["-p", exportPath, "frame_000001.png"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  if (firstFrame.error) throw firstFrame.error;
  if (firstFrame.status !== 0) throw new Error(firstFrame.stderr?.toString() ?? "Could not read oversized browser export frame");
  const exported = await sharp(firstFrame.stdout).raw().toBuffer({ resolveWithObject: true });
  const exportedPixel = Array.from(exported.data.subarray(
    (Math.floor(exported.info.height / 2) * exported.info.width + Math.floor(exported.info.width / 2)) * exported.info.channels,
    (Math.floor(exported.info.height / 2) * exported.info.width + Math.floor(exported.info.width / 2)) * exported.info.channels + 3
  ));
  const exportPixelOraclePassed = expectedRgb !== null && expectedRgb.every((channel, index) => Math.abs(channel - exportedPixel[index]!) <= 20);
  if (!exportPixelOraclePassed) throw new Error(`Oversized browser export pixel mismatch: expected top track RGB ${expectedRgb}, got ${exportedPixel}`);
  const exportState = await readRun(page);
  const previewRun = report.scenarios.oversizedPreviewShapes;
  report.scenarios.oversizedBrowserExportShapes = {
    ...previewRun,
    measurementPath: "browser-export",
    elapsedMs: exportElapsedMs,
    sampleCount: 1,
    compositorSubmissions: exportState.events.filter((event) => event.kind === "compositor-submit").length,
    bitmapCacheResidentBytes: exportState.bitmapCacheResidentBytes,
    bitmapCachePeakFrameBytes: exportState.bitmapCachePeakFrameBytes,
    outputSizeBytes: statSync(exportPath).size,
    encodedDimensions: { width: exported.info.width, height: exported.info.height },
    frameOraclePassed: exportPixelOraclePassed,
    correctFrameMatches: exportPixelOraclePassed
  };
  const reportPath = join(REPORT_DIR, "timeline-preview-oversized-shapes.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  expect(validateTimelinePerfReport(report)).toBe(true);
});
