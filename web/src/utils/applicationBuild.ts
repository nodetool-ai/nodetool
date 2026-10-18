/**
 * Client for the app build endpoints:
 *   POST /api/applications/spec      → write the spec only (`poll: true` answers a session id)
 *   POST /api/applications/build     → start a build (`poll: true` answers a session id)
 *   GET  /api/debug/sessions/:id     → the run's state, then its report
 *   POST /api/debug/sessions/:id/cancel
 *
 * A spec is what a build is measured against: the operations, the widgets and
 * the interactions that must pass. A build turns a description, or a spec the
 * creator already read, into an app bundle (the screen plus the workflows its
 * buttons run), test-runs it, and installs nothing. A green report's bundle
 * goes to `POST /api/applications/import-bundle`, through
 * `installApplicationBundle` in `applicationBundle.ts`.
 */
import { restFetch } from "../lib/rest-fetch";
import { isObjectLike } from "./typePredicates";

/** One workflow run the app can trigger, as the Spec stage wrote it. */
export interface AppSpecOperation {
  id: string;
  /** What the workflow does, in words a graph planner builds from. */
  objective: string;
  workflowId?: string;
  inputs: { name: string; type: string; example: unknown }[];
  outputs: { name: string; type: string }[];
  streaming: boolean;
}

/** One placed component of the screen. */
export interface AppSpecWidget {
  role: string;
  type: string;
  binding: string;
  label: string;
  container?: string;
  visibleWhen?: string;
}

/** What a user does, and what must then be true. */
export interface AppSpecInteraction {
  name: string;
  steps: unknown[];
  expect: { widget: string; check: string; value?: unknown }[];
}

/**
 * The server's `BuildSpec`, typed as far as the App flow reads it. Unread
 * fields ride through untouched, because the build validates the whole spec.
 */
export interface AppSpec {
  title: string;
  operations: AppSpecOperation[];
  variables: unknown[];
  widgets: AppSpecWidget[];
  interactions: AppSpecInteraction[];
}

export const isAppSpec = (value: unknown): value is AppSpec =>
  isObjectLike(value) &&
  typeof value["title"] === "string" &&
  Array.isArray(value["operations"]) &&
  Array.isArray(value["variables"]) &&
  Array.isArray(value["widgets"]) &&
  Array.isArray(value["interactions"]);

export interface ApplicationSpecRequest {
  prompt: string;
  provider: string;
  model: string;
  signal?: AbortSignal;
  /** Milliseconds between polls. */
  pollMs?: number;
}

export interface ApplicationBuildRequest {
  prompt: string;
  /** A spec the creator read. The build skips its own Spec stage for it. */
  spec?: AppSpec;
  provider: string;
  model: string;
  /** Ceiling on the build's spend. Omitted, the server's default applies. */
  costCapUsd?: number;
  /** Called with each stage a poll of the running build reports. */
  onProgress?: (progress: AppBuildProgress) => void;
  signal?: AbortSignal;
  /** Milliseconds between polls. */
  pollMs?: number;
}

/** A build stage, as the server names it. */
export type AppBuildStage =
  | "spec"
  | "plan"
  | "author"
  | "check"
  | "run"
  | "judge";

/** Where a running build is: its stage, and the repair round (0 first). */
export interface AppBuildProgress {
  stage: AppBuildStage;
  round: number;
}

const BUILD_STAGES: readonly string[] = [
  "spec",
  "plan",
  "author",
  "check",
  "run",
  "judge"
];

const buildProgressOf = (report: Record<string, unknown>): AppBuildProgress | null => {
  const progress = report["progress"];
  if (
    !isObjectLike(progress) ||
    typeof progress["stage"] !== "string" ||
    !BUILD_STAGES.includes(progress["stage"]) ||
    typeof progress["round"] !== "number"
  ) {
    return null;
  }
  return {
    stage: progress["stage"] as AppBuildStage,
    round: progress["round"]
  };
};

export interface ApplicationBuildResult {
  /** The bundle to install. */
  bundle: unknown;
  name: string;
}

const DEFAULT_POLL_MS = 2000;

const errorDetail = (data: unknown, fallback: string): string =>
  isObjectLike(data) && "detail" in data && data.detail
    ? String(data.detail)
    : fallback;

