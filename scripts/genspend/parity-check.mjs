#!/usr/bin/env node
/**
 * Check NodeTool's local price arithmetic against GenSpend's own calculator.
 *
 * The shipped catalog is a snapshot we compute on locally — nothing about what
 * a user is building leaves the machine — so the risk is that our port of the
 * selection rules drifts from theirs. This re-prices a fixed set of cases from
 * `packages/model-pricing/src/generated/genspend-pricing.json` and asserts each
 * equals `POST https://genspend.io/api/v1/quote` for the same step. It needs
 * the network, so it runs in the nightly sync workflow only, never in the PR
 * quality gate.
 *
 *   node scripts/genspend/parity-check.mjs [catalog.json]
 *   node scripts/genspend/parity-check.mjs --json
 *
 * The cases are pinned to a provider, because an unpinned quote picks the
 * cheapest priceable offering and would compare against an offering our key
 * does not name. Each case therefore carries both vocabularies: GenSpend's
 * `model` slug + provider slug for the quote, and our `<provider_id>:<model_id>`
 * key for the catalog. They are chosen from what our catalog actually covers —
 * GenSpend's documented figures include models NodeTool ships no node for, and
 * comparing those would prove nothing about our data.
 *
 * Two limits, both deliberate:
 *
 * - Every case on a laddered offering states a resolution. `/quote` declines a
 *   laddered offering when none is given; we price the base spec and record an
 *   assumption instead, which is a divergence by design (a node that never set
 *   `resolution` would otherwise show no price at all), so it is not something
 *   parity can assert.
 * - `per_request` extras are unasserted: both catalog entries carrying one
 *   (`fal-ai/z-image/turbo`, `nvidia/cosmos-3-super/text-to-image`) are models
 *   `/quote` declines outright, so there is no figure to compare. They are
 *   excluded from the total on both sides, which is what matters.
 *
 * A case can also go stale on GenSpend's side: an offering they stop serving is
 * dropped from the export, so the sync drops our row and `/quote` refuses the
 * step. Both sides then agree, and the case has nothing left to assert — it is
 * reported as delisted and does not count toward the priced total. That path
 * needs both halves (see `isDelisted`), because a quote that declines while we
 * still carry a price is the finding worth failing on: the shipped catalog is
 * quoting a model the provider no longer serves.
 *
 * Exit code 0 only when every case matched AND at least `MIN_PRICED_CASES` were
 * really priced: a run that resolved nothing must fail rather than pass empty.
 * That count is what stops delistings from hollowing the check out quietly.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_CATALOG = join(
  ROOT,
  "packages/model-pricing/src/generated/genspend-pricing.json"
);

export const QUOTE_URL = "https://genspend.io/api/v1/quote";

/** Sub-cent agreement; the two sides do the same multiplications in floats. */
export const EPSILON = 1e-6;

/**
 * A parity run that priced fewer cases than this proves nothing — a catalog
 * that lost every key would otherwise pass with zero comparisons. It is also
 * the backstop under `DELISTED_QUOTE_ERROR`: delistings stop being tolerated
 * once enough of them have hollowed the run out.
 */
export const MIN_PRICED_CASES = 15;

/** The catalog has no row for the case's key at all. */
export const NO_CATALOG_ENTRY = "no catalog entry";

/**
 * `/quote` says the offering is gone at that provider. GenSpend has no
 * structured field for it, so the prose is the signal; a change to the wording
 * surfaces as a failed case rather than a silent reclassification, which is the
 * safe direction.
 */
export const DELISTED_QUOTE_ERROR = /not available at/i;

/** GenSpend's video ladder, plus the spellings a provider page uses for it. */
const RESOLUTION_TIERS = {
  "480p": "480p",
  "540p": "480p",
  "576p": "480p",
  "720p": "720p",
  "768p": "720p",
  "1080p": "1080p",
  "1440p": "2K",
  "2k": "2K",
  "4k": "4K",
  "2160p": "4K"
};

const normalizeResolution = (value) => {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return RESOLUTION_TIERS[key] ?? (key ? value.trim() : null);
};

const PER_SECOND_CLASSES = new Set(["per-video-second", "per-audio-second"]);

