#!/usr/bin/env node
/**
 * NodeTool WebSocket + HTTP server entry point — Fastify edition.
 *
 * TLS: set TLS_CERT and TLS_KEY to paths of cert.pem / key.pem.
 *      An HTTP→HTTPS redirect server starts on port 80 when TLS is active.
 * Connect the CLI with: npm run chat -- --url ws://localhost:7777/ws
 */

import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import crypto from "node:crypto";
import {
  createLogger,
  configureLogging,
  getDefaultDbPath,
  getPostgresDatabaseUrl,
  loadEnvironment
} from "@nodetool-ai/config";
import type { NodeMetadata } from "@nodetool-ai/node-sdk";
import { registerTransformersJsProvider } from "@nodetool-ai/transformers-js-provider";
import { bootstrapNodeRegistry } from "./node-registry-setup.js";
import { corsOriginDelegate } from "./cors.js";
import { zipExtensionDist } from "./lib/extension-dist.js";
import {
  resolveTrustLocalhost,
  isLoopbackAddress,
  parseTrustedProxies
} from "./lib/localhost-trust.js";
import {
  initTelemetry,
  createPythonBridge,
  WebsocketPythonBridge,
  SwappableBridge,
  logPythonWorkerStderr,
  type PythonBridge
} from "@nodetool-ai/runtime";
import { initMasterKey } from "@nodetool-ai/security";
import {
  WorkerManager,
  startReaper,
  type WorkerConnection
} from "@nodetool-ai/compute";
import {
  getWorkerProfile,
  initDb,
  initPostgresDb,
  migrateSqliteDb,
  runSeeds,
  touchWorkerInstance
} from "@nodetool-ai/models";
import { registerPythonProviders } from "./models-api.js";
import type { HttpApiOptions } from "./http-api.js";
import { handleMcpHttpRequest } from "./mcp-server.js";

import Fastify, { type FastifyInstance } from "fastify";
import fastifyWebSocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { pack } from "msgpackr";
import { SupabaseAuthProvider, LocalAuthProvider } from "@nodetool-ai/auth";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions
} from "@trpc/server/adapters/fastify";
import { appRouter, type AppRouter } from "./trpc/router.js";
import { createContextFactory } from "./trpc/context.js";
import type { WorkerHealth } from "./trpc/context.js";
import {
  getHttpRateLimitConfig,
  rateLimitKey,
  isRateLimitExempt
} from "./lib/http-rate-limit.js";

import websocketPlugin from "./plugins/websocket.js";
import healthRoute from "./routes/health.js";
import configRoute from "./routes/config.js";
import assetsRoutes from "./routes/assets.js";
import workflowsRoutes from "./routes/workflows.js";
import jobsRoutes from "./routes/jobs.js";
import nodesRoutes from "./routes/nodes.js";
import storageRoutes from "./routes/storage.js";
import openaiRoutes from "./routes/openai.js";
import oauthRoutes from "./routes/oauth.js";
import workspaceRoutes from "./routes/workspace.js";
import filesRoutes from "./routes/files.js";
import collectionsRoutes from "./routes/collections.js";
import falCreditsRoute from "./routes/fal-credits.js";
import falPricingRoute from "./routes/fal-pricing.js";
import falPricingEstimateRoute from "./routes/fal-pricing-estimate.js";
import kieCreditsRoute from "./routes/kie-credits.js";
import kiePricingRoute from "./routes/kie-pricing.js";
import {
  agentSocketRoute,
  getAgentRuntime,
  setLlmAgentGraphPlannerRegistry
} from "./agent/index.js";

// @llamaindex/liteparse bundles a webpack pdf.js whose `isNodeJS` heuristic
// resolves to false inside Electron utilityProcess (process.type === "utility"),
// causing it to take browser-only code paths that reference the global `document`
// and throw `ReferenceError: document is not defined` on parse(). Reporting
// process.type as "browser" — the value Electron's main process uses — flips
// the heuristic back to Node mode so NodeBinaryDataFactory / fs-based asset
// loading is selected. No-op outside Electron.
{
  const proc = process as unknown as { type?: string; versions: { electron?: string } };
  if (proc.versions?.electron && proc.type && proc.type !== "browser") {
    try {
      Object.defineProperty(process, "type", {
        value: "browser",
        writable: true,
        configurable: true
      });
    } catch {
      // Property is non-configurable in some Electron builds; ignore.
    }
  }
}

loadEnvironment(resolve(dirname(fileURLToPath(import.meta.url)), "../../.."));

const log = createLogger("nodetool.websocket.server");
// Apply log level from NODETOOL_LOG_LEVEL / LOG_LEVEL env vars (the module
// initialises eagerly, but an explicit call here picks up any env mutations
// made by the process launcher before this point).
configureLogging();

