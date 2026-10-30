/**
 * `RenderTimeline` in headless Chromium.
 *
 * The editor exports a timeline with `renderTimeline`
 * (`web/src/components/timeline/render/TimelineRenderer.ts`): the live
 * preview's compositor and scene model, WebCodecs decode, mediabunny mux. This
 * runs that same exporter on the server so a workflow render is the picture
 * the preview showed, and variable-frame-rate clips decode by their own
 * timestamps instead of through a per-frame seek.
 *
 * A loopback HTTP server, bound to 127.0.0.1 behind a random path prefix,
 * serves the page (`renderPage.ts`), the clip media (with byte ranges, which
 * WebCodecs and `<video>` both read through) and the bundled and Google
 * fonts, and receives the output: muxed chunks at their byte positions, or
 * one PNG per frame. Playwright drives the page and blocks every request to
 * any other origin. Nothing is held whole in the page or here.
 *
 * What the browser writes depends on what it can encode
 * ({@link encodingsFor}): H.264 MP4 and VP9 WebM are written as they are;
 * MP4 from a Chromium without an H.264 encoder (Playwright's own build) comes
 * back as VP9 or AV1 and libav transcodes it; ProRes MOV, a PNG sequence and
 * alpha WebM from a browser without a VP9 alpha encoder come back as PNG
 * frames that libav encodes or the zip writer stores.
 *
 * Audio is not mixed here. The caller mixes it with libav, as it does for the
 * other render path, so the soundtrack does not depend on which path ran.
 */

import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, rename, stat, type FileHandle } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { importOptionalModule } from "@nodetool-ai/config";
import { transcodeVideo } from "@nodetool-ai/runtime/media";
import {
  BUNDLED_FONT_FILES,
  googleFontFaceCss,
  type TimelineSequence
} from "@nodetool-ai/timeline";
import {
  HEADLESS_RENDER_ENTRY,
  HEADLESS_RENDER_PATHS,
  HEADLESS_RENDER_PROGRESS,
  type HeadlessRenderEncoding,
  type HeadlessRenderProgress,
  type HeadlessRenderReport,
  type HeadlessRenderRequest
} from "@nodetool-ai/timeline/render";

import type { ResolvedTimelineOutput } from "./outputFormats.js";
import { DECODER_PROBES, openSourceConverter, type SourceConverter } from "./browserSources.js";
import { openPngZipWriter } from "./pngSequence.js";
import { encoderSpecFromArgs, openPngFrameEncoder } from "./rawFrames.js";
import { loadTimelineRenderPage } from "./renderPage.js";

/**
 * No headless browser could be started here: Playwright is not installed, or
 * no Chromium it can launch is. The caller falls back to the Node compositor.
 */
export class BrowserRenderUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BrowserRenderUnavailableError";
  }
}

export interface BrowserRenderOptions {
  sequence: TimelineSequence;
  /** Output size; the sequence's own size is the layout reference. */
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  output: ResolvedTimelineOutput;
  /** Video bitrate in bits per second; 0 leaves it to the encoder. */
  bitrate: number;
  resolveAssetPath: (assetId: string) => Promise<string | null>;
  /** Destination: the video container, or the PNG sequence's zip. */
  outPath: string;
  /** Scratch space for an intermediate file the server transcodes. */
  workDir: string;
  onProgress?: (frame: number, totalFrames: number) => void;
  signal?: AbortSignal;
}

export interface BrowserRenderResult {
  /** The compositor the page drew with. */
  backend: "webgpu" | "canvas2d";
  adapter: string | null;
  /** Why the page drew with Canvas 2D although it had WebGPU, else null. */
  webgpuUnusable: string | null;
  /** Which browser ran: a path, a Playwright channel, or "bundled". */
  browser: string;
  encoding: HeadlessRenderEncoding;
  /** Whether libav re-encoded what the browser wrote. */
  transcoded: boolean;
  frames: number;
  degradedBakes: number;
  /** Google font families the page asked for that could not be resolved. */
  fontsUnavailable: string[];
  /** Clips converted to VP9 first because the browser cannot decode them. */
  convertedSources: number;
}

