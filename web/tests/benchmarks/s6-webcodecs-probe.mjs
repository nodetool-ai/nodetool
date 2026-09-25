#!/usr/bin/env node
// Diagnostic for the L3 H.264 fixture. Run with the fixture path as argument.
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { build } from "esbuild";

const fixture = process.argv[2];
if (!fixture) throw new Error("Usage: node s6-webcodecs-probe.mjs <fixture.mp4>");
const media = await readFile(fixture);
const ffmpegFrames = new Map();
for (const index of [0, 1, 12, 24, 36]) {
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", fixture,
    "-vf", `select=eq(n\\,${index})`, "-frames:v", "1",
    "-f", "image2pipe", "-vcodec", "png", "pipe:1"
  ], { maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`FFmpeg reference frame ${index}: ${result.stderr}`);
  ffmpegFrames.set(`/ffmpeg-${index}.png`, result.stdout);
}
const library = await readFile(new URL("../../../node_modules/mediabunny/dist/bundles/mediabunny.mjs", import.meta.url));
const [{ text: sourceModule }] = (await build({
  entryPoints: [new URL("../../src/components/timeline/render/SequentialVideoSource.ts", import.meta.url).pathname],
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false
})).outputFiles;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on("console", (message) => process.stderr.write(`console ${message.type()}: ${message.text()}\n`));
  page.on("pageerror", (error) => process.stderr.write(`pageerror: ${error}\n`));
  page.on("crash", () => process.stderr.write("page crashed\n"));
  page.on("framenavigated", (frame) => process.stderr.write(`navigated: ${frame.url()}\n`));
  await page.route("http://localhost:9176/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/mediabunny.mjs") return route.fulfill({ contentType: "text/javascript", body: library });
    if (path === "/s6-source.mjs") return route.fulfill({ contentType: "text/javascript", body: sourceModule });
    if (ffmpegFrames.has(path)) return route.fulfill({ contentType: "image/png", body: ffmpegFrames.get(path) });
    if (path === "/video.mp4") {
      const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range && range[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
      const headers = { "accept-ranges": "bytes", "content-length": String(end - start + 1) };
      if (range) headers["content-range"] = `bytes ${start}-${end}/${media.length}`;
      return route.fulfill({
        status: range ? 206 : 200,
        contentType: "video/mp4",
        headers,
        body: media.subarray(start, end + 1)
      });
    }
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>S6 probe</title>" });
  });
  await page.goto("http://localhost:9176/");
  const result = await page.evaluate(async () => {
    const { Input, Mp4InputFormat, BlobSource, EncodedPacketSink, VideoSampleSink } = await import("/mediabunny.mjs");
    const blob = new Blob([await (await fetch("/video.mp4")).arrayBuffer()], { type: "video/mp4" });
    const input = new Input({ source: new BlobSource(blob), formats: [new Mp4InputFormat()] });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track");
    const config = await track.getDecoderConfig();
    const support = config && typeof VideoDecoder !== "undefined"
      ? await VideoDecoder.isConfigSupported(config)
      : null;
    const hardwareSupport = config && typeof VideoDecoder !== "undefined"
      ? await VideoDecoder.isConfigSupported({ ...config, hardwareAcceleration: "prefer-hardware" })
      : null;
    const packetSink = new EncodedPacketSink(track);
    const packetTimes = [];
    for await (const packet of packetSink.packets()) packetTimes.push(Math.round(packet.timestamp * 1e6));
    const decodedOutputTimes = [];
    let queuePeak = 0;
    let decoderError = null;
    const decoder = new VideoDecoder({
      output: (frame) => { decodedOutputTimes.push(frame.timestamp); frame.close(); },
      error: (error) => { decoderError = String(error); }
    });
    decoder.configure(config);
    const rawStart = performance.now();
    for await (const packet of packetSink.packets()) {
      if (decoder.decodeQueueSize >= 4) {
        await new Promise((resolve) => decoder.addEventListener("dequeue", resolve, { once: true }));
      }
      decoder.decode(packet.toEncodedVideoChunk());
      queuePeak = Math.max(queuePeak, decoder.decodeQueueSize);
    }
    await decoder.flush();
    const rawDecodeMs = performance.now() - rawStart;
    decoder.close();
    const sink = new VideoSampleSink(track);
    const sampleTimes = [];
    const sampleStart = performance.now();
    for await (const sample of sink.samples()) {
      sampleTimes.push(sample.microsecondTimestamp);
      sample.close();
    }
    const sequentialMs = performance.now() - sampleStart;
    const sortedPacketTimes = [...packetTimes].sort((a, b) => a - b);
    const maxTimestampDeltaUs = Math.max(...sampleTimes.map((t, i) => Math.abs(t - sortedPacketTimes[i])));
    input.dispose();
    const { SequentialVideoSource } = await import("/s6-source.mjs");
    const source = await SequentialVideoSource.open("/video.mp4");
    if (!source) throw new Error("Sequential source was unavailable");
    const sourceStart = performance.now();
    const decodedSizes = [];
    for (let i = 0; i < 120; i++) {
      const bitmap = await source.frameAt(i / 24);
      if (i === 0 || i === 119) decodedSizes.push([bitmap.width, bitmap.height]);
    }
    const sourceMs = performance.now() - sourceStart;
    source.dispose();
    const abortSource = await SequentialVideoSource.open("/video.mp4");
    const controller = new AbortController();
    const aborted = abortSource.frameAt(3, controller.signal).then(
      () => "resolved",
      (error) => error?.name ?? String(error)
    );
    controller.abort();
    const abortResult = await aborted;
    abortSource.dispose();
    const video = document.createElement("video");
    video.muted = true;
    video.src = "/video.mp4";
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(video.error);
    });
    const seekTimes = Array.from({ length: 120 }, (_, i) => i / 24);
    const seeks = [];
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 36;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const soughtPixels = [];
    for (const time of seekTimes) {
      const start = performance.now();
      await new Promise((resolve, reject) => {
        video.onseeked = resolve;
        video.onerror = () => reject(video.error);
        video.currentTime = time;
      });
      seeks.push({ requested: time, currentTime: video.currentTime, ms: performance.now() - start });
      context.drawImage(video, 0, 0, 64, 36);
      soughtPixels.push(context.getImageData(0, 0, 64, 36).data);
    }
    const paritySource = await SequentialVideoSource.open("/video.mp4");
    if (!paritySource) throw new Error("Sequential parity source was unavailable");
    const oracleInput = new Input({ source: new BlobSource(blob), formats: [new Mp4InputFormat()] });
    const oracleTrack = await oracleInput.getPrimaryVideoTrack();
    const oracleSink = new VideoSampleSink(oracleTrack);
    const parity = [];
    for (const time of [0, 1 / 24, 2 / 24, 0.5, 1, 2, 3, 4]) {
      const bitmap = await paritySource.frameAt(time);
      context.drawImage(bitmap, 0, 0, 64, 36);
      const decoded = context.getImageData(0, 0, 64, 36).data;
      const oracleSample = await oracleSink.getSample(time);
      const oracleFrame = oracleSample.toVideoFrame();
      const oracleBitmap = await createImageBitmap(oracleFrame);
      context.drawImage(oracleBitmap, 0, 0, 64, 36);
      const oraclePixels = context.getImageData(0, 0, 64, 36).data;
      oracleBitmap.close();
      oracleFrame.close();
      oracleSample.close();
      const index = Math.round(time * 24);
      const compare = (other) => {
        if (!other) return null;
        let sum = 0;
        for (let i = 0; i < other.length; i++) sum += Math.abs(other[i] - decoded[i]);
        return sum / other.length;
      };
      parity.push({
        time,
        previousDelta: compare(soughtPixels[index - 1]),
        sameDelta: compare(soughtPixels[index]),
        nextDelta: compare(soughtPixels[index + 1]),
        oracleDelta: compare(oraclePixels)
      });
    }
    paritySource.dispose();
    const sampleSource = await SequentialVideoSource.open("/video.mp4");
    const sampleParity = [];
    for (const time of [
      0, 0.5 / 24, 1 / 24 - 0.00001, 1 / 24,
      1 / 24 + 0.00001, 1.5 / 24, 0.5, 0.5 + 0.5 / 24,
      0.5 + 1 / 24, 0.5 + 2 / 24
    ]) {
      const bitmap = await sampleSource.frameAt(time);
      context.drawImage(bitmap, 0, 0, 64, 36);
      const decoded = context.getImageData(0, 0, 64, 36).data;
      const sample = await oracleSink.getSample(time);
      const frame = sample.toVideoFrame();
      const oracleBitmap = await createImageBitmap(frame);
      context.drawImage(oracleBitmap, 0, 0, 64, 36);
      const oracle = context.getImageData(0, 0, 64, 36).data;
      oracleBitmap.close();
      frame.close();
      sample.close();
      await new Promise((resolve, reject) => {
        video.onseeked = resolve;
        video.onerror = () => reject(video.error);
        video.currentTime = time;
      });
      context.drawImage(video, 0, 0, 64, 36);
      const sought = context.getImageData(0, 0, 64, 36).data;
      let oracleDelta = 0;
      let seekDelta = 0;
      for (let i = 0; i < oracle.length; i++) {
        oracleDelta += Math.abs(oracle[i] - decoded[i]);
        seekDelta += Math.abs(sought[i] - decoded[i]);
      }
      sampleParity.push({ time, oracleDelta: oracleDelta / oracle.length, seekDelta: seekDelta / sought.length });
    }
    let reverseResult = "resolved";
    try { await sampleSource.frameAt(0.5); }
    catch (error) { reverseResult = error.message; }
    sampleSource.dispose();
    const ffmpegSource = await SequentialVideoSource.open("/video.mp4");
    const ffmpegParity = [];
    for (const index of [0, 1, 12, 24, 36]) {
      const time = index / 24;
      const decodedBitmap = await ffmpegSource.frameAt(time);
      context.drawImage(decodedBitmap, 0, 0, 64, 36);
      const decoded = context.getImageData(0, 0, 64, 36).data;
      const referenceBitmap = await createImageBitmap(await (await fetch(`/ffmpeg-${index}.png`)).blob());
      context.drawImage(referenceBitmap, 0, 0, 64, 36);
      const reference = context.getImageData(0, 0, 64, 36).data;
      referenceBitmap.close();
      await new Promise((resolve, reject) => {
        video.onseeked = resolve;
        video.onerror = () => reject(video.error);
        video.currentTime = time;
      });
      context.drawImage(video, 0, 0, 64, 36);
      const sought = context.getImageData(0, 0, 64, 36).data;
      let sequentialDelta = 0;
      let seekDelta = 0;
      for (let i = 0; i < reference.length; i++) {
        sequentialDelta += Math.abs(decoded[i] - reference[i]);
        seekDelta += Math.abs(sought[i] - reference[i]);
      }
      ffmpegParity.push({ index, sequentialDelta: sequentialDelta / reference.length, seekDelta: seekDelta / reference.length });
    }
    ffmpegSource.dispose();
    oracleInput.dispose();
    video.removeAttribute("src");
    video.load();
    const sortedSeeks = seeks.map((seek) => seek.ms).sort((a, b) => a - b);
    return {
      codec: config?.codec,
      support: support?.supported ?? false,
      hardwareHintSupported: hardwareSupport?.supported ?? false,
      packetCount: packetTimes.length,
      sampleCount: sampleTimes.length,
      maxTimestampDeltaUs,
      rawDecodedCount: decodedOutputTimes.length,
      rawTimestampDeltaUs: Math.max(...decodedOutputTimes.map((t, i) => Math.abs(t - sortedPacketTimes[i]))),
      rawDecodeMs,
      queuePeak,
      decoderError,
      abortResult,
      reverseResult,
      sampleStart: sampleTimes.slice(0, 5),
      sampleEnd: sampleTimes.slice(-5),
      sequentialMs,
      sourceMs,
      decodedSizes,
      seekTotalMs: seeks.reduce((sum, seek) => sum + seek.ms, 0),
      seekMedianMs: sortedSeeks[Math.floor(sortedSeeks.length / 2)],
      seekP95Ms: sortedSeeks[Math.floor(sortedSeeks.length * 0.95)],
      seekFirst: seeks[0],
      seekLast: seeks.at(-1),
      parity,
      sampleParity,
      ffmpegParity,
      videoDecoderAvailable: typeof VideoDecoder !== "undefined"
    };
  });
  if (!result.support || result.sampleCount !== result.packetCount ||
      result.rawDecodedCount !== result.packetCount || result.maxTimestampDeltaUs > 1 ||
      result.abortResult !== "AbortError" ||
      result.reverseResult !== "Video timestamp left the sequential window" ||
      result.parity.some((sample) => sample.oracleDelta !== 0) ||
      result.sampleParity.some((sample) => sample.oracleDelta !== 0)) {
    throw new Error(`WebCodecs parity or cancellation failed: ${JSON.stringify(result)}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
}
