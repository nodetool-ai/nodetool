/**
 * `nodetool app build` as a server capability — the engine behind
 * `POST /api/applications/build` and the `build_app` agent tool.
 *
 * The build itself is `buildApp` from `@nodetool-ai/agents`, unchanged: this
 * module only supplies the four things the orchestrator cannot get for itself
 * on a server — a provider, the node registry, a kernel runner for the Run
 * stage, and a workflow loader for operations that bind an existing workflow.
 *
 * A build runs for minutes, so it is fronted by the same session registry an
 * interactive debug run uses (`debug-sessions.ts`): `poll: true` returns a
 * session id immediately and the caller reads
 * `GET /api/debug/sessions/:id` until it settles, or cancels with
 * `POST /api/debug/sessions/:id/cancel`. A build parks no escalations, so its
 * session only ever reports `running` or `done`.
 *
 * The report carries the bundle; nothing here installs it. Turning a green
 * build into an application is the caller's next call, to the normal
 * `POST /api/applications/import-bundle`.
 */

import { randomUUID } from "node:crypto";
import { createLogger, getDefaultAssetsPath } from "@nodetool-ai/config";
import {
  buildApp,
  parseBuildSpec,
  DEFAULT_BUILD_COST_CAP_USD,
  type BuildReport,
  type BuildSpec
} from "@nodetool-ai/agents";
import { getSecret, Workflow } from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  FileStorageAdapter,
  ProcessingContext,
  getProvider,
  isProviderConfigured,
  listRegisteredProviderIds,
  type BaseProvider
} from "@nodetool-ai/runtime";
import { createAppServerRunner } from "./app-run-server.js";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import {
  debugSessions,
  InteractiveEscalationHandle,
  type DebugSession
} from "../debug-sessions.js";
import type { HttpApiOptions } from "../http-api.js";

const log = createLogger("nodetool.websocket.app-build");

/** The request body of `POST /api/applications/build`. */
export interface AppBuildRequest {
  /** What to build. Either this or `spec`. */
  prompt?: string;
  /** A pinned `BuildSpec`, skipping the Spec stage. Either this or `prompt`. */
  spec?: unknown;
  provider?: string;
  model?: string;
  /** Workflow ids to pin, in operation declaration order. */
  workflow_ids?: string[];
  max_repairs?: number;
  cost_cap_usd?: number;
  timeout_ms?: number;
  /**
   * Return a session id as soon as the build starts instead of holding the
   * request open for it. The caller then polls the debug-session endpoints.
   */
  poll?: boolean;
}

/**
 * Test seams. Production passes none of these: the provider comes from the
 * user's secrets and the registry from the server's own bootstrap.
 */
export interface AppBuildDeps {
  createProvider?: (providerId: string, userId: string) => Promise<BaseProvider>;
  loadProviders?: (userId: string) => Promise<Record<string, BaseProvider>>;
  registry?: NodeRegistry;
}

let defaultRegistryPromise: Promise<NodeRegistry> | null = null;

async function getDefaultRegistry(): Promise<NodeRegistry> {
  if (!defaultRegistryPromise) {
    defaultRegistryPromise = import("../node-registry-setup.js").then((m) =>
      m.bootstrapNodeRegistry({ log })
    );
  }
  return defaultRegistryPromise;
}

