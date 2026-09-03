/**
 * The credit spend gate for NodeTool's managed provider.
 *
 * Only spend routed through provider "nodetool" — curated models running on
 * platform-owned keys — is metered; the callers hold that condition. BYOK
 * providers are never gated: their spend rides the user's own keys, and both
 * models coexist on one server.
 *
 * Two things can refuse a call: a model the operator did not whitelist
 * (`NODETOOL_CREDIT_MODELS`), and a balance that cannot cover the estimate.
 * Callers pass the managed model ids the work names so the first refusal
 * arrives before the run starts, with the model in the message.
 *
 * Like the application-budget gate, it fails open: metering must never take
 * the runner down.
 */
import { checkCredits, type CreditRefusal } from "@nodetool-ai/models";

export type CreditGateResult =
  | { allowed: true }
  | { allowed: false; refusal: CreditRefusal; reason: string };

/**
 * In-flight reservations: spend admitted but not yet in the prediction
 * ledger. Without them, N concurrent submissions all pass against the same
 * balance and a small balance authorizes N× its worth of platform spend.
 * A reservation is taken when a run is admitted and released at its terminal
 * state (or cancel-while-queued); the TTL bounds leaks from paths that never
 * reach either (process-local state — a multi-instance deployment needs the
 * reservation moved into the database, as application-budgets does).
 */
interface SpendReservation {
  usd: number;
  at: number;
}

const RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;
const reservations = new Map<string, Map<string, SpendReservation>>();

export function reserveSpend(
  userId: string,
  key: string,
  estimatedUsd: number
): void {
  let byKey = reservations.get(userId);
  if (!byKey) {
    byKey = new Map();
    reservations.set(userId, byKey);
  }
  byKey.set(key, { usd: Math.max(0, estimatedUsd), at: Date.now() });
}

/** Releasing an unknown key is a no-op, so terminal paths can call it blindly. */
export function releaseSpend(userId: string, key: string): void {
  const byKey = reservations.get(userId);
  if (!byKey) return;
  byKey.delete(key);
  if (byKey.size === 0) reservations.delete(userId);
}

export function reservedSpendUsd(userId: string): number {
  const byKey = reservations.get(userId);
  if (!byKey) return 0;
  const cutoff = Date.now() - RESERVATION_TTL_MS;
  let total = 0;
  for (const [key, reservation] of byKey) {
    if (reservation.at < cutoff) {
      byKey.delete(key);
      continue;
    }
    total += reservation.usd;
  }
  if (byKey.size === 0) reservations.delete(userId);
  return total;
}

/**
 * Decide whether `userId` may spend an estimated `estimatedUsd` through the
 * managed provider on `models`, counting spend already admitted but not yet
 * settled. Estimates are floors (unpriceable work estimates 0), so an empty
 * balance blocks even a 0-estimate call.
 */
export async function admitSpend(
  userId: string | null | undefined,
  estimatedUsd: number,
  models: readonly string[] = []
): Promise<CreditGateResult> {
  try {
    const decision = await checkCredits(
      userId ?? "1",
      estimatedUsd + reservedSpendUsd(userId ?? "1"),
      models
    );
    return decision.allowed
      ? { allowed: true }
      : {
          allowed: false,
          refusal: decision.refusal,
          reason: decision.reason
        };
  } catch (error) {
    console.error("Credit gate check failed (failing open):", error);
    return { allowed: true };
  }
}
