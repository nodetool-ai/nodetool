/**
 * Trigger dispatcher — turns durable `trigger_inputs` into runs.
 *
 * Ingestion adapters (webhook route, scheduler, file watcher) only *store*
 * events. This is the single consumer: for every enabled `trigger_registrations`
 * row it drains the unprocessed inputs addressed to that registration's
 * (workflow, node) and starts one headless run per input, handing the payload
 * to the trigger node as the run's `trigger_event`.
 *
 * Two paths feed it, following the `startReaper` shape
 * (`@nodetool-ai/compute`): a coarse poll timer, and an in-process `notify()`
 * that adapters call right after appending. `notify()` is what makes a
 * same-process event dispatch immediately; the poll is only the
 * crash-recovery path (a server that died mid-dispatch, or an input written by
 * another process).
 *
 * ## Delivered vs. failed
 *
 * `startJob` **rejecting** means the run was never accepted (workflow missing,
 * DB/infra hiccup): the input stays unprocessed so the next tick redelivers it,
 * and the reason lands in `registration.last_error`.
 *
 * `startJob` **resolving with `status: "failed"`** is a different thing — the
 * run was accepted and executed, and the *graph* failed. That is a delivered
 * event: the input is marked processed (retrying a deterministic graph failure
 * would loop forever) and the run error is still written to
 * `registration.last_error` so the UI shows the last outcome.
 *
 * ## Acceptance vs. completion
 *
 * `startJob` resolves on *terminal* status — it does not come back until the
 * workflow has finished. A pass that awaited that would hold every other
 * registration behind the slowest run in flight: a webhook arriving one second
 * into a ten-minute triggered run waited ten minutes for its own dispatch.
 *
 * So a pass awaits **acceptance**, not completion. `startHeadlessJob` reports
 * acceptance through `onAccepted` the moment the workflow resolves and the
 * `Job` row exists; the run itself settles later, on its own. `drain()` is what
 * awaits the runs, for shutdown and for tests.
 *
 * A `startJob` that never calls `onAccepted` (the test fakes, any other job
 * starter) still works: acceptance then resolves when the job promise does,
 * which is exactly the old behaviour.
 *
 * ## Idempotency and the crash window
 *
 * An input is marked processed **when the run is accepted**, never before. In
 * process, `inflight` (keyed by `inputId`) makes overlapping passes and
 * concurrent `dispatchInput` calls join the same dispatch instead of starting a
 * second run.
 *
 * The uncovered window is a crash *between* run acceptance and
 * `markProcessed`: the input is still unprocessed on restart, so it is
 * redelivered and the run happens twice. This is deliberate — at-least-once
 * delivery. Dropping an event is worse than repeating one, and marking first
 * would turn any crash before acceptance into a silently lost event.
 *
 * A run that was never accepted (`startJob` rejected) leaves `last_fired_at`
 * alone: nothing fired, and stamping it made the editor report a delivery that
 * never happened.
 *
 * ## Who writes `last_fired_at`
 *
 * A kind whose ingestion adapter runs in this process stamps the column when
 * it delivers the event: `schedule` (where the column doubles as the
 * scheduler's due-computation cursor, so moving it again here would shift the
 * schedule) and `file_watch`. The dispatcher leaves those rows alone.
 *
 * `webhook` and `manual` arrive from outside and have no such owner, and
 * leaving the column untouched made a webhook that had been delivering all
 * week still report "Never" in the editor. For those the dispatcher stamps it
 * on a delivered dispatch — the same write that records the run's outcome.
 */

import { createLogger } from "@nodetool-ai/config";
import { TriggerWakeupService } from "@nodetool-ai/kernel";
import type { TriggerInput, TriggerInputStore } from "@nodetool-ai/kernel";
import {
  getDb,
  RunEvent,
  TriggerInput as TriggerInputModel,
  TriggerRegistration
} from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  startHeadlessJob,
  type HeadlessJobStatus,
  type StartHeadlessJobOptions
} from "../headless-job-runner.js";
import { SCHEDULE_KIND } from "./schedule-timing.js";
import {
  checkTriggerBounds,
  disableTrigger,
  settleTriggerOutcome,
  triggerRunParams
} from "./settle.js";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label, not a behavioural contract
const log = createLogger("nodetool.websocket.triggers.dispatcher");

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 100;

/**
 * Kinds whose in-process ingestion adapter already stamps `last_fired_at` at
 * delivery time (see the module docs). The dispatcher stamps every other kind.
 */
const ADAPTER_STAMPS_FIRED_AT: ReadonlySet<string> = new Set([
  SCHEDULE_KIND,
  "file_watch"
]);

