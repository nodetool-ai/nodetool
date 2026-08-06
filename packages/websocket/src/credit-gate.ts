/**
 * The user-credit spend gate. Off by default: the open platform meters cost
 * but never blocks on it. A product deployment that sells credits (the
 * Studio) sets NODETOOL_CREDITS_ENFORCED=1 and every spend path asks this
 * gate before calling a provider.
 *
 * Like the application-budget gate, it fails open: metering must never take
 * the runner down.
 */
import { checkCredits } from "@nodetool-ai/models";

export const creditsEnforced = (): boolean => {
  const value = process.env.NODETOOL_CREDITS_ENFORCED?.toLowerCase();
  return value === "1" || value === "true";
};

export type CreditGateResult = { allowed: true } | { allowed: false; reason: string };

/**
 * Decide whether `userId` may spend an estimated `estimatedUsd`. Estimates
 * are floors (unpriceable work estimates 0), so an empty balance blocks even
 * a 0-estimate call.
 */
export async function admitSpend(
  userId: string | null | undefined,
  estimatedUsd: number
): Promise<CreditGateResult> {
  if (!creditsEnforced()) return { allowed: true };
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
