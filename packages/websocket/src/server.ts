#!/usr/bin/env node
/**
 * NodeTool WebSocket + HTTP server entry point — Fastify edition.
 *
 * TLS: set TLS_CERT and TLS_KEY to paths of cert.pem / key.pem.
 *      An HTTP→HTTPS redirect server starts on port 80 when TLS is active.
 * Connect the CLI with: npm run chat -- --url ws://localhost:7777/ws
 */

import { join, resolve, dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import crypto from "node:crypto";
import { createLogger, getDefaultDbPath } from "@nodetool/config";
import { NodeRegistry } from "@nodetool/node-sdk";
import { registerBaseNodes } from "@nodetool/base-nodes";
import { registerElevenLabsNodes } from "@nodetool/elevenlabs-nodes";
import { registerFalNodes } from "@nodetool/fal-nodes";
import { registerReplicateNodes } from "@nodetool/replicate-nodes";
import { setSecretResolver, PythonStdioBridge } from "@nodetool/runtime";
import { getSecret, initMasterKey } from "@nodetool/security";
import { initDb } from "@nodetool/models";
import {
  Tool,
  GoogleSearchTool,
  GoogleNewsTool,
  GoogleImagesTool,
  GoogleGroundedSearchTool,
  GoogleImageGenerationTool,
  OpenAIWebSearchTool,
  OpenAIImageGenerationTool,
  OpenAITextToSpeechTool,
  BrowserTool,
  ScreenshotTool,
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool,
  DownloadFileTool,
  HttpRequestTool,
  ExtractPDFTextTool,
  ExtractPDFTablesTool,
  ConvertPDFToMarkdownTool,
  CalculatorTool,
  SearchEmailTool,
  ArchiveEmailTool,
  AddLabelToEmailTool,
  DataForSEOSearchTool,
  DataForSEONewsTool,
  DataForSEOImagesTool,
  SaveAssetTool,
  ReadAssetTool
} from "@nodetool/agents";
import { registerPythonProviders } from "./models-api.js";
import type { HttpApiOptions } from "./http-api.js";

import Fastify, { type FastifyInstance } from "fastify";
import fastifyWebSocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { SupabaseAuthProvider, LocalAuthProvider } from "@nodetool/auth";

// Auth: extend FastifyRequest with userId
declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
  }
}

import websocketPlugin from "./plugins/websocket.js";
import healthRoute from "./routes/health.js";
import assetsRoutes from "./routes/assets.js";
import workflowsRoutes from "./routes/workflows.js";
import jobsRoutes from "./routes/jobs.js";
import messagesRoutes from "./routes/messages.js";
import threadsRoutes from "./routes/threads.js";
import nodesRoutes from "./routes/nodes.js";
import settingsRoutes from "./routes/settings.js";
import storageRoutes from "./routes/storage.js";
import usersRoutes from "./routes/users.js";
import openaiRoutes from "./routes/openai.js";
import oauthRoutes from "./routes/oauth.js";
import workspaceRoutes from "./routes/workspace.js";
import filesRoutes from "./routes/files.js";
import costsRoutes from "./routes/costs.js";
import skillsRoutes from "./routes/skills.js";
import collectionsRoutes from "./routes/collections.js";
import modelsRoutes from "./routes/models.js";

const log = createLogger("nodetool.websocket.server");
const startupT0 = performance.now();
function startupMs(): string {
  return `${(performance.now() - startupT0).toFixed(0)}ms`;
}

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

