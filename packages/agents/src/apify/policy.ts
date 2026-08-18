/**
 * What this install will let an actor do — the reason this integration is not
 * remote code execution by proxy.
 *
 * An Apify actor is somebody else's program, run on somebody else's machines,
 * against a URL a model chose. Three separate things therefore have to be
 * decided before one runs, and they are decided here rather than at the call
 * sites so there is one place to read and one place to test:
 *
 *   1. **Which actors** — the mode and the allowlist.
 *   2. **Where they may point** — URL screening of the actor's own input.
 *   3. **How much they may spend** — the per-session budget.
 *
 * None of this replaces NodeTool's permission gate. Every capability in the
 * module carries a category and goes through `run.invoke` like all the others;
 * this is the Apify-specific layer *underneath* that gate, answering questions
 * the generic gate has no way to ask — the gate knows "this call is external",
 * it does not know that `compass/google-maps-extractor` is not on the list.
 */

import { isSafePublicHttpsUrl } from "@nodetool-ai/runtime";

import { ApifyError } from "./errors.js";
import { CATALOG_ACTOR_IDS } from "./catalog.js";
import { toCanonicalActorId } from "./client.js";
import { isRecord, isString } from "../utils/type-guards.js";

/**
 * How much of Apify this install exposes.
 *
 * - `disabled` — no Apify call of any kind.
 * - `allowlist` — the shipped catalog plus whatever the operator added, and
 *   nothing else. Store search is refused: there is no point letting a model
 *   discover actors it cannot run. **The default.**
 * - `discovery` — search and inspect the whole store freely; run an
 *   allowlisted actor directly, and anything else only after the user approves
 *   that specific actor through the normal permission prompt.
 * - `unrestricted` — any actor, for trusted environments.
 */
export type ApifyPolicyMode =
  | "disabled"
  | "allowlist"
  | "discovery"
  | "unrestricted";

const MODES: ReadonlySet<string> = new Set([
  "disabled",
  "allowlist",
  "discovery",
  "unrestricted"
]);

/** Ceilings a single session may not exceed, whatever a model asks for. */
export interface ApifyBudget {
  /** Actor runs one session may start. */
  readonly maxRuns: number;
  /** Dataset items one run may be billed for. */
  readonly maxItems: number;
  /** Wall clock one run may take, in seconds. */
  readonly maxRunSeconds: number;
  /** Memory one run may be given, in MB. */
  readonly maxMemoryMb: number;
  /** Total Apify spend one session may incur, in USD. */
  readonly maxCostUsd: number;
}

export const DEFAULT_BUDGET: ApifyBudget = {
  maxRuns: 10,
  maxItems: 1000,
  maxRunSeconds: 300,
  maxMemoryMb: 4096,
  maxCostUsd: 5
};

export interface ApifyPolicy {
  readonly mode: ApifyPolicyMode;
  /** Canonical actor ids runnable without an approval prompt. */
  readonly allowlist: ReadonlySet<string>;
  readonly budget: ApifyBudget;
}

function positiveNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Read the policy from the environment.
 *
 * `NODETOOL_APIFY_MODE` picks the mode and `NODETOOL_APIFY_ALLOWED_ACTORS` is
 * a comma-separated list *added to* the shipped catalog — added rather than
 * replacing it, because the common operator intent is "the usual ones plus
 * mine", and a replacing list silently turns off the wrappers.
 */
export function apifyPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ApifyPolicy {
  const raw = (env.NODETOOL_APIFY_MODE ?? "").trim().toLowerCase();
  const mode = (MODES.has(raw) ? raw : "allowlist") as ApifyPolicyMode;
  const extra = (env.NODETOOL_APIFY_ALLOWED_ACTORS ?? "")
    .split(",")
    .map((id) => toCanonicalActorId(id).trim())
    .filter((id) => id.length > 0);

  return {
    mode,
    allowlist: new Set([...CATALOG_ACTOR_IDS, ...extra]),
    budget: {
      maxRuns: positiveNumberEnv("NODETOOL_APIFY_MAX_RUNS", DEFAULT_BUDGET.maxRuns),
      maxItems: positiveNumberEnv(
        "NODETOOL_APIFY_MAX_ITEMS",
        DEFAULT_BUDGET.maxItems
      ),
      maxRunSeconds: positiveNumberEnv(
        "NODETOOL_APIFY_MAX_RUN_SECONDS",
        DEFAULT_BUDGET.maxRunSeconds
      ),
      maxMemoryMb: positiveNumberEnv(
        "NODETOOL_APIFY_MAX_MEMORY_MB",
        DEFAULT_BUDGET.maxMemoryMb
      ),
      maxCostUsd: positiveNumberEnv(
        "NODETOOL_APIFY_MAX_COST_USD",
        DEFAULT_BUDGET.maxCostUsd
      )
    }
  };
}

/** What a policy decided about running one actor. */
export type ActorVerdict =
  /** Run it. */
  | { readonly decision: "allow" }
  /** Run it only if the user approves this actor by name. */
  | { readonly decision: "ask"; readonly reason: string }
  | { readonly decision: "deny"; readonly reason: string };

/** Whether discovery — store search and inspecting an arbitrary actor — is on. */
export function allowsDiscovery(policy: ApifyPolicy): boolean {
  return policy.mode === "discovery" || policy.mode === "unrestricted";
}

