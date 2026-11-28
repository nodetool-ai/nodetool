/**
 * The HTTP server behind `nodetool timeline preview`.
 *
 * It serves one page and a few routes the page reads:
 *
 * - `GET /api/source` — the timeline or storyboard summary (see source.ts).
 * - `GET /frame/<n>.png?scale=<s>` — one timeline frame, rendered on demand
 *   through the export compositor and cached by document version.
 * - `GET /api/strip?count=<k>` — renders `k` evenly spaced frames in one
 *   compositor run, so a thumbnail strip does not pay pipeline setup per frame.
 * - `GET /video.mp4?scale=<s>` — the whole timeline encoded with audio,
 *   rendered on first request and served with byte ranges.
 * - `GET /asset/<id>` — a storyboard still or take, only for assets the
 *   current storyboard references.
 *
 * Renders run one at a time: the compositor holds one GPU device, and a queue
 * keeps a burst of scrubbing from starting many runs at once.
 *
 * Plain `node:http` keeps the command feature free of a web framework. Every
 * route reads only path segments and two numeric query values, which are
 * validated where they are read.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { isString } from "@nodetool-ai/cli-common/predicates";
import type { PreviewSource } from "./source.js";
import { previewPage } from "./page.js";

export interface PreviewRenderer {
  /** Render these timeline frames at `scale`, as PNG bytes by frame index. */
  frames(frames: number[], scale: number): Promise<Map<number, Uint8Array>>;
  /** Render the whole timeline to an MP4 at `scale` and return its path. */
  video(scale: number, version: string): Promise<string>;
}

export interface PreviewServerOptions {
  /** Read the source again. Called at most once per `sourceTtlMs`. */
  load: () => Promise<PreviewSource>;
  render: PreviewRenderer;
  /** Resolve a storyboard asset to a local file. */
  assetPath: (assetId: string) => Promise<string | null>;
  /** When set, every request needs it as `?token=` or the cookie it sets. */
  token?: string;
  /** The default frame scale. */
  scale: number;
  sourceTtlMs?: number;
  onLog?: (line: string) => void;
}

/** Frames held across scrubbing. A 960×540 PNG is a few hundred KB. */
const MAX_CACHED_FRAMES = 240;
const MAX_STRIP_FRAMES = 24;
const COOKIE = "nodetool_preview";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime"
};

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** `count` frame indices spread evenly over `totalFrames`, first and last included. */
export function stripFrames(totalFrames: number, count: number): number[] {
  if (totalFrames <= 0) {
    return [];
  }
  const n = Math.max(1, Math.min(count, totalFrames));
  if (n === 1) {
    return [0];
  }
  const frames = new Set<number>();
  for (let i = 0; i < n; i++) {
    frames.add(Math.round((i * (totalFrames - 1)) / (n - 1)));
  }
  return [...frames];
}

function parseScale(value: string | null, fallback: number): number {
  if (value === null || value === "") {
    return fallback;
  }
  const scale = Number(value);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) {
    throw new HttpError(400, `scale must be a number in (0, 1] (got "${value}").`);
  }
  return scale;
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieToken(req: IncomingMessage): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}

function send(
  res: ServerResponse,
  status: number,
  body: string | Uint8Array,
  type: string,
  headers: Record<string, string> = {}
): void {
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": String(Buffer.byteLength(body)),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  res.end(body);
}

const sendJson = (res: ServerResponse, status: number, value: unknown): void =>
  send(res, status, JSON.stringify(value), "application/json; charset=utf-8");

/** Serve a file, honoring one `Range: bytes=a-b` so a video can seek. */
async function sendFile(req: IncomingMessage, res: ServerResponse, file: string): Promise<void> {
  const { size } = await stat(file);
  const type = CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  const headers = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
  if (range && (range[1] !== "" || range[2] !== "")) {
    const start = range[1] === "" ? Math.max(0, size - Number(range[2])) : Number(range[1]);
    const end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
    if (start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, "Content-Length": String(size) });
  createReadStream(file).pipe(res);
}