/**
 * How a registration handles an event that arrives while one of its runs is
 * still in flight. `parallel` (the default) starts a second run, `queue` waits
 * for the current one, `skip` drops the event (marking it processed).
 */
export type ConcurrencyPolicy = "parallel" | "queue" | "skip";

/** The part of a started job the dispatcher cares about. */
export interface DispatchedJob {
  jobId: string;
  status?: HeadlessJobStatus;
  error?: string | null;
}

/** Job-start function; defaults to `startHeadlessJob`. */
export type StartTriggerJob = (
  options: StartHeadlessJobOptions
) => Promise<DispatchedJob>;

/**
 * Adapter hint that new inputs exist. The argument is optional and ignored:
 * every notify kicks one dispatch pass, which keeps the signature compatible
 * with both the webhook route's `() => void` and the scheduler's
 * `(event) => void`.
 */
export type DispatcherNotify = (event?: {
  registrationId?: string;
  inputId?: string;
}) => void;

export interface TriggerDispatcherOptions {
  /** Where unprocessed inputs are read from. Wire the Drizzle store at boot. */
  store: TriggerInputStore;
  startJob?: StartTriggerJob;
  /** Node registry handed to `startJob`; defaults to the runner's own. */
  registry?: NodeRegistry;
  /** Max inputs drained per registration per pass. Defaults to 100. */
  batchSize?: number;
}

export interface StartDispatcherOptions extends TriggerDispatcherOptions {
  /** Poll period for the crash-recovery path. Defaults to 15s. */
  intervalMs?: number;
}

/** What a single input's dispatch settled as. */
export type DispatchOutcome =
  | { status: "dispatched"; jobId: string }
  | { status: "skipped"; reason: string };

/** Stops the poll timer; also carries `notify`/`drain` for adapters and tests. */
export interface DispatcherHandle {
  (): void;
  notify: DispatcherNotify;
  drain(): Promise<void>;
  dispatchInput(inputId: string): Promise<{ jobId: string }>;
}

interface RegistrationState {
  /** Runs currently in flight for this registration. */
  running: number;
  /** Serialization point for the `queue` policy. */
  chain: Promise<unknown>;
}

/**
 * One input's dispatch, split at the acceptance point: `accepted` settles when
 * the run was taken on (or refused), `done` when it has finished.
 */
interface Dispatch {
  accepted: Promise<void>;
  done: Promise<DispatchOutcome>;
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
  settled: boolean;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const d: Deferred = {
    promise,
    settled: false,
    resolve: () => {
      if (d.settled) return;
      d.settled = true;
      resolve();
    },
    reject: (reason) => {
      if (d.settled) return;
      d.settled = true;
      reject(reason);
    }
  };
  return d;
}

function readPolicy(registration: TriggerRegistration): ConcurrencyPolicy {
  const raw = registration.config_json?.concurrency;
  if (raw === "queue" || raw === "skip" || raw === "parallel") return raw;
  return "parallel";
}

async function listEnabledRegistrations(): Promise<TriggerRegistration[]> {
  const rows = await getDb().query.triggerRegistrations.findMany({
    where: (t, { eq }) => eq(t.enabled, 1),
    orderBy: (t, { asc }) => asc(t.created_at)
  });
  return rows.map((r) => new TriggerRegistration(r as Record<string, unknown>));
}

/**
 * The registration an input belongs to. Adapters address inputs by
 * `(workflow_id, node_id)` — the input's `runId` *is* the workflow id — so the
 * lookup is a workflow scan plus a node-id match.
 */
async function findRegistrationForInput(
  input: TriggerInput
): Promise<TriggerRegistration | null> {
  const registrations = await TriggerRegistration.findByWorkflow(input.runId);
  return registrations.find((r) => r.node_id === input.nodeId) ?? null;
}

/**
 * Consumes stored trigger inputs. One instance owns the per-registration
 * concurrency state and the per-input in-flight map, so both survive across
 * passes.
 */
export class TriggerDispatcher {
  private readonly store: TriggerInputStore;
  private readonly startJob: StartTriggerJob;
  private readonly registry?: NodeRegistry;
  private readonly batchSize: number;

  private readonly states = new Map<string, RegistrationState>();
  private readonly inflight = new Map<string, Dispatch>();
  /** Runs a pass handed off but that have not finished. `drain()` awaits these. */
  private readonly outstanding = new Set<Promise<unknown>>();

  private pass: Promise<void> | null = null;
  private pending = false;
  private stopped = false;

