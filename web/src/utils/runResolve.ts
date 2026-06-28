import type { NodeKind } from "./nodeHash";
import {
  newestCompletedGenerationForSignature,
  type Generation
} from "./nodeGenerations";

/**
 * Reuse resolution for run-subgraph caching (spec §5).
 *
 * Bottom-up (sources → target), memoized, with TTL + dirty propagation. Given a
 * node, decides whether a partial run can reuse cached work, must replay a
 * multi-select stream, must re-run, or must block:
 *
 *   - "reuse"  — a usable cached result exists (Constant live value, fresh
 *                Computed cache, or a completed Generative generation).
 *   - "replay" — a Generative with ≥2 selected generations streams that ordered
 *                set (ForEach replay); counts as "will run" for downstreams.
 *   - "run"    — must execute (cache miss / expired / dirty upstream / cycle).
 *   - "block"  — a Generative has no usable generation; the run cannot proceed.
 *
 * Pure: every graph fact is read through injected accessors (no live-store
 * imports), so this is unit-testable with a fixed `now`.
 */

export type ResolveDecision = "reuse" | "replay" | "run" | "block";

export interface ResolveContext {
  /** constant | generative | computed (see nodeHash classify). */
  classify: (_id: string) => NodeKind;
  /** The node's current effective-input digest (TTL-free content key). */
  inputSignature: (_id: string) => string;
  /** Distinct inbound source node ids. */
  upstreamIds: (_id: string) => string[];
  /** Per-type cache TTL in seconds, `"forever"`, or unset (never cache). */
  cacheTtl: (_id: string) => number | "forever" | undefined;
  /** Merged generation history, oldest→newest; entries may carry inputSignature. */
  generations: (_id: string) => Generation[];
  /** `node.data.selected_generations` — explicit multi-select set. */
  selectedGenerationIds: (_id: string) => string[];
  /** `node.data.selected_generation` — single pinned generation id. */
  selectedGenerationId: (_id: string) => string | undefined;
  /** Injected clock (ms). Tests pass a fixed value. */
  now: number;
}

export const resolve = (
  nodeId: string,
  ctx: ResolveContext
): ResolveDecision => {
  const memo = new Map<string, ResolveDecision>();
  const visiting = new Set<string>();

  const go = (id: string): ResolveDecision => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    // Cycle guard: a back-edge resolves to "run" (the SCC re-executes as a unit),
    // never recursing forever (spec §8). Not memoized — the in-progress node
    // memoizes its real decision when its own frame unwinds.
    if (visiting.has(id)) return "run";
    visiting.add(id);
    const decision = compute(id);
    visiting.delete(id);
    memo.set(id, decision);
    return decision;
  };

  const compute = (id: string): ResolveDecision => {
    const kind = ctx.classify(id);

    // A constant is deterministic: its output is its config, captured by its
    // outputIdentity, so a downstream cache keyed on that stays valid → "reuse".
    // (When its live value is undefined, buildRunSubgraph materializes it by
    // including & running the node so it emits its default — still deterministic,
    // so this stays "reuse" rather than dirtying descendants.)
    if (kind === "constant") return "reuse";

    if (kind === "generative") {
      const gens = ctx.generations(id);
      const selectedIds = ctx.selectedGenerationIds(id);

      // Explicit multi-select → ForEach replay of the completed members. An
      // explicit selection is intentional (spec §1.5), so block rather than
      // stream an empty set when none of the selected generations are completed.
      if (selectedIds.length >= 2) {
        return gens.some(
          (g) => g.status === "completed" && selectedIds.includes(g.id)
        )
          ? "replay"
          : "block";
      }

      // Explicit single pin → that exact generation must be usable; do NOT
      // silently fall back to a different one (spec §1.5). Block if it is
      // missing or not completed.
      const pinned = ctx.selectedGenerationId(id);
      if (pinned !== undefined) {
        const g = gens.find((x) => x.id === pinned);
        return g && g.status === "completed" ? "reuse" : "block";
      }

      // No explicit selection → reuse the latest completed run; a failed or
      // in-flight latest run falls back to the last good result (spec §5/S18).
      return gens.some((g) => g.status === "completed") ? "reuse" : "block";
    }

    // Computed: reuse iff inputs unchanged AND within TTL AND no upstream re-runs.
    const ups = ctx.upstreamIds(id).map(go);
    if (ups.some((d) => d === "block")) return "block";
    const anyUpstreamWillRun = ups.some((d) => d === "run" || d === "replay");

    const signature = ctx.inputSignature(id);
    const g = newestCompletedGenerationForSignature(
      ctx.generations(id),
      signature
    );

    const ttl = ctx.cacheTtl(id);
    const cacheable = ttl === "forever" || (typeof ttl === "number" && ttl > 0);
    const withinTtl =
      ttl === "forever" ||
      (!!g && typeof ttl === "number" && ctx.now - g.createdAt < ttl * 1000);
    const fresh = !!g && cacheable && withinTtl;

    return !anyUpstreamWillRun && fresh ? "reuse" : "run";
  };

  return go(nodeId);
};
