#!/usr/bin/env node
/**
 * NodeTool WebSocket + HTTP server entry point — Fastify edition.
 *
 * TLS: set TLS_CERT and TLS_KEY to paths of cert.pem / key.pem.
 *      An HTTP→HTTPS redirect server starts on port 80 when TLS is active.
 * Connect the CLI with: npm run chat -- --url ws://localhost:7777/ws
 */

import {
  startGenerationReconcileWorker,
  sweepInterruptedGenerations
} from "@nodetool-ai/execution";
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
import { registerTransformersJsProvider } from "@nodetool-ai/transformers-js-provider";
import { setCodeNodeAgentsModule } from "@nodetool-ai/base-nodes";
import * as agentsModule from "@nodetool-ai/agents";
import {
  bootstrapNodeRegistry,
  mergePythonBridgeMetadata
} from "./node-registry-setup.js";
import { corsOriginDelegate } from "./cors.js";
import { zipExtensionDist } from "./lib/extension-dist.js";
import { isPublicAuthExemptRoute } from "./lib/public-routes.js";
import {
  isWebSocketUpgrade,
  denyUnauthorized,
  denyDraining
} from "./lib/ws-upgrade.js";
import { isDraining, startDrain } from "./drain.js";
import { chatTurnRegistry } from "./chat-turn-registry.js";
import { jobRunRegistry } from "./job-run-registry.js";
import { replayUpgradeToOwner } from "./lib/fly-replay.js";
import { startJobCancelPoller } from "./job-control.js";
import {
  resolveTrustLocalhost,
  isLoopbackAddress,
  parseTrustedProxies,
  parseTrustedLocalNetworks,
  isTrustedLocalAddress
} from "./lib/localhost-trust.js";
import {
  initTelemetry,
  shutdownTelemetry,
  createPythonBridge,
  WebsocketPythonBridge,
  SwappableBridge,
  logPythonWorkerStderr,
  type ModelDownloadUpdate,
  type PythonBridge
} from "@nodetool-ai/runtime";
import { deriveKey, getMasterKey, initMasterKey } from "@nodetool-ai/security";
import { setDefaultModelInterfaces } from "@nodetool-ai/runtime";
import { serverModelInterfaces } from "./websocket-client-session.js";
import {
  WorkerManager,
  attachWorkerActivityHeartbeat,
  startReaper,
  type WorkerConnection
} from "@nodetool-ai/compute";
import {
  getSecret,
  AccessToken,
  getWorkerProfile,
  initDb,
  initPostgresDb,
  isAccessToken,
  McpOauthClient,
  MCP_OAUTH_ACCESS_TOKEN_PREFIX,
  migrateSqliteDb,
  runSeeds
} from "@nodetool-ai/models";
import { isMcpHttpEnabled, MCP_ENABLE_FLAG } from "./lib/mcp-mount.js";
import {
  authenticateMcpAccessToken,
  mcpBearerChallenge
} from "./oauth/gate.js";
import { registerPythonProviders, relayWorkerDownload } from "./models-api.js";
import { syncCustomProviderRegistry } from "./custom-providers.js";
import { runAutomaticStorageCleanup } from "./storage-retention.js";

/** User id the auth middleware assigns in local (no-account) mode. */
const LOCAL_USER_ID = "1";
/** How long an MCP OAuth client nobody ever approved is kept before the
 * periodic cleanup deletes it. */
const UNUSED_OAUTH_CLIENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
import type { SdkV1RouteApiOptions } from "./routes/sdk-v1.js";
import { TRPC_MAX_BATCH_SIZE } from "@nodetool-ai/protocol";
import { handleMcpHttpRequest } from "./mcp-server.js";

import Fastify, { type FastifyInstance } from "fastify";
import fastifyWebSocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { packWebSocketMessage } from "./messagepack.js";
import {
  SupabaseAuthProvider,
  LocalAuthProvider,
  DelegatedTokenProvider,
  isDelegatedToken,
  AppSessionTokenProvider,
  isAppSessionToken
} from "@nodetool-ai/auth";
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

import {
  createTriggerWebhookRoute,
  startTriggerServices,
  triggersEnabled
} from "./triggers/boot.js";