const near = (a, b) => Math.abs(a - b) <= EPSILON + Math.abs(b) * 1e-9;

/**
 * Price one step from a stored catalog entry, implementing the subset of
 * GenSpend's rules the fixed cases exercise. Pure: no I/O, no clock.
 *
 * Returns `{ costUsd }` or `{ declined }` — declining is a result, not an
 * error. We never reuse another rung for a resolution the provider does not
 * publish, because understating is the direction that hurts.
 */
export function priceCase(entry, params = {}) {
  if (!entry) return { declined: NO_CATALOG_ENTRY };
  if ((entry.data_flags ?? []).some((f) => f.severity === "quote_wrong")) {
    return { declined: "known quote discrepancy" };
  }

  const resolution = normalizeResolution(params.resolution);
  const rows = entry.variants ?? [];
  const seconds = Number.isFinite(params.seconds) ? params.seconds : null;

  // Clip envelope: `null` declines every duration, an envelope declines what
  // falls outside it.
  if (seconds !== null && "clip_seconds" in entry) {
    const clip = entry.clip_seconds;
    if (clip === null) return { declined: "no receipted clip length" };
    if (clip) {
      if (Array.isArray(clip.set) && !clip.set.includes(seconds)) {
        return { declined: `no published price at ${seconds}s` };
      }
      if (Number.isFinite(clip.min) && seconds < clip.min) {
        return { declined: `below the receipted clip envelope` };
      }
      if (Number.isFinite(clip.max) && seconds > clip.max) {
        return { declined: `above the receipted clip envelope` };
      }
    }
  }

  // Narrow the grid, one axis at a time. A plain t2v/i2v job never takes a
  // video-input row: that is a different billing axis, handled by the re-rate
  // below.
  const baseRow = rows.find((row) => row.is_base) ?? null;
  let candidates = rows.filter((row) => row.video_input !== true);

  const laddered = candidates.filter((row) => row.resolution);
  if (laddered.length > 0) {
    if (resolution) {
      candidates = laddered.filter(
        (row) => normalizeResolution(row.resolution) === resolution
      );
      if (candidates.length === 0) {
        return { declined: `no published price at ${resolution}` };
      }
    } else if (baseRow) {
      // Resolution unset: the provider's own base spec, never the cheapest rung.
      candidates = laddered.filter(
        (row) => row.resolution === baseRow.resolution
      );
    }
  }

  const timed = candidates.filter((row) => Number.isFinite(row.duration_seconds));
  if (timed.length > 0) {
    if (seconds !== null) {
      candidates = timed.filter((row) => row.duration_seconds === seconds);
      if (candidates.length === 0) {
        return { declined: `no published price at ${seconds}s` };
      }
    } else {
      candidates = timed.filter((row) => row.is_base).length > 0
        ? timed.filter((row) => row.is_base)
        : timed;
    }
  }

  // Audio is a billing axis worth up to 2×. Unset, the honest default is
  // whatever the base spec delivers — not the cheaper of the two.
  const wantAudio =
    typeof params.withAudio === "boolean"
      ? params.withAudio
      : typeof baseRow?.with_audio === "boolean"
        ? baseRow.with_audio
        : null;
  if (wantAudio !== null) {
    const audio = candidates.filter((row) => row.with_audio === wantAudio);
    if (audio.length > 0) candidates = audio;
  }

  // Tier is the same shape of axis: a provider selling Standard and Pro under
  // one id delivers the base spec's tier unless the caller says otherwise.
  const wantTier = params.tier ?? baseRow?.tier ?? null;
  if (wantTier) {
    const tiered = candidates.filter((row) => row.tier === wantTier);
    if (tiered.length > 0) candidates = tiered;
  }

  const row = candidates.find((r) => r.is_base) ?? candidates[0] ?? null;
  const unitPrice = row ? row.price_usd : entry.unit_price;
  const unitClass = row ? row.unit_class : entry.unit_class;

  let cost;
  if (PER_SECOND_CLASSES.has(unitClass)) {
    if (seconds === null) return { declined: "duration unknown" };
    cost = unitPrice * seconds;
  } else {
    cost = unitPrice;
  }

  const surcharges = entry.surcharges ?? [];
  const refVideoSeconds = Number.isFinite(params.referenceVideoSeconds)
    ? params.referenceVideoSeconds
    : 0;
  const warnings = [];
  if (refVideoSeconds > 0) {
    // A re-rate replaces the generation cost rather than adding to it, and is
    // scoped by resolution. No row for the requested resolution declines the
    // re-rate — never another rung — leaving the generation cost as a floor.
    const rates = surcharges.filter((s) => s.kind === "input_video_second");
    const rate =
      rates.find((s) => !s.spec) ??
      rates.find(
        (s) => resolution && normalizeResolution(s.spec) === resolution
      ) ??
      null;
    if (rate) {
      if (seconds === null) return { declined: "duration unknown" };
      cost = rate.unit_price_usd * (seconds + refVideoSeconds);
    } else if (rates.length > 0) {
      warnings.push("no video-input rate at this resolution — lower bound");
    }
  }

  const refImages = Number.isFinite(params.referenceImages)
    ? params.referenceImages
    : 0;
  if (refImages > 0) {
    const surcharge = surcharges.find((s) => s.kind === "input_image");
    if (surcharge) {
      cost +=
        Math.max(0, refImages - surcharge.free_allowance) *
        surcharge.unit_price_usd;
    } else {
      warnings.push("reference images not priced here — lower bound");
    }
  }

  // `per_request` extras are opt-in; they are surfaced, never summed.
  const quantity = Number.isFinite(params.quantity) ? params.quantity : 1;
  return { costUsd: cost * quantity, warnings };
}

