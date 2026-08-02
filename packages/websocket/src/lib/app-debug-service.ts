/**
 * `nodetool app debug` as a server capability — the engine behind
 * `POST /api/applications/debug`.
 *
 * The simulation itself is `simulateApp` from `@nodetool-ai/execution`,
 * unchanged: this module supplies the three things it cannot get for itself on
 * a server — the target (an application row, or the document the caller posted
 * inline), the workflow loader its operations resolve against, and a kernel
 * runner for the runs.
 *
 * The inline `document` path is the one that matters for an editor assistant.
 * A draft lives in the browser until the user saves, so anything keyed on
 * `application_id` grades a stale row — a verdict that lies exactly when the
 * assistant is mid-edit. Posting the document verbatim grades what the
 * assistant is actually holding.
 *
 * A run with `run: true` executes real workflows, so it can take minutes:
 * `poll: true` fronts it with the same session registry a build uses
 * (`debug-sessions.ts`). A simulation parks no escalations, so its session only
 * ever reports `running` or `done`.
 */

import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import {
  applicationTarget,
  inlineDocumentTarget,
  simulateApp,
  summarizeAppReport,
  type AppDebugReport,
  type AppWorkflowRecord,
  type InteractionStep,
  type ResolvedAppTarget
} from "@nodetool-ai/execution/app-debug";
import { Application, Workflow } from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { ApiErrorCode } from "../error-codes.js";
import { throwApiError } from "../trpc/error-formatter.js";
import {
  debugSessions,
  InteractiveEscalationHandle,
  type DebugSession
} from "../debug-sessions.js";
import type { HttpApiOptions } from "../http-api.js";
import { createAppServerRunner } from "./app-run-server.js";

const log = createLogger("nodetool.websocket.app-debug");

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
    throwApiError(
      ApiErrorCode.INVALID_INPUT,
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
      throwApiError(ApiErrorCode.NOT_FOUND, `No application found: ${id}`);
    }
    return applicationTarget(id, application, loadFromDb);
  }
  if (hasDocument) {
    return inlineDocumentTarget(body.document, loadFromDb);
  }
  return throwApiError(
    ApiErrorCode.INVALID_INPUT,
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
  apiOptions: HttpApiOptions = {},
  deps: AppDebugDeps = {}
): Promise<Record<string, unknown>> {
  const debugId = `app-debug-${randomUUID()}`;
  const resolved = await resolveTarget(userId, body, deps);
  const registry =
    deps.registry ?? apiOptions.registry ?? (await getDefaultRegistry());
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
      const report = await simulateApp(
        resolved,
        {
          ...(body.params ? { params: body.params } : {}),
          ...(body.interact ? { interact: body.interact } : {}),
          ...(body.run !== undefined ? { run: body.run } : {}),
          ...(timeoutMs !== undefined ? { timeoutMs } : {})
        },
        {
          loadFromDb: (id: string) =>
            (deps.loadWorkflow ?? loadUserWorkflow)(userId, id),
          runOnServer: createAppServerRunner(userId, registry, {
            jobPrefix: "app-debug-run"
          })
        }
      );
      return debugPayload(report, debugId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("app debug failed outside the report", { debugId, message });
      return {
        debug_id: debugId,
        status: "failed",
        error: message,
        verdict: { ok: false, headline: message, issues: [message], warnings: [] }
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
