/**
 * The credit spend gate for NodeTool's managed provider.
 *
 * Only spend routed through provider "nodetool" — curated models running on
 * platform-owned keys — is metered; the callers hold that condition. BYOK
 * providers are never gated: their spend rides the user's own keys, and both
 * models coexist on one server.
 *
 * Like the application-budget gate, it fails open: metering must never take
 * the runner down.
 */
import { checkCredits } from "@nodetool-ai/models";

export type CreditGateResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Decide whether `userId` may spend an estimated `estimatedUsd` through the
 * managed provider. Estimates are floors (unpriceable work estimates 0), so
 * an empty balance blocks even a 0-estimate call.
 */
export async function admitSpend(
  userId: string | null | undefined,
  estimatedUsd: number
): Promise<CreditGateResult> {
  try {
    const decision = await checkCredits(userId ?? "1", estimatedUsd);
    return decision.allowed
      ? { allowed: true }
      : { allowed: false, reason: decision.reason };
  } catch (error) {
    console.error("Credit gate check failed (failing open):", error);
    return { allowed: true };
  }
}
