/**
 * Provider-spend ledger — the write half of `nodetool costs`.
 *
 * `BaseProvider` accounts for chat and stream in tokens, and the host writes
 * that row. Image, video and audio generation had no equivalent: the money went
 * out and nothing reached the `predictions` table, so a render session read as
 * free.
 *
 * Two kinds of generation reach a ledger row here:
 *
 * - A node that knows its own charge calls `context.setProviderCost()`, which
 *   rides out on the completed `node_update` as `provider_cost`. FAL and kie do
 *   this — the number comes from the provider, so it wins. When the provider
 *   also exposes a request-keyed billing API, the estimate is reconciled to the
 *   actual charge in the background.
 * - Everything else goes through `ProcessingContext.runProviderPrediction` (and
 *   its streaming/encoded siblings), which emits a `prediction` message
 *   carrying provider, model, capability and the job's parameters. That is
 *   priced here against `@nodetool-ai/model-pricing` — the same catalog the
 *   editor's cost preview and the pre-run budget gate read.
 *
 * A model in no catalog still gets a row, with `cost` left null rather than set
 * to zero: the call is visible in `nodetool costs`, and a null is countable as
 * unpriced instead of summing as free. The units behind a price are recorded
 * next to it (`billing_unit`, `quantity`, `unit_price`, `currency`, plus the
 * catalog's own breakdown in `metadata`) so a per-second or per-megapixel row
 * is auditable even when the estimate is imperfect.
 */

import { createLogger } from "@nodetool-ai/config";
import { Prediction } from "@nodetool-ai/models";
import { getModelUnitPrice } from "@nodetool-ai/model-pricing";
import { extractPricingParams } from "@nodetool-ai/node-sdk";
import { getCostReconciler } from "@nodetool-ai/runtime";
import type { ProcessingMessage, ProviderCost } from "@nodetool-ai/protocol";
import {
  createTrackerState,
  trackPredictionMessage,
  type GenerationTrackerState
} from "./generation-tracker.js";

const log = createLogger("nodetool.execution.cost-ledger");

/**
 * Capabilities a provider bills per output rather than per token. Chat,
 * streaming chat and embeddings are absent on purpose: those are token-billed
 * and already accounted for by `BaseProvider.trackUsage`.
 */
const UNIT_BILLED_CAPABILITIES = new Set([
  "text_to_image",
  "image_to_image",
  "inpainting",
  "text_to_video",
  "image_to_video",
  "video_to_video",
  "upscale_image",
  "remove_background",
  "relight_image",
  "segment_image",
  "vectorize_image",
  "lip_sync",
  "text_to_speech",
  "text_to_music",
  "automatic_speech_recognition",
  "text_to_3d",
  "image_to_3d"
]);

/** Whether a capability is billed per unit of output (and so belongs here). */
export function isUnitBilledCapability(
  capability: string | null | undefined
): boolean {
  return capability != null && UNIT_BILLED_CAPABILITIES.has(capability);
}

/** One generation to price and record. */
export interface GenerationSpend {
  userId: string;
  provider: string;
  model: string;
  capability?: string | null;
  /** Outputs produced — the multiplier on the catalog's per-run price. */
  quantity?: number;
  /** What the job stated, in provider parameter spelling (`duration_seconds`, `resolution`, …). */
  params?: Record<string, unknown> | null;
  nodeId?: string;
  nodeType?: string;
  workflowId?: string | null;
  /** The project this run belongs to, when it has one. */
  projectId?: string | null;
  /** The project document this run is producing, when it names one. */
  documentId?: string | null;
  durationMs?: number | null;
}

/** What the catalog answered for a generation, or `null` when it knows no price. */
export interface PricedGeneration {
  cost: number;
  unit_price: number;
  quantity: number;
  billing_unit: string;
  currency: string;
  /** The catalog's own reasoning, e.g. "5 s × $0.205/s at 720p". */
  breakdown?: string;
  /** What the catalog filled in because the job did not state it. */
  assumptions?: string[];
}

/** What a ledger row records about how its cost was arrived at. */
interface GenerationMetadata {
  capability: string | null;
  price_source?: "model-catalog";
  price_breakdown?: string;
  price_assumptions?: string[];
  unpriced_reason?: string;
}

/**
 * Price a generation against the model catalogs. Returns `null` when no catalog
 * carries the model, or when the catalog declines to extrapolate — a refusal is
 * an answer, and inventing a number would be worse than recording none.
 */
