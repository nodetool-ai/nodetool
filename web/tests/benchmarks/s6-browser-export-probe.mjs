#!/usr/bin/env node
// Compare both browser-export decode paths on the L3 one-stream fixture.
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { build } from "esbuild";

const fixture = process.argv[2];
if (!fixture) throw new Error("Usage: node s6-browser-export-probe.mjs <one-1080p.mp4>");
const format = process.argv[3] === "mp4" ? "mp4" : "png_sequence";
const headed = process.argv.includes("--headed");
const canvas2d = process.argv.includes("--canvas2d");
const media = await readFile(fixture);
const [{ text: entry }] = (await build({
  stdin: {
    contents: [
      'export { renderTimeline } from "./web/src/components/timeline/render/TimelineRenderer.ts";',
      'export { makeClip, makeTrack } from "./packages/timeline/src/index.ts";',
      'export { unzipSync } from "fflate";',
      'export { Input, BlobSource, Mp4InputFormat, VideoSampleSink, Output, BufferTarget, Mp4OutputFormat, CanvasSource } from "mediabunny";'
    ].join("\n"),
    resolveDir: new URL("../../..", import.meta.url).pathname,
    sourcefile: "s6-export-entry.ts"
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false
})).outputFiles;

const browser = await chromium.launch({
  headless: !headed,
  args: ["--enable-unsafe-webgpu", "--enable-webgpu-developer-features", "--enable-precise-memory-info", "--js-flags=--expose-gc"]
});
try {
  const results = [];
  for (const mode of ["seek", "sequential", "sequential", "seek"]) {
    const page = await browser.newPage();
    if (canvas2d) {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });
      });
    }
    if (mode === "seek") {
      await page.addInitScript(() => {
        const native = globalThis.VideoDecoder;
        globalThis.__restoreVideoDecoder = () => {
          Object.defineProperty(globalThis, "VideoDecoder", { value: native, configurable: true });
        };
        Object.defineProperty(globalThis, "VideoDecoder", { value: undefined, configurable: true });
      });
    }
    await page.route("http://localhost:9177/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/entry.mjs") return route.fulfill({ contentType: "text/javascript", body: entry });
      if (path === "/video.mp4") {
        const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = range ? Number(range[1]) : 0;
        const end = range && range[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
        const headers = { "accept-ranges": "bytes", "content-length": String(end - start + 1) };
        if (range) headers["content-range"] = `bytes ${start}-${end}/${media.length}`;
        return route.fulfill({ status: range ? 206 : 200, contentType: "video/mp4", headers, body: media.subarray(start, end + 1) });
      }
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>S6 export</title>" });
    });
    await page.goto("http://localhost:9177/");
    const result = await page.evaluate(async (format) => {
      const { renderTimeline, makeClip, makeTrack, unzipSync, Input, BlobSource, Mp4InputFormat, VideoSampleSink, Output, BufferTarget, Mp4OutputFormat, CanvasSource } = await import("/entry.mjs");
      const track = makeTrack({ id: "picture", type: "video", index: 0 });
      const clip = makeClip({
        id: "fixture",
        trackId: track.id,
        name: "L3 one-stream 1080p",
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        startMs: 0,
        durationMs: 2000,
        currentAssetId: "fixture-media"
      });
      globalThis.gc?.();
      let peakHeap = performance.memory?.usedJSHeapSize ?? null;
      const start = performance.now();
      const result = await renderTimeline({
        tracks: [track], clips: [clip], width: 1920, height: 1080,
        fps: 24, durationMs: 2000, format,
        resolveUrl: async () => "/video.mp4",
        onProgress: () => {
          if (peakHeap !== null) peakHeap = Math.max(peakHeap, performance.memory.usedJSHeapSize);
        }
      });
      const elapsedMs = performance.now() - start;
      globalThis.__restoreVideoDecoder?.();
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 36;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const pixels = [];
      let manifestCount = null;
      if (format === "png_sequence") {
        const files = unzipSync(result.bytes);
        const frameNames = Object.keys(files).filter((name) => /^frame_\d+\.png$/.test(name)).sort();
        manifestCount = JSON.parse(new TextDecoder().decode(files["manifest.json"])).count;
        for (const name of frameNames) {
          const bitmap = await createImageBitmap(new Blob([files[name]], { type: "image/png" }));
          context.drawImage(bitmap, 0, 0, 64, 36);
          const bytes = context.getImageData(0, 0, 64, 36).data;
          pixels.push(btoa(String.fromCharCode(...bytes)));
          bitmap.close();
        }
      } else {
        const outputInput = new Input({
          source: new BlobSource(new Blob([result.bytes], { type: "video/mp4" })),
          formats: [new Mp4InputFormat()]
        });
        const outputTrack = await outputInput.getPrimaryVideoTrack();
        const outputSink = new VideoSampleSink(outputTrack);
        for await (const sample of outputSink.samples()) {
          const frame = sample.toVideoFrame();
          const bitmap = await createImageBitmap(frame);
          context.drawImage(bitmap, 0, 0, 64, 36);
          const bytes = context.getImageData(0, 0, 64, 36).data;
          pixels.push(btoa(String.fromCharCode(...bytes)));
          bitmap.close();
          frame.close();
          sample.close();
        }
        outputInput.dispose();
      }
      const oracleInput = new Input({
        source: new BlobSource(new Blob([await (await fetch("/video.mp4")).arrayBuffer()])),
        formats: [new Mp4InputFormat()]
      });
      const oracleTrack = await oracleInput.getPrimaryVideoTrack();
      const oracleSink = new VideoSampleSink(oracleTrack);
      const oraclePixels = [];
      for (let frameIndex = 0; frameIndex < pixels.length; frameIndex++) {
        const sample = await oracleSink.getSample(frameIndex / 24);
        const frame = sample.toVideoFrame();
        const bitmap = await createImageBitmap(frame);
        context.drawImage(bitmap, 0, 0, 64, 36);
        const bytes = context.getImageData(0, 0, 64, 36).data;
        oraclePixels.push(btoa(String.fromCharCode(...bytes)));
        bitmap.close();
        frame.close();
        sample.close();
      }
      oracleInput.dispose();
      let standaloneEncoderPixel = null;
      if (format === "mp4") {
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = 64;
        sourceCanvas.height = 64;
        sourceCanvas.getContext("2d").fillStyle = "#ff0000";
        sourceCanvas.getContext("2d").fillRect(0, 0, 64, 64);
        const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
        const canvasSource = new CanvasSource(sourceCanvas, { codec: "avc", bitrate: 1000000 });
        output.addVideoTrack(canvasSource, { frameRate: 24 });
        await output.start();
        await canvasSource.add(0, 1 / 24);
        canvasSource.close();
        await output.finalize();
        const checkInput = new Input({
          source: new BlobSource(new Blob([output.target.buffer], { type: "video/mp4" })),
          formats: [new Mp4InputFormat()]
        });
        const checkTrack = await checkInput.getPrimaryVideoTrack();
        const checkSample = await new VideoSampleSink(checkTrack).getSample(0);
        const checkFrame = checkSample.toVideoFrame();
        const checkBitmap = await createImageBitmap(checkFrame);
        const checkContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
        checkContext.drawImage(checkBitmap, 0, 0);
        standaloneEncoderPixel = Array.from(checkContext.getImageData(32, 32, 1, 1).data);
        checkBitmap.close();
        checkFrame.close();
        checkSample.close();
        checkInput.dispose();
      }
      return {
        elapsedMs,
        peakHeap,
        frameCount: pixels.length,
        manifestCount,
        outputBytes: result.bytes.length,
        firstExportPixel: pixels[0]
          ? Array.from(atob(pixels[0]), (char) => char.charCodeAt(0)).slice((18 * 64 + 32) * 4, (18 * 64 + 32) * 4 + 4)
          : null,
        standaloneEncoderPixel,
        pixels,
        oraclePixels
      };
    }, format);
    results.push({ mode, ...result });
    await page.close();
  }
  const comparisons = [];
  for (const [seek, sequential] of [[results[0], results[1]], [results[3], results[2]]]) {
    let equalFrames = 0;
    let totalDelta = 0;
    let maxDelta = 0;
    for (let frame = 0; frame < seek.pixels.length; frame++) {
      const a = Buffer.from(seek.pixels[frame], "base64");
      const b = Buffer.from(sequential.pixels[frame], "base64");
      let frameEqual = true;
      for (let i = 0; i < a.length; i++) {
        const delta = Math.abs(a[i] - b[i]);
        totalDelta += delta;
        maxDelta = Math.max(maxDelta, delta);
        if (delta !== 0) frameEqual = false;
      }
      if (frameEqual) equalFrames++;
    }
    comparisons.push({
      equalFrames,
      frameCount: seek.frameCount,
      meanChannelDelta: totalDelta / (seek.frameCount * 64 * 36 * 4),
      maxChannelDelta: maxDelta
    });
  }
  const oracleComparisons = results.map((run) => {
    let totalDelta = 0;
    let equalFrames = 0;
    const nearest = { previous: 0, same: 0, next: 0 };
    for (let frame = 0; frame < run.pixels.length; frame++) {
      const actual = Buffer.from(run.pixels[frame], "base64");
      const oracle = Buffer.from(run.oraclePixels[frame], "base64");
      let equal = true;
      const candidateDeltas = {};
      for (const [label, index] of [["previous", frame - 1], ["same", frame], ["next", frame + 1]]) {
        if (index < 0 || index >= run.oraclePixels.length) continue;
        const candidate = Buffer.from(run.oraclePixels[index], "base64");
        let sum = 0;
        for (let i = 0; i < actual.length; i++) sum += Math.abs(actual[i] - candidate[i]);
        candidateDeltas[label] = sum;
      }
      const closest = Object.entries(candidateDeltas).sort((a, b) => a[1] - b[1])[0][0];
      nearest[closest]++;
      for (let i = 0; i < actual.length; i++) {
        const delta = Math.abs(actual[i] - oracle[i]);
        totalDelta += delta;
        if (delta !== 0) equal = false;
      }
      if (equal) equalFrames++;
    }
    return { mode: run.mode, equalFrames, meanChannelDelta: totalDelta / (run.frameCount * 64 * 36 * 4), nearest };
  });
  process.stdout.write(`${JSON.stringify({
    format,
    headed,
    canvas2d,
    runs: results.map(({ pixels, oraclePixels, ...run }) => run),
    comparisons,
    oracleComparisons
  }, null, 2)}\n`);
} finally {
  await browser.close();
}
