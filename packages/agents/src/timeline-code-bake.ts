/**
 * Bake a timeline's authoring code: run an `@nodetool-ai/sandbox-timeline`
 * script once and hand back the `TimelineDocument` it built, without writing
 * anywhere.
 *
 * The precedent is `custom-animation-bake.ts`: baking is hermetic — no
 * network, no secrets reachable outside what a replayed call already saw —
 * because a build is a function of the code and its recorded calls, and
 * giving it open reach would make the same script produce a different
 * document (and repeat a side effect) depending on where it ran.
 *
 * The mechanism: an ordinary authoring script calls
 * `v.save(nodetool.timelines, {...})`, which in a real run reaches the
 * `timelines` capability module and actually writes a row. Here `nodetool`
 * is the *real* object model (`NODETOOL_PRELUDE`, the same prelude a live
 * CodeAct action or JS script gets), but every capability call it makes
 * routes through `__callTool`, a bridge this module owns rather than the
 * live belt:
 *
 * - A `nodetool.timelines.*` call (`create`/`setDocument`/`edit`/`validate`/
 *   `bakeAudioAnimation`) is answered by {@link timelineStubDispatch} —
 *   `create`/`setDocument` capture the document `v.save()` hands them
 *   instead of reaching a store; `validate` answers `ok: true`
 *   unconditionally, because the merge caller
 *   (`packages/agents/src/capabilities/timelines.ts`) writes the
 *   baked-and-merged result through the real `set_timeline_document` path
 *   afterward, which validates for real. `edit` — `v.save()`'s `ops` option
 *   — records the ops instead of applying them; this function applies them
 *   afterward with `applyOps`, the same pure op applier `edit_timeline`
 *   uses, over an in-memory `TimelineSequence` that is never saved.
 *   `bakeAudioAnimation` — `el.react()` — still needs a real decode call, so
 *   it stays refused; the guest's own `__callBeltTool` turns a `{ok: false}`
 *   answer into a thrown `Error`, so a script using `el.react()` fails the
 *   bake with a clear `baked.error` instead of aborting the runtime.
 * - Any other call is *replayed*: {@link BakeTimelineCodeOptions.calls} is
 *   this exact code's own prior run, keyed by capability name plus a hash of
 *   its canonical arguments (`hashTimelineCallArgs` —
 *   `timeline-code-embed-keys.ts`), so a matching call is answered with the
 *   value it produced then, and the capability never runs again — no
 *   generation is repeated, no memory write happens twice, no outbound fetch
 *   fires again. A call with no matching record fails the bake, naming the
 *   call, unless {@link BakeTimelineCodeOptions.allowLive} is set, in which
 *   case that one call runs for real through
 *   {@link BakeTimelineCodeOptions.liveRun} and its result is added to the
 *   records this function hands back — the caller
 *   (`tryEmbedTimelineCode`/`bakeAndMergeTimelineCode`) is what actually
 *   persists the updated set.
 *
 * `Math.random()` and `Date.now()`/`new Date()` are seeded identically to
 * the run that produced {@link BakeTimelineCodeOptions.calls}
 * (`timelineDeterminismShim`), so code that used either still reproduces
 * exactly rather than merely being caught by the document-equality check
 * one layer up (`bakedDocumentMatchesSaved`).
 *
 * `setDocument`/`validate`'s first call gets the *live* `v._document` as
 * part of their arguments, still carrying the scene builders' guest
 * closures (`attachMotion`). The guest's own `__callBeltTool` already
 * `JSON.stringify`s every argument before it reaches `__callTool`, which
 * drops those closures the same way `JSON.parse(JSON.stringify(...))` used
 * to do host-side — so the document `__callTool` receives is already plain
 * data, and this function's own document-level normalization
 * (`normalizeAuthoredDocument`) is what makes it match what a real save
 * would store.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { TimelineDocument } from "@nodetool-ai/models";
import {
  normalizeAuthoredDocument,
  hashSceneSubtree,
  sceneSubtreeClips,
  type TimelineClip,
  type TimelineDocumentLike
} from "@nodetool-ai/timeline";
import type { TimelineCallRecord } from "@nodetool-ai/timeline";
import {
  hashTimelineCallArgs,
  timelineCallResultBytes,
  timelineDeterminismShim,
  MAX_TIMELINE_CALL_BYTES,
  type RawTimelineCallRecord
} from "./timeline-code-embed-keys.js";
import type { CapabilityRun } from "./capabilities/types.js";

/** Wall-clock ceiling on a bake. Building a document is arithmetic over a
 * bounded scene list; anything slower is a runaway script, and a caller
 * (an agent, or the editor) is waiting on this call. */