  constructor(options: TriggerDispatcherOptions) {
    this.store = options.store;
    this.startJob = options.startJob ?? startHeadlessJob;
    this.registry = options.registry;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  }

  /**
   * Drain every enabled registration's unprocessed inputs once. Resolves when
   * every input this pass picked up has been *accepted* — not when its run has
   * finished, so one slow workflow cannot hold up the next pass (see the
   * acceptance-vs-completion note above). Use `drain()` to await the runs. A
   * single input's failure does not abort the pass.
   */
  async runOnce(): Promise<void> {
    const registrations = await listEnabledRegistrations();
    const accepted: Array<Promise<unknown>> = [];

    for (const registration of registrations) {
      const inputs = await this.store.findUnprocessed(
        registration.workflow_id,
        registration.node_id,
        this.batchSize
      );
      for (const input of inputs) {
        // Swallow here only: each dispatch already records its own error.
        accepted.push(
          this.enqueue(input, registration).accepted.catch(() => undefined)
        );
      }
    }

    await Promise.all(accepted);
  }

  /** Adapter hint: run a pass now, coalescing concurrent notifies. */
  notify: DispatcherNotify = () => {
    if (this.stopped) return;
    this.pending = true;
    if (this.pass) return;
    this.pass = this.runPasses().finally(() => {
      this.pass = null;
    });
  };

  /**
   * Await the currently running pass (and any pass it coalesced) *and* every
   * run those passes handed off. A settling run can enqueue nothing new, but a
   * pass can, so both are re-checked until the two are quiet together.
   */
  async drain(): Promise<void> {
    while (this.pass || this.outstanding.size > 0) {
      if (this.pass) await this.pass;
      await Promise.all(
        [...this.outstanding].map((p) => p.catch(() => undefined))
      );
    }
  }

  stop(): void {
    this.stopped = true;
  }

  /**
   * Deliver one already-stored input immediately. The synchronous-dispatch
   * contract used by the manual-fire API: resolves with the started job id,
   * rejects with an `Error` whose message starts with `"input not found"` or
   * `"registration disabled"` for those two cases. A concurrent call for the
   * same input joins the in-flight dispatch rather than starting a second run.
   */
  async dispatchInput(inputId: string): Promise<{ jobId: string }> {
    const existing = this.inflight.get(inputId);
    const settled = existing
      ? await existing.done
      : await this.dispatchStoredInput(inputId);
    if (settled.status !== "dispatched") {
      throw new Error(`dispatch skipped: ${settled.reason}`);
    }
    return { jobId: settled.jobId };
  }

  private async dispatchStoredInput(inputId: string): Promise<DispatchOutcome> {
    const input = await this.findInput(inputId);
    if (!input) {
      throw new Error(`input not found: ${inputId}`);
    }
    const registration = await findRegistrationForInput(input);
    if (!registration) {
      throw new Error(
        `input not found: no trigger registration for input ${inputId}`
      );
    }
    if (registration.enabled !== 1) {
      throw new Error(`registration disabled: ${registration.id}`);
    }
    return this.enqueue(input, registration).done;
  }

  /**
   * Look an input up by id. The `TriggerInputStore` interface addresses inputs
   * by (run, node) only, so the by-id read goes through the model — the same
   * table the Drizzle store writes.
   */
  private async findInput(inputId: string): Promise<TriggerInput | null> {
    const row = await TriggerInputModel.findByInputId(inputId);
    if (!row || row.processed !== 0) return null;
    return {
      runId: row.run_id,
      nodeId: row.node_id,
      inputId: row.input_id,
      payload: row.payload_json,
      cursor: row.cursor ?? undefined,
      processed: false,
      createdAt: new Date(row.created_at)
    };
  }

