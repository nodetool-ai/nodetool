/**
 * The generation tracker — the follower that owns a generation's ledger row
 * from `running` to its terminal state.
 *
 * `cost-ledger.ts` used to write one row when a prediction *completed*. That
 * listener never saw a failure, a cancellation or a restart, and the row it
 * wrote named no asset. This module replaces that branch: the `running`
 * message opens the row (same id as the message), the terminal message closes
 * it with the cost, the assets and the provider's receipt, and two things a
 * listener cannot give live here too — a reconcile queue that is a query on
 * the table (so it survives a restart) and a sweep that closes the rows a
 * dead process left open.
 *
 * Design: docs/media-generation-tracking-design.md § 6.
 */

import { createLogger } from "@nodetool-ai/config";
import {
  MAX_RECONCILE_ATTEMPTS,
  Prediction
} from "@nodetool-ai/models";
import type {
  GenerationReceipt,
  Prediction as PredictionMessage
} from "@nodetool-ai/protocol";
import { getCostReconciler } from "@nodetool-ai/runtime";
import {
  isUnitBilledCapability,
  priceGeneration,
  type RunCostLedgerOptions
} from "./cost-ledger.js";

const log = createLogger("nodetool.execution.generation-tracker");

/** What a generation row records about how it was priced and reconciled. */
interface GenerationRowMetadata {
  capability?: string | null;
  price_source?: "provider" | "model-catalog" | "provider-billing";
  price_breakdown?: string;
  price_assumptions?: string[];
  unpriced_reason?: string;
  reconcile?: "unavailable";
  reconcile_error?: string;
  reconcile_next_at?: string;
  interrupted_reason?: string;
}

/** The columns a terminal message writes onto the row it closes. */
interface GenerationRowUpdate {
  status: string;
  completed_at: string;
  error: string | null;
  duration: number | null;
  provider_request_id: string | null;
  asset_ids?: string[];
  cost?: number | null;
  currency?: string | null;
  billing_unit?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  metadata?: GenerationRowMetadata;
}

/** The row's stored metadata, typed as what this module writes into it. */
function rowMetadata(row: Prediction): GenerationRowMetadata {
  return { ...(row.metadata ?? {}) } as GenerationRowMetadata;
}

/** Minutes between attempts; the index is the attempt just made. */
const RECONCILE_BACKOFF_MINUTES = [1, 5, 30, 120, 720];

/**
 * Ids whose `running` insert failed on this host (no database, a closed
 * connection). The later update for the same id is skipped silently instead
 * of logged a second time.
 */
const unrecorded = new Set<string>();

/**
 * Generations opened for a node that have not been linked to an asset yet,
 * keyed `${jobId}::${nodeId}`. The websocket autosave asks for them when it
 * persists that node's `generation_complete` (design § 8, S3).
 */
const unlinkedByNode = new Map<string, string[]>();

/**
 * Node ids whose generation carried a provider-stated cost, per attach. A
 * `node_update.provider_cost` for that node would be the same charge twice.
 */
export interface GenerationTrackerState {
  readonly receiptCostNodes: Set<string>;
}

export function createTrackerState(): GenerationTrackerState {
  return { receiptCostNodes: new Set() };
}

function nodeKey(jobId: string | null | undefined, nodeId: string): string {
  return `${jobId ?? ""}::${nodeId}`;
}

function receiptCost(
  receipt: GenerationReceipt | null | undefined
): NonNullable<GenerationReceipt["cost"]> | null {
  const cost = receipt?.cost;
  if (!cost || !Number.isFinite(cost.amount)) return null;
  return cost;
}

/**
 * Handle one `prediction` message. Unit-billed capabilities only: a chat
 * completion already reaches the ledger through the provider's token
 * accounting, and a second row per LLM call would double it.
 */
export async function trackPredictionMessage(
  msg: PredictionMessage,
  options: RunCostLedgerOptions,
  state: GenerationTrackerState
): Promise<void> {
  if (!isUnitBilledCapability(msg.capability)) return;
  if (!msg.provider || !msg.model) return;
  switch (msg.status) {
    case "running":
      await openRow(msg, options);
      return;
    case "completed":
    case "failed":
    case "cancelled":
      await closeRow(msg, options, state);
      return;
    default:
      return;
  }
}

