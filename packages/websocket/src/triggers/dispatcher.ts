/**
 * Trigger dispatcher — consume durable `trigger_inputs` and start one run per
 * event through the headless job-start path.
 *
 * Two feeds keep the same input from being dispatched twice:
 *   - `notifyDispatcher()` — adapters (webhook route, scheduler, file watcher)
 *     call this right after they append an input, so a same-process event
 *     dispatches immediately.
 *   - a poll loop (the `startReaper` shape) — a periodic sweep of unprocessed
 *     inputs that recovers events left behind by a crash between store and
 *     dispatch.
 *
 * An in-flight set keyed by `input_id` dedupes the two so notify + poll can't
 * double-start the same input.
 *
 * Dispatch semantics (per input):
 *   - Look up the registration by `(workflow_id = input.run_id, node_id)`.
 *     Missing → mark the input processed and drop it (orphan). Disabled → leave
 *     it unprocessed and skip (a later enable re-picks it).
 *   - Start the run, then mark the input processed *only after* the start is
 *     accepted (the Job row exists). A crash between store and dispatch
 *     therefore re-delivers rather than drops. On a rejected start the input
 *     stays unprocessed for the next sweep and the registration's `last_error`
 *     is recorded; a successful start updates `last_fired_at`.
 *   - Concurrency policy from `config_json.concurrency`:
 *       `parallel` (default) — dispatch immediately.
 *       `queue` — serialize per registration, waiting for each run's full
 *         completion before the next starts (falls back to waiting for start
 *         acceptance when the job runner exposes no completion promise).
 *       `skip` — if a run for this registration is already in flight, mark the
 *         input processed *without* starting a run.
 *   - Emit a `TriggerInputReceived` run event (best-effort, try/catch wrapped),
 *     the same convention `registration-sync.ts` uses for `TriggerRegistered`.
 */

import { createLogger } from "@nodetool-ai/config";
import { TriggerInput, TriggerRegistration, RunEvent } from "@nodetool-ai/models";
import { TriggerWakeupService } from "@nodetool-ai/kernel";
import {
  startHeadlessJobDetached,
  type HeadlessTriggerEvent
} from "../headless-job-runner.js";
import {
  DrizzleTriggerInputStore,
  DrizzleDurableInboxStore
} from "./stores.js";

const log = createLogger("nodetool.websocket.triggers.dispatcher");

// ── Injectable job-start contract ────────────────────────────────────────────

/** The run-start request the dispatcher hands to {@link StartJobFn}. */
export interface DispatchJobRequest {
  workflowId: string;
  userId: string;
  triggerEvent: HeadlessTriggerEvent;
}

/**
 * The result of accepting a run. `jobId` is available as soon as the Job row is
 * persisted (acceptance). `completion` — when the runner exposes it — resolves
 * when the run settles; the `queue` policy awaits it to serialize, and the
 * `skip` policy uses it to know a run is still in flight.
 */
export interface DispatchJobResult {
  jobId: string;
  completion?: Promise<unknown>;
}

/** Starts a run for one trigger event; injectable so tests stub it. */
export type StartJobFn = (
  req: DispatchJobRequest
) => Promise<DispatchJobResult>;

/** Default runner: start a detached headless job and surface its jobId. */
const defaultStartJob: StartJobFn = async (req) => {
  const handle = await startHeadlessJobDetached({
    workflowId: req.workflowId,
    userId: req.userId,
    triggerEvent: req.triggerEvent
  });
  return { jobId: handle.jobId };
};

type ConcurrencyPolicy = "parallel" | "queue" | "skip";

// ── Module state ─────────────────────────────────────────────────────────────

interface DispatcherState {
  startJob: StartJobFn;
  batchLimit: number;
  /** input_ids currently being dispatched (dedupe across notify + poll). */
  inFlightInputs: Set<string>;
  /** count of runs in flight per registration (for `skip`). */
  runningByReg: Map<string, number>;
  /** per-registration serialization chain (for `queue`). */
  queueChains: Map<string, Promise<void>>;
  /** the drain currently in progress, if any. */
  draining: Promise<void> | null;
  /** a notify arrived mid-drain; run one more pass. */
  pendingNotify: boolean;
  stopped: boolean;
  timer: NodeJS.Timeout | null;
}

let active: DispatcherState | null = null;

function regKey(reg: TriggerRegistration): string {
  // workflow_id / node_id are arbitrary strings; JSON.stringify avoids a
  // separator collision (see TriggerWakeupService._inboxFor).
  return JSON.stringify([reg.workflow_id, reg.node_id]);
}

function policyOf(reg: TriggerRegistration): ConcurrencyPolicy {
  const c = (reg.config_json as Record<string, unknown> | null)?.concurrency;
  if (c === "queue" || c === "skip") return c;
  return "parallel";
}