/** The subset of Playwright this driver uses. */
interface PlaywrightBrowser {
  newContext(options: { serviceWorkers: "block" }): Promise<PlaywrightContext>;
  close(): Promise<void>;
}
interface PlaywrightContext {
  route(
    url: string,
    handler: (route: {
      request(): { url(): string };
      continue(): Promise<void>;
      abort(code: string): Promise<void>;
    }) => Promise<void>
  ): Promise<void>;
  newPage(): Promise<PlaywrightPage>;
}
interface PlaywrightResponse {
  status(): number;
}
interface PlaywrightHandle {
  dispose(): Promise<void>;
}
interface PlaywrightPage {
  exposeFunction(name: string, fn: (...args: never[]) => void): Promise<void>;
  goto(url: string): Promise<PlaywrightResponse | null>;
  waitForFunction(fn: string): Promise<PlaywrightHandle>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  on(event: "pageerror", listener: (error: Error) => void): void;
  on(event: "console", listener: (message: { type(): string; text(): string }) => void): void;
  setDefaultTimeout(ms: number): void;
}
interface PlaywrightChromium {
  launch(options: {
    headless: boolean;
    args: string[];
    channel?: string;
    executablePath?: string;
  }): Promise<PlaywrightBrowser>;
}

/**
 * Flags for a GPU-less host as much as a laptop. WebGPU stays behind a flag
 * on Linux, where an adapter is SwiftShader or a Vulkan driver (lavapipe);
 * macOS gets Metal without asking.
 */
const CHROMIUM_ARGS = [
  "--enable-unsafe-webgpu",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--disable-dev-shm-usage",
  "--autoplay-policy=no-user-gesture-required",
  "--mute-audio",
  // A long render must not be throttled as a background tab.
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  // Headless Linux composites a WebGPU canvas only over Vulkan: without
  // these, the first `getCurrentTexture()` loses the device ("A valid
  // external Instance reference no longer exists"). macOS uses Metal.
  ...(process.platform === "linux" ? ["--enable-features=Vulkan", "--use-angle=vulkan"] : [])
];

/**
 * The browsers to try, in order. `CHROME_PATH` names the host's Chromium
 * (the Docker image sets it). `chrome` is an installed Google Chrome, whose
 * WebCodecs encode H.264; the Playwright build cannot. The bundled Chromium
 * is the last resort.
 */
function launchCandidates(): { label: string; options: { channel?: string; executablePath?: string } }[] {
  const candidates: { label: string; options: { channel?: string; executablePath?: string } }[] = [];
  const executablePath = process.env["CHROME_PATH"]?.trim();
  if (executablePath) candidates.push({ label: executablePath, options: { executablePath } });
  candidates.push({ label: "chrome", options: { channel: "chrome" } });
  candidates.push({ label: "bundled", options: { channel: "chromium" } });
  return candidates;
}

async function launchBrowser(): Promise<{ browser: PlaywrightBrowser; label: string }> {
  let playwright: { chromium: PlaywrightChromium };
  try {
    playwright = await importOptionalModule<{ chromium: PlaywrightChromium }>(
      "playwright",
      { commonJs: true }
    );
  } catch (error) {
    throw new BrowserRenderUnavailableError(
      "The browser render needs the Playwright package, which is not installed.",
      { cause: error }
    );
  }
  const failures: string[] = [];
  for (const candidate of launchCandidates()) {
    try {
      const browser = await playwright.chromium.launch({
        headless: true,
        args: CHROMIUM_ARGS,
        ...candidate.options
      });
      return { browser, label: candidate.label };
    } catch (error) {
      const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
      failures.push(`${candidate.label}: ${message}`);
    }
  }
  throw new BrowserRenderUnavailableError(
    `No Chromium could be launched for the browser render (${failures.join("; ")}).`
  );
}

/**
 * What to ask the page for, in preference order. The last entry is always
 * PNG frames, which every browser can produce and libav encodes to any of
 * the formats, so a missing WebCodecs encoder never fails the render.
 */
export function encodingsFor(output: ResolvedTimelineOutput): HeadlessRenderEncoding[] {
  const png: HeadlessRenderEncoding = { kind: "png" };
  if (output.format === "png_sequence" || output.format === "mov") return [png];
  if (output.format === "webm") {
    return [{ kind: "video", container: "webm", codec: "vp9" }, png];
  }
  // mp4 is H.264 unless the caller named another libav encoder, which only a
  // transcode can honour.
  const direct: HeadlessRenderEncoding[] =
    output.requiredEncoder === "libx264"
      ? [{ kind: "video", container: "mp4", codec: "avc" }]
      : [];
  return [
    ...direct,
    { kind: "video", container: "webm", codec: "vp9", intermediate: true },
    { kind: "video", container: "mp4", codec: "av1", intermediate: true },
    png
  ];
}

/** Whether the browser's file is the requested one, with no second encode. */
function isFinal(encoding: HeadlessRenderEncoding, output: ResolvedTimelineOutput): boolean {
  if (encoding.kind === "png") return output.format === "png_sequence";
  return encoding.intermediate !== true &&
    ((output.format === "mp4" && encoding.container === "mp4") ||
      (output.format === "webm" && encoding.container === "webm"));
}