/**
 * The fixed cases. `key` is our catalog key; `model`/`provider` are GenSpend's
 * vocabulary for the same offering. `expect: "decline"` asserts both sides
 * refuse to price the step.
 */
export const PARITY_CASES = [
  {
    name: "flat per-image price",
    key: "fal_ai:fal-ai/flux-1/dev",
    model: "flux-1-dev",
    provider: "fal"
  },
  {
    // Keeps a second provider in the set, on the entry-level path: no
    // `variants`, so the unit price and class come off the entry itself. It
    // replaced a Together per-image case GenSpend delisted; `/quote` prices no
    // Together image offering our catalog carries, so the swap is to video.
    name: "per-second on an entry with no variant grid, a second provider",
    key: "together:minimax/hailuo-02",
    model: "hailuo-02",
    provider: "together",
    params: { seconds: 6, resolution: "720p" }
  },
  {
    name: "per-second × duration, no ladder to narrow",
    key: "atlascloud:bytedance/seedance-2.0/text-to-video",
    model: "seedance-2",
    provider: "atlascloud",
    params: { seconds: 5, resolution: "720p" }
  },
  {
    name: "per-second × a longer duration",
    key: "atlascloud:bytedance/seedance-2.0/text-to-video",
    model: "seedance-2",
    provider: "atlascloud",
    params: { seconds: 10, resolution: "720p" }
  },
  {
    name: "resolution ladder, base rung",
    key: "kie:bytedance/seedance-2",
    model: "seedance-2",
    provider: "kie",
    params: { seconds: 5, resolution: "720p" }
  },
  {
    name: "resolution ladder, dearer rung",
    key: "kie:bytedance/seedance-2",
    model: "seedance-2",
    provider: "kie",
    params: { seconds: 5, resolution: "1080p" }
  },
  {
    name: "resolution ladder, cheaper rung",
    key: "kie:bytedance/seedance-2",
    model: "seedance-2",
    provider: "kie",
    params: { seconds: 5, resolution: "480p" }
  },
  {
    name: "audio axis, silent (the base spec)",
    key: "kie:kling-3.0/video",
    model: "kling-3.0-standard",
    provider: "kie",
    params: { seconds: 5, resolution: "1080p" }
  },
  {
    name: "audio axis, with audio",
    key: "kie:kling-3.0/video",
    model: "kling-3.0-standard",
    provider: "kie",
    params: { seconds: 5, resolution: "1080p", withAudio: true }
  },
  {
    name: "per-generation duration rung, not multiplied",
    key: "minimax:MiniMax-Hailuo-02",
    model: "hailuo-02",
    provider: "minimax",
    params: { seconds: 6, resolution: "720p" }
  },
  {
    name: "per-generation duration rung, the longer clip",
    key: "minimax:MiniMax-Hailuo-02",
    model: "hailuo-02",
    provider: "minimax",
    params: { seconds: 10, resolution: "720p" }
  },
  {
    name: "tier axis, the base spec's tier",
    key: "kie:hailuo/2-3-image-to-video-standard",
    model: "hailuo-2.3",
    provider: "kie",
    params: { seconds: 6, resolution: "1080p" }
  },
  {
    name: "reference images inside the free allowance",
    key: "fal_ai:minimax/h3/text-to-video",
    model: "minimax-h3",
    provider: "fal",
    params: { seconds: 6, resolution: "720p", referenceImages: 3 }
  },
  {
    name: "reference images past the free allowance, additive",
    key: "fal_ai:minimax/h3/text-to-video",
    model: "minimax-h3",
    provider: "fal",
    params: { seconds: 6, resolution: "720p", referenceImages: 8 }
  },
  {
    name: "reference video re-rates the whole job, scoped to 720p",
    key: "kie:bytedance/seedance-2",
    model: "seedance-2",
    provider: "kie",
    params: { seconds: 5, resolution: "720p", referenceVideoSeconds: 5 }
  },
  {
    name: "reference video re-rate at an unscoped rate",
    key: "fal_ai:fal-ai/wan/v2.7/text-to-video",
    model: "wan-2.7",
    provider: "fal",
    params: { seconds: 5, resolution: "720p", referenceVideoSeconds: 5 }
  },
  {
    name: "no rate at this resolution: generation only, a lower bound",
    key: "kie:bytedance/seedance-2",
    model: "seedance-2",
    provider: "kie",
    params: { seconds: 5, resolution: "480p", referenceVideoSeconds: 5 }
  },
  {
    name: "stated resolution the provider does not publish",
    key: "kie:bytedance/seedance-2",
    model: "seedance-2",
    provider: "kie",
    params: { seconds: 5, resolution: "2K" },
    expect: "decline"
  },
  {
    name: "duration outside the receipted clip envelope",
    key: "fal_ai:fal-ai/veo3.1/fast",
    model: "veo-3.1-fast",
    provider: "fal",
    params: { seconds: 10, resolution: "720p" },
    expect: "decline"
  }
];