async function findRegistration(
  workflowId: string,
  nodeId: string
): Promise<TriggerRegistration | null> {
  const regs = await TriggerRegistration.findByWorkflow(workflowId);
  return regs.find((r) => r.node_id === nodeId) ?? null;
}

async function emitInputReceived(
  reg: TriggerRegistration,
  input: TriggerInput
): Promise<void> {
  try {
    // Keyed by workflow_id (there is no run id yet), matching the
    // TriggerRegistered convention in registration-sync.ts.
    await RunEvent.appendEvent(
      reg.workflow_id,
      "TriggerInputReceived",
      { node_id: reg.node_id, input_id: input.input_id },
      reg.node_id
    );
  } catch (error) {
    log.warn(
      `Failed to emit TriggerInputReceived for ${reg.workflow_id}/${reg.node_id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Start a run for one input against its registration. Marks the input processed
 * only after the start is accepted; records `last_fired_at`/`last_error` on the
 * registration. Rethrows a rejected start (input left unprocessed).
 */
async function startRunForInput(
  startJob: StartJobFn,
  reg: TriggerRegistration,
  input: TriggerInput
): Promise<DispatchJobResult> {
  let result: DispatchJobResult;
  try {
    result = await startJob({
      workflowId: reg.workflow_id,
      userId: reg.user_id,
      triggerEvent: {
        node_id: input.node_id,
        payload: input.payload_json,
        input_id: input.input_id
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(
      `startJob rejected for ${reg.workflow_id}/${reg.node_id} (input ${input.input_id}): ${message}`
    );
    try {
      reg.last_error = message;
      await reg.save();
    } catch {
      // Recording the error is best-effort; the input stays unprocessed either
      // way and is retried on the next sweep.
    }
    throw error;
  }

  // Start accepted → the Job row exists. Mark processed now; a crash before
  // this point re-delivers the input rather than dropping it.
  await TriggerInput.markProcessed(input.input_id);
  try {
    reg.last_fired_at = new Date().toISOString();
    reg.last_error = null;
    await reg.save();
  } catch {
    // last_fired_at is diagnostic; a failed write must not fail the dispatch.
  }
  await emitInputReceived(reg, input);
  return result;
}

/** Track a started run for `skip`/`queue` bookkeeping: increment while in
 *  flight, decrement when its completion settles (immediately if none). */
function trackCompletion(
  state: DispatcherState,
  key: string,
  result: DispatchJobResult
): void {
  state.runningByReg.set(key, (state.runningByReg.get(key) ?? 0) + 1);
  const done = result.completion ?? Promise.resolve();
  void Promise.resolve(done).finally(() => {
    const next = (state.runningByReg.get(key) ?? 1) - 1;
    if (next <= 0) state.runningByReg.delete(key);
    else state.runningByReg.set(key, next);
  });
}

/** Start + track a run, swallowing a rejected start (already logged). */
async function runAndTrack(
  state: DispatcherState,
  reg: TriggerRegistration,
  input: TriggerInput,
  key: string
): Promise<void> {
  try {
    const result = await startRunForInput(state.startJob, reg, input);
    trackCompletion(state, key, result);
  } catch {
    // Rejected start: input stays unprocessed, last_error already recorded.
  }
}

/**
 * Dispatch one stored input under its registration's concurrency policy. Adds
 * the input to `inFlightInputs` for the duration so an overlapping drain skips
 * it; removes it once the input is definitively handled (for `queue`, after the
 * serialized run finishes).
 */
async function dispatchStored(
  state: DispatcherState,
  input: TriggerInput
): Promise<void> {
  state.inFlightInputs.add(input.input_id);

  const reg = await findRegistration(input.run_id, input.node_id);
  if (!reg) {
    log.info(
      `Orphan trigger input ${input.input_id} (no registration for ${input.run_id}/${input.node_id}) — marking processed`
    );
    await TriggerInput.markProcessed(input.input_id);
    state.inFlightInputs.delete(input.input_id);
    return;
  }

  if (reg.enabled !== 1) {
    // Disabled: leave unprocessed so re-enabling re-delivers it.
    state.inFlightInputs.delete(input.input_id);
    return;
  }

  const policy = policyOf(reg);
  const key = regKey(reg);

  if (policy === "skip") {
    if ((state.runningByReg.get(key) ?? 0) > 0) {
      await TriggerInput.markProcessed(input.input_id);
      state.inFlightInputs.delete(input.input_id);
      return;
    }
    await runAndTrack(state, reg, input, key);
    state.inFlightInputs.delete(input.input_id);
    return;
  }

  if (policy === "queue") {
    // Append to the per-registration chain and return without awaiting: the run
    // (and the input's markProcessed / inFlight removal) happens in the chain,
    // so the next queued input waits for this one's full completion.
    const prev = state.queueChains.get(key) ?? Promise.resolve();
    const next = prev.then(async () => {
      try {
        const result = await startRunForInput(state.startJob, reg, input);
        trackCompletion(state, key, result);
        // Serialize on the full run: hold the chain until the run settles.
        await (result.completion ?? Promise.resolve());
      } catch {
        // Rejected start: input stays unprocessed, last_error already recorded.
      } finally {
        state.inFlightInputs.delete(input.input_id);
      }
    });
    state.queueChains.set(
      key,
      next.catch(() => undefined)
    );
    return;
  }

  // parallel (default): dispatch immediately, run settles in the background.
  await runAndTrack(state, reg, input, key);
  state.inFlightInputs.delete(input.input_id);
}

async function drainOnce(state: DispatcherState): Promise<void> {
  const inputs = await TriggerInput.findUnprocessed(state.batchLimit);
  for (const input of inputs) {
    if (state.stopped) break;
    if (state.inFlightInputs.has(input.input_id)) continue;
    try {
      await dispatchStored(state, input);
    } catch (error) {
      log.error(
        `Dispatch failed for input ${input.input_id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

async function runDrain(state: DispatcherState): Promise<void> {
  do {
    state.pendingNotify = false;
    await drainOnce(state);
  } while (state.pendingNotify && !state.stopped);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Kick a dispatch sweep. Adapters call this right after appending an input for
 * immediate delivery; the periodic poll calls it too. Concurrent calls coalesce
 * onto the in-progress drain (a call mid-drain schedules one more pass). The
 * returned promise resolves when the triggered drain finishes. A no-op with no
 * active dispatcher.
 */
export function notifyDispatcher(): Promise<void> {
  const state = active;
  if (!state || state.stopped) return Promise.resolve();
  if (state.draining) {
    state.pendingNotify = true;
    return state.draining;
  }
  state.draining = runDrain(state).finally(() => {
    state.draining = null;
  });
  return state.draining;
}

export interface StartDispatcherOptions {
  /** Injectable run starter; defaults to the detached headless runner. */
  startJob?: StartJobFn;
  /** Poll interval for the crash-recovery sweep (ms). Default 15s. */
  intervalMs?: number;
  /** Max inputs pulled per sweep. Default 100. */
  batchLimit?: number;
}

/**
 * Start the dispatcher: a poll loop plus the {@link notifyDispatcher} fast path.
 * Returns a stop function that clears the timer and tears the dispatcher down
 * (leaving no open timers).
 */
export function startDispatcher(opts: StartDispatcherOptions = {}): () => void {
  const state: DispatcherState = {
    startJob: opts.startJob ?? defaultStartJob,
    batchLimit: opts.batchLimit ?? 100,
    inFlightInputs: new Set(),
    runningByReg: new Map(),
    queueChains: new Map(),
    draining: null,
    pendingNotify: false,
    stopped: false,
    timer: null
  };
  active = state;

  const intervalMs = opts.intervalMs ?? 15_000;
  const timer = setInterval(() => {
    void notifyDispatcher();
  }, intervalMs);
  // Don't keep the process alive solely for the dispatcher poll.
  if (typeof timer.unref === "function") timer.unref();
  state.timer = timer;

  return () => {
    state.stopped = true;
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    if (active === state) active = null;
  };
}

/**
 * Deliver one already-stored input immediately and resolve with the started job
 * id. Bypasses the concurrency policy (this is the explicit "fire now" path).
 *
 * Rejects with an Error whose message starts with:
 *   - `"input not found"` — no input with that id.
 *   - `"registration disabled"` — the input's registration is missing or not
 *     enabled.
 */
export async function dispatchInput(
  inputId: string
): Promise<{ jobId: string }> {
  const input = await TriggerInput.findByInputId(inputId);
  if (!input) {
    throw new Error(`input not found: ${inputId}`);
  }
  const reg = await findRegistration(input.run_id, input.node_id);
  if (!reg || reg.enabled !== 1) {
    throw new Error(
      `registration disabled for ${input.run_id}/${input.node_id} (input ${inputId})`
    );
  }
  const startJob = active?.startJob ?? defaultStartJob;
  const result = await startRunForInput(startJob, reg, input);
  return { jobId: result.jobId };
}

// ── Wakeup service singleton ─────────────────────────────────────────────────

let wakeupService: TriggerWakeupService | null = null;

/**
 * The module-level {@link TriggerWakeupService} singleton, backed by the Drizzle
 * stores. Adapters (and Task 14's manual-dispatch router) deliver inputs
 * through it. Task 11's boot wiring may replace it with
 * {@link setTriggerWakeupService}.
 */
export function getTriggerWakeupService(): TriggerWakeupService {
  if (!wakeupService) {
    wakeupService = new TriggerWakeupService(
      new DrizzleDurableInboxStore(),
      new DrizzleTriggerInputStore()
    );
  }
  return wakeupService;
}

/**
 * Replace (or with `null`, reset) the wakeup-service singleton. Used by boot
 * wiring to inject a shared instance and by tests to reset between cases.
 */
export function setTriggerWakeupService(
  service: TriggerWakeupService | null
): void {
  wakeupService = service;
}
