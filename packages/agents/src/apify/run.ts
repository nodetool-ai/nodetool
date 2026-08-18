/**
 * Starting an actor, waiting for it, and cancelling it — the part with the
 * money and the clock in it.
 *
 * The lifecycle is start → poll → collect, and each step exists to answer a
 * failure the others cannot. Polling rather than a synchronous run is what
 * makes the run *abortable*: the run id exists from the first response, so a
 * NodeTool cancellation has something concrete to abort on Apify's side rather
 * than merely abandoning an HTTP request while the actor keeps billing.
 *
 * Cancellation is the reason this file is not three inline calls in the
 * capability. When the run signal fires mid-poll, the wait unwinds — but the
 * *actor* is still running on Apify's machines, and something has to send the
 * abort. That cleanup deliberately runs on a fresh, un-aborted path, because
 * the obvious implementation (pass the caller's signal to the abort request)
 * cancels the cleanup with the thing it is cleaning up.
 */

import { setTimeout as delay } from "node:timers/promises";

import type { ProcessingContext } from "@nodetool-ai/runtime";

import {
  ApifyClient,
  isTerminalRunStatus,
  toCanonicalActorId,
  type ApifyRun
} from "./client.js";
import { ApifyError, asApifyError } from "./errors.js";
import {
  assertActorInputUrlsArePublic,
  decideActor,
  type ApifyBudgetLedger,
  type ApifyPolicy
} from "./policy.js";
import type { ApifyProvenance } from "./normalize.js";

/** How often a running actor is polled. */
const POLL_INTERVAL_MS = 2_000;

/** How long the interval grows to for a long run, so a slow actor is cheap. */
const MAX_POLL_INTERVAL_MS = 10_000;

export interface RunActorOptions {
  readonly actorId: string;
  readonly input: Record<string, unknown>;
  /** Wait for the run to settle. False returns as soon as it is accepted. */
  readonly waitForFinish?: boolean;
  /** Wall-clock ceiling for the wait, in seconds. Clamped to the budget. */
  readonly timeoutSecs?: number;
  readonly memoryMbytes?: number;
  readonly maxItems?: number;
  readonly build?: string;
}

export interface RunActorResult {
  readonly run: ApifyRun;
  readonly provenance: ApifyProvenance;
}

/** Ask the user about one actor the allowlist does not cover. */
export type ApproveActor = (actorId: string, reason: string) => Promise<boolean>;

/**
 * Decide, start, and (optionally) wait.
 *
 * The order of the three checks is the point: the policy decides *before* the
 * budget is charged, and the budget is claimed *before* the run is started, so
 * a refused actor costs nothing and a refused budget starts nothing. Reversing
 * either would mean discovering the answer after the money was spent.
 */
export async function runActor(
  client: ApifyClient,
  policy: ApifyPolicy,
  ledger: ApifyBudgetLedger,
  options: RunActorOptions,
  hooks: {
    signal?: AbortSignal;
    approve?: ApproveActor;
    onStatus?: (run: ApifyRun) => void;
  } = {}
): Promise<RunActorResult> {
  const actorId = toCanonicalActorId(options.actorId);

  const verdict = decideActor(policy, actorId);
  if (verdict.decision === "deny") {
    throw new ApifyError("actor_not_allowed", verdict.reason, { actorId });
  }
  if (verdict.decision === "ask") {
    const approved =
      hooks.approve === undefined
        ? false
        : await hooks.approve(actorId, verdict.reason);
    if (!approved) {
      throw new ApifyError(
        "actor_not_allowed",
        hooks.approve === undefined
          ? `${verdict.reason} This surface cannot ask for approval, so the run was refused.`
          : `Running ${actorId} was not approved.`,
        { actorId }
      );
    }
  }

  assertActorInputUrlsArePublic(options.input);

  const clamped = ledger.clampRunOptions({
    ...(options.timeoutSecs === undefined
      ? {}
      : { timeoutSecs: options.timeoutSecs }),
    ...(options.memoryMbytes === undefined
      ? {}
      : { memoryMbytes: options.memoryMbytes }),
    ...(options.maxItems === undefined ? {} : { maxItems: options.maxItems })
  });

  ledger.reserveRun(actorId);

  let run = await client.startRun(
    {
      actorId,
      input: options.input,
      timeoutSecs: clamped.timeoutSecs,
      maxItems: clamped.maxItems,
      ...(clamped.memoryMbytes === undefined
        ? {}
        : { memoryMbytes: clamped.memoryMbytes }),
      ...(options.build === undefined ? {} : { build: options.build })
    },
    hooks.signal
  );
  hooks.onStatus?.(run);

  if (options.waitForFinish !== false) {
    run = await waitForRun(client, run, clamped.timeoutSecs, hooks);
  }

  ledger.recordCost(run.usageTotalUsd);
  return { run, provenance: provenanceOf(actorId, run) };
}