/**
 * Did GenSpend stop serving this offering since the case was pinned?
 *
 * Both halves must say so. `/quote` names the delisting, and our own catalog
 * has dropped the row — which `buildPriceIndex` does only for an offering the
 * export no longer marks `available`. A case where the quote declines but we
 * still carry a price is the opposite finding and stays a failure: it means the
 * shipped catalog quotes a model the provider no longer serves.
 */
function isDelisted(local, step) {
  return (
    local.declined === NO_CATALOG_ENTRY &&
    typeof step?.error === "string" &&
    DELISTED_QUOTE_ERROR.test(step.error)
  );
}

/** One case's verdict, for the report and the exit code. */
function compareCase(testCase, entry, step) {
  const local = priceCase(entry, testCase.params ?? {});
  const remote =
    step && typeof step.costUsd === "number" ? step.costUsd : null;
  const declineExpected = testCase.expect === "decline";

  if (local.declined || remote === null) {
    const agree = Boolean(local.declined) && remote === null;
    const delisted = !declineExpected && agree && isDelisted(local, step);
    return {
      name: testCase.name,
      key: testCase.key,
      priced: false,
      declined: true,
      delisted,
      ok: delisted || (agree && declineExpected),
      local: local.declined ?? local.costUsd,
      remote: step?.error ?? remote,
      detail: delisted
        ? `delisted: ${step.error}`
        : agree
          ? declineExpected
            ? "both declined"
            : "both declined, but the case expected a price"
          : `local ${local.declined ?? local.costUsd} vs quote ${
              step?.error ?? remote
            }`
    };
  }

  const ok = !declineExpected && near(local.costUsd, remote);
  return {
    name: testCase.name,
    key: testCase.key,
    priced: true,
    declined: false,
    delisted: false,
    ok,
    local: local.costUsd,
    remote,
    detail: ok
      ? `$${remote.toFixed(6)}`
      : `local $${local.costUsd.toFixed(6)} vs quote $${remote.toFixed(6)}`
  };
}