export const TIMELINE_CODE_BAKE_TIMEOUT_SECONDS = 20;

export interface BakeTimelineCodeOptions {
  /** Prior calls this exact code made, to replay instead of running for real. */
  calls?: readonly TimelineCallRecord[];
  /** Seeds `Math.random()`/`Date.now()` — the same values the recorded run used. */
  seed?: number;
  epochMs?: number;
  /**
   * When a call has no matching record, run it for real through `liveRun`
   * instead of failing the bake, and add its result to the records this
   * call hands back. Requires `liveRun`. Never set by the automatic
   * embed-right-after-save path (`tryEmbedTimelineCode`) — there, the
   * records are exactly what the same run just made, so nothing should be
   * missing; only a human/agent explicitly re-baking edited code
   * (`set_timeline_code`/`edit_timeline_code`/`rebake_timeline_code` with
   * `allow_live: true`) asks for this.
   */
  allowLive?: boolean;
  /** The gated run a missing call executes for real under `allowLive`. */
  liveRun?: CapabilityRun;
}

export interface BakeTimelineCodeResult {
  ok: boolean;
  /** Present only when `ok`. */
  document?: TimelineDocumentLike;
  logs: string[];
  error?: string;
  duration_ms: number;
  /**
   * The records this bake actually used, plus any it made live under
   * `allowLive` — present only when `ok`. A caller stores exactly this set
   * (not the input `calls` verbatim): a record the code no longer calls is
   * dropped, so an edit that removes a call also removes its stale record.
   */
  calls?: TimelineCallRecord[];
  /** Capability names a non-`allowLive` bake could not find a record for. */
  missingCalls?: string[];
}

const TIMELINE_STUB_METHODS = new Set([
  "create_timeline",
  "set_timeline_document",
  "edit_timeline",
  "validate_timeline",
  "bake_audio_animation"
]);

/**
 * Run one timeline authoring script and return the document its `v.save()`
 * call wrote. Returns rather than throws: a script that fails is a result to
 * report to the caller (and, through it, the agent that wrote the code).
 */
