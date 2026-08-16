/**
 * `nodetool app build` as a callable service — the engine behind
 * `POST /api/applications/build`.
 *
 * The build itself is `buildApp`, unchanged: this module only supplies the four
 * things the orchestrator cannot get for itself — a provider, the node
 * registry, a kernel runner for the Run stage, and a workflow loader for
 * operations that bind an existing workflow.
 *
 * It lives in this package rather than in `websocket` because `buildApp` does,
 * and `packages/agents` cannot import upward. The server keeps only the route
 * and the error mapping.
 *
 * A build runs for minutes, so it is fronted by the same session registry an
 * interactive debug run uses (`@nodetool-ai/execution/service`): `poll: true`
 * returns a session id immediately and the caller reads
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
  AppServiceError,
  createAppServerRunner,
  debugSessions,
  InteractiveEscalationHandle,
  type DebugSession
} from "@nodetool-ai/execution/service";
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
import {
  buildApp,
  DEFAULT_BUILD_COST_CAP_USD,
  type BuildAppOptions
} from "./build.js";
import { parseBuildSpec } from "./spec.js";
import { resolveJudgeModelSpec } from "./judge.js";
import type { BuildReport, BuildSpec } from "./types.js";

const log = createLogger("nodetool.agents.app-build-service");

/** The request body of `POST /api/applications/build`. */
export interface AppBuildRequest {
  /** What to build. Either this or `spec`. */
  prompt?: string;
  /** A pinned `BuildSpec`, skipping the Spec stage. Either this or `prompt`. */
  spec?: unknown;
  provider?: string;
  model?: string;
  /**
   * `provider/model` (or a bare model id on the builder's provider) for the
   * Judge stage. Omitted ⇒ an independent default from the configured
   * providers, so a build is not graded by the model that authored it.
   */
  judge_model?: string;
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
 * user's secrets and the registry from the host's own bootstrap.
 */
export interface AppBuildDeps {
  createProvider?: (
    providerId: string,
    userId: string
  ) => Promise<BaseProvider>;
  loadProviders?: (userId: string) => Promise<Record<string, BaseProvider>>;
  registry?: NodeRegistry;
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

/**
 * A body number that is a finite positive value. Absent stays absent — a
 * present-but-invalid one is rejected rather than replaced by a default, since
 * `cost_cap_usd: 0` silently becoming $2 spends money the caller said not to.
 */
function positive(field: string, value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new AppServiceError(
      "invalid_input",
      `${field} must be a positive number.`
    );
  }
  return value;
}

/** A body number that is a non-negative integer. Present-but-invalid is an error. */
function count(field: string, value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AppServiceError(
      "invalid_input",
      `${field} must be a non-negative integer.`
    );
  }
  return value;
}

function resolveModel(body: AppBuildRequest) {
  const provider = body.provider ?? process.env["NODETOOL_APP_BUILD_PROVIDER"];
  const model = body.model ?? process.env["NODETOOL_APP_BUILD_MODEL"];
  if (!provider || !model) {
    throw new AppServiceError(
      "invalid_input",
      "An app build needs a provider and a model — pass them in the body, or " +
        "set NODETOOL_APP_BUILD_PROVIDER and NODETOOL_APP_BUILD_MODEL."
    );
  }
  return { provider, model };
}

/**
 * Which model judges the build. The same resolution the CLI runs: an explicit
 * `judge_model` wins, then `NODETOOL_APP_JUDGE_MODEL`, then the best candidate
 * among the configured providers that is not what the builder used. A model
 * grading its own work is the weakest reviewer available.
 */
function resolveJudge(init: {
  builder: BaseProvider;
  builderModel: string;
  explicit?: string;
  providers: Record<string, BaseProvider>;
}) {
  const spec: Parameters<typeof resolveJudgeModelSpec>[0] = {
    builderProviderId: init.builder.provider,
    builderModel: init.builderModel,
    isAvailable: (id: string) =>
      id === init.builder.provider || id in init.providers
  };
  if (init.explicit !== undefined) spec.explicit = init.explicit;
  const resolution = resolveJudgeModelSpec(spec);
  const provider =
    resolution.providerId === init.builder.provider
      ? init.builder
      : init.providers[resolution.providerId];
  if (!provider) {
    if (init.explicit) {
      throw new AppServiceError(
        "invalid_input",
        `judge_model names provider "${resolution.providerId}", which is not configured.`
      );
    }
    return { provider: init.builder, model: init.builderModel };
  }
  return { provider, model: resolution.model };
}

function resolveSpec(body: AppBuildRequest): BuildSpec | null {
  if (body.spec === undefined) {
    if (!body.prompt || !body.prompt.trim()) {
      throw new AppServiceError(
        "invalid_input",
        "An app build needs either a prompt or a spec."
      );
    }
    return null;
  }
  const parsed = parseBuildSpec(body.spec);
  if (!parsed.spec) {
    throw new AppServiceError(
      "invalid_input",
      `Invalid spec: ${parsed.issues.map((i) => i.message).join("; ")}`
    );
  }
  return parsed.spec;
}

/** The build's payload while it is still running. */
function runningPayload(
  session: DebugSession,
  buildId: string
) {
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
  defaultRegistry: NodeRegistry,
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
  const registry = deps.registry ?? defaultRegistry;
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
  const maxRepairs = count("max_repairs", body.max_repairs);
  const timeoutMs = positive("timeout_ms", body.timeout_ms);
  const costCapUsd = positive("cost_cap_usd", body.cost_cap_usd);
  const judgeInit: Parameters<typeof resolveJudge>[0] = {
    builder: provider,
    builderModel: selection.model,
    providers
  };
  if (body.judge_model) judgeInit.explicit = body.judge_model;
  const judge = resolveJudge(judgeInit);

  // The promise a session fronts must never reject: a rejected build would
  // leave the session parked forever with no report to hand back.
  const done: Promise<Record<string, unknown>> = (async () => {
    try {
      const buildOptions: BuildAppOptions = {
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
          if (!graph) return null;
          return workflow?.name ? { graph, name: workflow.name } : { graph };
        },
        judge: { provider: judge.provider, model: judge.model },
        costCapUsd: costCapUsd ?? DEFAULT_BUILD_COST_CAP_USD,
        signal: controller.signal,
        buildId,
        ledger: { userId },
        onLog: (line) => {
          logLines.push(line.trimEnd());
        }
      };
      if (spec) {
        buildOptions.spec = spec;
      } else {
        buildOptions.prompt = body.prompt ?? "";
      }
      if (body.workflow_ids?.length) {
        buildOptions.pinnedWorkflowIds = body.workflow_ids;
      }
      if (maxRepairs !== undefined) buildOptions.maxRepairs = maxRepairs;
      if (timeoutMs !== undefined) buildOptions.timeoutMs = timeoutMs;

      const report = await buildApp(buildOptions);
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
) {
  return {
    build_id: buildId,
    status: report.verdict.ok ? "completed" : "failed",
    ...report,
    log: logLines,
    install: report.bundle
      ? 'POST /api/applications/import-bundle with {"bundle": <report.bundle>} to install this app.'
      : null
  };
}
