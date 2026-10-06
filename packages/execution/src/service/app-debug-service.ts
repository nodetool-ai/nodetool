/**
 * `nodetool app debug` as a service — the engine behind
 * `POST /api/applications/debug` and the `debug_app` agent tool.
 *
 * The simulation itself is `simulateApp`, unchanged: this module supplies the
 * three things it cannot get for itself — the target (an application row, or
 * the document the caller posted inline), the workflow loader its operations
 * resolve against, and a kernel runner for the runs.
 *
 * The inline `document` path is the one that matters for an editor assistant.
 * A draft lives in the browser until the user saves, so anything keyed on
 * `application_id` grades a stale row — a verdict that lies exactly when the
 * assistant is mid-edit.
 *
 * A run with `run: true` executes real workflows, so it can take minutes:
 * `poll: true` fronts it with the same session registry a build uses. A
 * simulation parks no escalations, so its session only ever reports `running`
 * or `done`.
 */

import { randomUUID } from "node:crypto";
import { createLogger, getDefaultAssetsPath } from "@nodetool-ai/config";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import { parseApplicationBundle } from "@nodetool-ai/app-runtime";
import {
  Application,
  AppRunError,
  Workflow,
  WorkflowVersion,
  getSecret,
  resolveAppInstanceApplicationId,
  createJsScriptResolver
} from "@nodetool-ai/models";
import type { JsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { JsScriptOperationRunner } from "../app-debug/script-operation.js";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { ProcessingContext, type StorageAdapter } from "@nodetool-ai/runtime";
import {
  applicationTarget,
  bundleTarget,
  createAppDebugRunRecording,
  inlineDocumentTarget,
  simulateApp,
  summarizeAppReport
} from "../app-debug/index.js";
import type {
  AppDebugReport,
  AppWorkflowRecord,
  InteractionStep,
  ResolvedAppTarget
} from "../app-debug/index.js";
import { createAppServerRunner } from "./app-run-server.js";
import {
  debugSessions,
  InteractiveEscalationHandle,
  type DebugSession
} from "./debug-sessions.js";
import {
  isNonEmptyString,
  isPositiveFiniteNumber
} from "../predicates.js";

const log = createLogger("nodetool.execution.app-debug");

/**
 * A refusal the caller turns into its own transport error. `code` is the
 * vocabulary the HTTP layer maps onto `ApiErrorCode`; nothing here knows about
 * Fastify or tRPC.
 */
export class AppServiceError extends Error {
  constructor(
    readonly code: "invalid_input" | "not_found",
    message: string
  ) {
    super(message);
    this.name = "AppServiceError";
  }
}

/** The request body of `POST /api/applications/debug`. */
export interface AppDebugRequest {
  /** A saved application, read from the row. Either this or `document`. */
  application_id?: string;
  /** The live draft, verbatim. Either this or `application_id`. */
  document?: unknown;
  /** Reactive values applied before the interactions, keyed by input name. */
  params?: Record<string, unknown>;
  /** The interaction script. Omitted, the app's natural run trigger fires. */
  interact?: InteractionStep[];
  /** Execute workflow runs (default true). false = static wiring check only. */
  run?: boolean;
  /** Per-run timeout, ms. */
  timeout_ms?: number;
  /**
   * Return a session id as soon as the simulation starts instead of holding
   * the request open for it. The caller then polls the debug-session endpoints.
   */
  poll?: boolean;
}

/** Test seams. Production passes none of these. */
export interface AppDebugDeps {
  registry?: NodeRegistry;
  /** Load a workflow's graph by id, scoped to the user. */
  loadWorkflow?: (
    userId: string,
    id: string,
    version?: number
  ) => Promise<AppWorkflowRecord | null>;
  /** Load an application row by id. */
  loadApplication?: (
    userId: string,
    id: string
  ) => Promise<{ id: string; name: string; document: unknown } | null>;
  /**
   * Execute a script operation. Running a sandbox body lives above this
   * package, so a host that wants script operations passes one in; without it
   * such an operation reports as unexecutable instead of being skipped.
   */
  runScript?: JsScriptOperationRunner;
  context?: ProcessingContext;
  scriptRunner?: (context: ProcessingContext, input: Parameters<JsScriptOperationRunner>[0]) => ReturnType<JsScriptOperationRunner>;
  /** The store `asset://<id>` inputs in the app's workflows resolve through. */
  assetStorage?: StorageAdapter | null;
}

/** A pinned script version the user owns, for a script operation. */
async function loadUserJsScript(
  userId: string,
  scriptId: string,
  scriptVersion: number
): Promise<{ name: string; document: JsScriptDocument } | null> {
  const resolved = await createJsScriptResolver().resolve(
    { id: scriptId, version: scriptVersion },
    userId
  );
  return resolved ? { name: resolved.name, document: resolved.document } : null;
}

/** A workflow the user can read, in the shape the simulator wants. */
async function loadUserWorkflow(
  userId: string,
  id: string,
  version?: number
): Promise<AppWorkflowRecord | null> {
  const workflow = await Workflow.find(userId, id);
  if (!workflow) { return null; }
  const pinned = version === undefined ? null : await WorkflowVersion.findByVersion(workflow.id, version);
  if (version !== undefined && (!pinned || pinned.user_id !== workflow.user_id)) { return null; }
  const graph = pinned?.graph ?? workflow.getGraph();
  return graph ? { graph } : null;
}

/** An application the user owns, with its document still unparsed. */
async function loadUserApplication(
  userId: string,
  id: string
): Promise<{ id: string; name: string; document: unknown } | null> {
  let fullId: string;
  try { fullId = await resolveAppInstanceApplicationId(userId, id); }
  catch (error) {
    if (error instanceof AppRunError && error.code === "not_found") { return null; }
    if (error instanceof AppRunError) { throw new AppServiceError("invalid_input", error.message); }
    throw error;
  }
  const application = await Application.findById(fullId);
  if (!application || application.user_id !== userId) return null;
  return {
    id: application.id,
    name: application.name,
    document: application.document
  };
}

/** A body number that is a finite positive value, or undefined. */
function positive(value: number | undefined): number | undefined {
  return isPositiveFiniteNumber(value) ? value : undefined;
}

/** The simulation's payload while it is still running. */
function runningPayload(
  session: DebugSession,
  debugId: string
) {
  return {
    status: "running",
    session_id: session.id,
    debug_id: debugId,
    poll: `GET /api/debug/sessions/${session.id}`,
    cancel: `POST /api/debug/sessions/${session.id}/cancel`
  };
}

/**
 * The compacted report as the HTTP surface and the tool see it. The session
 * fronts an untyped JSON payload, so the summary's own fields are spread
 * through `Object.entries` rather than asserted into a dictionary.
 */
function debugPayload(
  report: AppDebugReport,
  debugId: string
) {
  return {
    debug_id: debugId,
    status: report.verdict.ok ? "completed" : "failed",
    ...Object.fromEntries(Object.entries(summarizeAppReport(report)))
  };
}

/**
 * Resolve the request's target: an application row, or the document it carries.
 * Exactly one of the two, so a caller never has to wonder which one was graded.
 */
async function resolveTarget(
  userId: string,
  body: AppDebugRequest,
  deps: AppDebugDeps
): Promise<ResolvedAppTarget> {
  const hasId = isNonEmptyString(body.application_id);
  const hasDocument = body.document !== undefined && body.document !== null;
  if (hasId && hasDocument) {
    throw new AppServiceError(
      "invalid_input",
      "Pass either application_id or document, not both — a saved row and a " +
        "live draft are different apps the moment the draft changes."
    );
  }
  const loadFromDb = (id: string, version?: number): Promise<AppWorkflowRecord | null> =>
    (deps.loadWorkflow ?? loadUserWorkflow)(userId, id, version);

  if (hasId) {
    const id = body.application_id as string;
    const application = await (deps.loadApplication ?? loadUserApplication)(
      userId,
      id
    );
    if (!application) {
      throw new AppServiceError("not_found", `No application found: ${id}`);
    }
    return applicationTarget(id, application, loadFromDb);
  }
  if (hasDocument) {
    const bundle = parseApplicationBundle(body.document);
    if (bundle) { return bundleTarget(bundle, "inline"); }
    return inlineDocumentTarget(body.document, loadFromDb);
  }
  throw new AppServiceError(
    "invalid_input",
    "An app debug run needs either an application_id or a document."
  );
}

/**
 * Debug an app. Resolves with the compacted report (plus the session id), or —
 * with `poll: true` — with the session id as soon as the run is under way.
 */
export async function runApplicationDebug(
  userId: string,
  body: AppDebugRequest,
  defaultRegistry: NodeRegistry,
  deps: AppDebugDeps = {}
): Promise<Record<string, unknown>> {
  const debugId = `app-debug-${randomUUID()}`;
  const resolved = await resolveTarget(userId, body, deps);
  const registry = deps.registry ?? defaultRegistry;
  const timeoutMs = positive(body.timeout_ms);
  const controller = new AbortController();
  const context = deps.context
    ? deps.context.copy({ jobId: debugId })
    : new ProcessingContext({ userId, jobId: debugId,
      secretResolver: (key) => getSecret(key, userId),
      storage: new FileStorageAdapter(getDefaultAssetsPath()), assetStorage: deps.assetStorage ?? null });
  context.signal = deps.context ? AbortSignal.any([deps.context.signal, controller.signal]) : controller.signal;

  const runIds = new Set<string>();

  // The promise a session fronts must never reject: a rejected run would leave
  // the session parked forever with no report to hand back.
  const simulation: Promise<Record<string, unknown>> = (async () => {
    try {
      const simulateOptions: Parameters<typeof simulateApp>[1] = {};
      if (body.params) {
        simulateOptions.params = body.params;
      }
      if (body.interact) {
        simulateOptions.interact = body.interact;
      }
      if (body.run !== undefined) {
        simulateOptions.run = body.run;
      }
      if (timeoutMs !== undefined) {
        simulateOptions.timeoutMs = timeoutMs;
      }
      const simulateDeps: Parameters<typeof simulateApp>[2] = {
        loadFromDb: (id: string, version?: number) =>
          (deps.loadWorkflow ?? loadUserWorkflow)(userId, id, version),
        runOnServer: createAppServerRunner(userId, registry, {
          jobPrefix: "app-debug-run",
          assetStorage: deps.assetStorage ?? null
        }),
        loadScript: (scriptId: string, scriptVersion: number) =>
          loadUserJsScript(userId, scriptId, scriptVersion)
      };
      const scriptRunner = deps.scriptRunner;
      const runScript = scriptRunner
        ? (input: Parameters<JsScriptOperationRunner>[0]) => scriptRunner(context, input)
        : deps.runScript;
      if (runScript) {
        simulateDeps.runScript = runScript;
      }
      const recording = createAppDebugRunRecording({ userId, target: resolved, registry, context,
        onRunCreated: (id) => { runIds.add(id); },
        loadWorkflow: simulateDeps.loadFromDb, loadScript: simulateDeps.loadScript,
        applicationId: body.application_id,
        runWorkflow: (parent, input) => createAppServerRunner(userId, registry, { context: parent })(input),
        runScript: (parent, input) => {
          if (deps.scriptRunner) { return deps.scriptRunner(parent, input); }
          if (deps.runScript) { return deps.runScript(input); }
          throw new Error("Host does not provide script execution");
        }
      });
      Object.assign(simulateDeps, recording);
      const report = await simulateApp(resolved, simulateOptions, simulateDeps);
      report.run_ids = [...runIds];
      const payload = debugPayload(report, debugId);
      return controller.signal.aborted ? { ...payload, status: "failed", error: "cancelled" } : payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("app debug failed outside the report", { debugId, message });
      return {
        debug_id: debugId,
        run_ids: [...runIds],
        status: "failed",
        error: message,
        verdict: {
          ok: false,
          headline: message,
          issues: [message],
          warnings: []
        }
      };
    }
  })();

  const done = simulation;

  const session = debugSessions.create({
    userId,
    workflowId: resolved.info.workflowId,
    jobId: debugId,
    handle: new InteractiveEscalationHandle(),
    done,
    cancel: () => {
      controller.abort();
    }
  });

  if (body.poll === true) return runningPayload(session, debugId);
  return { ...(await done), session_id: session.id };
}
