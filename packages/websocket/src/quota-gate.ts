/**
 * The spend limits an admin of a self-hosted server sets per user.
 *
 * Two budgets exist: language-model tokens, and media generation in USD. A
 * call checks only the budgets it would spend from, and only when the provider
 * would be paid with the server's key: work on a key the user saved is theirs
 * to pay for. Limits apply per UTC day or month, read from the prediction
 * ledger (see `user-quota.ts` in models).
 *
 * The check runs before work starts. A run already admitted finishes even if
 * it crosses the limit, and the next one is refused. Like the credit gate, it
 * fails open: metering must never take the runner down.
 *
 * The same call checks the permission flags that cover spending first:
 * `use_llm` for token work, `generate_media` for media work, and
 * `use_server_keys` for any work the server's key would pay for. Those fail
 * closed, since a permission is an access rule (see `lib/permissions.ts`).
 */
import { createLogger } from "@nodetool-ai/config";
import {
  getEffectiveQuota,
  providerKeySource,
  quotaUsage,
  setProviderCredentialKeyResolver,
  type EffectiveQuota
} from "@nodetool-ai/models";
import {
  PROVIDER_MODEL_TYPES,
  type NodeMetadataLike
} from "@nodetool-ai/node-sdk/cost-estimate";
import {
  getProviderSecretKey,
  getRegisteredProvider
} from "@nodetool-ai/runtime";

import { permissionRefusal, permissionsFor } from "./lib/permissions.js";

const log = createLogger("nodetool.websocket.quota-gate");

export type QuotaKind = "tokens" | "media";

/** One provider a call would spend through. */
export interface QuotaNeed {
  kind: QuotaKind;
  provider: string;
  /** The pre-run estimate for media work, when one exists. */
  estimatedUsd?: number;
}

export type QuotaDecision =
  | { allowed: true }
  | { allowed: false; kind: QuotaKind | "permission"; reason: string };

/** How long a user's limits are reused before they are read again. */
export const QUOTA_CACHE_TTL_MS = 30_000;

const cache = new Map<string, { quota: EffectiveQuota; at: number }>();

/** Drop cached limits, after an admin changes them. */
export function forgetQuota(userId?: string): void {
  if (userId === undefined) cache.clear();
  else cache.delete(userId);
}

async function limitsFor(userId: string, now: number): Promise<EffectiveQuota> {
  const hit = cache.get(userId);
  if (hit && now - hit.at < QUOTA_CACHE_TTL_MS) return hit.quota;
  const quota = await getEffectiveQuota(userId);
  cache.set(userId, { quota, at: now });
  return quota;
}

/**
 * Name the credential a provider bills against, so the ledger can record
 * whose key paid. A registered provider with no key (a local runtime) has
 * none. A node family that calls its vendor directly (FAL, kie, Replicate)
 * is not a registered provider and follows the `<PROVIDER>_API_KEY` naming.
 */
export function providerCredentialKey(provider: string): string | null {
  if (!provider) return null;
  if (getRegisteredProvider(provider)) return getProviderSecretKey(provider);
  if (provider === "fal_ai" || provider === "fal") return "FAL_API_KEY";
  if (provider === "replicate") return "REPLICATE_API_TOKEN";
  return `${provider.toUpperCase()}_API_KEY`;
}

/** Called once at server start, so every new ledger row records its payer. */
export function installQuotaLedger(): void {
  setProviderCredentialKeyResolver(providerCredentialKey);
}

const formatTokens = (value: number): string =>
  Math.round(value).toLocaleString("en-US");

const periodWord = (period: string): string =>
  period === "day" ? "today" : "this month";

/**
 * Decide whether `userId` may start work that spends through `needs`. Needs
 * paid with the user's own key are left out before any limit is read.
 */
