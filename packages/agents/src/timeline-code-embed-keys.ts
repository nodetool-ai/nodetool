/**
 * `ProcessingContext` keys and support for the code-embedding bookkeeping
 * `v.save()` relies on — split from `capabilities/timelines.ts` so a host
 * (the CodeAct action runner, `code.ts`) can set them, and `invoke.ts` can
 * record into them, without eagerly importing `capabilities/timelines.ts`'s
 * heavy dependencies (models, the timeline validator, the hermetic bake)
 * just to run an action that never touches a timeline.
 *
 * See `capabilities/timelines.ts`'s own re-export of the two context keys
 * for the full contract: what sets them, what reads them, and why context
 * rather than the calling `CapabilityRun`.
 */

import { createHash } from "node:crypto";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/**
 * `timeline_id`s `set_timeline_document` wrote during the run currently
 * executing. A host initializes this to `[]` for *every* action/script run —
 * there is no way to know in advance whether it will touch a timeline — and
 * its presence (rather than a separate flag) is what tells
 * `set_timeline_document` and {@link recordTimelineCall} a host is tracking
 * this run at all.
 */
export const TIMELINE_DOCUMENT_WRITES_KEY = "__timeline_document_writes";

/**
 * The in-memory call log for the run currently executing — every capability
 * call `invoke.ts`'s `gatedCall` sees while this key holds an array, in call
 * order, `{method, args, result}` by reference (no hashing, no copying: a
 * host turns this into `document.source.calls` only for the rare run that
 * actually saves a timeline). A host initializes this to `[]` for *every*
 * action/script run, not only ones that turn out to touch a timeline — there
 * is no way to know in advance — and discards it unread when the run saves
 * nothing. See {@link recordTimelineCall} and `RawTimelineCallRecord`.
 */
export const TIMELINE_CALL_LOG_KEY = "__timeline_call_log";

/** The random seed generated for a tracked run, reused for its own bake. */
export const TIMELINE_SEED_KEY = "__timeline_seed";

/** The frozen clock reading generated for a tracked run, reused for its own bake. */
export const TIMELINE_EPOCH_MS_KEY = "__timeline_epoch_ms";

/**
 * Total bytes of `result` JSON a run's `document.source.calls` may hold.
 *
 * 256 KB: generously above what a normal capability answer needs (a
 * generation result is an asset handle — an id and a URI, not pixels; a list
 * or search result is a page of rows) while still small next to a document
 * row's own size limits, so an author who wants a persistent record of a
 * capability call is not tempted to route large payloads through it. A
 * result that does not fit is simply not stored — the call still runs, the
 * code still gets its real answer, only a future rebake needing that exact
 * call fails with a clear reason instead of a document silently ballooning.
 */
export const MAX_TIMELINE_CALL_BYTES = 256 * 1024;

/**
 * A stable hash of `args` after every capability normalizes it (snake_case,
 * defaults applied) — the same shape whether the guest phrased a call through
 * the object model, a raw import, or the belt. Keys are sorted at every
 * depth so two calls that differ only in property order hash the same.
 */
export function hashTimelineCallArgs(args: unknown): string {
  return createHash("sha256").update(stableJson(args)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * The JSON byte size a call record's `result` would add to a document — what
 * {@link MAX_TIMELINE_CALL_BYTES} bounds.
 */
export function timelineCallResultBytes(result: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(result) ?? "null", "utf8");
  } catch {
    // A result Zod's `z.unknown()` accepts but `JSON.stringify` cannot
    // represent (a cycle, a BigInt) is exactly the case the cap exists for.
    return Number.POSITIVE_INFINITY;
  }
}

/** A fresh seed for `Math.random()`, 31 bits so it stays a safe int on both sides of a JSON round trip. */
export function randomTimelineSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

/**
 * Prepended to a tracked run's code — both the live run and its own bake —
 * so `Math.random()` reproduces identically on replay: a mulberry32 PRNG
 * seeded from `seed`.
 *
 * This is the "seed it" branch of determinism, not the "record every call"
 * fallback: reassigning `Math.random` is ordinary QuickJS guest JS — `Math`
 * is QuickJS's own native implementation, not a host bridge — so no
 * sandbox-core change is needed, and it is cheap: one PRNG step per call
 * instead of a growing recorded sequence to replay in lockstep.
 *
 * `Date.now()`/`new Date()` are deliberately left alone. An earlier version
 * of this shim also froze them to a fixed `epochMs`, which is the fallback
 * `epochMs` still exists for — a script that builds a document from
 * `Date.now()` still needs its own seed to freeze against. But pinning the
 * *whole action's* clock broke every ordinary use of elapsed real time in
 * the same action — a poll loop computing "has `timeoutMs` passed since
 * `Date.now()` at the start" saw the same reading forever and never timed
 * out (`nodetool.jobs.wait`'s own test caught this in under a minute).
 * Freezing the clock is therefore not "clean" here in the sense the design
 * asked for, so per its own fallback: code that calls `Date.now()`/
 * `new Date()` stays outside what a hermetic replay can reproduce, and
 * `bakedDocumentMatchesSaved`'s ordinary mismatch path is what reports it —
 * the same "not embedded, not deterministic" warning `Math.random()` got
 * before this shim existed.
 */
export function timelineDeterminismShim(seed: number, _epochMs: number): string {
  return `
(function () {
  var __s = ${JSON.stringify(seed)} >>> 0;
  Math.random = function () {
    __s = (Math.imul(__s, 1664525) + 1013904223) >>> 0;
    return __s / 4294967296;
  };
})();
`;
}

/** One capability call as {@link recordTimelineCall} logs it — unhashed, uncapped, by reference. */
export interface RawTimelineCallRecord {
  method: string;
  args: unknown;
  result: unknown;
}

/**
 * Append one capability call to the run's in-memory log — an `Array.push`
 * against whatever array `TIMELINE_CALL_LOG_KEY` already holds, so this costs
 * one allocation (the log entry) and nothing else: no hashing, no
 * `JSON.stringify`, no copy of the existing log. That work — computing
 * `argsHash`, enforcing {@link MAX_TIMELINE_CALL_BYTES} — happens once, in
 * `capabilities/timelines.ts`, for the one run in many that turns out to
 * have saved a timeline; every other run's log is read once and dropped.
 *
 * A no-op when this context carries no log (a run no host is tracking this
 * way) or is a test double with no `.get`/`.set`.
 */
export function recordTimelineCall(
  context: ProcessingContext,
  method: string,
  args: unknown,
  result: unknown
): void {
  if (typeof context.get !== "function" || typeof context.set !== "function") {
    return;
  }
  const log = context.get<RawTimelineCallRecord[] | undefined>(
    TIMELINE_CALL_LOG_KEY
  );
  if (log === undefined) return;
  log.push({ method, args, result });
}