/** The request handler, separate from the listener so tests can drive it. */
export function createPreviewHandler(
  options: PreviewServerOptions
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const ttl = options.sourceTtlMs ?? 1000;
  const log = options.onLog ?? (() => {});
  let loaded: { at: number; source: Promise<PreviewSource> } | undefined;
  const frameCache = new Map<string, Uint8Array>();
  const videos = new Map<string, Promise<string>>();
  let queue: Promise<unknown> = Promise.resolve();

  const source = (): Promise<PreviewSource> => {
    if (!loaded || Date.now() - loaded.at > ttl) {
      loaded = { at: Date.now(), source: options.load() };
      // A failed read is not cached, so the next poll tries again.
      loaded.source.catch(() => { loaded = undefined; });
    }
    return loaded.source;
  };

  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const timeline = async () => {
    const current = await source();
    if (current.kind !== "timeline") {
      throw new HttpError(404, "This preview shows a storyboard, which has no rendered frames.");
    }
    if (current.totalFrames === 0) {
      throw new HttpError(409, "The timeline has zero duration: it has no clips.");
    }
    return current;
  };

  const frameKey = (version: string, scale: number, frame: number): string => `${version}:${scale}:${frame}`;

  const remember = (key: string, png: Uint8Array): void => {
    frameCache.delete(key);
    frameCache.set(key, png);
    while (frameCache.size > MAX_CACHED_FRAMES) {
      const oldest = frameCache.keys().next().value;
      if (oldest === undefined) break;
      frameCache.delete(oldest);
    }
  };

  /** Render the uncached frames of `frames` in one run and return them all. */
  const renderFrames = async (version: string, frames: number[], scale: number): Promise<Map<number, Uint8Array>> => {
    const missing = frames.filter((frame) => !frameCache.has(frameKey(version, scale, frame)));
    if (missing.length > 0) {
      await exclusive(async () => {
        // Another request may have rendered some of them while this one queued.
        const still = missing.filter((frame) => !frameCache.has(frameKey(version, scale, frame)));
        if (still.length === 0) return;
        const started = Date.now();
        const rendered = await options.render.frames(still, scale);
        log(`Rendered ${rendered.size} frame(s) at scale ${scale} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
        for (const [frame, png] of rendered) remember(frameKey(version, scale, frame), png);
      });
    }
    const result = new Map<number, Uint8Array>();
    for (const frame of frames) {
      const png = frameCache.get(frameKey(version, scale, frame));
      if (!png) throw new HttpError(500, `The compositor returned no picture for frame ${frame}.`);
      result.set(frame, png);
    }
    return result;
  };

  const route = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
    const path = url.pathname;
    if (path === "/") {
      send(res, 200, previewPage(), "text/html; charset=utf-8");
      return;
    }
    if (path === "/api/source") {
      sendJson(res, 200, await source());
      return;
    }
    const frameMatch = /^\/frame\/(\d+)\.png$/.exec(path);
    if (frameMatch) {
      const current = await timeline();
      const frame = Number(frameMatch[1]);
      if (frame >= current.totalFrames) {
        throw new HttpError(404, `Frame ${frame} is outside the timeline, which has frames 0-${current.totalFrames - 1}.`);
      }
      const scale = parseScale(url.searchParams.get("scale"), options.scale);
      const png = (await renderFrames(current.version, [frame], scale)).get(frame);
      if (!png) throw new HttpError(500, `The compositor returned no picture for frame ${frame}.`);
      send(res, 200, png, "image/png");
      return;
    }
    if (path === "/api/strip") {
      const current = await timeline();
      const count = Number(url.searchParams.get("count") ?? "12");
      if (!Number.isInteger(count) || count < 1 || count > MAX_STRIP_FRAMES) {
        throw new HttpError(400, `count must be a whole number from 1 to ${MAX_STRIP_FRAMES}.`);
      }
      const scale = parseScale(url.searchParams.get("scale"), Math.min(options.scale, 0.25));
      const frames = stripFrames(current.totalFrames, count);
      await renderFrames(current.version, frames, scale);
      sendJson(res, 200, { version: current.version, scale, frames });
      return;
    }
    if (path === "/video.mp4") {
      const current = await timeline();
      const scale = parseScale(url.searchParams.get("scale"), options.scale);
      const key = `${current.version}:${scale}`;
      let pending = videos.get(key);
      if (!pending) {
        pending = exclusive(async () => {
          const started = Date.now();
          const file = await options.render.video(scale, current.version);
          log(`Rendered the video at scale ${scale} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
          return file;
        });
        videos.set(key, pending);
        pending.catch(() => videos.delete(key));
      }
      await sendFile(req, res, await pending);
      return;
    }
    const assetMatch = /^\/asset\/([A-Za-z0-9_-]{1,128})$/.exec(path);
    if (assetMatch) {
      const current = await source();
      const assetId = assetMatch[1] ?? "";
      const referenced =
        current.kind === "storyboard" &&
        current.shots.some((shot) => shot.keyframe?.assetId === assetId || shot.clip?.assetId === assetId);
      if (!referenced) {
        throw new HttpError(404, `Asset ${assetId} is not part of this storyboard.`);
      }
      const file = await options.assetPath(assetId);
      if (!file) {
        throw new HttpError(404, `Asset ${assetId} has no local file.`);
      }
      await sendFile(req, res, file);
      return;
    }
    throw new HttpError(404, `No route for ${path}.`);
  };

  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://preview.invalid");
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        throw new HttpError(405, "The preview server only answers GET.");
      }
      if (options.token !== undefined) {
        const given = url.searchParams.get("token");
        if (given !== null && sameToken(given, options.token)) {
          res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(options.token)}; HttpOnly; SameSite=Strict; Path=/`);
        } else {
          const cookie = cookieToken(req);
          if (cookie === undefined || !sameToken(cookie, options.token)) {
            throw new HttpError(401, "Open the URL the preview command printed: it carries the access token.");
          }
        }
      }
      await route(req, res, url);
    } catch (error) {
      // Only an HttpError's own message reaches the client. Anything else can
      // carry paths or internals, so it goes to the terminal instead.
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError
        ? error.message
        : "The preview failed. The terminal running nodetool timeline preview shows the error.";
      if (!(error instanceof HttpError)) {
        log(`Error on ${url.pathname}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!res.headersSent) sendJson(res, status, { error: message });
      else res.end();
    }
  };
}

export interface StartedPreviewServer {
  server: Server;
  /** The address the server listens on, with the token when one is set. */
  url: string;
  port: number;
  close: () => Promise<void>;
}

export async function startPreviewServer(
  options: PreviewServerOptions & { host: string; port: number }
): Promise<StartedPreviewServer> {
  const handler = createPreviewHandler(options);
  const server = createServer((req, res) => { void handler(req, res); });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = address === null || isString(address) ? options.port : address.port;
  const host = options.host.includes(":") ? `[${options.host}]` : options.host;
  const query = options.token === undefined ? "" : `?token=${encodeURIComponent(options.token)}`;
  return {
    server,
    url: `http://${host}:${port}/${query}`,
    port,
    close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections(); })
  };
}
