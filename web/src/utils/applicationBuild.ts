/**
 * Client for the app build endpoint:
 *   POST /api/applications/build     → start a build (`poll: true` answers a session id)
 *   GET  /api/debug/sessions/:id     → the build's state, then its report
 *   POST /api/debug/sessions/:id/cancel
 *
 * A build turns a description into an app bundle (the screen plus the
 * workflows its buttons run), test-runs it, and installs nothing. A green
 * report's bundle goes to `POST /api/applications/import-bundle`, through
 * `installApplicationBundle` in `applicationBundle.ts`.
 */
import { restFetch } from "../lib/rest-fetch";
import { isObjectLike } from "./typePredicates";

export interface ApplicationBuildRequest {
  prompt: string;
  provider: string;
  model: string;
  signal?: AbortSignal;
  /** Milliseconds between polls. */
  pollMs?: number;
}

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
 * Build an app from a description and wait for the report. Resolves with the
 * bundle of a green build and rejects with the reason otherwise. Aborting the
 * signal cancels the build on the server.
 */
export async function buildApplication({
  prompt,
  provider,
  model,
  signal,
  pollMs = DEFAULT_POLL_MS
}: ApplicationBuildRequest): Promise<ApplicationBuildResult> {
  const started = await restFetch("/api/applications/build", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, provider, model, poll: true }),
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
      if (report["status"] === "running") {
        continue;
      }
      const verdict = report["verdict"];
      const ok = isObjectLike(verdict) && verdict["ok"] === true;
      if (!ok || !report["bundle"]) {
        throw new Error(failureReason(report));
      }
      return { bundle: report["bundle"], name: bundleName(report["bundle"]) };
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