const readJson = async (res: Response): Promise<unknown> =>
  res.json().catch(() => null);

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** Why a finished build was not green, in a sentence. */
const failureReason = (report: Record<string, unknown>): string => {
  const verdict = report["verdict"];
  const reason =
    isObjectLike(verdict) && typeof verdict["reason"] === "string"
      ? verdict["reason"]
      : typeof report["error"] === "string"
        ? report["error"]
        : "";
  return reason
    ? `The app did not pass its test run: ${reason}`
    : "The app did not pass its test run.";
};

const bundleName = (bundle: unknown): string =>
  isObjectLike(bundle) && typeof bundle["name"] === "string" && bundle["name"]
    ? bundle["name"]
    : "New app";

/**
 * Start a polled run on `path` and wait until its session settles. Resolves
 * with the settled report. Aborting the signal cancels the run on the server.
 */
async function runPolled(
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  pollMs: number,
  onRunning?: (report: Record<string, unknown>) => void
): Promise<Record<string, unknown>> {
  const started = await restFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, poll: true }),
    signal
  });
  const startData = await readJson(started);
  if (!started.ok) {
    throw new Error(
      errorDetail(startData, `The build did not start (${started.status}).`)
    );
  }
  const sessionId =
    isObjectLike(startData) && typeof startData["session_id"] === "string"
      ? startData["session_id"]
      : null;
  if (!sessionId) {
    throw new Error("The build did not start: no session was returned.");
  }
  const sessionUrl = `/api/debug/sessions/${encodeURIComponent(sessionId)}`;
  const cancel = () => {
    void restFetch(`${sessionUrl}/cancel`, { method: "POST" }).catch(() => {
      // The build stops on its own budget if the cancel does not land.
    });
  };
  if (signal?.aborted) {
    cancel();
  }
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      await wait(pollMs, signal);
      const res = await restFetch(sessionUrl, { method: "GET", signal });
      const report = await readJson(res);
      if (!res.ok || !isObjectLike(report)) {
        throw new Error(
          errorDetail(report, `The build stopped answering (${res.status}).`)
        );
      }
      if (report["status"] !== "running") {
        return report;
      }
      onRunning?.(report);
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

/**
 * Write the spec for a description and wait for it. Resolves with a valid
 * spec and rejects with the reason the model could not write one.
 */
export async function specifyApplication({
  prompt,
  provider,
  model,
  signal,
  pollMs = DEFAULT_POLL_MS
}: ApplicationSpecRequest): Promise<AppSpec> {
  const report = await runPolled(
    "/api/applications/spec",
    { prompt, provider, model },
    signal,
    pollMs
  );
  if (report["status"] !== "completed" || !isAppSpec(report["spec"])) {
    const reason =
      typeof report["error"] === "string" && report["error"]
        ? report["error"]
        : "no spec came back";
    throw new Error(`The design could not be written: ${reason}`);
  }
  return report["spec"];
}

/**
 * Build an app from a description, or from the spec it was reviewed as, and
 * wait for the report. Resolves with the bundle of a green build and rejects
 * with the reason otherwise. Aborting the signal cancels the build on the
 * server.
 */
export async function buildApplication({
  prompt,
  spec,
  provider,
  model,
  costCapUsd,
  onProgress,
  signal,
  pollMs = DEFAULT_POLL_MS
}: ApplicationBuildRequest): Promise<ApplicationBuildResult> {
  const report = await runPolled(
    "/api/applications/build",
    {
      ...(spec ? { spec } : { prompt }),
      provider,
      model,
      ...(costCapUsd !== undefined && { cost_cap_usd: costCapUsd })
    },
    signal,
    pollMs,
    onProgress
      ? (running) => {
          const progress = buildProgressOf(running);
          if (progress) {
            onProgress(progress);
          }
        }
      : undefined
  );
  const verdict = report["verdict"];
  const ok = isObjectLike(verdict) && verdict["ok"] === true;
  if (!ok || !report["bundle"]) {
    throw new Error(failureReason(report));
  }
  return { bundle: report["bundle"], name: bundleName(report["bundle"]) };
}