import websocketPlugin from "./plugins/websocket.js";
import healthRoute, { getVersion } from "./routes/health.js";
import configRoute, { describeMissingAnonKey } from "./routes/config.js";
import assetsRoutes from "./routes/assets.js";
import timelineFontRoutes from "./routes/timeline-fonts.js";
import sdkV1Routes from "./routes/sdk-v1.js";
import workflowsRoutes from "./routes/workflows.js";
import nodesRoutes from "./routes/nodes.js";
import storageRoutes from "./routes/storage.js";
import openaiRoutes from "./routes/openai.js";
import oauthRoutes from "./routes/oauth.js";
import { oauthAsRoutes } from "./routes/oauth-as.js";
import {
  isSdkV1AuthenticationRequired,
  isSdkV1DiscoveryRequest
} from "./sdk/sdk-route-policy.js";
import { createNodeToolSdkV1CapabilitiesProvider } from "./sdk/sdk-runtime-capabilities-service.js";
import { createSdkV1ModelDownloadService } from "./sdk/sdk-model-download-service.js";
import {
  getSdkV1ModelCatalog,
  SdkModelCatalogServiceError
} from "./sdk/sdk-model-catalog-service.js";
import type { UnifiedModel } from "@nodetool-ai/protocol";
import { unifiedModel } from "@nodetool-ai/protocol/api-schemas/models.js";
import { createNodeToolSdkV1PreflightService } from "./sdk/sdk-preflight-service.js";
import { createSdkV1ExecutionTargetReadiness } from "./sdk/sdk-execution-target-readiness.js";
import { SdkLiveRunnerRegistry } from "./sdk/sdk-live-runner-registry.js";
import { createSdkV1Service } from "./sdk/sdk-v1-service.js";
import { createSdkV1ImplementationBoundary } from "./sdk/sdk-v1-handler-map.js";
import { createSdkV1TemporaryAssetService } from "./sdk/sdk-temporary-asset-service.js";
import { getTempAdapter } from "./lib/storage.js";
import { FrontendRendererRegistry } from "./frontend-renderer-registry.js";
import workspaceRoutes from "./routes/workspace.js";
import {
  initWorkspaceChangeEvents,
  initWorkspaceStorage
} from "./lib/workflow-workspace.js";
import filesRoutes from "./routes/files.js";
import collectionsRoutes from "./routes/collections.js";
import applicationsRoutes from "./routes/applications.js";
import publicAppRoutes from "./routes/public-apps.js";
import { appDeploymentsEnabled } from "./lib/app-deployment-service.js";
import jsScriptsRoutes from "./routes/js-scripts.js";
import timelineAnimationRoutes from "./routes/timeline-animations.js";
import storyboardsRoutes from "./routes/storyboards.js";
import sandboxModulesRoutes from "./routes/sandbox-modules.js";
import falCreditsRoute from "./routes/fal-credits.js";
import falPricingRoute from "./routes/fal-pricing.js";
import falPricingEstimateRoute from "./routes/fal-pricing-estimate.js";
import kieCreditsRoute from "./routes/kie-credits.js";
import kiePricingRoute from "./routes/kie-pricing.js";
import kieWebhookRoute from "./routes/kie-webhook.js";
import { createIntegrationRoutes } from "./routes/integrations.js";
import { isNonEmptyString, isString } from "./lib/wire-values.js";
import { logTrpcRequestError } from "./trpc/error-logging.js";

/** The Node `process` as Electron extends it. `type` is absent elsewhere. */
type ElectronProcess = typeof process & { readonly type?: string };