const dbPath = getDefaultDbPath();
try {
  mkdirSync(dirname(dbPath), { recursive: true });
  initDb(dbPath);
  log.info(`Database ready [${startupMs()}]`, { path: dbPath });
  // Initialize master key from keychain before any secret access.
  // This must happen before setSecretResolver so that getMasterKey() (sync)
  // returns the keychain key rather than auto-generating a new one.
  await initMasterKey();
  setSecretResolver((key, userId) =>
    getSecret(key, userId).then((v) => v ?? undefined)
  );
} catch (err) {
  log.error(
    "Database setup failed",
    err instanceof Error ? err : new Error(String(err))
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Python pip metadata root detection
// ---------------------------------------------------------------------------

function detectPipMetadataRoots(): string[] {
  const script = `
import json, pathlib, subprocess, sys
roots = set()
try:
    proc = subprocess.run(
        [sys.executable, "-m", "pip", "show", "-f",
         "nodetool-core", "nodetool-base"],
        capture_output=True, text=True, check=False,
    )
    output = proc.stdout or ""
except Exception:
    output = ""
location = None
in_files = False
for raw in output.splitlines():
    line = raw.rstrip("\\n")
    if line.startswith("Name: "):
        location = None; in_files = False; continue
    if line.startswith("Location: "):
        location = line.split(":", 1)[1].strip(); continue
    if line.startswith("Editable project location: "):
        editable = line.split(":", 1)[1].strip()
        if editable: roots.add(editable)
        continue
    if line.startswith("Files:"): in_files = True; continue
    if line.startswith("---"):
        location = None; in_files = False; continue
    if not in_files or not location or not line.startswith("  "): continue
    rel = line.strip().replace("\\\\", "/")
    if "package_metadata" not in rel: continue
    abs_path = (pathlib.Path(location) / rel).resolve()
    metadata_dir = abs_path if abs_path.is_dir() else abs_path.parent
    roots.add(str(metadata_dir))
print(json.dumps(sorted(roots)))
`;
  for (const python of ["python3", "python"]) {
    const proc = spawnSync(python, ["-c", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    if (proc.status !== 0 || !proc.stdout) continue;
    try {
      const roots = JSON.parse(proc.stdout.trim()) as string[];
      if (Array.isArray(roots)) {
        return roots.filter(
          (p) => typeof p === "string" && p.length > 0 && existsSync(p)
        );
      }
    } catch {
      // try next python executable
    }
  }
  return [];
}

const metadataRoots = detectPipMetadataRoots();

// Also scan local TS node packages that have nodetool/package_metadata
const localPackagesDir = resolve(__dirname, "../../");
if (existsSync(localPackagesDir)) {
  try {
    for (const entry of readdirSync(localPackagesDir, {
      withFileTypes: true
    })) {
      if (!entry.isDirectory()) continue;
      const metaDir = join(
        localPackagesDir,
        entry.name,
        "nodetool",
        "package_metadata"
      );
      if (existsSync(metaDir)) {
        const resolved = resolve(localPackagesDir, entry.name);
        if (!metadataRoots.includes(resolved)) {
          metadataRoots.push(resolved);
        }
      }
    }
  } catch {
    // ignore scan errors
  }
}

log.info(`Metadata roots detected [${startupMs()}]`, {
  roots: metadataRoots
});

// ---------------------------------------------------------------------------
// Node registry
// ---------------------------------------------------------------------------

const registry = new NodeRegistry();
registry.loadPythonMetadata({ roots: metadataRoots, maxDepth: 8 });
log.info(`Python metadata loaded [${startupMs()}]`);
registerBaseNodes(registry);
registerElevenLabsNodes(registry);
registerFalNodes(registry);
registerReplicateNodes(registry);
log.info(`Node registry ready [${startupMs()}]`);

// ---------------------------------------------------------------------------
// Python bridge
// ---------------------------------------------------------------------------

const pythonBridge = new PythonStdioBridge({
  workerArgs: process.env["NODETOOL_WORKER_NAMESPACES"]
    ? ["--namespaces", process.env["NODETOOL_WORKER_NAMESPACES"]]
    : []
});

let pythonBridgeReady = false;

pythonBridge.on("stderr", (msg: string) => {
  for (const line of msg.split("\n")) {
    if (line.trim()) log.debug(`[python-worker] ${line}`);
  }
});

pythonBridge.on("exit", (code: number) => {
  log.warn(`Python worker exited with code ${code}`);
  pythonBridgeReady = false;
});

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

const builtinToolClasses: (new () => Tool)[] = [
  GoogleSearchTool,
  GoogleNewsTool,
  GoogleImagesTool,
  GoogleGroundedSearchTool,
  GoogleImageGenerationTool,
  OpenAIWebSearchTool,
  OpenAIImageGenerationTool,
  OpenAITextToSpeechTool,
  BrowserTool,
  ScreenshotTool,
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool,
  DownloadFileTool,
  HttpRequestTool,
  ExtractPDFTextTool,
  ExtractPDFTablesTool,
  ConvertPDFToMarkdownTool,
  CalculatorTool,
  SearchEmailTool,
  ArchiveEmailTool,
  AddLabelToEmailTool,
  DataForSEOSearchTool,
  DataForSEONewsTool,
  DataForSEOImagesTool,
  SaveAssetTool,
  ReadAssetTool
];

// Lazy tool class map — defers instantiation until first access.
let _toolClassMap: Map<string, new () => Tool> | null = null;
function getToolClassMap(): Map<string, new () => Tool> {
  if (!_toolClassMap) {
    _toolClassMap = new Map();
    for (const cls of builtinToolClasses) {
      const instance = new cls();
      _toolClassMap.set(instance.name, cls);
    }
    log.info(
      `Tool class map built (${_toolClassMap.size} tools) [${startupMs()}]`
    );
  }
  return _toolClassMap;
}
// Expose as a getter-backed object so existing code using toolClassMap works unchanged.
const toolClassMap = new Proxy(new Map<string, new () => Tool>(), {
  get(_target, prop, _receiver) {
    const map = getToolClassMap();
    const value = (map as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(map);
    }
    return value;
  }
});

// ---------------------------------------------------------------------------
// TLS configuration
// ---------------------------------------------------------------------------

function findCert(envVar: string, filename: string): string | undefined {
  const fromEnv = process.env[envVar];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  // Walk up from cwd looking for the cert file
  let dir = resolve(process.cwd());
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, filename);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const tlsCertPath = findCert("TLS_CERT", "cert.pem");
const tlsKeyPath = findCert("TLS_KEY", "key.pem");
const tlsEnabled = Boolean(tlsCertPath && tlsKeyPath);

let httpsOptions: { cert: Buffer; key: Buffer } | undefined;
if (tlsEnabled && tlsCertPath && tlsKeyPath) {
  httpsOptions = {
    cert: readFileSync(tlsCertPath),
    key: readFileSync(tlsKeyPath)
  };
  log.info("TLS enabled", { cert: tlsCertPath, key: tlsKeyPath });
}

// ---------------------------------------------------------------------------
// Host / port
// ---------------------------------------------------------------------------

const port = Number(process.env["PORT"] ?? 7777);
// In production (TLS), bind to 0.0.0.0 unless HOST is explicitly set
const host = process.env["HOST"] ?? (tlsEnabled ? "0.0.0.0" : "127.0.0.1");

// ---------------------------------------------------------------------------
// Fastify app
// ---------------------------------------------------------------------------

const app: FastifyInstance = (Fastify as any)({
  ...(httpsOptions ? { https: httpsOptions } : {}),
  trustProxy: true,
  bodyLimit: 100 * 1024 * 1024, // 100 MB
  logger: false,
  ignoreTrailingSlash: true,
  genReqId: (req: {
    headers: Record<string, string | string[] | undefined>;
  }) => {
    return (req.headers["x-request-id"] as string) || crypto.randomUUID();
  }
});

// ---------------------------------------------------------------------------
// Request ID correlation
// ---------------------------------------------------------------------------

app.addHook("onRequest", async (request) => {
  request.log.info(
    { reqId: request.id, method: request.method, url: request.url },
    "incoming request"
  );
});

app.addHook("onSend", async (request, reply) => {
  reply.header("X-Request-Id", request.id);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const supabaseUrl = process.env["SUPABASE_URL"];
const supabaseKey = process.env["SUPABASE_KEY"];
const supabaseMode = Boolean(supabaseUrl && supabaseKey);
const supabaseProvider = supabaseMode
  ? new SupabaseAuthProvider({
      supabaseUrl: supabaseUrl!,
      supabaseKey: supabaseKey!
    })
  : null;
const localProvider = supabaseProvider ? null : new LocalAuthProvider();

app.decorateRequest("userId", null);

app.addHook("onRequest", async (req, reply) => {
  // Let CORS preflight through — the @fastify/cors plugin handles OPTIONS responses
  if (req.method === "OPTIONS") return;

  // Public routes — no auth required
  const pathname = req.url.split("?")[0];
  if (
    pathname === "/health" ||
    pathname === "/ready" ||
    pathname.startsWith("/api/oauth/") ||
    pathname === "/api/assets/packages" ||
    pathname.startsWith("/api/assets/packages/") ||
    pathname === "/api/nodes/metadata"
  ) {
    return;
  }

  // Extract token from the appropriate source
  const isWs = req.headers["upgrade"]?.toLowerCase() === "websocket";
  const searchParams = new URLSearchParams(req.url.split("?")[1] ?? "");
  const provider = supabaseProvider ?? localProvider!;
  const token = isWs
    ? provider.extractTokenFromWs(
        req.headers as Record<string, string>,
        searchParams
      )
    : provider.extractTokenFromHeaders(req.headers as Record<string, string>);

  if (supabaseMode) {
    if (!token) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }
    const result = await supabaseProvider!.verifyToken(token);
    if (!result.ok) {
      reply.status(401).send({ error: result.error ?? "Unauthorized" });
      return;
    }
    req.userId = result.userId ?? null;
    return;
  }

  // Dev mode: localhost only
  // Use req.socket.remoteAddress rather than req.ip because trustProxy: true
  // makes req.ip reflect x-forwarded-for (spoofable).
  const remoteAddr = req.socket.remoteAddress ?? "";
  const isLocalhost = remoteAddr === "127.0.0.1" || remoteAddr === "::1";
  if (!isLocalhost) {
    reply.status(401).send({ error: "Remote access requires authentication" });
    return;
  }
  req.userId = "1";
});

// CORS
await app.register(fastifyCors, { origin: true });

// WebSocket support
await app.register(fastifyWebSocket);

// Parse all request bodies as raw Buffer — the Web API handlers do their own parsing
app.removeAllContentTypeParsers();
app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
  done(null, body);
});

// ---------------------------------------------------------------------------
// API options for HTTP route handlers
// ---------------------------------------------------------------------------

const apiOptions: HttpApiOptions = { metadataRoots, registry };
const staticFolder = process.env["STATIC_FOLDER"];
const hasStaticApp = Boolean(staticFolder && existsSync(staticFolder));

// ---------------------------------------------------------------------------
// Register route plugins
// ---------------------------------------------------------------------------

await app.register(websocketPlugin, {
  registry,
  pythonBridge,
  getPythonBridgeReady: () => pythonBridgeReady,
  ensurePythonBridge: async () => {
    if (pythonBridgeReady) return;
    await pythonBridge.ensureConnected();
    pythonBridgeReady = true;
    const meta = pythonBridge.getNodeMetadata();
    log.info(
      `Python bridge connected [${startupMs()}] — ${meta.length} Python nodes available`
    );
    registerPythonProviders(pythonBridge)
      .then((registered) => {
        if (registered.length > 0) {
          log.info(`Registered Python providers: ${registered.join(", ")}`);
        }
      })
      .catch((err) => {
        log.warn(
          "Failed to register Python providers",
          err instanceof Error ? err : new Error(String(err))
        );
      });
  },
  toolClassMap
});

await app.register(healthRoute);

// All HTTP API routes receive apiOptions
const routeOpts = { apiOptions };

await app.register(assetsRoutes, routeOpts);
await app.register(workflowsRoutes, routeOpts);
await app.register(jobsRoutes, routeOpts);
await app.register(messagesRoutes, routeOpts);
await app.register(threadsRoutes, routeOpts);
await app.register(nodesRoutes, routeOpts);
await app.register(settingsRoutes, routeOpts);
await app.register(storageRoutes, routeOpts);
await app.register(usersRoutes, routeOpts);
await app.register(openaiRoutes, routeOpts);
await app.register(oauthRoutes, routeOpts);
await app.register(workspaceRoutes, routeOpts);
await app.register(filesRoutes, routeOpts);
await app.register(costsRoutes, routeOpts);
await app.register(skillsRoutes, routeOpts);
await app.register(collectionsRoutes, routeOpts);
await app.register(modelsRoutes, routeOpts);

log.info(`Routes registered [${startupMs()}]`);

if (hasStaticApp && staticFolder) {
  log.info("Serving static app", { root: staticFolder });

  await app.register(fastifyStatic, {
    root: staticFolder,
    prefix: "/"
  });

  app.get("/", async (_req, reply) => {
    return reply.sendFile("index.html");
  });

  app.get("/apps/index.html", async (_req, reply) => {
    return reply.sendFile("index.html");
  });
}

// Log all 404s so we can identify missing routes
app.setNotFoundHandler((req, reply) => {
  const pathname = req.url.split("?")[0] ?? "/";

  if (
    hasStaticApp &&
    req.method === "GET" &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/health") &&
    !pathname.startsWith("/ws") &&
    !pathname.startsWith("/v1") &&
    !pathname.startsWith("/oauth") &&
    !pathname.includes(".")
  ) {
    return reply.sendFile("index.html");
  }

  log.warn(`404 Not Found: ${req.method} ${req.url}`);
  return reply.status(404).send({ detail: "Not found" });
});

// ---------------------------------------------------------------------------
// HTTP → HTTPS redirect server (when TLS is active)
// ---------------------------------------------------------------------------

if (tlsEnabled) {
  const redirectPort = Number(process.env["REDIRECT_PORT"] ?? 80);
  const redirectServer = createHttpServer((req, res) => {
    const reqHost = req.headers.host?.split(":")[0] ?? "localhost";
    const location = `https://${reqHost}:${port}${req.url ?? "/"}`;
    res.statusCode = 301;
    res.setHeader("Location", location);
    res.end();
  });
  redirectServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EACCES") {
      log.warn(
        `HTTP redirect server skipped — port ${redirectPort} requires elevated privileges`
      );
    } else {
      log.error("HTTP redirect server error", err);
    }
  });
  redirectServer.listen(redirectPort, "0.0.0.0", () => {
    log.info(`HTTP → HTTPS redirect server listening on :${redirectPort}`);
  });
}

