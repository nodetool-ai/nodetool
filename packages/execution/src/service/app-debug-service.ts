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
import { createLogger } from "@nodetool-ai/config";
import {
  Application,
  Workflow,
  createJsScriptResolver
} from "@nodetool-ai/models";
import type { JsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { JsScriptOperationRunner } from "../app-debug/script-operation.js";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  applicationTarget,
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
    id: string
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
  id: string
): Promise<AppWorkflowRecord | null> {
  const workflow = await Workflow.find(userId, id);
  const graph = workflow?.getGraph() as AppWorkflowRecord["graph"] | undefined;
  return graph ? { graph } : null;
}

/** An application the user owns, with its document still unparsed. */
async function loadUserApplication(
  userId: string,
  id: string
): Promise<{ id: string; name: string; document: unknown } | null> {
  const application = await Application.findById(id);
  if (!application || application.user_id !== userId) return null;
  return {
    id: application.id,
    name: application.name,
    document: application.document
  };
}

/** A body number that is a finite positive value, or undefined. */
function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/** The simulation's payload while it is still running. */
function runningPayload(
  session: DebugSession,
  debugId: string
): Record<string, unknown> {
  return {
    status: "running",
    session_id: session.id,
    debug_id: debugId,
    poll: `GET /api/debug/sessions/${session.id}`,
    cancel: `POST /api/debug/sessions/${session.id}/cancel`
  };
}

/** The compacted report as the HTTP surface and the tool see it. */
function debugPayload(
  report: AppDebugReport,
  debugId: string
): Record<string, unknown> {
  return {
    debug_id: debugId,
    status: report.verdict.ok ? "completed" : "failed",
    ...(summarizeAppReport(report) as unknown as Record<string, unknown>)
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
  const hasId = typeof body.application_id === "string" && body.application_id;
  const hasDocument = body.document !== undefined && body.document !== null;
  if (hasId && hasDocument) {
    throw new AppServiceError(
      "invalid_input",
      "Pass either application_id or document, not both — a saved row and a " +
        "live draft are different apps the moment the draft changes."
    );
  }
  const loadFromDb = (id: string): Promise<AppWorkflowRecord | null> =>
    (deps.loadWorkflow ?? loadUserWorkflow)(userId, id);

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

  // Cancelling a simulation settles its session with a failed report; the runs
  // already in flight finish in the background, since `simulateApp` takes no
  // signal. Nothing they touch is persisted, so a finished orphan run is spend,
  // not state.
  let cancelled: ((payload: Record<string, unknown>) => void) | null = null;
  const abandoned = new Promise<Record<string, unknown>>((resolve) => {
    cancelled = resolve;
  });

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
        loadFromDb: (id: string) =>
          (deps.loadWorkflow ?? loadUserWorkflow)(userId, id),
        runOnServer: createAppServerRunner(userId, registry, {
          jobPrefix: "app-debug-run"
        }),
        loadScript: (scriptId: string, scriptVersion: number) =>
          loadUserJsScript(userId, scriptId, scriptVersion)
      };
      if (deps.runScript) {
        simulateDeps.runScript = deps.runScript;
      }
      const report = await simulateApp(resolved, simulateOptions, simulateDeps);
      return debugPayload(report, debugId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("app debug failed outside the report", { debugId, message });
      return {
        debug_id: debugId,
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

  const done = Promise.race([simulation, abandoned]);

  const session = debugSessions.create({
    userId,
    workflowId: resolved.info.workflowId,
    jobId: debugId,
    handle: new InteractiveEscalationHandle(),
    done,
    cancel: () =>
      cancelled?.({
        debug_id: debugId,
        status: "failed",
        error: "cancelled",
        verdict: {
          ok: false,
          headline: "App debug cancelled before it finished.",
          issues: ["cancelled"],
          warnings: []
        }
      })
  });

  if (body.poll === true) return runningPayload(session, debugId);
  return { ...(await done), session_id: session.id };
}