// @llamaindex/liteparse bundles a webpack pdf.js whose `isNodeJS` heuristic
// resolves to false inside Electron utilityProcess (process.type === "utility"),
// causing it to take browser-only code paths that reference the global `document`
// and throw `ReferenceError: document is not defined` on parse(). Reporting
// process.type as "browser" — the value Electron's main process uses — flips
// the heuristic back to Node mode so NodeBinaryDataFactory / fs-based asset
// loading is selected. No-op outside Electron.
{
  // Electron adds these two to the Node `process`; on plain Node both reads
  // come back undefined and the check below fails, as it should.
  const electronVersion = process.versions["electron"];
  // SAFETY: `type` is Electron's addition to the Node `process`, so it is
  // declared optional here and reads undefined everywhere else.
  const processType = (process as ElectronProcess).type;
  if (electronVersion && processType && processType !== "browser") {
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

await initTelemetry();
const startupT0 = performance.now();
/**
 * When this process started. A generation row still `running` from before
 * this moment belongs to a process that is gone, and the sweep closes it
 * (docs/media-generation-tracking-design.md § 6.3).
 */
const PROCESS_STARTED_AT = new Date().toISOString();
let stopGenerationReconcileWorker: (() => void) | null = null;
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
  const message = packWebSocketMessage({
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

  // Bookkeeping for media generations: close the rows a restart orphaned, and
  // keep refining estimates into billed amounts while the server runs.
  void sweepInterruptedGenerations(PROCESS_STARTED_AT).catch((err: unknown) => {
    log.warn("Interrupted-generation sweep failed", {
      error: err instanceof Error ? err.message : String(err)
    });
  });
  stopGenerationReconcileWorker = startGenerationReconcileWorker({
    resolveSecret: (key, userId) => getSecret(key, userId)
  });

  const runHistoryCleanup = (): void => {
    void runAutomaticStorageCleanup(LOCAL_USER_ID)
      .then((result) => {
        if (result && result.total > 0) {
          log.info("Cleaned retained workflow and run history", result);
        }
      })
      .catch((error) => {
        log.warn(
          "Automatic history cleanup failed",
          error instanceof Error ? error : new Error(String(error))
        );
      });
    // `/oauth/register` is anonymous and writes a durable row, so the rows it
    // leaves behind need a sweep of their own: a client nobody ever approved
    // is dead weight. One with any grant — active or revoked — is kept.
    void McpOauthClient.gcUnused(UNUSED_OAUTH_CLIENT_TTL_MS)
      .then((deleted) => {
        if (deleted > 0) {
          log.info("Deleted unapproved MCP OAuth clients", { deleted });
        }
      })
      .catch((error) => {
        log.warn(
          "MCP OAuth client cleanup failed",
          error instanceof Error ? error : new Error(String(error))
        );
      });
  };
  runHistoryCleanup();
  const historyCleanupTimer = setInterval(
    runHistoryCleanup,
    6 * 60 * 60 * 1000
  );
  historyCleanupTimer.unref?.();
} catch (err) {
  log.error(
    "Database setup failed",
    err instanceof Error ? err : new Error(String(err))
  );
  process.exit(1);
}

// Persistence for every context this process builds. Each entrance used to
// wire its own, and the ones that forgot produced runs that could not save an
// asset — the same workflow ran from the editor and threw over HTTP. A
// context that wires its own still wins.
setDefaultModelInterfaces(serverModelInterfaces());

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

// User-defined OpenAI-compatible providers for the local user, so a workflow
// run through a headless entrance reaches them without a settings request
// first. Each request re-syncs the caller's own catalog.
try {
  const ids = await syncCustomProviderRegistry(LOCAL_USER_ID);
  if (ids.length > 0) {
    log.info(`Registered custom providers: ${ids.join(", ")}`);
  }
} catch (err) {
  log.warn(
    "Custom provider sync failed (non-fatal)",
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
        return roots.filter((p) => isNonEmptyString(p) && existsSync(p));
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

// The Code node reaches the toolbelt and its `@nodetool-ai/sandbox-nodetool/*`
// imports through the agents package, which it resolves by bare specifier.
// That specifier resolves in a checkout and nowhere in the bundled backend —
// esbuild inlines the workspace packages into server.mjs — so hand it the copy
// this module already holds. Without it, a Code node body in the desktop app
// and in the Docker image runs with an empty `nodetool.capabilities()`.
setCodeNodeAgentsModule(agentsModule);
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
  const loadErrors = localBridge.getLoadErrors?.() ?? [];
  if (loadErrors.length === 0) return;
  log.warn(`Python bridge ${context} with ${loadErrors.length} load error(s)`);
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
// throttling and the best-effort write live in @nodetool-ai/compute so the CLI
// gets the same behaviour; a local stdio bridge emits no "activity", so this is
// inert there.
attachWorkerActivityHeartbeat(pythonBridge, {
  resolveInstanceId: async () =>
    (await workerManager.getActiveWorker())?.id ?? null
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

// The `/mcp` streamable-HTTP mount. Off in production by default: it carries
// the full agent toolbelt for whichever user it binds, so a deployment opts in
// with NODETOOL_ENABLE_MCP=1 and authenticates the agent like any other client.
// The gate is shared with the settings UI, which reports it (see lib/mcp-mount).
const mcpHttpEnabled = isMcpHttpEnabled();

// The `WWW-Authenticate` challenge for an unauthenticated or invalid `/mcp`
// request (docs/mcp-oauth-design.md § "401 challenge") comes from
// `oauth/gate.ts` — the same gate the AS routes use, so the server never
// advertises a discovery flow the AS answers with 404. A server where the
// flow cannot complete answers the plain 401 it always has.

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

const serverOptions = {
  // Only trust X-Forwarded-For from explicitly configured proxies. With no
  // proxies configured this is `false`, so req.ip is the unspoofable socket
  // peer address.
  trustProxy: trustedProxies.length > 0 ? trustedProxies : false,
  bodyLimit: 100 * 1024 * 1024, // 100 MB
  logger: false,
  // tRPC's httpBatchLink encodes all batched procedure names into a single
  // URL path segment joined with commas (e.g. `/trpc/foo,bar,baz`). Fastify's
  // default `maxParamLength` of 100 rejects larger batches with a 404, and 2000
  // was not enough either: one model-picker mount produced a ~2900 char path.
  // The clients cap a batch at 20 procedures (`maxItems`); this is the backstop.
  routerOptions: {
    ignoreTrailingSlash: true,
    maxParamLength: 8000
  },
  genReqId: (req: {
    headers: Record<string, string | string[] | undefined>;
  }) => {
    return (req.headers["x-request-id"] as string) || crypto.randomUUID();
  }
};

const app: FastifyInstance = (
  Fastify as (...args: unknown[]) => FastifyInstance
)(httpsOptions ? { https: httpsOptions, ...serverOptions } : serverOptions);

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

  // Baseline security response headers. The web app's CSP lives in a `<meta>`
  // tag, which browsers ignore for `frame-ancestors` — that directive is only
  // honoured in a header, so clickjacking protection has to be set here.
  //
  // `/api/storage/*` is exempt: those bytes are designed to be embedded from
  // other origins (MCP App iframes, the Electron renderer, external preview
  // clients — see storage-api.ts), and the endpoint deliberately serves
  // unknown extensions as `application/octet-stream` for `<img>`/`<video>` to
  // sniff. Both `nosniff` and the frame headers would break that contract.
  const path = request.url.split("?")[0] ?? "/";
  if (!path.startsWith("/api/storage/")) {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "SAMEORIGIN");
    reply.header("Content-Security-Policy", "frame-ancestors 'self'");
  }
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

// CORS must be registered before hooks that can short-circuit. Auth failures
// and rate-limit responses still need ACAO for first-party web deployments.
await app.register(fastifyCors, { origin: corsOriginDelegate });

// ---------------------------------------------------------------------------
// Per-IP HTTP rate limiting
// ---------------------------------------------------------------------------
// Registered before the auth hook so floods are rejected with 429 before any
// token verification work. Localhost is exempt; tune via NODETOOL_RATE_LIMIT_*.
const httpRateLimit = getHttpRateLimitConfig();
// Always register so every request path (including the auth hook) shares one
// limiter. When disabled via env, use a cap large enough to be inert in
// practice while keeping CodeQL/static setup able to see the plugin.
const httpRateLimitMax = httpRateLimit.enabled
  ? httpRateLimit.max
  : Number.MAX_SAFE_INTEGER;
await app.register(fastifyRateLimit, {
  global: true,
  max: httpRateLimitMax,
  timeWindow: httpRateLimit.timeWindow,
  keyGenerator: (req) => rateLimitKey(req, httpRateLimit.trustProxy),
  allowList: (req) =>
    isRateLimitExempt(rateLimitKey(req, httpRateLimit.trustProxy))
});
log.info(
  httpRateLimit.enabled
    ? "Per-IP HTTP rate limiting enabled"
    : "Per-IP HTTP rate limiting disabled (limiter registered with no practical cap)",
  {
    max: httpRateLimitMax,
    timeWindowMs: httpRateLimit.timeWindow,
    trustProxy: httpRateLimit.trustProxy
  }
);

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

// A server that enforces auth but never got an anon key serves a healthy
// /health and a well-formed /api/config while no user can log in. Say so at
// boot, where an operator reading the deploy log will see it.
const missingAnonKey = describeMissingAnonKey();
if (missingAnonKey) {
  log.error(missingAnonKey);
}

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

// Source networks trusted to run as the local user "1" without a token. Needed
// for containerized self-hosting: Docker NATs a published-port connection to
// the bridge gateway (e.g. 172.17.0.1), so it never arrives from loopback and
// the isLoopbackAddress bypass can't fire. Honored ONLY in Local mode — when
// auth is enforced a CIDR must never bypass a real login, so the list is empty.
const trustLocalNetworks = enforceAuth
  ? []
  : parseTrustedLocalNetworks(process.env["NODETOOL_TRUST_LOCAL_NETWORKS"]);

if (enforceAuth && process.env["NODETOOL_TRUST_LOCAL_NETWORKS"]) {
  log.warn(
    "NODETOOL_TRUST_LOCAL_NETWORKS is set while auth is enforced (Supabase " +
      "mode); it is ignored so every request must present a valid token."
  );
} else if (trustLocalNetworks.length > 0) {
  log.warn(
    `Local mode: trusting connections from ${trustLocalNetworks.join(", ")} ` +
      'as user "1" without authentication. Only expose this instance to ' +
      "networks you trust."
  );
}

// Messaging integrations (Telegram, later Discord). The service token is what
// enables the surface: without it there are no integration routes and no
// delegated tokens to verify.
const integrationServiceToken = process.env["NODETOOL_INTEGRATION_TOKEN"];
const integrationsEnabled = Boolean(
  integrationServiceToken && integrationServiceToken.length >= 16
);
if (integrationServiceToken && !integrationsEnabled) {
  log.warn(
    "NODETOOL_INTEGRATION_TOKEN is shorter than 16 characters and was " +
      "ignored; the /api/integrations routes are not registered."
  );
}

// Delegated tokens are signed with a key derived from the master key, so
// rotating the master key revokes every outstanding one. Derived lazily: a
// server that never mints one never reads the key.
let cachedDelegatedKey: Buffer | null = null;
const delegatedSigningKey = (): Buffer =>
  (cachedDelegatedKey ??= deriveKey(
    getMasterKey(),
    "nodetool-delegated-token"
  ));

const delegatedProvider = integrationsEnabled
  ? new DelegatedTokenProvider(delegatedSigningKey)
  : null;

// A deployed mini app's run sessions are signed with their own key, derived
// from the same master key under a different label. Rotating the master key
// invalidates every outstanding session; a distinct label keeps a session
// token from ever verifying as a delegated one, or the reverse.
let cachedAppSessionKey: Buffer | null = null;
const appSessionSigningKey = (): Buffer =>
  (cachedAppSessionKey ??= deriveKey(getMasterKey(), "nodetool-app-session"));

// Public app deployments exist only in production; outside it the routes are
// still registered and every handler refuses, so the surface is decided by one
// predicate at request time rather than by boot order.
const appSessionProvider = new AppSessionTokenProvider(appSessionSigningKey);

app.decorateRequest("userId", null);
app.decorateRequest("authToken", null);
app.decorateRequest("appSession", null);

// Global @fastify/rate-limit (registered above) runs before this hook on every
// request, including public auth exemptions handled by isPublicAuthExemptRoute.
// CodeQL js/missing-rate-limiting does not attribute a global Fastify plugin to
// a hook handler, so it would read this as unlimited. It ships in
// security-extended, which our default-setup code scanning does not run, so it
// never fires here. Nothing excludes it either: default setup reads no config
// file, so suppressing an alert means dismissing it in the Security UI.
app.addHook("onRequest", async (req, reply) => {
  // Let CORS preflight through — the @fastify/cors plugin handles OPTIONS responses
  if (req.method === "OPTIONS") return;

  // Public routes — no auth required (still rate-limited globally above).
  const pathname = req.url.split("?")[0];
  if (
    isPublicAuthExemptRoute(pathname, req.method) ||
    (isSdkV1DiscoveryRequest(pathname, req.method) &&
      !isSdkV1AuthenticationRequired(process.env, enforceAuth))
  ) {
    return;
  }

  // Static frontend assets don't require auth (served by fastifyStatic)
  // `GET /mcp` is the MCP SSE stream, not a static asset — it must go through
  // auth so the mount can bind the session's user.
  if (
    hasStaticApp &&
    req.method === "GET" &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/ws") &&
    !pathname.startsWith("/v1") &&
    !pathname.startsWith("/trpc") &&
    !pathname.startsWith("/mcp")
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
  // auth is enforced). Docker's bridge NAT means the peer is the gateway rather
  // than loopback, so NODETOOL_TRUST_LOCAL_NETWORKS additionally trusts that
  // source range (Local mode only).
  if (
    (trustLocalhost && isLoopbackAddress(clientIp)) ||
    isTrustedLocalAddress(clientIp, trustLocalNetworks)
  ) {
    req.userId = "1";
    return;
  }

  // Extract token from the appropriate source
  const isWs = isWebSocketUpgrade(req);
  const searchParams = new URLSearchParams(req.url.split("?")[1] ?? "");
  const provider = supabaseProvider ?? localProvider!;
  const token = isWs
    ? provider.extractTokenFromWs(
        req.headers as Record<string, string>,
        searchParams
      )
    : provider.extractTokenFromHeaders(req.headers as Record<string, string>);

  // MCP OAuth access tokens (`nta_`) authorize `/mcp` ONLY — the audience
  // binding is structural, not claim-parsing (docs/mcp-oauth-design.md §
  // "Token model and storage"). A valid token whose stored `resource` no
  // longer matches this deployment's canonical `/mcp` URI (the server was
  // rehosted since it was minted) or that is presented outside `/mcp` is
  // denied with `invalid_token`, never silently ignored — falling through to
  // the `ntk_`/session checks below would let an audience-scoped credential
  // be probed against the rest of the API.
  if (token && token.startsWith(MCP_OAUTH_ACCESS_TOKEN_PREFIX)) {
    const decision = await authenticateMcpAccessToken(
      token,
      req.url.split("?")[0] ?? "/"
    );
    if (decision.ok) {
      req.userId = decision.userId;
      req.authToken = token;
      return;
    }
    denyUnauthorized(
      req,
      reply,
      { error: "invalid_token" },
      decision.challenge
    );
    return;
  }

  // Access tokens (`ntk_`) are the credential a person mints in the app and
  // pastes into an MCP client's config. They authenticate in every auth mode,
  // including local: a self-hoster exposing /mcp beyond loopback should be
  // able to hand out a revocable per-agent token rather than widen
  // NODETOOL_TRUST_LOCAL_NETWORKS. A token that fails here falls through, so
  // an expired or revoked one is refused by the mode's own rules.
  if (token && isAccessToken(token)) {
    const accessToken = await AccessToken.verify(token);
    if (accessToken) {
      req.userId = accessToken.user_id;
      req.authToken = token;
      void accessToken.touch().catch(() => {
        // last_used_at is a convenience for the revoke UI; a failed write
        // must not fail the request it was recording.
      });
      return;
    }
  }

  // A deployed mini app's session token (`nda_`) authenticates a visitor who
  // has the app's hidden URL. It carries the owner's user id *and* the one
  // application it may act on, and its whole point is that it reaches nothing
  // else — so the confinement is applied right here, at the door, rather than
  // trusted to every handler downstream. `/ws` is the only path it opens: the
  // run transport, and exactly that path — `/ws/download` and `/ws/extension`
  // are model downloads and the browser-extension bridge, neither of which a
  // visitor to somebody's app has any business opening. The public app routes
  // need no token at all (they are auth-exempt above), and every other path —
  // tRPC, the REST library, assets, settings — is refused, because the
  // owner's account is not what the visitor was given a link to.
  //
  // A failed verification does *not* fall through to the providers below. An
  // expired or tampered app session must be refused as itself; letting it
  // reach the session check would turn a confined credential into a probe
  // against the rest of the API.
  if (token && isAppSessionToken(token)) {
    const session = await appSessionProvider.verifyToken(token);
    if (
      session.ok &&
      session.applicationId &&
      session.userId &&
      appDeploymentsEnabled() &&
      pathname === "/ws"
    ) {
      req.userId = session.userId;
      req.authToken = token;
      req.appSession = {
        applicationId: session.applicationId,
        version: session.applicationVersion ?? 0
      };
      return;
    }
    denyUnauthorized(req, reply, { error: "Unauthorized" });
    return;
  }

  // Delegated tokens (a messaging bridge acting as the linked user) are
  // checked only when they announce themselves by prefix. Anything else —
  // including a delegated token that is expired or tampered with — falls
  // through to the configured provider, which rejects it.
  if (delegatedProvider && token && isDelegatedToken(token)) {
    const delegated = await delegatedProvider.verifyToken(token);
    if (delegated.ok) {
      req.userId = delegated.userId ?? null;
      req.authToken = token;
      return;
    }
  }

  // /mcp gets a WWW-Authenticate challenge on every unauthenticated/invalid
  // denial below it — but only when the OAuth flow can actually complete
  // (see mcpBearerChallenge). Every other path is unaffected.
  const challenge = pathname.startsWith("/mcp")
    ? mcpBearerChallenge()
    : undefined;

  if (supabaseMode) {
    if (!token) {
      denyUnauthorized(req, reply, { error: "Unauthorized" }, challenge);
      return;
    }
    const result = await supabaseProvider!.verifyToken(token);
    if (!result.ok) {
      denyUnauthorized(
        req,
        reply,
        { error: result.error ?? "Unauthorized" },
        challenge
      );
      return;
    }
    req.userId = result.userId ?? null;
    req.authToken = token;
    return;
  }

  denyUnauthorized(
    req,
    reply,
    { error: "Remote access requires authentication" },
    challenge
  );
});

// Multi-instance only: a handshake asking to resume a run that another machine
// owns is answered with a fly-replay instruction instead of being accepted
// here, so the client reconnects onto the process holding the run's session.
// Registered after the auth hook because it scopes the lookup to req.userId.
// Inert (one env read, no DB) without NODETOOL_INSTANCE_ID / FLY_MACHINE_ID.
app.addHook("onRequest", async (req, reply) => {
  await replayUpgradeToOwner(req, reply);
});

// A machine that is draining takes no new sockets: the handshake is answered
// with 503 rather than accepted, so the client's reconnect backoff carries it
// to a machine that is staying. Its /health is already failing, so the proxy
// normally routes elsewhere before this is reached; this covers the window
// between the drain starting and the next health check.
app.addHook("onRequest", async (req, reply) => {
  if (!isDraining() || !isWebSocketUpgrade(req)) return;
  const path = req.url.split("?")[0] ?? "";
  if (path !== "/ws" && !path.startsWith("/ws/")) return;
  denyDraining(req, reply);
});

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
  log.warn(
    "Examples directory not found — template workflows will be unavailable"
  );
}

// ---------------------------------------------------------------------------
// API options for HTTP route handlers
// ---------------------------------------------------------------------------

const sdkLiveRunnerRegistry = new SdkLiveRunnerRegistry();
const frontendRendererRegistry = new FrontendRendererRegistry();
const resolveExecutionTarget = createSdkV1ExecutionTargetReadiness({
  getActiveWorker: () => workerManager.getActiveWorker()
});

function listRegistryRecommendedModels(): UnifiedModel[] {
  const models: UnifiedModel[] = [];
  for (const metadata of registry.listMetadata()) {
    for (const candidate of metadata.recommended_models ?? []) {
      const parsed = unifiedModel.safeParse(candidate);
      if (parsed.success) {
        models.push({
          ...parsed.data,
          provider:
            parsed.data.provider == null ? undefined : parsed.data.provider
        });
      }
    }
  }
  return models;
}

const sdkModelDownloadService = createSdkV1ModelDownloadService({
  startWorkerDownload: (userId, request, operationId, onProgress) =>
    relayWorkerDownload(
      {
        send: (data) => onProgress(JSON.parse(data) as ModelDownloadUpdate)
      },
      pythonBridge,
      workerManager,
      {
        command: "start_download",
        repo_id: request.repo_id,
        path: request.path ?? null,
        allow_patterns: request.allow_patterns ?? null,
        ignore_patterns: request.ignore_patterns ?? null,
        model_type: request.model_type,
        scope: "worker"
      },
      operationId,
      userId
    ),
  cancelWorkerDownload: (operationId) =>
    pythonBridge.cancelModelDownload(operationId)
});

const apiOptions: SdkV1RouteApiOptions = {
  metadataRoots,
  registry,
  getPythonBridgeReady,
  sdkV1Boundary: createSdkV1ImplementationBoundary(
    createSdkV1Service({
      getCapabilities: createNodeToolSdkV1CapabilitiesProvider({
        nodetoolVersion: getVersion(),
        registry,
        pythonBridge: () => (getPythonBridgeReady() ? "ready" : "starting"),
        profiles: {
          discovery: "available",
          execution: "available",
          preflight: "available",
          model_catalog: "available",
          model_download: "available",
          temporary_asset_upload: "available"
        },
        authModes: enforceAuth ? ["bearer"] : ["trusted_local"],
        assetUriSchemes: ["asset"],
        limits: {
          maxRpcBatch: 100,
          // The initial SDK profile deliberately prefers asset references for
          // media instead of promising an inline payload size.
          maxInlineBytes: 0,
          maxQueuedJobs: 0,
          maxJobEventReplay: 0,
          requestTimeoutSeconds: 30
        }
      }),
      preflightService: createNodeToolSdkV1PreflightService({
        registry,
        getPythonBridgeReady,
        getExecutionTargetReadiness: ({ request, principal }) => {
          const target = request.execution_target;
          if (target?.kind === "runner") {
            const ready = sdkLiveRunnerRegistry.has(
              target.runner_id,
              principal.userId
            );
            return {
              id: target.runner_id,
              name: "Live runner",
              ready,
              message: ready ? null : "Selected live runner is not available."
            };
          }
          return resolveExecutionTarget(target);
        },
        getExecutionCapacitySnapshot: ({ request, principal }) => {
          const target = request.execution_target;
          if (target?.kind !== "runner") {
            throw new Error(
              "Execution capacity requires a selected live runner."
            );
          }
          return sdkLiveRunnerRegistry.getCapacity({
            runnerId: target.runner_id,
            userId: principal.userId,
            workflowId: request.workflow_id,
            concurrent: target.concurrent
          });
        }
      }),
      modelCatalogService: {
        list: (args) =>
          getSdkV1ModelCatalog({
            ...args,
            recommendedModels: listRegistryRecommendedModels(),
            getWorkerModels: async () => {
              const activeWorker = await workerManager?.getActiveWorker();
              if (!activeWorker) {
                throw new SdkModelCatalogServiceError(
                  "No worker is attached to this server."
                );
              }
              if (!pythonBridge.supportsModelManagement()) {
                throw new SdkModelCatalogServiceError(
                  "The attached worker does not support model management."
                );
              }
              const models: UnifiedModel[] = [];
              for (const candidate of await pythonBridge.listCachedModels()) {
                const parsed = unifiedModel.safeParse(candidate);
                if (parsed.success) models.push(parsed.data as UnifiedModel);
              }
              return models;
            }
          })
      },
      modelDownloadService: sdkModelDownloadService,
      temporaryAssetService: createSdkV1TemporaryAssetService({
        getStorage: getTempAdapter
      })
    })
  )
};
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
// The bundled typefaces (D8). Two layouts, checked rather than assumed: the
// packaged backend stages them beside `server.mjs`, a checkout keeps them in
// the timeline package's own `fonts/` directory. `registerBundledFonts` in
// `@nodetool-ai/timeline/fonts/node` resolves the same two for the Node
// rasterizers; this is the copy the HTTP route serves to the browser from.
const _bundledFontsDir = [
  resolve(_serverDir, "fonts"),
  resolve(_serverDir, "..", "..", "..", "packages", "timeline", "fonts")
].find((dir) => existsSync(dir));
if (_bundledFontsDir) {
  apiOptions.bundledFontsDir = _bundledFontsDir;
}

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
    maxBatchSize: TRPC_MAX_BATCH_SIZE,
    onError({ path, error, req }) {
      logTrpcRequestError(log, {
        path,
        error,
        requestId: req.id
      });
    }
  } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"]
});

await app.register(websocketPlugin, {
  registry,
  pythonBridge,
  apiOptions,
  sdkLiveRunnerRegistry,
  frontendRendererRegistry,
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
    const mergeResult = mergePythonBridgeMetadata(registry, meta);
    log.info(
      `Python bridge connected [${startupMs()}] — ${mergeResult.total} Python nodes (${mergeResult.bridgeOnly} bridge-only, ${mergeResult.alreadyKnown} already registered)`
    );
    pythonBridge
      .getWorkerStatus?.()
      ?.then((status) => {
        log.info(`Python bridge status [${startupMs()}]`, {
          protocol_version: status.protocol_version,
          node_count: status.node_count,
          provider_count: status.provider_count,
          namespaces: status.namespaces,
          transport: status.transport,
          max_frame_size: status.max_frame_size,
          load_error_count: status.load_errors.length
        });
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

// One poller for the whole process, not one per connection: it re-reads this
// instance's own running runs so a cancel written on another instance lands
// here. The registry it consults is process-wide.
const stopJobCancelPoller = startJobCancelPoller();

await app.register(healthRoute);
await app.register(configRoute);

// All HTTP API routes receive apiOptions
const routeOpts = { apiOptions };

await app.register(sdkV1Routes, routeOpts);
await app.register(assetsRoutes, routeOpts);
await app.register(timelineFontRoutes, routeOpts);
await app.register(workflowsRoutes, routeOpts);
await app.register(nodesRoutes, routeOpts);
await app.register(storageRoutes, routeOpts);
await app.register(openaiRoutes, routeOpts);
await app.register(oauthRoutes, routeOpts);
// MCP OAuth 2.1 AS + well-known discovery routes (docs/mcp-oauth-design.md).
// Self-contained: registers its own content-type parsers on its own
// encapsulated context, so it is unaffected by the raw-buffer parser the
// outer app installs above. 404s every route on its own when the flow is
// unconfigured or NODETOOL_DISABLE_MCP_OAUTH=1 — nothing to gate here.
await app.register(oauthAsRoutes);
await app.register(workspaceRoutes, routeOpts);

// A cloud deployment keeps workspaces in the asset bucket rather than on the
// machine's disk, which it would lose on every replacement. No-op locally.
initWorkspaceStorage();
// The Workspace Explorer has no other way to hear about a file a run wrote:
// workspace files are not database rows.
initWorkspaceChangeEvents();
await app.register(filesRoutes, routeOpts);
await app.register(collectionsRoutes, routeOpts);
await app.register(applicationsRoutes, routeOpts);
await app.register(publicAppRoutes, { appSessionSigningKey });
await app.register(jsScriptsRoutes, routeOpts);
await app.register(timelineAnimationRoutes, routeOpts);
await app.register(storyboardsRoutes, routeOpts);
await app.register(sandboxModulesRoutes);
await app.register(falCreditsRoute);
await app.register(falPricingRoute);
await app.register(falPricingEstimateRoute);
await app.register(kieCreditsRoute);
await app.register(kiePricingRoute);
await app.register(kieWebhookRoute);
// Messaging-integration identity routes (`/api/integrations/:provider/*`).
// The plugin registers nothing unless NODETOOL_INTEGRATION_TOKEN is set, so a
// server without it answers 404 on every one of these paths.
await app.register(
  createIntegrationRoutes({ signingKey: delegatedSigningKey, enforceAuth })
);
// Trigger webhook ingestion (`POST /api/webhooks/:token`). Registered here
// because Fastify routes must exist before `app.listen`; the plugin reaches the
// wakeup service and dispatcher started below through module accessors.
if (triggersEnabled()) {
  await app.register(createTriggerWebhookRoute());
}
// The `/mcp` mount is a bare MCP over-HTTP transport (the configuration
// endpoints moved to the tRPC `mcpConfig` router, which stays local-only). In
// production it registers only with NODETOOL_ENABLE_MCP=1, and it binds the
// user the auth hook resolved rather than the local single user.
if (mcpHttpEnabled) {
  app.all("/mcp", async (req, reply) => {
    const protocol = httpsOptions ? "https" : "http";
    const url = `${protocol}://${req.headers.host ?? `127.0.0.1:${port}`}${req.url}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(key, item);
        }
      } else if (value != null) {
        headers.set(key, value);
      }
    }

    const requestBody =
      req.method === "GET" || req.method === "DELETE"
        ? undefined
        : Buffer.isBuffer(req.body)
          ? req.body
          : isString(req.body)
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
      ...{ duplex: "half" }
    } as RequestInit);

    // The scope is the user the auth hook resolved for this request. With no
    // user, no scope is passed and mcp-server.ts answers 401 at initialize
    // instead of handing out an anonymous full-access session.
    const response = await handleMcpHttpRequest(request, {
      metadataRoots,
      registry,
      examplesDir: apiOptions.examplesDir,
      frontendRendererRegistry,
      agentToolsScope: req.userId
        ? {
            userId: req.userId,
            source: isProduction ? "http-session" : "local-dev-http"
          }
        : undefined,
      unauthorizedChallenge: mcpBearerChallenge()
    });
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
} else {
  log.info(
    `MCP over HTTP (/mcp) disabled in production; set ${MCP_ENABLE_FLAG}=1 to enable`
  );
}

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
    !pathname.startsWith("/.well-known/") &&
    // /oauth/consent is the one /oauth path that IS the SPA — the MCP OAuth
    // consent page (docs/mcp-oauth-design.md). Every other /oauth/* path is
    // an AS API route (authorize/token/register/revoke), and unmatched
    // requests there must 404 rather than get served index.html.
    (pathname === "/oauth/consent" || !pathname.startsWith("/oauth")) &&
    !pathname.startsWith("/trpc") &&
    !pathname.startsWith("/mcp") &&
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
// Triggers — durable wakeup service, dispatcher, and ingestion adapters
// ---------------------------------------------------------------------------
//
// Starting the dispatcher also drains the boot backlog: every unprocessed
// `trigger_inputs` row a previous process life stored is dispatched now. Set
// NODETOOL_DISABLE_TRIGGERS=1 to opt this process out.

const triggerServices = startTriggerServices({ registry });

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

/**
 * How long SIGTERM waits for aborted turns and runs to settle. Under Fly's
 * 300 s cap between the signal and the kill; the drain the deploy script runs
 * first is what actually waits for a long turn, so this is the fallback for a
 * restart nobody drained.
 */
function shutdownGraceMs(): number {
  const raw = process.env["NODETOOL_SHUTDOWN_GRACE_MS"];
  if (!raw) return 240_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 240_000;
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  // The wait below can last minutes; a second signal in that window must not
  // run the teardown a second time on top of the first.
  if (shuttingDown) {
    log.info(`${signal} received again — shutdown already in progress`);
    return;
  }
  shuttingDown = true;
  log.info(`${signal} received — shutting down`);
  // Take no new work first, so nothing starts during the wait below.
  startDrain();
  const abortedTurns = chatTurnRegistry.abortAll("shutdown");
  const cancelledJobs = jobRunRegistry.cancelAll();
  if (abortedTurns > 0 || cancelledJobs > 0) {
    log.info("Aborting in-flight work", {
      turns: abortedTurns,
      jobs: cancelledJobs
    });
  }
  const grace = shutdownGraceMs();
  const [turnsDrained, jobsDrained] = await Promise.all([
    chatTurnRegistry.drained(grace),
    jobRunRegistry.drained(grace)
  ]);
  if (!turnsDrained || !jobsDrained) {
    // The turn's own `finally` writes the stand-in tool-result rows, so a
    // turn still running here is one whose transcript stays incomplete.
    log.warn("Shutdown grace expired with work still running", {
      graceMs: grace,
      turns: chatTurnRegistry.runningCount(),
      jobs: jobRunRegistry.runningCount()
    });
  }
  // Spans are batched, so without this every span the last turns produced dies
  // with the process.
  await shutdownTelemetry();
  log.info("Closing Python bridge");
  stopReaper();
  stopJobCancelPoller();
  stopGenerationReconcileWorker?.();
  try {
    await triggerServices.stop();
  } catch (err) {
    log.warn(
      "Trigger services failed to stop cleanly",
      err instanceof Error ? err : new Error(String(err))
    );
  }
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

// The deploy's drain signal: stop taking work and let the turns in flight
// finish, without a deadline. `scripts/fly-rolling-deploy.sh` sends it, waits
// for /health to report no turns and no jobs, and only then replaces the
// machine — which is what keeps a 30-minute turn off Fly's 300 s SIGTERM cap.
process.on("SIGUSR2", () => {
  log.info("SIGUSR2 received — draining");
  startDrain();
});

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
      const mergeResult = mergePythonBridgeMetadata(registry, meta);
      log.info(
        `Python bridge connected [${startupMs()}] — ${mergeResult.total} Python nodes (${mergeResult.bridgeOnly} bridge-only, ${mergeResult.alreadyKnown} already registered)`
      );
      pythonBridge
        .getWorkerStatus?.()
        ?.then((status) => {
          log.info(`Python bridge status [${startupMs()}]`, {
            protocol_version: status.protocol_version,
            node_count: status.node_count,
            provider_count: status.provider_count,
            namespaces: status.namespaces,
            transport: status.transport,
            max_frame_size: status.max_frame_size,
            load_error_count: status.load_errors.length
          });
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
  const pythonAllowedInProduction =
    process.env["NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION"] === "1";
  log.info(
    isProduction && !pythonAllowedInProduction
      ? "Python bridge disabled in production — Python nodes will not be available; set NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1 to enable (the image ships no Python worker: install nodetool-core and point NODETOOL_PYTHON at that interpreter)"
      : "Python not found — Python nodes will not be available"
  );
}