// ---------------------------------------------------------------------------
// Start Fastify server immediately, Python bridge connects in background
// ---------------------------------------------------------------------------

const proto = tlsEnabled ? "https" : "http";
app.listen({ port, host }, (err) => {
  if (err) {
    log.error("Failed to start server", err);
    process.exit(1);
  }
  log.info(`Server listening on ${proto}://${host}:${port} [${startupMs()}]`);
  log.info(
    `WebSocket endpoint: ${tlsEnabled ? "wss" : "ws"}://${host}:${port}/ws`
  );
});

// Start Python bridge eagerly if Python is installed.
if (pythonBridge.hasPython()) {
  pythonBridge
    .ensureConnected()
    .then(() => {
      pythonBridgeReady = true;
      const meta = pythonBridge.getNodeMetadata();
      log.info(
        `Python bridge connected [${startupMs()}] — ${meta.length} Python nodes available`
      );
      registerPythonProviders(pythonBridge)
        .then((registered) => {
          if (registered.length > 0) {
            log.info(`Registered Python providers: ${registered.join(", ")}`);
          }
        })
        .catch((err) => {
          log.warn(
            "Failed to register Python providers",
            err instanceof Error ? err : new Error(String(err))
          );
        });
    })
    .catch((err) => {
      log.warn(
        "Python bridge failed to start (Python nodes will not be available)",
        err instanceof Error ? err : new Error(String(err))
      );
    });
} else {
  log.info("Python not found — Python nodes will not be available");
}