/** Every configured provider, so the planner can pick real models. */
async function loadConfiguredProviders(
  userId: string
): Promise<Record<string, BaseProvider>> {
  const secretFor = (key: string) =>
    getSecret(key, userId).then((v) => v ?? undefined);
  const providers: Record<string, BaseProvider> = {};
  await Promise.all(
    listRegisteredProviderIds().map(async (id) => {
      try {
        if (await isProviderConfigured(id, secretFor)) {
          providers[id] = await getProvider(id, secretFor);
        }
      } catch (err) {
        log.debug("Skipping unconfigured provider for app build", {
          provider: id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    })
  );
  return providers;
}

/** A body number that is a finite positive value, or undefined. */
function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/** A body number that is a non-negative integer, or undefined. */
function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function resolveModel(body: AppBuildRequest): {
  provider: string;
  model: string;
} {
  const provider = body.provider ?? process.env["NODETOOL_APP_BUILD_PROVIDER"];
  const model = body.model ?? process.env["NODETOOL_APP_BUILD_MODEL"];
  if (!provider || !model) {
    throwApiError(
      ApiErrorCode.INVALID_INPUT,
      "An app build needs a provider and a model — pass them in the body, or " +
        "set NODETOOL_APP_BUILD_PROVIDER and NODETOOL_APP_BUILD_MODEL."
    );
  }
  return { provider, model };
}

function resolveSpec(body: AppBuildRequest): BuildSpec | null {
  if (body.spec === undefined) {
    if (!body.prompt || !body.prompt.trim()) {
      throwApiError(
        ApiErrorCode.INVALID_INPUT,
        "An app build needs either a prompt or a spec."
      );
    }
    return null;
  }
  const parsed = parseBuildSpec(body.spec);
  if (!parsed.spec) {
    throwApiError(
      ApiErrorCode.INVALID_INPUT,
      `Invalid spec: ${parsed.issues.map((i) => i.message).join("; ")}`
    );
  }
  return parsed.spec;
}

/** The build's payload while it is still running. */
function runningPayload(
  session: DebugSession,
  buildId: string
): Record<string, unknown> {
  return {
    status: "running",
    session_id: session.id,
    build_id: buildId,
    poll: `GET /api/debug/sessions/${session.id}`,
    cancel: `POST /api/debug/sessions/${session.id}/cancel`
  };
}

/**
 * Start a build. Resolves with the `BuildReport` (plus the session id), or —
 * with `poll: true` — with the session id as soon as the build is under way.
 */
export async function runApplicationBuild(
  userId: string,
  body: AppBuildRequest,
  apiOptions: HttpApiOptions = {},
  deps: AppBuildDeps = {}
): Promise<Record<string, unknown>> {
  const selection = resolveModel(body);
  const spec = resolveSpec(body);
  const buildId = `app-build-${randomUUID()}`;

  const provider = await (deps.createProvider
    ? deps.createProvider(selection.provider, userId)
    : getProvider(selection.provider, (key) =>
        getSecret(key, userId).then((v) => v ?? undefined)
      ));
  const registry =
    deps.registry ?? apiOptions.registry ?? (await getDefaultRegistry());
  const providers = await (deps.loadProviders ?? loadConfiguredProviders)(
    userId
  );

  const context = new ProcessingContext({
    jobId: buildId,
    workflowId: null,
    userId,
    secretResolver: (key: string) => getSecret(key, userId),
    storage: new FileStorageAdapter(getDefaultAssetsPath())
  });

  const controller = new AbortController();
  const logLines: string[] = [];
  const maxRepairs = count(body.max_repairs);
  const timeoutMs = positive(body.timeout_ms);

  // The promise a session fronts must never reject: a rejected build would
  // leave the session parked forever with no report to hand back.
  const done: Promise<Record<string, unknown>> = (async () => {
    try {
      const report = await buildApp({
        ...(spec ? { spec } : { prompt: body.prompt ?? "" }),
        provider,
        model: selection.model,
        context,
        registry,
        providers,
        runOnServer: createAppServerRunner(userId, registry, {
          jobPrefix: "app-build-run"
        }),
        loadWorkflow: async (id: string) => {
          const workflow = await Workflow.find(userId, id);
          const graph = workflow?.getGraph() as
            | {
                nodes: Array<Record<string, unknown>>;
                edges: Array<Record<string, unknown>>;
              }
            | undefined;
          return graph
            ? { graph, ...(workflow?.name ? { name: workflow.name } : {}) }
            : null;
        },
        ...(body.workflow_ids?.length
          ? { pinnedWorkflowIds: body.workflow_ids }
          : {}),
        ...(maxRepairs !== undefined ? { maxRepairs } : {}),
        costCapUsd: positive(body.cost_cap_usd) ?? DEFAULT_BUILD_COST_CAP_USD,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        signal: controller.signal,
        buildId,
        ledger: { userId },
        onLog: (line) => {
          logLines.push(line.trimEnd());
        }
      });
      return buildPayload(report, buildId, logLines);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("app build failed outside the report", { buildId, message });
      return {
        build_id: buildId,
        status: "failed",
        error: message,
        verdict: { ok: false, reason: message, notSimulated: [] },
        log: logLines
      };
    }
  })();

  const session = debugSessions.create({
    userId,
    workflowId: null,
    jobId: buildId,
    handle: new InteractiveEscalationHandle(),
    done,
    cancel: () => controller.abort()
  });

  if (body.poll === true) return runningPayload(session, buildId);
  return { ...(await done), session_id: session.id };
}

/** The report as the HTTP surface and the tool see it. */
function buildPayload(
  report: BuildReport,
  buildId: string,
  logLines: string[]
): Record<string, unknown> {
  return {
    build_id: buildId,
    status: report.verdict.ok ? "completed" : "failed",
    ...(report as unknown as Record<string, unknown>),
    log: logLines,
    install: report.bundle
      ? "POST /api/applications/import-bundle with {\"bundle\": <report.bundle>} to install this app."
      : null
  };
}