export async function bakeTimelineCode(
  context: ProcessingContext,
  code: string,
  options: BakeTimelineCodeOptions = {}
): Promise<BakeTimelineCodeResult> {
  const started = Date.now();
  const fail = (error: string, logs: string[] = []): BakeTimelineCodeResult => ({
    ok: false,
    error,
    logs,
    duration_ms: Date.now() - started
  });

  if (!code.trim()) {
    return fail("The timeline's authoring code is empty.");
  }
  if (options.allowLive && !options.liveRun) {
    return fail(
      "bakeTimelineCode: allowLive requires liveRun (the gated run a missing call executes for real)."
    );
  }

  const { resolveImportedPacks } = await import("./js-script-sandbox.js");
  const packs = resolveImportedPacks(code, context, {
    subject: "The timeline's authoring code"
  });
  if (!packs.ok) {
    return fail(packs.error);
  }

  let captured: TimelineDocumentLike | undefined;
  let createCount = 0;
  let createdFps: number | undefined;
  let createdWidth: number | undefined;
  let createdHeight: number | undefined;
  let capturedOps: unknown[] | undefined;

  function timelineStubDispatch(
    name: string,
    args: Record<string, unknown>
  ): unknown {
    switch (name) {
      case "create_timeline": {
        createCount += 1;
        createdFps = typeof args["fps"] === "number" ? args["fps"] : undefined;
        createdWidth =
          typeof args["width"] === "number" ? args["width"] : undefined;
        createdHeight =
          typeof args["height"] === "number" ? args["height"] : undefined;
        return { timeline_id: `bake:${createCount}` };
      }
      case "set_timeline_document": {
        captured = args["document"] as TimelineDocumentLike;
        return { written: true };
      }
      case "edit_timeline": {
        // Recorded, not applied here: `v.save()` only checks
        // `edit.failed`/`edit.ops`, so an empty success report lets the
        // script finish (and its trailing `validate()` run against the
        // still-unedited document, which is fine — the real validate below
        // runs after ops are applied). Ops are applied host-side once the
        // guest is done; see the file header.
        capturedOps = Array.isArray(args["ops"]) ? args["ops"] : [];
        return { failed: 0, ops: [] };
      }
      case "validate_timeline":
        return { ok: true, errors: [], warnings: [] };
      case "bake_audio_animation":
        throw new Error(
          "el.react() bakes an audio-reactive animation with a real decode " +
            "call, which cannot run during a hermetic code bake. Remove " +
            "el.react() from code stored as timeline source, or call " +
            "bake_audio_animation separately after the code is set."
        );
      default:
        throw new Error(`unreachable: ${name} is not a stubbed timeline method`);
    }
  }

  // Every recorded call, keyed by `method:argsHash` — the same key
  // `recordTimelineCall`'s consumer computes for a fresh call, so a match
  // here means "this code already made this exact call and got this
  // result." `usedKeys` tracks which of them this run actually reached, so
  // the caller can drop the rest (an edit that removes a call should not
  // leave its stale record behind); `newRecords` collects what `allowLive`
  // ran for real.
  const recordsByKey = new Map<string, TimelineCallRecord>();
  for (const record of options.calls ?? []) {
    recordsByKey.set(`${record.method}:${record.argsHash}`, record);
  }
  const usedKeys = new Set<string>();
  const newRecords: TimelineCallRecord[] = [];
  const missingCalls: string[] = [];

  async function callTool(
    name: unknown,
    argsJson: unknown
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
    try {
      if (typeof name !== "string") {
        return { ok: false, error: "callTool: name must be a string" };
      }
      const rawArgs =
        typeof argsJson === "string" && argsJson
          ? (JSON.parse(argsJson) as Record<string, unknown>)
          : {};
      if (TIMELINE_STUB_METHODS.has(name)) {
        return { ok: true, result: timelineStubDispatch(name, rawArgs) };
      }
      // Canonicalize the same way `invoke.ts`'s `gatedCall` does before it
      // records a live call (snake_case aliases, folded/defaulted fields) —
      // hashing anything looser would make a replay's key miss a live
      // recording that was, in every way that matters, the same call.
      const { findCapability } = await import("./capabilities/registry.js");
      const { validateCapabilityArgs, withSnakeCaseAliases } = await import(
        "./capabilities/args.js"
      );
      const entry = await findCapability(name);
      const checked = entry
        ? validateCapabilityArgs(entry.spec, withSnakeCaseAliases(rawArgs))
        : { ok: true as const, args: rawArgs };
      const args = checked.ok ? checked.args : rawArgs;

      const key = `${name}:${hashTimelineCallArgs(args)}`;
      const record = recordsByKey.get(key);
      if (record) {
        usedKeys.add(key);
        return { ok: true, result: record.result };
      }
      if (options.allowLive && options.liveRun) {
        const result = await options.liveRun.invoke(name, rawArgs);
        const fresh: TimelineCallRecord = {
          method: name,
          argsHash: hashTimelineCallArgs(args),
          result
        };
        newRecords.push(fresh);
        usedKeys.add(key);
        return { ok: true, result };
      }
      missingCalls.push(name);
      return {
        ok: false,
        error:
          `No recorded call for "${name}" with these arguments — the code ` +
          "changed what it calls since it was last saved. Pass " +
          "allow_live: true to run it for real and record a fresh result."
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const seed = options.seed ?? 0;
  const epochMs = options.epochMs ?? 0;

  const { NODETOOL_PRELUDE } = await import("./sandbox-toolbelt.js");
  const { listCapabilitySpecs } = await import("./capabilities/registry.js");
  // Every catalog name, not just the ones this code is known to call: a
  // membership miss here throws "not in this toolbelt" before `callTool`
  // ever runs, which would hide the more useful "no recorded call" message
  // behind a confusing one for a call the code newly added.
  const toolNames = listCapabilitySpecs().map((spec) => spec.name);

  const { runInSandbox } = await import("./js-sandbox.js");
  const result = await runInSandbox({
    code: `${timelineDeterminismShim(seed, epochMs)}\n${NODETOOL_PRELUDE}\n${code}`,
    context,
    timeoutMs: TIMELINE_CODE_BAKE_TIMEOUT_SECONDS * 1000,
    globals: {
      __toolNames: toolNames,
      __toolModules: {},
      __callTool: callTool
    },
    // Hermetic beyond what `calls` already answered: no secrets, no network.
    // `maxFetchCalls: 0` makes the guest's first raw `fetch()` fail rather
    // than reach the network — a build is a function of the code and its
    // recorded calls alone, so a script that reaches out during a bake in a
    // way `calls` cannot answer must fail the bake, not silently succeed
    // differently depending on what was reachable from wherever it ran.
    limits: { secretScope: [], maxFetchCalls: 0 },
    modules: packs.modules
  });

  const logs = result.logs ?? [];
  if (!result.success) {
    const base: BakeTimelineCodeResult = {
      ok: false,
      error: result.error ?? "The timeline's authoring code failed.",
      logs,
      duration_ms: Date.now() - started
    };
    if (missingCalls.length > 0) base.missingCalls = [...new Set(missingCalls)];
    return base;
  }
  if (!captured) {
    return fail(
      "The code ran without calling v.save(nodetool.timelines, {...}) — " +
        "nothing was built.",
      logs
    );
  }

  // The real `nodetool.timelines.setDocument` (`set_timeline_document`'s
  // impl) runs every document through `normalizeAuthoredDocument` before it
  // is stored — filling in the schema's bookkeeping fields
  // (track `index`/`visible`/`locked`, clip `sourceType`/`status`/`locked`/
  // `versions`, animation ids) that a hand-authored or freshly-built document
  // leaves out. `edit_timeline`'s `applyOps` then runs against that
  // normalized, stored document, never the raw one `v.save()` built. A bake
  // has to do the same normalization before its own `applyOps` call below —
  // otherwise an op whose result depends on a field normalization fills in
  // (`hashSceneSubtree` sees whatever `snap_to_beats` left the clip at)
  // computes against a document shaped differently than what a real save
  // would have produced, and its hash cannot match the shipped one.
  captured = normalizeAuthoredDocument(
    captured as unknown as Record<string, unknown>
  ).document as unknown as TimelineDocumentLike;

  if (capturedOps && capturedOps.length > 0) {
    const { parseOps, applyOps } = await import("./capabilities/timelines.js");
    const { ungatedCapabilityRun } = await import("./capabilities/invoke.js");
    const { TimelineSequence } = await import("@nodetool-ai/models");

    const parsed = parseOps(capturedOps);
    if ("error" in parsed) {
      return fail(`v.save()'s \`ops\`: ${parsed.error}`, logs);
    }
    // Never saved: `applyOps` mutates nothing outside the bridge it builds
    // over this row's fields, and `sequence.save()` is never called. The id
    // only has to be a string — nothing looks it up.
    const sequence = new TimelineSequence({
      id: "bake",
      user_id: context.userId ?? "bake",
      project_id: "bake",
      fps: createdFps ?? 30,
      width: createdWidth ?? 1920,
      height: createdHeight ?? 1080
    });
    const run = ungatedCapabilityRun(context);
    const { records, state } = await applyOps(
      run,
      sequence,
      captured as unknown as TimelineDocument,
      parsed
    );
    const failedOps = records.filter((record) => !record.ok);
    if (failedOps.length > 0) {
      return fail(
        `edit_timeline: ${JSON.stringify(failedOps, null, 2)}`,
        logs
      );
    }
    // Same merge `edit_timeline` writes back to the row with — see
    // `editTimeline.impl` in `capabilities/timelines.ts`.
    const next: TimelineDocumentLike = {
      ...captured,
      tracks: state.documentTracks,
      clips: state.documentClips,
      markers: state.markers
    } as TimelineDocumentLike;
    if (state.tempo) (next as Record<string, unknown>).tempo = state.tempo;
    if (state.setup) (next as Record<string, unknown>).setup = state.setup;
    if (
      state.mediaTracks.length > 0 ||
      (captured as Record<string, unknown>).mediaTracks !== undefined
    ) {
      (next as Record<string, unknown>).mediaTracks = state.mediaTracks;
    }
    captured = next;
  }

  const usedRecords = [...usedKeys]
    .map((key) => recordsByKey.get(key))
    .filter((record): record is TimelineCallRecord => record !== undefined);

  return {
    ok: true,
    document: captured,
    logs,
    duration_ms: Date.now() - started,
    calls: [...usedRecords, ...newRecords]
  };
}

/**
 * Turn a run's raw, unhashed call log (`invoke.ts` already left out every
 * `timelines`-module call — the bake's own stub always handles those, never
 * a replayed result) into the `TimelineCallRecord[]` a document's
 * `source.calls` stores: hashed arguments, capped total size. Once the
 * running total would cross {@link MAX_TIMELINE_CALL_BYTES}, further calls
 * are left out and counted — the calls still ran for real and the code still
 * got their answers; only the record is missing, so a future rebake needing
 * that exact call fails with a clear reason instead of the document growing
 * without bound.
 */
export function finalizeTimelineCallRecords(
  raw: readonly RawTimelineCallRecord[]
): { calls: TimelineCallRecord[]; droppedForSize: number } {
  const calls: TimelineCallRecord[] = [];
  let total = 0;
  let droppedForSize = 0;
  for (const entry of raw) {
    const bytes = timelineCallResultBytes(entry.result);
    if (total + bytes > MAX_TIMELINE_CALL_BYTES) {
      droppedForSize += 1;
      continue;
    }
    total += bytes;
    calls.push({
      method: entry.method,
      argsHash: hashTimelineCallArgs(entry.args),
      result: entry.result
    });
  }
  return { calls, droppedForSize };
}

/** Scene group clips, keyed by `sourceScene`. Local to `sceneGroupsByName` in `@nodetool-ai/timeline`, which is not exported. */
function sceneGroupIdsByName(
  clips: readonly TimelineClip[]
): Map<string, string> {
  const byName = new Map<string, string>();
  for (const clip of clips) {
    if (typeof clip.sourceScene === "string" && clip.sourceScene !== "") {
      byName.set(clip.sourceScene, clip.id);
    }
  }
  return byName;
}

/** Every clip id belonging to one of `groups`' scene subtrees. */
function sceneClipIds(
  clips: readonly TimelineClip[],
  groups: ReadonlyMap<string, string>
): Set<string> {
  const ids = new Set<string>();
  for (const groupId of groups.values()) {
    for (const clip of sceneSubtreeClips(clips, groupId)) ids.add(clip.id);
  }
  return ids;
}

/** A stable string for everything in a document outside its own scenes. */
function nonSceneFingerprint(
  document: TimelineDocumentLike,
  outsideIds: ReadonlySet<string>
): string {
  const byId = (a: { id: string }, b: { id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const outsideClips = document.clips
    .filter((clip) => outsideIds.has(clip.id))
    .slice()
    .sort(byId);
  const record = document as unknown as Record<string, unknown>;
  const markers = Array.isArray(record["markers"])
    ? [...(record["markers"] as { id: string }[])].sort(byId)
    : record["markers"] ?? null;
  return JSON.stringify({
    outsideClips,
    tracks: record["tracks"] ?? null,
    markers,
    tempo: record["tempo"] ?? null,
    camera2d: record["camera2d"] ?? null,
    setup: record["setup"] ?? null,
    mediaTracks: record["mediaTracks"] ?? null
  });
}

/**
 * Whether `baked` — a fresh hermetic rebuild of some code — is the same
 * timeline `saved` already is: every scene the two share hashes the same
 * (`hashSceneSubtree`, the same identity check `mergeTimelineSource` uses to
 * tell an untouched scene from a hand-edited one), the two name the same
 * scenes, and everything outside a scene (passthrough clips, tracks, markers,
 * tempo, camera2d, setup, mediaTracks) matches after the same normalization
 * a bake already applies (`normalizeAuthoredDocument`, inside
 * {@link bakeTimelineCode}).
 *
 * This is the gate for embedding a run's own code as a timeline's source
 * right after a plain `v.save()`: only when a hermetic rerun of that exact
 * code reproduces what was actually saved is the code a faithful record of
 * the document, so only then is attaching it safe. A mismatch means the save
 * depended on something the rerun could not repeat (network, secrets,
 * another tool call) or was not deterministic (`Math.random()`, `Date.now()`).
 */
export function bakedDocumentMatchesSaved(
  saved: TimelineDocumentLike,
  baked: TimelineDocumentLike
): boolean {
  const savedGroups = sceneGroupIdsByName(saved.clips as TimelineClip[]);
  const bakedGroups = sceneGroupIdsByName(baked.clips as TimelineClip[]);
  if (savedGroups.size !== bakedGroups.size) return false;
  for (const [name, savedGroupId] of savedGroups) {
    const bakedGroupId = bakedGroups.get(name);
    if (bakedGroupId === undefined) return false;
    if (
      hashSceneSubtree(saved.clips as TimelineClip[], savedGroupId) !==
      hashSceneSubtree(baked.clips as TimelineClip[], bakedGroupId)
    ) {
      return false;
    }
  }
  const savedOutside = sceneClipIds(saved.clips as TimelineClip[], savedGroups);
  const bakedOutside = sceneClipIds(baked.clips as TimelineClip[], bakedGroups);
  return (
    nonSceneFingerprint(saved, savedOutside) ===
    nonSceneFingerprint(baked, bakedOutside)
  );
}
