/**
 * The app's server: one process, one port.
 *
 *   POST /api/run           run one of the app's workflows or JS scripts,
 *                           streamed as SSE
 *   POST /api/upload        store a file the user picked, answer its URL
 *   GET  /api/models        models the configured providers offer, by kind
 *   GET  /api/storage/<key> serve stored uploads and run outputs
 *   GET  /api/package-assets/<package>/<path>
 *                           serve the sample files copied under assets/
 *   everything else        the UI (Vite in dev, `dist/` after `npm run build`)
 *
 * It listens on 127.0.0.1 unless HOST says otherwise. Every run spends the
 * provider keys in `.env`, so think before exposing it to a network.
 */
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { storageResponseHeaders } from "./storage-policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(ROOT, ".env"))) {
  process.loadEnvFile(join(ROOT, ".env"));
}

const DEV = process.argv.includes("--dev");
const PORT = Number(process.env.PORT ?? 5180);
const HOST = process.env.HOST ?? "127.0.0.1";
const DATA_DIR = resolve(ROOT, process.env.NODETOOL_DATA_DIR ?? ".nodetool-data");
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 200) * 1024 * 1024;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".glb": "model/gltf-binary",
  ".txt": "text/plain; charset=utf-8"
};

await mkdir(DATA_DIR, { recursive: true });
const { createRunner } = await import("./runner.mjs");
const runner = createRunner({ root: ROOT, dataDir: DATA_DIR });
const { createModelCatalog } = await import("./models.mjs");
const models = createModelCatalog();

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      throw new Error(`Body exceeds ${Math.round(limit / 1024 / 1024)} MB`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** A path under `base`, or null when the request tries to leave it. */
function safeJoin(base, requested) {
  const target = normalize(join(base, requested));
  return target === base || target.startsWith(base + sep) ? target : null;
}

async function serveFile(res, path, fallback, untrusted = false) {
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
      "content-length": info.size,
      ...(untrusted && storageResponseHeaders(path))
    });
    createReadStream(path).pipe(res);
  } catch {
    if (fallback) {
      await serveFile(res, fallback, null);
      return;
    }
    sendJson(res, 404, { error: "not_found" });
  }
}

async function handleRun(req, res) {
  let body;
  try {
    body = JSON.parse((await readBody(req, MAX_UPLOAD_BYTES)).toString("utf8"));
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }
  const workflow = typeof body?.workflow === "string" ? body.workflow : null;
  const script = typeof body?.script === "string" ? body.script : null;
  if (!workflow && !script) {
    sendJson(res, 400, { error: "missing_workflow" });
    return;
  }
  const jobId = typeof body.job_id === "string" ? body.job_id : randomUUID();
  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });
  const send = (message) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(message)}\n\n`);
  };
  try {
    const request = { params: body.params, propertyOverrides: body.property_overrides, operationId: body.operation_id, jobId, signal: abort.signal, send };
    if (script) await runner.runScript({ ...request, scriptKey: script });
    else await runner.run({ ...request, workflowKey: workflow });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[run ${jobId}] ${message}`);
    send({ type: "job_update", status: "failed", job_id: jobId, error: message });
  } finally {
    res.end();
  }
}

async function handleUpload(req, res, url) {
  const name = (url.searchParams.get("name") ?? "upload").replace(/[^A-Za-z0-9._-]+/g, "_");
  const contentType = req.headers["content-type"] ?? "application/octet-stream";
  try {
    const bytes = await readBody(req, MAX_UPLOAD_BYTES);
    const key = `uploads/${randomUUID()}-${name}`;
    await runner.storage.store(key, bytes, contentType);
    sendJson(res, 200, { uri: `/api/storage/${key}`, content_type: contentType });
  } catch (error) {
    sendJson(res, 413, { error: error instanceof Error ? error.message : String(error) });
  }
}

let vite = null;
if (DEV) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: "spa"
  });
}

const DIST = join(ROOT, "dist");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/api/run" && req.method === "POST") {
      await handleRun(req, res);
      return;
    }
    if (url.pathname === "/api/upload" && req.method === "POST") {
      await handleUpload(req, res, url);
      return;
    }
    if (url.pathname === "/api/models" && req.method === "GET") {
      const kind = url.searchParams.get("kind") ?? "";
      const task = url.searchParams.get("task") || undefined;
      sendJson(res, 200, { models: await models.list(kind, task) });
      return;
    }
    if (url.pathname.startsWith("/api/storage/") && req.method === "GET") {
      const key = decodeURIComponent(url.pathname.slice("/api/storage/".length));
      const path = safeJoin(runner.storage.rootDir, key);
      if (!path) {
        sendJson(res, 400, { error: "invalid_path" });
        return;
      }
      await serveFile(res, path, null, true);
      return;
    }
    if (url.pathname.startsWith("/api/package-assets/") && req.method === "GET") {
      const rel = decodeURIComponent(url.pathname.slice("/api/package-assets/".length));
      const path = safeJoin(join(ROOT, "assets"), rel);
      if (!path) {
        sendJson(res, 400, { error: "invalid_path" });
        return;
      }
      await serveFile(res, path, null);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    if (vite) {
      vite.middlewares(req, res);
      return;
    }
    const path = safeJoin(DIST, url.pathname === "/" ? "index.html" : url.pathname);
    await serveFile(res, path ?? join(DIST, "index.html"), join(DIST, "index.html"));
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
    else res.end();
  }
});

server.listen(PORT, HOST, async () => {
  console.log(`App running at http://${HOST}:${PORT}`);
  if (!DEV && !existsSync(join(DIST, "index.html"))) {
    console.log("No UI build found. Run `npm run build` first, or `npm run dev`.");
  }
  const example = join(ROOT, ".env.example");
  if (existsSync(example)) {
    const names = (await readFile(example, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => line.split("=")[0]);
    const missing = names.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      console.log(`Not set (see .env.example): ${missing.join(", ")}`);
    }
  }
});