/** Decide whether `actorId` may run under `policy`. */
export function decideActor(
  policy: ApifyPolicy,
  actorId: string
): ActorVerdict {
  const id = toCanonicalActorId(actorId);
  if (policy.mode === "disabled") {
    return {
      decision: "deny",
      reason:
        "The Apify integration is disabled on this install " +
        "(NODETOOL_APIFY_MODE=disabled)."
    };
  }
  if (policy.mode === "unrestricted" || policy.allowlist.has(id)) {
    return { decision: "allow" };
  }
  if (policy.mode === "discovery") {
    return {
      decision: "ask",
      reason: `${id} is not on this install's Apify allowlist and needs approval before it runs.`
    };
  }
  return {
    decision: "deny",
    reason:
      `${id} is not on this install's Apify allowlist. Allowed actors: ` +
      `${[...policy.allowlist].sort().join(", ")}. An operator can add one ` +
      "with NODETOOL_APIFY_ALLOWED_ACTORS, or set NODETOOL_APIFY_MODE=discovery " +
      "to approve actors per run."
  };
}

/**
 * Whether a URL an actor is being pointed at resolves somewhere public.
 *
 * `isSafePublicHttpsUrl` carries NodeTool's IP-range logic — loopback, RFC1918,
 * link-local, CGNAT, cloud metadata, and the IPv6 forms that smuggle an IPv4
 * address — and reusing it beats a second copy that drifts. It also insists on
 * https, which is right for a download and wrong here: actors legitimately
 * crawl plain-http sites. So the scheme is normalized to https for the *host*
 * check and the real scheme is checked separately.
 *
 * Apify runs on Apify's machines, so a private address in an actor input
 * cannot reach NodeTool's own network — unless NodeTool is reachable from the
 * internet, which is exactly the self-hosted case, and a `.internal` hostname
 * that only resolves inside a customer VPC is another. The check is cheap and
 * the failure mode is expensive, so it runs regardless of who is hosting.
 */
export function isPubliclyRoutableUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const asHttps = new URL(parsed.toString());
  asHttps.protocol = "https:";
  return isSafePublicHttpsUrl(asHttps.toString());
}

/** Every string in `value` that parses as a URL, at any depth. */
function collectUrls(value: unknown, found: string[] = []): string[] {
  if (isString(value)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim())) found.push(value.trim());
    return found;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectUrls(entry, found);
    return found;
  }
  if (isRecord(value)) {
    for (const entry of Object.values(value)) collectUrls(entry, found);
    return found;
  }
  return found;
}

/**
 * Refuse an actor input that points anywhere non-public.
 *
 * The walk is over the whole input rather than a known set of URL fields:
 * every actor names its URL field differently (`startUrls`, `url`,
 * `directUrls`, `queries` carrying a URL), and a check that only knows
 * `startUrls` is a check a model routes around by accident.
 */
export function assertActorInputUrlsArePublic(
  input: Record<string, unknown>
): void {
  for (const url of collectUrls(input)) {
    if (!isPubliclyRoutableUrl(url)) {
      throw new ApifyError(
        "invalid_input",
        `Refusing to point an Apify actor at ${url}: actor inputs may only ` +
          "target public http(s) addresses, not loopback, private-network, " +
          "or cloud-metadata destinations."
      );
    }
  }
}

/**
 * A session's running Apify spend.
 *
 * Per session rather than per call, because the risk being bounded is an
 * autonomous agent looping — any single run is affordable, and it is the
 * eleventh that is the problem. It is a plain mutable counter held by the
 * capability run, so a workflow, a chat turn, and a Code node each get their
 * own without any of them being able to reset another's.
 */
export class ApifyBudgetLedger {
  #runs = 0;
  #costUsd = 0;
  readonly budget: ApifyBudget;

  constructor(budget: ApifyBudget = DEFAULT_BUDGET) {
    this.budget = budget;
  }

  get runs(): number {
    return this.#runs;
  }

  get costUsd(): number {
    return this.#costUsd;
  }

  /** Claim one run's slot, or refuse before anything is started or billed. */
  reserveRun(actorId: string): void {
    if (this.#runs >= this.budget.maxRuns) {
      throw new ApifyError(
        "budget_exceeded",
        `This session has already started ${this.#runs} Apify runs, its limit. ` +
          `Refusing to start ${actorId}.`,
        { actorId }
      );
    }
    if (this.#costUsd >= this.budget.maxCostUsd) {
      throw new ApifyError(
        "budget_exceeded",
        `This session has spent $${this.#costUsd.toFixed(2)} on Apify, its ` +
          `limit of $${this.budget.maxCostUsd.toFixed(2)}.`,
        { actorId }
      );
    }
    this.#runs += 1;
  }

  /** Record what a finished run actually cost, as Apify reported it. */
  recordCost(usd: number | undefined): void {
    if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) {
      this.#costUsd += usd;
    }
  }

  /** Clamp a caller's run options to the budget. */
  clampRunOptions(options: {
    timeoutSecs?: number;
    memoryMbytes?: number;
    maxItems?: number;
  }): { timeoutSecs: number; memoryMbytes?: number; maxItems: number } {
    return {
      timeoutSecs: Math.min(
        options.timeoutSecs ?? this.budget.maxRunSeconds,
        this.budget.maxRunSeconds
      ),
      ...(options.memoryMbytes === undefined
        ? {}
        : {
            memoryMbytes: Math.min(
              options.memoryMbytes,
              this.budget.maxMemoryMb
            )
          }),
      maxItems: Math.min(
        options.maxItems ?? this.budget.maxItems,
        this.budget.maxItems
      )
    };
  }
}