export function priceGeneration(
  spend: GenerationSpend
): PricedGeneration | null {
  const quantity = spend.quantity ?? 1;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const price = getModelUnitPrice(
    { id: spend.model, provider: spend.provider },
    extractPricingParams(spend.params)
  );
  if (!price || price.declined) return null;
  if (!Number.isFinite(price.unit_price)) return null;

  const priced: PricedGeneration = {
    cost: price.unit_price * quantity,
    unit_price: price.unit_price,
    quantity,
    billing_unit: price.billing_unit || (spend.capability ?? "run"),
    currency: price.currency || "USD"
  };
  if (price.breakdown) priced.breakdown = price.breakdown;
  if (price.assumptions?.length) priced.assumptions = price.assumptions;
  return priced;
}

/**
 * Write one generation to the ledger. Best-effort: a host with no database
 * (a hermetic run, an eval) must not fail because accounting could not be
 * persisted — the generation already happened and was already billed.
 */
export async function recordGenerationSpend(
  spend: GenerationSpend
): Promise<Prediction | null> {
  const priced = priceGeneration(spend);
  const metadata: GenerationMetadata = {
    capability: spend.capability ?? null
  };
  if (priced) {
    metadata.price_source = "model-catalog";
    if (priced.breakdown) metadata.price_breakdown = priced.breakdown;
    if (priced.assumptions) metadata.price_assumptions = priced.assumptions;
  } else {
    metadata.unpriced_reason = `No unit price for ${spend.provider}/${spend.model} in the model catalogs`;
  }

  try {
    return await Prediction.create<Prediction>({
      user_id: spend.userId,
      provider: spend.provider,
      model: spend.model,
      node_id: spend.nodeId ?? "",
      node_type: spend.nodeType ?? "",
      workflow_id: spend.workflowId ?? null,
      project_id: spend.projectId ?? null,
      document_id: spend.documentId ?? null,
      status: "completed",
      cost: priced ? priced.cost : null,
      billing_unit: priced ? priced.billing_unit : (spend.capability ?? null),
      quantity: priced ? priced.quantity : (spend.quantity ?? 1),
      unit_price: priced ? priced.unit_price : null,
      currency: priced ? priced.currency : null,
      duration: spend.durationMs != null ? spend.durationMs / 1000 : null,
      metadata
    });
  } catch (err) {
    log.debug("Generation spend not recorded", {
      provider: spend.provider,
      model: spend.model,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

/** A charge a node reported for itself, as it rides out on `node_update`. */
export interface NodeCostSpend {
  userId: string;
  cost: ProviderCost;
  nodeId: string;
  nodeType: string;
  workflowId: string | null;
  /** The project this run belongs to, when it has one. */
  projectId?: string | null;
  /** The project document this run is producing, when it names one. */
  documentId?: string | null;
  /** Resolves the provider API key used to look the actual charge up, when one exists. */
  resolveSecret?: (key: string) => Promise<string | null | undefined>;
}

/**
 * Write a node-reported provider charge to the ledger, then refine it into the
 * provider's actual billed amount in the background when that provider
 * registered a reconciler. Best-effort throughout.
 */
export async function recordNodeProviderCost(
  spend: NodeCostSpend
): Promise<Prediction | null> {
  const { cost } = spend;
  // A NaN/Infinity amount from a buggy provider call can't be stored: SQLite
  // has no representation for it and JSON turns it into `null`.
  if (!Number.isFinite(cost.amount)) return null;
  try {
    const prediction = await Prediction.create<Prediction>({
      user_id: spend.userId,
      provider: cost.provider,
      model: cost.model ?? spend.nodeType,
      node_type: spend.nodeType,
      node_id: spend.nodeId,
      workflow_id: spend.workflowId,
      project_id: spend.projectId ?? null,
      document_id: spend.documentId ?? null,
      status: "completed",
      cost: cost.amount,
      currency: cost.currency ?? cost.unit ?? null,
      billing_unit: cost.billing_unit ?? null,
      quantity: cost.quantity ?? null,
      unit_price: cost.unit_price ?? null,
      provider_request_id: cost.provider_request_id ?? null,
      // Set by a token-billed call (an LLM node reporting a `generateLoop`
      // delta), left null by a per-output generation that counts no tokens.
      input_tokens: cost.input_tokens ?? null,
      output_tokens: cost.output_tokens ?? null,
      cached_tokens: cost.cached_tokens ?? null
    });
    if (cost.provider_request_id) {
      void reconcileProviderCost(prediction, spend);
    }
    return prediction;
  } catch (err) {
    log.debug("Node provider cost not recorded", {
      provider: cost.provider,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

/**
 * Replace an estimated charge with the provider's actual billed amount, looked
 * up by request id. Runs detached; leaves the estimate in place when no actual
 * is available.
 */
async function reconcileProviderCost(
  prediction: Prediction,
  spend: NodeCostSpend
): Promise<void> {
  const reconciler = getCostReconciler(spend.cost.provider);
  if (!reconciler || !spend.cost.provider_request_id) return;
  try {
    const secretKey = `${spend.cost.provider.toUpperCase()}_API_KEY`;
    const apiKey = await spend.resolveSecret?.(secretKey);
    const actual = await reconciler({
      requestId: spend.cost.provider_request_id,
      endpointId: spend.cost.model ?? null,
      secrets: apiKey ? { [secretKey]: apiKey } : {}
    });
    if (!actual) return;
    await prediction.update({
      cost: actual.cost,
      currency: actual.currency ?? prediction.currency,
      quantity: actual.quantity ?? prediction.quantity,
      unit_price: actual.unit_price ?? prediction.unit_price
    });
  } catch (err) {
    log.warn("Failed to reconcile provider cost", {
      provider: spend.cost.provider,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

export interface RunCostLedgerOptions {
  userId: string;
  workflowId: string | null;
  /**
   * The project this run belongs to. Left unset outside a project, and the row
   * then carries a null rather than being attributed to the loose bucket — a
   * project's total counts only what named it.
   */
  projectId?: string | null;
  /** The project document this run is producing, when the host names one. */
  documentId?: string | null;
  /** Node type for a node id, so a row names the node that spent the money. */
  nodeType?: (nodeId: string) => string;
  resolveSecret?: (key: string) => Promise<string | null | undefined>;
}

/**
 * A `nodeType` lookup built once per run. Scanning the node list per message
 * would be O(nodes × messages), which a 20 000-node graph feels.
 */
export function nodeTypeLookup(
  nodes: ReadonlyArray<{ id: string; type: string }>
): (nodeId: string) => string {
  const types = new Map(
    nodes.map((node): [string, string] => [node.id, node.type])
  );
  return (nodeId) => types.get(nodeId) ?? "";
}

/** The slice of `ProcessingContext` the ledger listens on. */
export interface CostLedgerSource {
  addMessageListener(listener: (msg: ProcessingMessage) => void): () => void;
}

/**
 * Record every generation a run pays for. Returns the detach function.
 *
 * Listens on the context rather than on a host's outbound message loop so each
 * surface — CLI, ws server, app runtime, debug harness — records once, from the
 * same seam, and cannot drift.
 */
export interface RunCostLedgerHandle {
  /** Detach the listener. */
  (): void;
  /**
   * Resolve once every write the listener has started so far has landed.
   * The listener fires and forgets; a caller that reads the row right after
   * the generation returned (a direct RPC answering its client) waits here.
   */
  settled(): Promise<void>;
}

export function attachRunCostLedger(
  context: CostLedgerSource,
  options: RunCostLedgerOptions
): RunCostLedgerHandle {
  const state = createTrackerState();
  const pending = new Set<Promise<void>>();
  const detach = context.addMessageListener((msg) => {
    const write = recordFromMessage(msg, options, state)
      .catch(() => undefined)
      .finally(() => pending.delete(write));
    pending.add(write);
  });
  return Object.assign(detach, {
    settled: async (): Promise<void> => {
      await Promise.all([...pending]);
    }
  });
}

/**
 * Ledger one run message: a node's self-reported charge, or a completed
 * unit-billed prediction. Anything else is not spend and writes nothing.
 */
export async function recordFromMessage(
  msg: ProcessingMessage,
  options: RunCostLedgerOptions,
  state: GenerationTrackerState = createTrackerState()
): Promise<void> {
  if (msg.type === "node_update" && msg.status === "completed") {
    if (!msg.provider_cost) return;
    // A node that went through the generation seam and whose provider stated
    // its charge already has a row with that charge (design § 6.5). Its own
    // `provider_cost` is the same money a second time.
    if (state.receiptCostNodes.has(msg.node_id)) {
      state.receiptCostNodes.delete(msg.node_id);
      return;
    }
    await recordNodeProviderCost({
      userId: options.userId,
      cost: msg.provider_cost,
      nodeId: msg.node_id,
      nodeType: msg.node_type || options.nodeType?.(msg.node_id) || "",
      workflowId: options.workflowId,
      projectId: options.projectId,
      documentId: options.documentId,
      resolveSecret: options.resolveSecret
    });
    return;
  }

  if (msg.type !== "prediction") return;
  // The tracker opens the row on `running` and closes it on the terminal
  // message, so every state of a generation is a row state.
  await trackPredictionMessage(msg, options, state);
}