async function openRow(
  msg: PredictionMessage,
  options: RunCostLedgerOptions
): Promise<void> {
  const origin = msg.origin;
  try {
    await Prediction.create<Prediction>({
      id: msg.id,
      user_id: options.userId,
      provider: msg.provider,
      model: msg.model,
      capability: msg.capability ?? null,
      node_id: msg.node_id ?? "",
      node_type: options.nodeType?.(msg.node_id) ?? "",
      workflow_id: msg.workflow_id ?? options.workflowId,
      project_id: options.projectId ?? null,
      document_id: options.documentId ?? null,
      surface: origin?.surface ?? null,
      thread_id: origin?.thread_id ?? null,
      tool_call_id: origin?.tool_call_id ?? null,
      job_id: origin?.job_id ?? null,
      status: "running",
      cost: null,
      parameters: msg.params ?? null,
      started_at: new Date().toISOString(),
      metadata: { capability: msg.capability ?? null }
    });
  } catch (err) {
    unrecorded.add(msg.id);
    log.warn("Generation not recorded", {
      generation_id: msg.id,
      provider: msg.provider,
      model: msg.model,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

async function closeRow(
  msg: PredictionMessage,
  options: RunCostLedgerOptions,
  state: GenerationTrackerState
): Promise<void> {
  if (unrecorded.has(msg.id)) {
    unrecorded.delete(msg.id);
    return;
  }
  const stated = receiptCost(msg.receipt);
  if (stated) state.receiptCostNodes.add(msg.node_id);

  const row = await Prediction.find(msg.id).catch(() => null);
  if (!row) {
    // The `running` message never reached this listener (attached late) or
    // the row vanished. Open and close in one write rather than lose it.
    await openRow(msg, options);
    if (unrecorded.has(msg.id)) {
      unrecorded.delete(msg.id);
      return;
    }
    const opened = await Prediction.find(msg.id).catch(() => null);
    if (!opened) return;
    await finishRow(opened, msg, options, stated);
    return;
  }
  await finishRow(row, msg, options, stated);
}

async function finishRow(
  row: Prediction,
  msg: PredictionMessage,
  options: RunCostLedgerOptions,
  stated: NonNullable<GenerationReceipt["cost"]> | null
): Promise<void> {
  const now = new Date().toISOString();
  const metadata = rowMetadata(row);
  metadata.capability = msg.capability ?? null;
  const update: GenerationRowUpdate = {
    status: msg.status,
    completed_at: now,
    error: msg.error ?? null,
    duration: msg.duration != null ? msg.duration / 1000 : row.duration,
    provider_request_id:
      msg.receipt?.provider_request_id ?? row.provider_request_id ?? null
  };
  if (msg.status === "completed" && msg.asset_ids) {
    update.asset_ids = msg.asset_ids;
  }

  if (stated) {
    // The provider's own number wins over the catalog estimate.
    update.cost = stated.amount;
    update.currency = stated.currency ?? "USD";
    update.billing_unit = stated.billing_unit ?? null;
    update.quantity = stated.quantity ?? null;
    update.unit_price = stated.unit_price ?? null;
    metadata.price_source = "provider";
  } else if (msg.status === "completed" && msg.provider && msg.model) {
    // One row per call; a call that produced several outputs (N variations
    // in one request) is priced per output.
    const priced = priceGeneration({
      userId: options.userId,
      provider: msg.provider,
      model: msg.model,
      capability: msg.capability,
      quantity: Math.max(1, msg.asset_ids?.length ?? 1),
      params: msg.params ?? {}
    });
    if (priced) {
      update.cost = priced.cost;
      update.currency = priced.currency;
      update.billing_unit = priced.billing_unit;
      update.quantity = priced.quantity;
      update.unit_price = priced.unit_price;
      metadata.price_source = "model-catalog";
      if (priced.breakdown) metadata.price_breakdown = priced.breakdown;
      if (priced.assumptions) metadata.price_assumptions = priced.assumptions;
    } else {
      update.cost = null;
      update.billing_unit = msg.capability ?? null;
      metadata.unpriced_reason = `No unit price for ${msg.provider}/${msg.model} in the model catalogs`;
    }
  }
  // A failed or cancelled call with no stated charge keeps `cost: null`: it
  // may still have been billed, and the reconciler answers that by request id.
  update.metadata = metadata;

  try {
    await row.update({ ...update });
  } catch (err) {
    log.warn("Generation outcome not recorded", {
      generation_id: msg.id,
      status: msg.status,
      error: err instanceof Error ? err.message : String(err)
    });
    return;
  }

  if (msg.status === "completed" && (!msg.asset_ids || msg.asset_ids.length === 0)) {
    // A node returned an inline ref; the host's autosave links it later.
    const key = nodeKey(msg.origin?.job_id, msg.node_id);
    const pending = unlinkedByNode.get(key) ?? [];
    pending.push(msg.id);
    unlinkedByNode.set(key, pending);
  }

  if (update.provider_request_id) {
    // First attempt now, detached; the queue worker owns the retries.
    void reconcileRow(row, options.resolveSecret).catch(() => undefined);
  }
}

/** Ids the tracker opened for a node that no asset has been linked to yet. */
export function generationsForNode(
  jobId: string | null | undefined,
  nodeId: string
): string[] {
  return [...(unlinkedByNode.get(nodeKey(jobId, nodeId)) ?? [])];
}

/**
 * Record which assets a generation produced, and stop offering those ids to
 * the autosave. A node that made several generations in one invocation
 * links all of them to the asset rather than guessing which one.
 */
export async function linkGenerationAssets(
  generationIds: readonly string[],
  assetIds: readonly string[]
): Promise<void> {
  if (generationIds.length === 0 || assetIds.length === 0) return;
  for (const [key, pending] of unlinkedByNode) {
    const rest = pending.filter((id) => !generationIds.includes(id));
    if (rest.length === 0) unlinkedByNode.delete(key);
    else unlinkedByNode.set(key, rest);
  }
  for (const id of generationIds) {
    try {
      const row = await Prediction.find(id);
      if (!row) continue;
      const merged = [...new Set([...(row.asset_ids ?? []), ...assetIds])];
      await row.update({ asset_ids: merged });
    } catch (err) {
      log.warn("Generation asset link not recorded", {
        generation_id: id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}

/** The secret resolver a reconcile needs: the provider's API key, per user. */
export type ReconcileSecretResolver = (
  key: string,
  userId: string
) => Promise<string | null | undefined>;

export interface ReconcileOutcome {
  before: number | null;
  after: number | null;
  reconciled: boolean;
  reason?: string;
}

/**
 * One reconcile attempt on one row. Increments the attempt counter, writes
 * the billed amount when the provider answers, marks the row `unavailable`
 * when no reconciler exists so it leaves the queue, and records the error
 * otherwise. The next attempt is scheduled by the backoff table.
 */
export async function reconcileRow(
  row: Prediction,
  resolveSecret?:
    | ((key: string) => Promise<string | null | undefined>)
    | ReconcileSecretResolver
): Promise<ReconcileOutcome> {
  const before = row.cost;
  if (!row.provider_request_id) {
    return { before, after: before, reconciled: false, reason: "no request id" };
  }
  const reconciler = getCostReconciler(row.provider);
  const now = new Date();
  const metadata = rowMetadata(row);
  if (!reconciler) {
    metadata.reconcile = "unavailable";
    await row.update({ reconciled_at: now.toISOString(), metadata: { ...metadata } });
    return {
      before,
      after: before,
      reconciled: false,
      reason: `no reconciler for ${row.provider}`
    };
  }
  const attempts = (row.reconcile_attempts ?? 0) + 1;
  const backoffMinutes =
    RECONCILE_BACKOFF_MINUTES[
      Math.min(attempts, RECONCILE_BACKOFF_MINUTES.length) - 1
    ];
  metadata.reconcile_next_at = new Date(
    now.getTime() + backoffMinutes * 60_000
  ).toISOString();
  try {
    const secretKey = `${row.provider.toUpperCase()}_API_KEY`;
    const apiKey = await resolveSecret?.(secretKey, row.user_id);
    const actual = await reconciler({
      requestId: row.provider_request_id,
      endpointId: row.model ?? null,
      secrets: apiKey ? { [secretKey]: apiKey } : {}
    });
    if (!actual) {
      metadata.reconcile_error = "provider has no billing record yet";
      await row.update({ reconcile_attempts: attempts, metadata: { ...metadata } });
      return {
        before,
        after: before,
        reconciled: false,
        reason: "provider has no billing record yet"
      };
    }
    delete metadata.reconcile_error;
    delete metadata.reconcile_next_at;
    metadata.price_source = "provider-billing";
    await row.update({
      cost: actual.cost,
      currency: actual.currency ?? row.currency,
      quantity: actual.quantity ?? row.quantity,
      unit_price: actual.unit_price ?? row.unit_price,
      reconcile_attempts: attempts,
      reconciled_at: now.toISOString(),
      metadata: { ...metadata }
    });
    return { before, after: actual.cost, reconciled: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    metadata.reconcile_error = reason;
    await row
      .update({ reconcile_attempts: attempts, metadata: { ...metadata } })
      .catch(() => undefined);
    log.warn("Failed to reconcile generation cost", {
      generation_id: row.id,
      provider: row.provider,
      attempt: attempts,
      error: reason
    });
    return { before, after: before, reconciled: false, reason };
  }
}

/** Reconcile one of the caller's generations now, outside the queue. */
export async function reconcileGeneration(
  id: string,
  userId: string,
  resolveSecret: (key: string) => Promise<string | null | undefined>
): Promise<ReconcileOutcome & { found: boolean }> {
  const row = await Prediction.findForUser(userId, id);
  if (!row) {
    return {
      found: false,
      before: null,
      after: null,
      reconciled: false,
      reason: "not found"
    };
  }
  return { found: true, ...(await reconcileRow(row, resolveSecret)) };
}

/**
 * Drain the reconcile queue once: every settled row with a request id and no
 * answer yet whose backoff has elapsed. Returns how many rows it touched.
 */
export async function drainReconcileQueue(
  resolveSecret: ReconcileSecretResolver,
  limit = 50
): Promise<number> {
  const rows = await Prediction.reconcileQueue(limit);
  const nowMs = Date.now();
  let touched = 0;
  for (const row of rows) {
    if ((row.reconcile_attempts ?? 0) >= MAX_RECONCILE_ATTEMPTS) continue;
    const nextAt = row.metadata?.reconcile_next_at;
    if (typeof nextAt === "string" && Date.parse(nextAt) > nowMs) continue;
    await reconcileRow(row, resolveSecret);
    touched += 1;
  }
  return touched;
}

/**
 * Start the reconcile worker: one drain shortly after start (billing events
 * lag the request), then one per interval. Returns the stop function. A host
 * with no database never starts it; an eval attaches none.
 */
export function startGenerationReconcileWorker(opts: {
  resolveSecret: ReconcileSecretResolver;
  intervalMs?: number;
  firstDelayMs?: number;
}): () => void {
  const intervalMs = opts.intervalMs ?? 5 * 60_000;
  const firstDelayMs = opts.firstDelayMs ?? 60_000;
  let stopped = false;
  const drain = (): void => {
    if (stopped) return;
    void drainReconcileQueue(opts.resolveSecret).catch((err: unknown) => {
      log.warn("Reconcile queue drain failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    });
  };
  const first = setTimeout(drain, firstDelayMs);
  const timer = setInterval(drain, intervalMs);
  first.unref?.();
  timer.unref?.();
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(timer);
  };
}

/**
 * Close the `running` rows a dead process left behind. Called once at host
 * start with the process start time; a row a live process is driving started
 * after that, so it cannot be caught. Returns how many rows it closed.
 */
export async function sweepInterruptedGenerations(
  processStartIso: string
): Promise<number> {
  const swept = await Prediction.sweepInterrupted(processStartIso);
  for (const row of swept) {
    await row
      .update({
        metadata: {
          ...(row.metadata ?? {}),
          interrupted_reason: "process restart"
        }
      })
      .catch(() => undefined);
  }
  if (swept.length > 0) {
    log.info("Swept interrupted generations", { count: swept.length });
  }
  return swept.length;
}

/** Test seam: forget the per-process bookkeeping. */
export function resetGenerationTrackerState(): void {
  unrecorded.clear();
  unlinkedByNode.clear();
}
