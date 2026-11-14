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
import type { GenerationRequest } from "@nodetool-ai/runtime";
import { admitSpend } from "../credit-gate.js";
import { admitQuota, type QuotaKind } from "../quota-gate.js";

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

/**
 * Admit one generation for `userId`, or throw a {@link GenerationRefusedError}
 * naming why. Both gates fail open on their own errors, as at every other
 * entrance; the permission flags fail closed.
 */
export async function admitGenerationRequest(
  userId: string,
  request: Pick<GenerationRequest, "provider" | "capability" | "model">
): Promise<void> {
  if (request.provider === "nodetool") {
    const credit = await admitSpend(userId, 0, request.model ? [request.model] : []);
    if (!credit.allowed) throw new GenerationRefusedError(credit.reason);
  }
  const quota = await admitQuota(userId, [
    { kind: quotaKindOf(String(request.capability)), provider: request.provider }
  ]);
  if (!quota.allowed) throw new GenerationRefusedError(quota.reason);
}

/** {@link admitGenerationRequest} bound to one user, as a seam hook. */
export function generationAdmissionFor(
  userId: string
): (request: GenerationRequest) => Promise<void> {
  return (request) => admitGenerationRequest(userId, request);
}