  private async runPasses(): Promise<void> {
    while (this.pending && !this.stopped) {
      this.pending = false;
      try {
        await this.runOnce();
      } catch (err) {
        log.warn(
          "Trigger dispatch pass failed",
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }
  }

  private stateFor(registrationId: string): RegistrationState {
    let state = this.states.get(registrationId);
    if (!state) {
      state = { running: 0, chain: Promise.resolve() };
      this.states.set(registrationId, state);
    }
    return state;
  }

  /**
   * Start (or join) the dispatch of one input under its registration's
   * concurrency policy.
   */
  private enqueue(
    input: TriggerInput,
    registration: TriggerRegistration
  ): Dispatch {
    const existing = this.inflight.get(input.inputId);
    if (existing) return existing;

    const policy = readPolicy(registration);
    const state = this.stateFor(registration.id);

    const acceptance = deferred();
    /**
     * The handoff point: the input is marked processed and the pass that
     * picked it up is released. Idempotent, because a `startJob` that reports
     * acceptance early also resolves when it finishes.
     */
    const accept = async (): Promise<void> => {
      if (acceptance.settled) return;
      await this.store.markProcessed(input.inputId);
      acceptance.resolve();
    };

    // The synchronous prefix of `run` (the `running` bump) executes as soon as
    // `run()` is called, so a second input enqueued in the same tick sees it.
    const run = async (): Promise<DispatchOutcome> => {
      if (policy === "skip" && state.running > 0) {
        await this.emitReceived(input, registration, policy, false);
        await accept();
        log.debug("Trigger input skipped (run already in flight)", {
          inputId: input.inputId,
          registrationId: registration.id
        });
        return {
          status: "skipped",
          reason: `a run is already in flight for input ${input.inputId}`
        };
      }
      state.running += 1;
      try {
        return await this.dispatchOne(input, registration, policy, accept);
      } finally {
        state.running -= 1;
      }
    };

    let done: Promise<DispatchOutcome>;
    if (policy === "queue") {
      // Both handlers run the dispatch: a failed predecessor must not cancel
      // its successors.
      done = state.chain.then(run, run);
      state.chain = done.catch(() => undefined);
    } else {
      done = run();
    }

    const dispatch: Dispatch = { accepted: acceptance.promise, done };
    this.inflight.set(input.inputId, dispatch);
    this.outstanding.add(done);

    const forget = (err?: unknown): void => {
      this.inflight.delete(input.inputId);
      this.outstanding.delete(done);
      // A dispatch that failed before it was ever accepted must not leave the
      // pass awaiting an acceptance that will never come.
      acceptance.reject(err);
    };
    void done.then(() => forget(), forget);
    // The pass attaches its own handler, but `dispatchInput` callers only take
    // `done` — keep a rejected acceptance from surfacing as unhandled.
    void acceptance.promise.catch(() => undefined);

    return dispatch;
  }

  private async dispatchOne(
    input: TriggerInput,
    registration: TriggerRegistration,
    policy: ConcurrencyPolicy,
    accept: () => Promise<void>
  ): Promise<DispatchOutcome> {
    const nowMs = Date.now();
    const gate = checkTriggerBounds(registration, nowMs);
    if (!gate.allowed) {
      // Exhausted: drop the event rather than leave it to redeliver forever,
      // and disarm so the next one never gets this far.
      await this.emitReceived(input, registration, policy, false);
      await accept();
      disableTrigger(registration, gate.reason);
      await registration.save();
      log.info("Trigger registration disabled before dispatch", {
        registrationId: registration.id,
        reason: gate.reason
      });
      return { status: "skipped", reason: `registration ${gate.reason}` };
    }

    await this.emitReceived(input, registration, policy, true);

    let job: DispatchedJob;
    try {
      const jobRequest: Parameters<typeof this.startJob>[0] = {
        workflowId: registration.workflow_id,
        userId: registration.user_id,
        params: triggerRunParams(registration, nowMs),
        // Per-registration opt-in, off unless the row says otherwise.
        supervise: registration.supervise === 1,
        triggerEvent: {
          node_id: input.nodeId,
          payload: input.payload,
          input_id: input.inputId
        },
        // Release the pass as soon as the run is taken on, so a long workflow
        // doesn't hold up every other registration's dispatch.
        onAccepted: () => {
          void accept();
        }
      };
      if (this.registry) {
        jobRequest.registry = this.registry;
      }
      job = await this.startJob(jobRequest);
    } catch (err) {
      // The run was never accepted: leave the input unprocessed so the next
      // tick redelivers it. It still counts as a failure — a registration
      // whose workflow has gone missing redelivers forever otherwise. Nothing
      // fired, so `last_fired_at` is left alone.
      const error = err instanceof Error ? err : new Error(String(err));
      await this.settle(
        registration,
        `dispatch failed: ${error.message}`,
        nowMs,
        { fired: false }
      );
      log.warn(
        `Trigger dispatch failed for input ${input.inputId} (registration ${registration.id})`,
        error
      );
      throw error;
    }

    // Accepted — mark processed only now (see the crash-window note above).
    // A no-op when `onAccepted` already fired mid-run.
    await accept();

    await this.settle(
      registration,
      job.status === "failed"
        ? `run failed: ${job.error ?? "unknown error"}`
        : null,
      nowMs
    );

    log.info("Trigger input dispatched", {
      inputId: input.inputId,
      registrationId: registration.id,
      jobId: job.jobId,
      status: job.status ?? "unknown"
    });

    return { status: "dispatched", jobId: job.jobId };
  }

  /** Append the audit event. Never lets a logging failure block a dispatch. */
  private async emitReceived(
    input: TriggerInput,
    registration: TriggerRegistration,
    policy: ConcurrencyPolicy,
    dispatched: boolean
  ): Promise<void> {
    try {
      await RunEvent.appendEvent(
        input.runId,
        "TriggerInputReceived",
        {
          input_id: input.inputId,
          registration_id: registration.id,
          kind: registration.kind,
          concurrency: policy,
          dispatched
        },
        input.nodeId
      );
    } catch (err) {
      log.warn(
        "Failed to append TriggerInputReceived event",
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }

  /**
   * Record what the run did to the registration: its outcome, the failure
   * counters, and — for the kinds no ingestion adapter stamps — the fire time
   * the editor shows as "Last fired".
   *
   * `fired: false` marks an outcome where no run ever started, so there is no
   * fire time to record however the kind is owned.
   */
  private async settle(
    registration: TriggerRegistration,
    error: string | null,
    nowMs: number,
    opts: { fired: boolean } = { fired: true }
  ): Promise<void> {
    const stampFiredAt =
      opts.fired && !ADAPTER_STAMPS_FIRED_AT.has(registration.kind);
    const disabled = settleTriggerOutcome(registration, {
      error,
      stampFiredAt,
      firedAt: new Date(nowMs).toISOString()
    });
    await registration.save();

    if (disabled) {
      log.info("Trigger registration disabled", {
        registrationId: registration.id,
        reason: disabled,
        error
      });
    }
  }
}

/** Construct a dispatcher without starting its poll timer (tests, boot code). */
export function createTriggerDispatcher(
  options: TriggerDispatcherOptions
): TriggerDispatcher {
  return new TriggerDispatcher(options);
}

// ── Process-wide handles ──────────────────────────────────────────────
//
// The manual-fire API (`trpc/routers/triggers.ts`) reaches the running
// dispatcher and wakeup service by module function, not by injection.

let activeDispatcher: TriggerDispatcher | null = null;
let wakeupService: TriggerWakeupService | null = null;

/**
 * The process's `TriggerWakeupService`. Boot wiring installs the DB-backed
 * instance via `setTriggerWakeupService`; until then a default (memory inbox)
 * instance is created lazily so callers always get a usable service.
 */
export function getTriggerWakeupService(): TriggerWakeupService {
  if (!wakeupService) {
    wakeupService = new TriggerWakeupService();
  }
  return wakeupService;
}

/** Install (or clear, with `null`) the process-wide wakeup service. */
export function setTriggerWakeupService(
  service: TriggerWakeupService | null
): void {
  wakeupService = service;
}

/** The running dispatcher, or `null` before boot wiring / after shutdown. */
export function getActiveDispatcher(): TriggerDispatcher | null {
  return activeDispatcher;
}

/**
 * Deliver one already-stored input immediately through the running dispatcher.
 * Resolves with the started job id; rejects with an `Error` whose message
 * starts with `"input not found"` or `"registration disabled"` for those cases.
 *
 * Note that the promise settles when the run *finishes*, because the headless
 * runner resolves on terminal status.
 */
export async function dispatchInput(
  inputId: string
): Promise<{ jobId: string }> {
  if (!activeDispatcher) {
    throw new Error("trigger dispatcher not started");
  }
  return activeDispatcher.dispatchInput(inputId);
}

/**
 * Start the dispatcher: one unref'd poll timer for crash recovery plus an
 * immediate backlog pass. The returned handle stops the timer and also exposes
 * `notify` (for adapters) and `drain`/`dispatchInput`.
 */
export function startDispatcher(
  options: StartDispatcherOptions
): DispatcherHandle {
  const dispatcher = new TriggerDispatcher(options);
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  activeDispatcher = dispatcher;

  const timer = setInterval(() => {
    dispatcher.notify();
  }, intervalMs);
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  // Any input left unprocessed by a previous process life goes out now.
  dispatcher.notify();

  const handle = (): void => {
    clearInterval(timer);
    dispatcher.stop();
    if (activeDispatcher === dispatcher) {
      activeDispatcher = null;
    }
  };
  handle.notify = dispatcher.notify;
  handle.drain = (): Promise<void> => dispatcher.drain();
  handle.dispatchInput = (inputId: string): Promise<{ jobId: string }> =>
    dispatcher.dispatchInput(inputId);
  return handle;
}