/**
 * Poll until the run settles, the deadline passes, or the caller cancels.
 *
 * The interval backs off from 2s to 10s. A poll is an HTTP request against a
 * rate-limited API, and an actor that takes ten minutes does not need three
 * hundred of them to be noticed finishing.
 */
export async function waitForRun(
  client: ApifyClient,
  started: ApifyRun,
  timeoutSecs: number,
  hooks: {
    signal?: AbortSignal;
    onStatus?: (run: ApifyRun) => void;
  } = {}
): Promise<ApifyRun> {
  const deadline = Date.now() + timeoutSecs * 1000;
  let run = started;
  let interval = POLL_INTERVAL_MS;

  while (!isTerminalRunStatus(run.status)) {
    if (hooks.signal?.aborted === true) {
      // The wait is over, but the actor is not. Abort it on a path that does
      // not carry the signal that just fired, or the cleanup cancels itself.
      await abortQuietly(client, run.id);
      throw new ApifyError(
        "cancelled",
        `The run was cancelled; Apify run ${run.id} was aborted.`,
        { runId: run.id, actorId: run.actId }
      );
    }
    if (Date.now() > deadline) {
      await abortQuietly(client, run.id);
      throw new ApifyError(
        "run_timed_out",
        `Apify run ${run.id} did not finish within ${timeoutSecs}s and was aborted.`,
        { runId: run.id, actorId: run.actId }
      );
    }

    await delay(interval, undefined, {
      ...(hooks.signal === undefined ? {} : { signal: hooks.signal })
    }).catch(() => undefined);
    interval = Math.min(interval * 1.5, MAX_POLL_INTERVAL_MS);

    run = await client.getRun(run.id, hooks.signal);
    hooks.onStatus?.(run);
  }

  if (run.status !== "SUCCEEDED") {
    throw new ApifyError(
      run.status === "ABORTED" ? "run_aborted" : "run_failed",
      `Apify run ${run.id} ended as ${run.status}` +
        (run.statusMessage === undefined ? "." : `: ${run.statusMessage}`),
      { runId: run.id, actorId: run.actId }
    );
  }
  return run;
}

/**
 * Abort without letting the abort's own failure replace the real error.
 *
 * Every caller here is already on a failure path — cancelled, or timed out —
 * and that is the error worth reporting. A network blip while sending the
 * abort must not mask it.
 */
export async function abortQuietly(
  client: ApifyClient,
  runId: string
): Promise<void> {
  try {
    await client.abortRun(runId);
  } catch {
    // Best-effort: the run may already have finished, or the network may be
    // gone. Either way the caller's original failure is the one to surface.
  }
}

/** Build the provenance record carried alongside an actor's output. */
export function provenanceOf(
  actorId: string,
  run: ApifyRun
): ApifyProvenance {
  return {
    actor_id: toCanonicalActorId(actorId),
    run_id: run.id,
    retrieved_at: new Date().toISOString(),
    ...(run.defaultDatasetId === undefined
      ? {}
      : { dataset_id: run.defaultDatasetId }),
    ...(run.defaultKeyValueStoreId === undefined
      ? {}
      : { key_value_store_id: run.defaultKeyValueStoreId }),
    status: run.status,
    ...(run.usageTotalUsd === undefined
      ? {}
      : { cost_usd: run.usageTotalUsd })
  };
}

/**
 * Resolve the Apify token for a run.
 *
 * `APIFY_API_TOKEN` is Apify's own name for it and the one the docs and the
 * settings page use; `APIFY_API_KEY` is what this install shipped first and is
 * still read so an upgrade does not silently switch Apify off. The value is
 * returned to exactly one caller — the client constructor — and never stored
 * anywhere a result, a log, or the guest can reach.
 */
export async function resolveApifyToken(
  context: Pick<ProcessingContext, "getSecret">
): Promise<string> {
  for (const name of ["APIFY_API_TOKEN", "APIFY_API_KEY"]) {
    const fromContext = await context.getSecret(name).catch(() => null);
    const value = fromContext ?? process.env[name];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  throw new ApifyError(
    "auth",
    "No Apify API token is configured. Add APIFY_API_TOKEN in Settings → " +
      "Secrets (get one at https://console.apify.com/account/integrations)."
  );
}

/** Wrap an unknown failure so callers always see a classified Apify error. */
export function toApifyFailure(value: unknown): ApifyError {
  return asApifyError(value);
}