export async function admitQuota(
  userId: string | null | undefined,
  needs: readonly QuotaNeed[],
  now = new Date()
): Promise<QuotaDecision> {
  if (!userId || needs.length === 0) return { allowed: true };

  const sources = new Map<string, Promise<string | null>>();
  const keySource = (provider: string): Promise<string | null> => {
    const source = sources.get(provider) ?? providerKeySource(userId, provider);
    sources.set(provider, source);
    return source;
  };
  const paidByServer = async (provider: string): Promise<boolean> =>
    (await keySource(provider)) !== "user";

  try {
    const refusal = await spendPermissionRefusal(userId, needs, keySource);
    if (refusal) return { allowed: false, kind: "permission", reason: refusal };
  } catch (error) {
    log.error("Permission check failed (refusing)", {
      userId,
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      allowed: false,
      kind: "permission",
      reason: "Could not check your permissions. Try again in a moment."
    };
  }

  try {
    const { quota } = await limitsFor(userId, now.getTime());
    if (!quota) return { allowed: true };
    if (quota.tokenLimit === null && quota.mediaUsdLimit === null) {
      return { allowed: true };
    }

    let wantsTokens = false;
    let wantsMedia = false;
    let mediaEstimate = 0;
    for (const need of needs) {
      if (need.kind === "tokens" && quota.tokenLimit === null) continue;
      if (need.kind === "media" && quota.mediaUsdLimit === null) continue;
      if (!(await paidByServer(need.provider))) continue;
      if (need.kind === "tokens") {
        wantsTokens = true;
      } else {
        wantsMedia = true;
        const estimate = need.estimatedUsd ?? 0;
        mediaEstimate += Number.isFinite(estimate) && estimate > 0 ? estimate : 0;
      }
    }
    if (!wantsTokens && !wantsMedia) return { allowed: true };

    const usage = await quotaUsage(userId, quota.period, now);
    const when = periodWord(quota.period);
    if (wantsTokens && quota.tokenLimit !== null && usage.tokens >= quota.tokenLimit) {
      return {
        allowed: false,
        kind: "tokens",
        reason: `You have used ${formatTokens(usage.tokens)} of your ${formatTokens(quota.tokenLimit)} model tokens ${when}. Ask an admin to raise your limit, or add your own provider key in Settings.`
      };
    }
    if (
      wantsMedia &&
      quota.mediaUsdLimit !== null &&
      (usage.mediaUsd >= quota.mediaUsdLimit ||
        usage.mediaUsd + mediaEstimate > quota.mediaUsdLimit)
    ) {
      const spent = `$${usage.mediaUsd.toFixed(2)} of your $${quota.mediaUsdLimit.toFixed(2)} media budget ${when}`;
      return {
        allowed: false,
        kind: "media",
        reason:
          usage.mediaUsd >= quota.mediaUsdLimit
            ? `You have spent ${spent}. Ask an admin to raise your limit, or add your own provider key in Settings.`
            : `You have spent ${spent}, and this would add about $${mediaEstimate.toFixed(2)}. Ask an admin to raise your limit, or add your own provider key in Settings.`
      };
    }
    return { allowed: true };
  } catch (error) {
    log.error("Quota check failed (failing open)", {
      userId,
      error: error instanceof Error ? error.message : String(error)
    });
    return { allowed: true };
  }
}

/**
 * The refusal for the first spending permission `needs` lack, else null. A
 * provider with no credential (a local runtime) never uses a server key.
 */
async function spendPermissionRefusal(
  userId: string,
  needs: readonly QuotaNeed[],
  keySource: (provider: string) => Promise<string | null>
): Promise<string | null> {
  const flags = await permissionsFor(userId);
  if (!flags.use_llm && needs.some((need) => need.kind === "tokens")) {
    return permissionRefusal("use_llm");
  }
  if (!flags.generate_media && needs.some((need) => need.kind === "media")) {
    return permissionRefusal("generate_media");
  }
  if (!flags.use_server_keys) {
    for (const need of needs) {
      if (providerCredentialKey(need.provider) === null) continue;
      if ((await keySource(need.provider)) === "server") {
        return permissionRefusal("use_server_keys");
      }
    }
  }
  return null;
}

/** Model-selection property types that bill in tokens. */
const TOKEN_MODEL_TYPES = new Set(["language_model", "embedding_model"]);

interface GraphNodeLike {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface EstimateItemLike {
  node_id: string;
  estimated_cost: number;
}

/**
 * What a workflow graph would spend from: a node that selects a language or
 * embedding model needs the token budget, one that selects an image, video,
 * speech or transcription model, or is a FAL or kie node, needs the media
 * budget at its estimated cost.
 */
export function quotaNeedsForGraph(
  nodes: readonly GraphNodeLike[],
  getMetadata: (nodeType: string) => NodeMetadataLike | undefined,
  items: readonly EstimateItemLike[]
): QuotaNeed[] {
  const costs = new Map(items.map((item) => [item.node_id, item]));
  const needs: QuotaNeed[] = [];
  for (const node of nodes) {
    const metadata = getMetadata(node.type);
    const item = costs.get(node.id);
    if (metadata?.fal_unit_pricing || metadata?.kie_unit_pricing) {
      needs.push({
        kind: "media",
        provider: metadata.fal_unit_pricing ? "fal_ai" : "kie",
        estimatedUsd: item?.estimated_cost
      });
      continue;
    }
    for (const property of metadata?.properties ?? []) {
      const propType = property?.type?.type;
      const name = property?.name;
      if (!name || !propType || !PROVIDER_MODEL_TYPES.has(propType)) continue;
      const value = node.data[name];
      if (value === null || typeof value !== "object") continue;
      const provider = (value as { provider?: unknown }).provider;
      if (typeof provider !== "string" || provider === "") continue;
      needs.push(
        TOKEN_MODEL_TYPES.has(propType)
          ? { kind: "tokens", provider }
          : { kind: "media", provider, estimatedUsd: item?.estimated_cost }
      );
      break;
    }
  }
  return needs;
}