/**
 * Compare every case and decide the run. Pure — `quoteSteps` is whatever the
 * quote endpoint answered, in case order — so the whole verdict is testable
 * without a network.
 */
export function runComparison({ catalog, quoteSteps, cases = PARITY_CASES }) {
  const results = cases.map((testCase, i) =>
    compareCase(testCase, catalog?.prices?.[testCase.key] ?? null, quoteSteps[i])
  );
  const priced = results.filter((r) => r.priced && r.ok).length;
  const delisted = results.filter((r) => r.delisted);
  const failures = results.filter((r) => !r.ok);
  const vacuous = priced < MIN_PRICED_CASES;
  return {
    results,
    priced,
    delisted,
    failures,
    vacuous,
    ok: failures.length === 0 && !vacuous,
    reason: vacuous
      ? `only ${priced} case(s) priced — at least ${MIN_PRICED_CASES} must match a real price, or the check passes on nothing${
          delisted.length > 0
            ? `; ${delisted.length} case(s) are pinned to offerings GenSpend has delisted and need repointing`
            : ""
        }`
      : failures.length > 0
        ? `${failures.length} case(s) disagree with GenSpend's calculator`
        : null
  };
}

/** The quote request body for a case list, in the same order. */
export function quoteRequest(cases = PARITY_CASES) {
  return {
    steps: cases.map((testCase) => ({
      model: testCase.model,
      provider: testCase.provider,
      ...(testCase.params?.resolution
        ? { resolution: testCase.params.resolution }
        : {}),
      ...(Number.isFinite(testCase.params?.seconds)
        ? { seconds: testCase.params.seconds }
        : {}),
      ...(Number.isFinite(testCase.params?.referenceImages)
        ? { referenceImages: testCase.params.referenceImages }
        : {}),
      ...(Number.isFinite(testCase.params?.referenceVideoSeconds)
        ? { referenceVideoSeconds: testCase.params.referenceVideoSeconds }
        : {}),
      ...(Number.isFinite(testCase.params?.quantity)
        ? { quantity: testCase.params.quantity }
        : {}),
      ...(typeof testCase.params?.withAudio === "boolean"
        ? { audioMode: testCase.params.withAudio ? "with" : "without" }
        : {})
    }))
  };
}

async function fetchQuote(cases, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(QUOTE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "nodetool-cost/1.0 (+https://nodetool.ai)"
        },
        body: JSON.stringify(quoteRequest(cases)),
        signal: AbortSignal.timeout(30_000)
      });
      if (!res.ok) throw new Error(`POST ${QUOTE_URL} → HTTP ${res.status}`);
      const body = await res.json();
      if (!Array.isArray(body?.steps) || body.steps.length !== cases.length) {
        throw new Error(`POST ${QUOTE_URL} → expected ${cases.length} steps`);
      }
      return body.steps;
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
  throw lastError;
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const path = argv.find((arg) => !arg.startsWith("--")) ?? DEFAULT_CATALOG;
  const catalog = JSON.parse(readFileSync(path, "utf8"));

  const steps = await fetchQuote(PARITY_CASES);
  const verdict = runComparison({ catalog, quoteSteps: steps });

  if (json) {
    console.log(JSON.stringify(verdict, null, 2));
  } else {
    for (const result of verdict.results) {
      const label = result.ok ? (result.delisted ? "gone" : "ok  ") : "FAIL";
      console.log(`${label} ${result.name.padEnd(52)} ${result.detail}`);
    }
    console.log(
      `\n${verdict.priced}/${PARITY_CASES.length} case(s) priced and matched against ${QUOTE_URL}.`
    );
    if (verdict.delisted.length > 0) {
      console.log(
        `${verdict.delisted.length} case(s) are pinned to offerings GenSpend has since delisted. ` +
          `Repoint them at a live offering:`
      );
      for (const result of verdict.delisted) {
        console.log(`  - ${result.key}`);
      }
    }
  }

  // stdout, not stderr: on stderr this line interleaved into the middle of the
  // report it summarizes, which is how the CI log read.
  if (!verdict.ok) {
    console.log(`\nParity check failed: ${verdict.reason}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