/**
 * Read-only workflow metadata GETs for SDK/editor boot (same role as
 * `/api/nodes/metadata`). Mutations still require auth below.
 */
function isPublicWorkflowMetadataRequest(
  pathname: string,
  method: string
): boolean {
  if (method !== "GET") return false;
  if (pathname === "/api/workflows" || pathname === "/api/workflows/") {
    return true;
  }
  if (
    pathname.startsWith("/api/workflows/public") ||
    pathname.startsWith("/api/workflows/examples")
  ) {
    return true;
  }
  if (pathname === "/api/workflows/names" || pathname === "/api/workflows/tools") {
    return true;
  }
  if (/^\/api\/workflows\/[^/]+\/dsl-export$/.test(pathname)) {
    return true;
  }
  return /^\/api\/workflows\/[^/]+$/.test(pathname);
}

await initTelemetry();
const startupT0 = performance.now();
function startupMs(): string {
  return `${(performance.now() - startupT0).toFixed(0)}ms`;
}

type ResourceChangeEvent = "created" | "updated" | "deleted";

async function broadcastResourceChange(
  app: FastifyInstance,
  change: {
    event: ResourceChangeEvent;
    resource_type: string;
    resource: Record<string, unknown>;
  }
): Promise<void> {
  const message = pack({
    type: "resource_change",
    ...change
  });

  for (const client of app.websocketServer.clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

async function notifyPythonBridgeResourceChanges(
  app: FastifyInstance,
  pythonBridge: PythonBridge
): Promise<void> {
  await broadcastResourceChange(app, {
    event: "updated",
    resource_type: "metadata",
    resource: { id: "nodes", etag: String(Date.now()) }
  });

  const registered = await registerPythonProviders(pythonBridge);
  if (registered.length > 0) {
    log.info(`Registered Python providers: ${registered.join(", ")}`);
  }

  const discoveredProviders = await pythonBridge.listProviders();
  const registeredProviders = new Set(registered);

  for (const provider of discoveredProviders) {
    await broadcastResourceChange(app, {
      event: registeredProviders.has(provider.id) ? "created" : "updated",
      resource_type: "provider",
      resource: {
        id: provider.id,
        provider: provider.id,
        capabilities: provider.capabilities,
        etag: String(Date.now())
      }
    });

    await broadcastResourceChange(app, {
      event: "updated",
      resource_type: "model",
      resource: {
        id: provider.id,
        provider: provider.id,
        etag: String(Date.now())
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return "(provided)";
  }
}

try {
  const postgresDatabaseUrl = getPostgresDatabaseUrl();
  if (postgresDatabaseUrl) {
    await initPostgresDb(postgresDatabaseUrl);
    log.info(`PostgreSQL database ready [${startupMs()}]`, {
      url: maskDatabaseUrl(postgresDatabaseUrl)
    });
  } else {
    const dbPath = getDefaultDbPath();
    log.info(`Initializing SQLite database at: ${dbPath}`);
    mkdirSync(dirname(dbPath), { recursive: true });
    const appliedMigrations = await migrateSqliteDb(dbPath);
    if (appliedMigrations.length > 0) {
      log.info(`SQLite migrations applied [${startupMs()}]`, {
        count: appliedMigrations.length,
        versions: appliedMigrations
      });
    }
    initDb(dbPath);
    log.info(`SQLite database ready [${startupMs()}]`, { path: dbPath });
  }

  // Initialize master key from keychain before any secret access. Callers
  // that need provider credentials bind their own `(key) => getSecret(key,
  // userId)` closure when invoking provider APIs — there is no shared
  // global resolver.
  await initMasterKey();
} catch (err) {
  log.error(
    "Database setup failed",
    err instanceof Error ? err : new Error(String(err))
  );
  process.exit(1);
}

// Seed built-in workflows — non-fatal; a seed failure should not prevent startup.
try {
  await runSeeds();
  log.info(`Seeds applied [${startupMs()}]`);
} catch (err) {
  log.warn(
    "Seeds failed (non-fatal)",
    err instanceof Error ? err : new Error(String(err))
  );
}

// ---------------------------------------------------------------------------
// Python pip metadata root detection
// ---------------------------------------------------------------------------

function detectPipMetadataRoots(): string[] {
  const script = `
import json, pathlib, subprocess, sys
roots = set()
try:
    # Discover all nodetool-* packages
    list_proc = subprocess.run(
        [sys.executable, "-m", "pip", "list", "--format=json"],
        capture_output=True, text=True, check=False,
    )
    pkg_names = [
        p["name"] for p in json.loads(list_proc.stdout or "[]")
        if p["name"].startswith("nodetool-")
    ] or ["nodetool-core", "nodetool-base"]
    proc = subprocess.run(
        [sys.executable, "-m", "pip", "show", "-f"] + pkg_names,
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
const localPackagesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../"
);
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

const registry = await bootstrapNodeRegistry({
  metadataRoots,
  log
});
log.info(`Node registry ready [${startupMs()}]`);
setLlmAgentGraphPlannerRegistry(registry);
if (process.env["NODETOOL_ENV"] !== "production") {
  registerTransformersJsProvider();
}

// ---------------------------------------------------------------------------
// Python bridge
// ---------------------------------------------------------------------------

const localBridge = createPythonBridge({
  workerArgs: process.env["NODETOOL_WORKER_NAMESPACES"]
    ? ["--namespaces", process.env["NODETOOL_WORKER_NAMESPACES"]]
    : []
});

// The ONE stable bridge reference handed to every consumer. It delegates to the
// local bridge by default; attaching a worker swaps in a dedicated WebSocket
// bridge to that worker (so ALL Python work — execution AND model management —
// targets the worker's GPU) and detach swaps back. Because the reference is
// stable and re-emits its target's events, consumers never re-read it and
// listeners are wired exactly once.
const pythonBridge = new SwappableBridge(localBridge);

let pythonBridgeReady = false;

// Worker bridge bookkeeping so it can be closed after swapping away. Only the
// remote WebSocket bridge is tracked here; the local stdio bridge is owned by
// `localBridge` above and never closed on swap.
let workerBridge: WebsocketPythonBridge | null = null;
const isLocalActive = (): boolean => pythonBridge.target === localBridge;
const getPythonBridgeReady = (): boolean =>
  isLocalActive() ? pythonBridgeReady : pythonBridge.isConnected;

// ---------------------------------------------------------------------------
// Worker provisioning (GPU workers via @nodetool-ai/compute)
// ---------------------------------------------------------------------------

const workerManager = new WorkerManager();

/**
 * Re-point the Python bridge for worker attach/detach by SWAPPING the
 * SwappableBridge's target (a local stdio bridge cannot be re-pointed in place).
 *
 * On attach: build a dedicated WebSocket bridge to the worker, connect it
 * (discover + status), swap it in as the target — so subsequent execution and
 * model-management calls run on the worker — then close the previous worker
 * bridge. Throws (failing the attach) if the worker can't be reached. On detach
 * (`null`): swap back to the local bridge and dispose the worker bridge.
 *
 * `swap()` itself never connects or closes a bridge — lifecycle is owned here:
 * connect before swapping in, close after swapping away.
 */
async function repointPythonBridge(
  target: WorkerConnection | null
): Promise<void> {
  if (target) {
    const next = new WebsocketPythonBridge({
      wsUrl: target.wsUrl,
      workerToken: target.token ?? undefined
    });
    try {
      await next.connect();
    } catch (err) {
      next.close();
      throw err;
    }
    const previous = workerBridge;
    workerBridge = next;
    pythonBridge.swap(next);
    if (previous) previous.close();
    log.info("Python bridge re-pointed to attached worker");
    return;
  }
  const previous = workerBridge;
  workerBridge = null;
  pythonBridge.swap(localBridge);
  if (previous) previous.close();
  log.info("Python bridge re-pointed back to the local worker");
}

/** Bound for the readiness probe: TCP/WS handshake + discover RPC. */
const WORKER_PROBE_TIMEOUT_MS = 8000;

/**
 * Probe a `running` worker's readiness by opening a transient bridge to its
 * `{wsUrl, token}` — the same handshake attach performs — then closing it. A
 * resolved connect (WS open + `discover` answered) means the worker process is
 * actually serving, not merely that the pod's port is mapped. Never throws:
 * failures (still booting, unreachable) report `{ healthy: false }`.
 */
async function probeWorkerHealth(
  target: WorkerConnection
): Promise<WorkerHealth> {
  if (!target.wsUrl) {
    return { healthy: false, error: "Worker has no WebSocket URL yet" };
  }
  const probe = new WebsocketPythonBridge({
    wsUrl: target.wsUrl,
    workerToken: target.token ?? undefined,
    // One-shot probe: no reconnect, bounded handshake.
    autoRestart: false,
    startupTimeoutMs: WORKER_PROBE_TIMEOUT_MS,
    reconnectRpcTimeoutMs: WORKER_PROBE_TIMEOUT_MS
  });
  // A probe must never escalate a socket 'error' into a crash.
  probe.on("error", () => {});
  try {
    await probe.connect();
    return {
      healthy: true,
      protocolVersion: probe.supportsModelManagement() ? 2 : 1
    };
  } catch (err) {
    return {
      healthy: false,
      error: err instanceof Error ? err.message : String(err)
    };
  } finally {
    try {
      probe.close();
    } catch {
      /* best-effort cleanup */
    }
  }
}

function logPythonBridgeDiagnostics(context: string): void {
  const loadErrors = (
    localBridge as {
      getLoadErrors?: () => Array<{
        module: string;
        phase: string;
        error: string;
      }>;
    }
  ).getLoadErrors?.() ?? [];
  if (loadErrors.length === 0) return;
  log.warn(
    `Python bridge ${context} with ${loadErrors.length} load error(s)`
  );
  for (const entry of loadErrors.slice(0, 10)) {
    log.warn(
      `[python-worker][load-error] ${entry.module} (${entry.phase}): ${entry.error}`
    );
  }
  if (loadErrors.length > 10) {
    log.warn(
      `[python-worker][load-error] ... ${loadErrors.length - 10} additional load error(s) omitted`
    );
  }
}

pythonBridge.on("stderr", (msg: string) => {
  for (const line of msg.split("\n")) {
    logPythonWorkerStderr(line, log);
  }
});

pythonBridge.on("error", (err: Error) => {
  log.error(`Python bridge protocol error: ${err.message}`);
  pythonBridgeReady = false;
});

pythonBridge.on("exit", (code: number) => {
  log.warn(`Python worker exited with code ${code}`);
  pythonBridgeReady = false;
});

// Keep the attached worker's `last_activity_at` fresh so the cost guard's
// reaper measures idle time from real bridge traffic, not from creation. The
// remote WebSocket bridge emits "activity" on every outbound frame; we touch
// the active worker instance, throttled so high-frequency traffic doesn't turn
// into a DB write per frame (the reaper runs every 60s; second-level freshness
// is ample). A local stdio bridge never emits "activity", so this is inert
// there. Failures are swallowed — a touch must never break execution.
const WORKER_TOUCH_THROTTLE_MS = 10_000;
let lastWorkerTouchAt = 0;
pythonBridge.on("activity", () => {
  const nowMs = Date.now();
  if (nowMs - lastWorkerTouchAt < WORKER_TOUCH_THROTTLE_MS) return;
  lastWorkerTouchAt = nowMs;
  void workerManager
    .getActiveWorker()
    .then((active) => (active ? touchWorkerInstance(active.id) : undefined))
    .catch(() => {
      // best-effort: keeping the idle clock fresh must not crash the runner
    });
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
const isProduction = process.env["NODETOOL_ENV"] === "production";
// In production, bind to all interfaces unless HOST is explicitly set
const host = process.env["HOST"] ?? (isProduction ? "0.0.0.0" : "127.0.0.1");

// Reverse proxies whose X-Forwarded-For header may be trusted to determine the
// real client IP. Comma-separated IPs/CIDRs (e.g. "127.0.0.1,10.0.0.0/8").
// When empty, X-Forwarded-For is NOT trusted: req.ip falls back to the socket
// peer address so clients cannot spoof their origin via headers.
const trustedProxies = parseTrustedProxies(
  process.env["NODETOOL_TRUSTED_PROXIES"]
);

// ---------------------------------------------------------------------------
// Fastify app
// ---------------------------------------------------------------------------

const app: FastifyInstance = (Fastify as any)({
  ...(httpsOptions ? { https: httpsOptions } : {}),
  // Only trust X-Forwarded-For from explicitly configured proxies. With no
  // proxies configured this is `false`, so req.ip is the unspoofable socket
  // peer address.
  trustProxy: trustedProxies.length > 0 ? trustedProxies : false,
  bodyLimit: 100 * 1024 * 1024, // 100 MB
  logger: false,
  // tRPC's httpBatchLink encodes all batched procedure names into a single
  // URL path segment joined with commas (e.g. `/trpc/foo,bar,baz`). Fastify's
  // default `maxParamLength` of 100 rejects larger batches with a 404 — bump
  // it so batches up to ~50 procedures route correctly.
  routerOptions: {
    ignoreTrailingSlash: true,
    maxParamLength: 2000
  },
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
// Per-IP HTTP rate limiting
// ---------------------------------------------------------------------------
// Registered before the auth hook so floods are rejected with 429 before any
// token verification work. Localhost is exempt; tune via NODETOOL_RATE_LIMIT_*.
const httpRateLimit = getHttpRateLimitConfig();
if (httpRateLimit.enabled) {
  await app.register(fastifyRateLimit, {
    global: true,
    max: httpRateLimit.max,
    timeWindow: httpRateLimit.timeWindow,
    keyGenerator: (req) => rateLimitKey(req, httpRateLimit.trustProxy),
    allowList: (req) =>
      isRateLimitExempt(rateLimitKey(req, httpRateLimit.trustProxy))
  });
  log.info("Per-IP HTTP rate limiting enabled", {
    max: httpRateLimit.max,
    timeWindowMs: httpRateLimit.timeWindow,
    trustProxy: httpRateLimit.trustProxy
  });
} else {
  log.info("Per-IP HTTP rate limiting disabled");
}

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

// Auth is enforced whenever a remote identity provider is configured.
const enforceAuth = supabaseMode;

// Whether loopback connections may bypass auth as user "1". Explicit
// NODETOOL_TRUST_LOCALHOST wins; otherwise this defaults off when auth is
// enforced (so reverse-proxied/containerized deployments — where the proxy
// connects from loopback — don't silently disable auth) and on for local dev.
const trustLocalhost = resolveTrustLocalhost({
  envValue: process.env["NODETOOL_TRUST_LOCALHOST"],
  enforceAuth
});

if (enforceAuth && trustLocalhost) {
  log.warn(
    "NODETOOL_TRUST_LOCALHOST is enabled while auth is enforced: any " +
      "connection from loopback (including a reverse proxy) bypasses " +
      "authentication. Unset it unless the proxy is fully trusted."
  );
}

app.decorateRequest("userId", null);

app.addHook("onRequest", async (req, reply) => {
  // Let CORS preflight through — the @fastify/cors plugin handles OPTIONS responses
  if (req.method === "OPTIONS") return;

  // Public routes — no auth required
  const pathname = req.url.split("?")[0];
  if (
    pathname === "/health" ||
    pathname === "/ready" ||
    pathname === "/api/health" ||
    pathname === "/api/config" ||
    pathname.startsWith("/api/oauth/") ||
    pathname === "/api/assets/packages" ||
    pathname.startsWith("/api/assets/packages/") ||
    pathname === "/api/nodes/metadata" ||
    pathname === "/api/node/metadata" ||
    isPublicWorkflowMetadataRequest(pathname, req.method)
  ) {
    return;
  }

  // Static frontend assets don't require auth (served by fastifyStatic)
  if (
    hasStaticApp &&
    req.method === "GET" &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/ws") &&
    !pathname.startsWith("/v1") &&
    !pathname.startsWith("/trpc")
  ) {
    return;
  }

  // req.ip reflects X-Forwarded-For only when the request arrived through a
  // configured trusted proxy (see NODETOOL_TRUSTED_PROXIES); otherwise it is
  // the unspoofable socket peer address.
  const clientIp = req.ip;

  // Loopback connections bypass auth as user "1" only when explicitly trusted.
  // Behind a reverse proxy/container/SSH tunnel the proxy itself connects from
  // loopback, so this is gated by NODETOOL_TRUST_LOCALHOST (off by default when
  // auth is enforced).
  if (trustLocalhost && isLoopbackAddress(clientIp)) {
    req.userId = "1";
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

  reply.status(401).send({ error: "Remote access requires authentication" });
});

// CORS — restrict to configured origins instead of reflecting any origin.
await app.register(fastifyCors, { origin: corsOriginDelegate });

// WebSocket support
await app.register(fastifyWebSocket);

// Parse all request bodies as raw Buffer — the Web API handlers do their own parsing
app.removeAllContentTypeParsers();
app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
  done(null, body);
});

// ---------------------------------------------------------------------------
// Examples directory detection
// ---------------------------------------------------------------------------

// Resolve examples directory so that example workflow JSON files can be served
// without requiring a Python installation.
//
// Resolution order:
//  1. NODETOOL_BASE_EXAMPLES_DIR env var (explicit override)
//  2. Co-located with server entry point — used when the backend is bundled
//     (e.g. resources/backend/server.mjs → resources/backend/examples/nodetool-base/)
//  3. Monorepo layout — used in development and dist runs where server.js lives
//     inside packages/websocket/src/ or packages/websocket/dist/
const _serverDir = dirname(fileURLToPath(import.meta.url));
const _envExamplesDir = process.env["NODETOOL_BASE_EXAMPLES_DIR"];
const _bundledExamplesDir = resolve(_serverDir, "examples", "nodetool-base");
const _bundledAssetsDir = resolve(_serverDir, "assets", "nodetool-base");
const _monoExamplesDir = resolve(
  _serverDir,
  "..",
  "..",
  "..",
  "packages",
  "base-nodes",
  "nodetool",
  "examples",
  "nodetool-base"
);
const _examplesDirCandidates: Array<string | null | undefined> = [
  _envExamplesDir && existsSync(_envExamplesDir) ? _envExamplesDir : null,
  existsSync(_bundledExamplesDir) ? _bundledExamplesDir : null,
  existsSync(_monoExamplesDir) ? _monoExamplesDir : null
];
const _resolvedExamplesDir =
  _examplesDirCandidates.find((d): d is string => Boolean(d)) ?? null;

if (_resolvedExamplesDir) {
  log.info(`Examples directory resolved: ${_resolvedExamplesDir}`);
} else {
  log.warn("Examples directory not found — template workflows will be unavailable");
}

// ---------------------------------------------------------------------------
// API options for HTTP route handlers
// ---------------------------------------------------------------------------

const apiOptions: HttpApiOptions = { metadataRoots, registry };
if (_resolvedExamplesDir) {
  apiOptions.examplesDir = _resolvedExamplesDir;
  if (existsSync(_bundledAssetsDir)) {
    apiOptions.examplesAssetsFallbackDir = _bundledAssetsDir;
  }
}

// Constant package assets (`package://<pkg>/<file>`) are served read-only at
// `/api/assets/packages/<pkg>/<file>` from `<root>/<pkg>/<file>`. The bundled
// root sits next to server.mjs (no Python needed); the monorepo root is used
// in dev/dist runs.
const _bundledPackageAssetsRoot = resolve(_serverDir, "assets");
const _monoPackageAssetsRoot = resolve(
  _serverDir,
  "..",
  "..",
  "..",
  "packages",
  "base-nodes",
  "nodetool",
  "assets"
);
const _packageAssetsRoots = [
  existsSync(_bundledPackageAssetsRoot) ? _bundledPackageAssetsRoot : null,
  existsSync(_monoPackageAssetsRoot) ? _monoPackageAssetsRoot : null
].filter((d): d is string => Boolean(d));
if (_packageAssetsRoots.length > 0) {
  apiOptions.packageAssetsRoots = _packageAssetsRoots;
  // Let in-process workflow execution resolve `package://` refs straight from
  // disk instead of guessing the loopback port for an HTTP round-trip.
  if (!process.env["NODETOOL_PACKAGE_ASSETS_DIR"]) {
    process.env["NODETOOL_PACKAGE_ASSETS_DIR"] = _packageAssetsRoots[0];
  }
}

const staticFolder = process.env["STATIC_FOLDER"];
const hasStaticApp = Boolean(staticFolder && existsSync(staticFolder));

// ---------------------------------------------------------------------------
// Register route plugins
// ---------------------------------------------------------------------------

const createContext = createContextFactory({
  registry,
  apiOptions,
  pythonBridge,
  getPythonBridgeReady,
  workerManager,
  repointPythonBridge,
  probeWorkerHealth
});

await app.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: {
    router: appRouter,
    createContext,
    // The web client forces all batches to POST (httpBatchLink
    // `methodOverride: "POST"`) so long batched inputs ride in the body instead
    // of the URL, which reverse proxies reject once the query string grows too
    // large (see web/src/trpc/client.ts and issues #3979/#3981). Without this
    // flag the server rejects POST-to-query with 405, leaving panels empty.
    allowMethodOverride: true,
    onError({ path, error }) {
      log.error(
        `tRPC error on ${path}`,
        error instanceof Error ? error : new Error(String(error))
      );
      // Surface inner ZodError details (output validation failures) so callers
      // can diagnose the offending fields instead of seeing only "Output
      // validation failed".
      const cause = (error as { cause?: unknown }).cause;
      if (cause && typeof cause === "object" && "issues" in cause) {
        log.error(
          `tRPC error cause on ${path}: ${JSON.stringify((cause as { issues: unknown }).issues)}`
        );
      }
    }
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"]
});

await app.register(websocketPlugin, {
  registry,
  pythonBridge,
  apiOptions,
  workerManager,
  getPythonBridgeReady,
  ensurePythonBridge: async () => {
    if (getPythonBridgeReady()) return;
    log.info(`Lazily starting Python bridge [${startupMs()}]`);
    try {
      await pythonBridge.ensureConnected();
    } catch (err) {
      log.warn(
        `Python bridge lazy start failed [${startupMs()}]`,
        err instanceof Error ? err : new Error(String(err))
      );
      throw err;
    }
    // A worker bridge is connected eagerly on attach; readiness then derives
    // from its live connection state. Only the local bridge does the one-time
    // node-metadata registration below.
    if (!isLocalActive()) {
      log.info(`Worker Python bridge connected [${startupMs()}]`);
      return;
    }
    pythonBridgeReady = true;
    log.info(`Python bridge lazy start completed [${startupMs()}]`);
    const meta = pythonBridge.getNodeMetadata();
    // Register Python bridge nodes — skip those already loaded from JSON metadata
    let bridgeOnly = 0;
    for (const nodeMeta of meta) {
      if (!nodeMeta.node_type) continue;
      if (registry.getMetadata(nodeMeta.node_type)) continue;
      bridgeOnly++;
      registry.loadMetadata(nodeMeta.node_type, {
        ...(nodeMeta as unknown as NodeMetadata),
        namespace: nodeMeta.node_type.split(".").slice(0, -1).join("."),
        layout: "default",
        recommended_models: nodeMeta.recommended_models ?? [],
        required_settings: nodeMeta.required_settings ?? [],
        // Python worker still emits `is_dynamic` on the stdio wire; map it to
        // the protocol's `supports_dynamic_inputs`.
        supports_dynamic_inputs: nodeMeta.is_dynamic ?? false,
        is_streaming_output: nodeMeta.is_streaming_output ?? false,
        supports_dynamic_outputs: false
      });
    }
    log.info(
      `Python bridge connected [${startupMs()}] — ${meta.length} Python nodes (${bridgeOnly} bridge-only, ${meta.length - bridgeOnly} from JSON)`
    );
    (
      pythonBridge as {
        getWorkerStatus?: () => Promise<{
          protocol_version: number;
          node_count: number;
          provider_count: number;
          namespaces: string[];
          transport: string;
          max_frame_size: number;
          load_errors: Array<unknown>;
        }>;
      }
    )
      .getWorkerStatus?.()
      ?.then((status) => {
        log.info(
          `Python bridge status [${startupMs()}]`,
          {
            protocol_version: status.protocol_version,
            node_count: status.node_count,
            provider_count: status.provider_count,
            namespaces: status.namespaces,
            transport: status.transport,
            max_frame_size: status.max_frame_size,
            load_error_count: status.load_errors.length
          }
        );
      })
      .catch((err: unknown) => {
        log.warn(
          `Failed to fetch Python bridge status [${startupMs()}]`,
          err instanceof Error ? err : new Error(String(err))
        );
      });
    logPythonBridgeDiagnostics("connected");
    notifyPythonBridgeResourceChanges(app, pythonBridge).catch((err) => {
      log.warn(
        "Failed to notify Python bridge resource changes",
        err instanceof Error ? err : new Error(String(err))
      );
    });
  }
});

await app.register(healthRoute);
await app.register(configRoute);

// All HTTP API routes receive apiOptions
const routeOpts = { apiOptions };

await app.register(assetsRoutes, routeOpts);
await app.register(workflowsRoutes, routeOpts);
await app.register(jobsRoutes, routeOpts);
await app.register(nodesRoutes, routeOpts);
await app.register(storageRoutes, routeOpts);
await app.register(openaiRoutes, routeOpts);
await app.register(oauthRoutes, routeOpts);
await app.register(workspaceRoutes, routeOpts);
await app.register(filesRoutes, routeOpts);
await app.register(collectionsRoutes, routeOpts);
await app.register(falCreditsRoute);
await app.register(falPricingRoute);
await app.register(falPricingEstimateRoute);
await app.register(kieCreditsRoute);
await app.register(kiePricingRoute);
// MCP endpoints are only available in local/dev mode — not in production.
// The configuration endpoints moved to the tRPC `mcpConfig` router; the
// `/mcp` proxy below is a bare MCP over-HTTP transport and stays on REST.
if (!isProduction) {
  app.all("/mcp", async (req, reply) => {
    const protocol = httpsOptions ? "https" : "http";
    const url = `${protocol}://${req.headers.host ?? `127.0.0.1:${port}`}${req.url}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(key, item);
        }
      } else if (typeof value === "string") {
        headers.set(key, value);
      }
    }

    const requestBody =
      req.method === "GET" || req.method === "DELETE"
        ? undefined
        : Buffer.isBuffer(req.body)
          ? req.body
          : typeof req.body === "string"
            ? req.body
            : req.body == null
              ? Buffer.alloc(0)
              : JSON.stringify(req.body);

    const request = new Request(url, {
      method: req.method,
      headers,
      body: Buffer.isBuffer(requestBody)
        ? new Uint8Array(requestBody)
        : requestBody,
      // `duplex` is required by Node's fetch when streaming bodies but is
      // missing from some `@types/node`/`undici-types` versions of RequestInit.
      ...({ duplex: "half" } as object)
    } as RequestInit);

    const response = await handleMcpHttpRequest(request, { metadataRoots });
    if (!response) {
      reply.status(404).send({ error: "Not found" });
      return;
    }

    reply.status(response.status);
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });
    const payload = Buffer.from(await response.arrayBuffer());
    reply.send(payload);
  });
}

await app.register(agentSocketRoute);

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

// Download the built Chrome extension as a zip, for the install helper UI.
app.get("/api/extension/download", async (_req, reply) => {
  try {
    const zip = await zipExtensionDist();
    return reply
      .header("Content-Type", "application/zip")
      .header(
        "Content-Disposition",
        'attachment; filename="nodetool-chrome-extension.zip"'
      )
      .send(zip);
  } catch (err) {
    log.warn(
      `Extension download failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return reply.status(404).send({ detail: "Extension build not found" });
  }
});

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
    !pathname.startsWith("/trpc") &&
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

// ---------------------------------------------------------------------------
// Worker cost guard — reconcile orphaned GPU pods on boot, then reap on a loop
// ---------------------------------------------------------------------------

const WORKER_REAPER_INTERVAL_MS = 60_000;

workerManager
  .reconcile()
  .then((summary) => {
    if (summary.liveCount > 0 || summary.orphans.length > 0) {
      log.info(
        `Worker reconcile: ${summary.liveCount} live, ` +
          `${summary.orphans.length} orphaned, ~$${summary.estimatedCostUsd.toFixed(2)}`
      );
    }
  })
  .catch((reconcileErr) => {
    log.warn(
      "Worker reconcile failed at startup",
      reconcileErr instanceof Error
        ? reconcileErr
        : new Error(String(reconcileErr))
    );
  });

const stopReaper = startReaper(
  {
    manager: workerManager,
    getProfile: (name) => getWorkerProfile(name),
    now: () => Date.now()
  },
  WORKER_REAPER_INTERVAL_MS
);

// ---------------------------------------------------------------------------
// Graceful shutdown — ensure child processes (Python worker, etc.) are killed
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  log.info(`${signal} received — shutting down`);
  log.info("Closing Python bridge");
  try {
    getAgentRuntime().closeAllSessions();
  } catch {
    // best-effort cleanup
  }
  stopReaper();
  localBridge.close();
  workerBridge?.close();
  try {
    await app.close();
  } catch {
    // ignore close errors
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// On Windows, Ctrl+C in some terminals fires SIGBREAK instead of SIGINT
if (process.platform === "win32") {
  process.on("SIGBREAK", () => void shutdown("SIGBREAK"));
}

// Start Python bridge eagerly if a worker is available.
if (pythonBridge.isAvailable()) {
  log.info(`Starting Python bridge eagerly [${startupMs()}]`);
  pythonBridge
    .ensureConnected()
    .then(() => {
      pythonBridgeReady = true;
      log.info(`Python bridge eager start completed [${startupMs()}]`);
      const meta = pythonBridge.getNodeMetadata();
      let bridgeOnly = 0;
      for (const nodeMeta of meta) {
        if (!nodeMeta.node_type) continue;
        if (registry.getMetadata(nodeMeta.node_type)) continue;
        bridgeOnly++;
        registry.loadMetadata(nodeMeta.node_type, {
          ...(nodeMeta as unknown as NodeMetadata),
          namespace: nodeMeta.node_type.split(".").slice(0, -1).join("."),
          layout: "default",
          recommended_models: nodeMeta.recommended_models ?? [],
          required_settings: nodeMeta.required_settings ?? [],
          // Python worker still emits `is_dynamic` on the stdio wire; map it to
          // the protocol's `supports_dynamic_inputs`.
          supports_dynamic_inputs: nodeMeta.is_dynamic ?? false,
          is_streaming_output: nodeMeta.is_streaming_output ?? false,
          supports_dynamic_outputs: false
        });
      }
      log.info(
        `Python bridge connected [${startupMs()}] — ${meta.length} Python nodes (${bridgeOnly} bridge-only, ${meta.length - bridgeOnly} from JSON)`
      );
      (
        pythonBridge as {
          getWorkerStatus?: () => Promise<{
            protocol_version: number;
            node_count: number;
            provider_count: number;
            namespaces: string[];
            transport: string;
            max_frame_size: number;
            load_errors: Array<unknown>;
          }>;
        }
      )
        .getWorkerStatus?.()
        ?.then((status) => {
          log.info(
            `Python bridge status [${startupMs()}]`,
            {
              protocol_version: status.protocol_version,
              node_count: status.node_count,
              provider_count: status.provider_count,
              namespaces: status.namespaces,
              transport: status.transport,
              max_frame_size: status.max_frame_size,
              load_error_count: status.load_errors.length
            }
          );
        })
        .catch((err: unknown) => {
          log.warn(
            `Failed to fetch Python bridge status [${startupMs()}]`,
            err instanceof Error ? err : new Error(String(err))
          );
        });
      logPythonBridgeDiagnostics("connected");
      notifyPythonBridgeResourceChanges(app, pythonBridge).catch((err) => {
        log.warn(
          "Failed to notify Python bridge resource changes",
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
  log.info(
    isProduction
      ? "Python bridge disabled in production — Python nodes will not be available"
      : "Python not found — Python nodes will not be available"
  );
}