/** Re-encode the browser's intermediate file with the output's own encoder. */
export async function transcodeIntermediate(
  inPath: string,
  outPath: string,
  output: ResolvedTimelineOutput
): Promise<void> {
  await transcodeVideo({ inputPath: inPath, outPath, spec: encoderSpecFromArgs(output.encoderArgs) });
}

/** Media type a `<video>`/`<img>` needs to hear; only SVG is not sniffed. */
async function sniffContentType(file: string): Promise<string> {
  const handle = await open(file, "r");
  try {
    const head = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    const text = head.subarray(0, bytesRead).toString("utf8");
    return /<svg[\s>]/i.test(text) ? "image/svg+xml" : "application/octet-stream";
  } finally {
    await handle.close();
  }
}

/** Serve `file`, honouring a single `bytes=` range. */
async function sendFile(
  request: IncomingMessage,
  response: ServerResponse,
  file: string,
  contentType: string
): Promise<void> {
  const { size } = await stat(file);
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
  let start = 0;
  let end = size - 1;
  if (range) {
    if (range[1] === "") {
      start = Math.max(0, size - Number(range[2]));
    } else {
      start = Number(range[1]);
      if (range[2] !== "") end = Math.min(end, Number(range[2]));
    }
    if (start > end || start >= size) {
      response.writeHead(416, { "content-range": `bytes */${size}` });
      response.end();
      return;
    }
  }
  const headers: Record<string, string> = {
    "content-type": contentType,
    "content-length": String(end - start + 1),
    "accept-ranges": "bytes"
  };
  if (range) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  response.writeHead(range ? 206 : 200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file, { start, end }).pipe(response);
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** Where the page's output goes on this side. */
interface OutputWriter {
  write(data: Buffer, position: number): Promise<void>;
  frame(index: number, png: Buffer): Promise<void>;
  finish(): Promise<void>;
  abort(): void;
}

function openOutputWriter(
  output: ResolvedTimelineOutput,
  outPath: string,
  intermediatePath: string,
  options: { width: number; height: number; fps: number }
): OutputWriter {
  let file: Promise<FileHandle> | null = null;
  const zip =
    output.format === "png_sequence"
      ? openPngZipWriter({ outPath, ...options, alpha: output.alpha })
      : null;
  let pngEncoder: ReturnType<typeof openPngFrameEncoder> | null = null;
  let nextFrame = 0;
  return {
    async write(data, position) {
      file ??= open(intermediatePath, "w");
      const handle = await file;
      let written = 0;
      while (written < data.length) {
        const { bytesWritten } = await handle.write(data, written, data.length - written, position + written);
        written += bytesWritten;
      }
    },
    async frame(index, png) {
      // The page awaits each upload, so frames arrive in order; a gap would
      // shift every later frame in an image2 stream.
      if (index !== nextFrame) {
        throw new Error(`Frame ${index} arrived where frame ${nextFrame} was expected`);
      }
      nextFrame += 1;
      if (zip) {
        zip.addPng(png);
        return;
      }
      pngEncoder ??= openPngFrameEncoder({
        outPath,
        fps: options.fps,
        encoderArgs: output.encoderArgs
      });
      await pngEncoder.write(png);
    },
    async finish() {
      if (file) await (await file).close();
      if (zip) await zip.finish();
      if (pngEncoder) await pngEncoder.finish();
    },
    abort() {
      void file?.then((handle) => handle.close()).catch(() => undefined);
      zip?.abort();
      pngEncoder?.abort();
    }
  };
}

/** The page's own HTML: one module script and nothing else. */
const PAGE_HTML =
  '<!doctype html><html><head><meta charset="utf-8"></head>' +
  '<body style="margin:0"><script type="module" src="render.js"></script></body></html>';

const FONT_CONTENT_TYPES: Record<string, string> = {
  ttf: "font/ttf",
  otf: "font/otf",
  woff2: "font/woff2"
};

function fontContentType(file: string): string {
  return FONT_CONTENT_TYPES[file.slice(file.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
}

/** Bundled fonts, as the API server serves them to the editor. */
const BUNDLED_FONT_PREFIX = "/api/assets/packages/timeline/fonts/";
/** Google font CSS, the path `fontLoading.ts` requests. */
const GOOGLE_FONT_CSS = /^\/api\/assets\/packages\/timeline\/fonts\/google\/([^/]+)\/css$/;

export async function renderTimelineInBrowser(
  opts: BrowserRenderOptions
): Promise<BrowserRenderResult> {
  const { sequence, output, signal } = opts;
  signal?.throwIfAborted();
  const script = await loadTimelineRenderPage();
  const token = randomBytes(16).toString("hex");
  const prefix = `/${token}/`;
  const intermediatePath = path.join(opts.workDir, `browser-render.${output.format === "webm" ? "webm" : "mp4"}`);
  const writer = openOutputWriter(output, opts.outPath, intermediatePath, {
    width: opts.width,
    height: opts.height,
    fps: opts.fps
  });

  const assetFiles: string[] = [];
  const assetIndex = new Map<string, number | null>();
  const googleFontFiles: string[] = [];
  const fontsUnavailable = new Set<string>();
  const { bundledFontsDir } = await import("@nodetool-ai/timeline/fonts/node");
  const fontsDir = bundledFontsDir();
  // Set once the page reports its decoders, before the render asks for media.
  let sources: SourceConverter | null = null;

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;
    if (request.method === "GET" && pathname.startsWith(BUNDLED_FONT_PREFIX)) {
      const css = GOOGLE_FONT_CSS.exec(pathname);
      if (css) {
        const family = decodeURIComponent(css[1] ?? "").trim();
        const requests = (url.searchParams.get("weights") ?? "400")
          .split(",")
          .map((token) => /^(\d{1,3})(i)?$/.exec(token.trim()))
          .filter((match): match is RegExpExecArray => match !== null)
          .map((match) => ({ weight: Number(match[1]), style: match[2] ? ("italic" as const) : ("normal" as const) }));
        const { resolveGoogleFontFamily } = await import("@nodetool-ai/timeline/fonts/google-fetch");
        const resolution = await resolveGoogleFontFamily(family, requests).catch(() => null);
        if (!resolution) {
          fontsUnavailable.add(family);
          response.writeHead(404).end();
          return;
        }
        const faces = resolution.faces.map((face) => {
          googleFontFiles.push(face.file);
          return { style: face.style, weights: face.weights, file: String(googleFontFiles.length - 1) };
        });
        response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
        response.end(googleFontFaceCss(resolution.family, faces, `${prefix}font`));
        return;
      }
      const name = pathname.slice(BUNDLED_FONT_PREFIX.length);
      if (!fontsDir || !(BUNDLED_FONT_FILES as readonly string[]).includes(name)) {
        response.writeHead(404).end();
        return;
      }
      await sendFile(request, response, path.join(fontsDir, name), fontContentType(name));
      return;
    }
    if (!pathname.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }
    const route = pathname.slice(prefix.length);
    if (request.method === "GET" && route === "") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(PAGE_HTML);
    } else if (request.method === "GET" && route === "render.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(script);
    } else if (request.method === "GET" && route === HEADLESS_RENDER_PATHS.resolve) {
      const id = url.searchParams.get("id") ?? "";
      let index = assetIndex.get(id);
      if (index === undefined) {
        const found = id ? await opts.resolveAssetPath(id) : null;
        const file = found && sources ? await sources.prepare(found) : found;
        index = file ? assetFiles.push(file) - 1 : null;
        assetIndex.set(id, index);
      }
      if (index === null) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ url: `asset/${index}` }));
    } else if ((request.method === "GET" || request.method === "HEAD") && route.startsWith("asset/")) {
      const file = assetFiles[Number(route.slice("asset/".length))];
      if (!file) {
        response.writeHead(404).end();
        return;
      }
      await sendFile(request, response, file, await sniffContentType(file));
    } else if (request.method === "GET" && route.startsWith("font/")) {
      const file = googleFontFiles[Number(route.slice("font/".length).split("/")[0])];
      if (!file) {
        response.writeHead(404).end();
        return;
      }
      await sendFile(request, response, file, fontContentType(file));
    } else if (request.method === "POST" && route === HEADLESS_RENDER_PATHS.out) {
      const position = Number(url.searchParams.get("position"));
      if (!Number.isSafeInteger(position) || position < 0) {
        response.writeHead(400).end();
        return;
      }
      await writer.write(await readBody(request), position);
      response.writeHead(204).end();
    } else if (request.method === "POST" && route === HEADLESS_RENDER_PATHS.frame) {
      await writer.frame(Number(url.searchParams.get("index")), await readBody(request));
      response.writeHead(204).end();
    } else {
      response.writeHead(404).end();
    }
  };

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "text/plain" });
      }
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  let browser: PlaywrightBrowser | null = null;
  const pageErrors: string[] = [];
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  // Closing the browser is what stops the work: the page, its GPU process and
  // its encoders go with it, whatever frame they were on.
  const onAbort = (): void => {
    void browser?.close().catch(() => undefined);
    rejectAbort?.(new DOMException("Timeline render cancelled", "AbortError"));
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  // Swallowed unless something awaits it: the race below does.
  aborted.catch(() => undefined);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const launched = await Promise.race([launchBrowser(), aborted]);
    browser = launched.browser;
    if (signal?.aborted) onAbort();
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/*", async (route) => {
      if (new URL(route.request().url()).origin === origin) {
        await route.continue();
      } else {
        await route.abort("blockedbyclient");
      }
    });
    const page = await context.newPage();
    // A render runs for as long as the timeline needs; the abort signal, not
    // a timeout, is what ends one early.
    page.setDefaultTimeout(0);
    // An error while the script loads leaves the entry undefined forever, and
    // nothing else would end the wait for it.
    let rejectLoad: ((reason: unknown) => void) | undefined;
    const loadFailed = new Promise<never>((_resolve, reject) => {
      rejectLoad = reject;
    });
    loadFailed.catch(() => undefined);
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
      rejectLoad?.(new Error(`The render page failed to load: ${error.message}`));
    });
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await page.exposeFunction(HEADLESS_RENDER_PROGRESS, (progress: HeadlessRenderProgress) => {
      if (progress.phase === "video") opts.onProgress?.(progress.frame, progress.totalFrames);
    });
    await Promise.race([page.goto(`${origin}${prefix}`), aborted, loadFailed]);
    await Promise.race([
      page.waitForFunction(`typeof window.${HEADLESS_RENDER_ENTRY} === "function"`),
      aborted,
      loadFailed
    ]);
    rejectLoad = undefined;
    const decodable = await Promise.race([
      page.evaluate(async (probes: ReadonlyArray<readonly [string, string]>) => {
        const found: string[] = [];
        for (const [name, codec] of probes) {
          try {
            if ((await VideoDecoder.isConfigSupported({ codec })).supported) found.push(name);
          } catch {
            // An unknown codec string is a codec this browser lacks.
          }
        }
        return found;
      }, DECODER_PROBES),
      aborted
    ]);
    sources = openSourceConverter({ workDir: opts.workDir, decodable: new Set(decodable), signal });

    const request: HeadlessRenderRequest = {
      tracks: sequence.tracks,
      clips: sequence.clips,
      mediaTracks: sequence.mediaTracks,
      camera2d: sequence.camera2d,
      tempo: sequence.tempo,
      master: sequence.master,
      width: opts.width,
      height: opts.height,
      referenceWidth: sequence.width > 0 ? sequence.width : opts.width,
      referenceHeight: sequence.height > 0 ? sequence.height : opts.height,
      referenceFps: sequence.fps,
      fps: opts.fps,
      durationMs: opts.durationMs,
      alpha: output.alpha,
      bitrate: opts.bitrate,
      motionBlur: output.motionBlur,
      encodings: encodingsFor(output)
    };
    let report: HeadlessRenderReport;
    try {
      report = await Promise.race([
        page.evaluate(
          ([entry, payload]) => {
            const run = (window as unknown as Record<string, (request: HeadlessRenderRequest) => Promise<HeadlessRenderReport>>)[entry];
            if (!run) throw new Error("The render page did not load");
            return run(payload);
          },
          [HEADLESS_RENDER_ENTRY, request] as const
        ),
        aborted
      ]);
    } catch (error) {
      if (signal?.aborted) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      const logged = pageErrors.length > 0 ? ` (page: ${pageErrors.slice(-3).join(" | ")})` : "";
      throw new Error(`The browser render failed: ${detail}${logged}`, { cause: error });
    }
    signal?.throwIfAborted();
    await writer.finish();

    const transcoded = !isFinal(report.encoding, output) && report.encoding.kind === "video";
    if (transcoded) {
      await transcodeIntermediate(intermediatePath, opts.outPath, output);
    } else if (report.encoding.kind === "video") {
      await rename(intermediatePath, opts.outPath);
    }
    return {
      backend: report.backend,
      adapter: report.adapter,
      webgpuUnusable: report.webgpuUnusable ?? null,
      browser: launched.label,
      encoding: report.encoding,
      transcoded,
      frames: report.frames,
      degradedBakes: report.degradedBakes,
      fontsUnavailable: [...fontsUnavailable],
      convertedSources: sources.converted
    };
  } catch (error) {
    writer.abort();
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await browser?.close().catch(() => undefined);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
