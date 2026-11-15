/**
 * Credit and quota admission for one provider call.
 *
 * A chat turn and a workflow run are admitted once, before they start
 * (`session/chat-turn.ts`, `session/job-execution.ts`). An MCP session has no
 * turn and no run to admit: every tool call, and every call an action makes,
 * reaches the provider on its own. This check runs inside the generation seam
 * instead, per call, with the provider and model the call resolved. It
 * applies the same two gates: the managed provider's credit balance and model
 * whitelist (`admitSpend`), and the admin's per-user quotas and spend
 * permissions (`admitQuota`).
 */
import { getModelUnitPrice } from "@nodetool-ai/model-pricing";
import { extractPricingParams } from "@nodetool-ai/node-sdk/pricing-params";
import type { GenerationRequest, ProcessingContext } from "@nodetool-ai/runtime";
import { admitSpend, releaseSpend, reserveSpend } from "../credit-gate.js";
import { admitQuota, type QuotaKind } from "../quota-gate.js";
import { isFiniteNumber } from "./wire-values.js";

/** Capabilities billed by the token, under the language-model budget. */
const TOKEN_CAPABILITIES: ReadonlySet<string> = new Set([
  "generate_message",
  "generate_messages",
  "generate_embedding",
  "rerank"
]);

/** The error a refused generation fails with. */
export class GenerationRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationRefusedError";
  }
}

function quotaKindOf(capability: string): QuotaKind {
  return TOKEN_CAPABILITIES.has(capability) ? "tokens" : "media";
}

/** Prediction statuses after which a generation spends nothing more. */
const TERMINAL_PREDICTION_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "cancelled"
]);

/**
 * What a managed-provider generation is expected to cost, from the model's
 * catalog price and the size the request asks for. Token-billed calls and
 * models with no catalog price estimate 0, as on the other entrances.
 */
export function estimateGenerationSpend(
  request: Pick<GenerationRequest, "provider" | "capability" | "model" | "params">
): number {
  if (request.provider !== "nodetool" || !request.model) return 0;
  if (TOKEN_CAPABILITIES.has(String(request.capability))) return 0;
  const unit = getModelUnitPrice(
    { id: request.model, provider: "nodetool" },
    extractPricingParams(request.params ?? {})
  );
  if (!unit || unit.declined || !isFiniteNumber(unit.unit_price)) return 0;
  const count = request.params?.["num_images"];
  const variations = isFiniteNumber(count) && count >= 1 ? Math.floor(count) : 1;
  return unit.unit_price * variations;
}

/**
 * Admit one generation for `userId`, or throw a {@link GenerationRefusedError}
 * naming why. Both gates fail open on their own errors, as at every other
 * entrance; the permission flags fail closed. A managed-provider call is
 * admitted against its estimated cost. With `reservationKey`, that estimate
 * is also held until the caller releases the key, so parallel calls admit
 * against each other instead of each against the same balance.
 */
export async function admitGenerationRequest(
  userId: string,
  request: Pick<GenerationRequest, "provider" | "capability" | "model" | "params">,
  reservationKey?: string
): Promise<void> {
  const estimatedUsd = estimateGenerationSpend(request);
  if (request.provider === "nodetool") {
    const credit = await admitSpend(
      userId,
      estimatedUsd,
      request.model ? [request.model] : []
    );
    if (!credit.allowed) throw new GenerationRefusedError(credit.reason);
  }
  const quota = await admitQuota(userId, [
    { kind: quotaKindOf(String(request.capability)), provider: request.provider }
  ]);
  if (!quota.allowed) throw new GenerationRefusedError(quota.reason);
  if (reservationKey && estimatedUsd > 0) {
    reserveSpend(userId, reservationKey, estimatedUsd);
  }
}

/**
 * {@link admitGenerationRequest} bound to one user, as a seam hook. With
 * `context`, each admitted estimate is reserved under the generation's id and
 * released when the context emits that generation's terminal `prediction`
 * message. Without one (a workflow or app run, whose own entrance reserves),
 * nothing is held.
 */
export function generationAdmissionFor(
  userId: string,
  context?: ProcessingContext
): (request: GenerationRequest, generationId: string) => Promise<void> {
  if (!context) {
    return (request) => admitGenerationRequest(userId, request);
  }
  const keyOf = (generationId: string): string => `mcp-generation:${generationId}`;
  context.addMessageListener((message) => {
    if (
      message.type === "prediction" &&
      TERMINAL_PREDICTION_STATUSES.has(message.status)
    ) {
      releaseSpend(userId, keyOf(message.id));
    }
  });
  return (request, generationId) =>
    admitGenerationRequest(userId, request, keyOf(generationId));
}
