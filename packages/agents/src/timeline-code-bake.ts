/**
 * Bake a timeline's authoring code: run an `@nodetool-ai/sandbox-timeline`
 * program once and hand back the `TimelineDocument` it built, without
 * writing anywhere.
 *
 * The stored code is a retained program (docs/timeline-code-capture.md):
 * research, generation and every other capability call ran once, in the
 * author's run, and their results are literals in the program. So a bake is
 * hermetic by construction. It gets no network, no secrets and no
 * capability except a stub for `nodetool.timelines`:
 *
 * - `create`/`setDocument` capture the document `v.save()` hands them.
 * - `validate` answers `ok: true`. The caller writes the result through the
 *   real `set_timeline_document` path afterward, which validates for real.
 * - `edit` records `v.save()`'s `ops`. This function applies them afterward
 *   with `applyOps`, the pure op applier `edit_timeline` uses, over an
 *   in-memory `TimelineSequence` that is never saved.
 * - `code.set` answers that nothing was attached, so the `v.save()` inside
 *   a bake does not start a second bake.
 * - `bakeAudioAnimation` (`el.react()`) needs a real decode and is refused.
 *
 * Any other capability call fails the bake and names the call. The bake runs
 * on a copy of the context with no workspace, and `applyOps` runs without
 * the hooks that write (a 3D render, a retargeted sequence). A bake reads
 * assets and runs custom animation bodies. It writes nothing.
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
import { resolveImportedPacks } from "./sandbox-pack-resolution.js";

/** Wall-clock ceiling on a bake. Building a document is arithmetic over a
 * bounded scene list; anything slower is a runaway script, and a caller
 * (an agent, or the editor) is waiting on this call. */
export const TIMELINE_CODE_BAKE_TIMEOUT_SECONDS = 20;

export interface BakeTimelineCodeResult {
  ok: boolean;
  /** Present only when `ok`. */
  document?: TimelineDocumentLike;
  logs: string[];
  error?: string;
  duration_ms: number;
  /**
   * The retained program the code's own `v.save()` printed, when capture
   * ran. Baking this program gives the same document again.
   */
  retainedProgram?: string;
}

const TIMELINE_STUB_METHODS = new Set([
  "create_timeline",
  "set_timeline_document",
  "edit_timeline",
  "validate_timeline",
  "bake_audio_animation",
  "set_timeline_code"
]);

/**
 * `context` with every path to the run's workspace removed. The sandbox then
 * gives the guest a `workspace` that refuses every call, and so does the
 * sandbox a custom animation body runs in.
 */
export function hermeticBakeContext(context: ProcessingContext): ProcessingContext {
  const refuse = (name: string) => () => {
    throw new Error(`${name} is not available during a timeline code bake.`);
  };
  return Object.create(context, {
    workspace: { value: null },
    resolveWorkspacePath: { value: refuse("resolveWorkspacePath") },
    assetToSandbox: { value: refuse("assetToSandbox") },
    sandboxToAsset: { value: refuse("sandboxToAsset") }
  }) as ProcessingContext;
}

/**
 * Run one timeline authoring script and return the document its `v.save()`
 * call wrote. Returns rather than throws: a script that fails is a result to
 * report to the caller (and, through it, the agent that wrote the code).
 */
export async function bakeTimelineCode(
  hostContext: ProcessingContext,
  code: string
): Promise<BakeTimelineCodeResult> {
  const context = hermeticBakeContext(hostContext);
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
  // The same fallback a chat session uses: a context built before the host
  // installed its catalog still bakes against the process catalog.
  const { getProcessSandboxModuleCatalog } = await import("@nodetool-ai/runtime");
  const packs = resolveImportedPacks(code, context, {
    subject: "The timeline's authoring code",
    catalog: context.sandboxModuleCatalog ?? getProcessSandboxModuleCatalog()
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
  let retainedProgram: string | undefined;

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
      case "set_timeline_code":
        if (typeof args["code"] === "string") retainedProgram = args["code"];
        return { timeline_id: args["timeline_id"], embedded: false, warnings: [] };
      default:
        throw new Error(`unreachable: ${name} is not a stubbed timeline method`);
    }
  }

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
      return {
        ok: false,
        error:
          `The code calls "${name}", which a rebake cannot run. Call it in ` +
          "the run that builds the timeline and use its result: v.save() " +
          "stores that result in the code as a value."
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const { NODETOOL_PRELUDE } = await import("./sandbox-toolbelt.js");
  const { listCapabilitySpecs } = await import("./capabilities/registry.js");
  // Every catalog name, not just the timeline stub's: a membership miss
  // throws "not in this toolbelt" before `callTool` runs, which would hide
  // the message naming the capability behind a confusing one.
  const toolNames = listCapabilitySpecs().map((spec) => spec.name);

  const { runInSandbox } = await import("./js-sandbox.js");
  const result = await runInSandbox({
    code: `${NODETOOL_PRELUDE}\n${code}`,
    context,
    timeoutMs: TIMELINE_CODE_BAKE_TIMEOUT_SECONDS * 1000,
    globals: {
      __toolNames: toolNames,
      __toolModules: {},
      __callTool: callTool
    },
    // Hermetic: no secrets, no network. `maxFetchCalls: 0` makes the
    // guest's first raw `fetch()` fail rather than reach the network, so a
    // build is a function of the code alone.
    limits: { secretScope: [], maxFetchCalls: 0 },
    modules: packs.modules
  });

  const logs = result.logs ?? [];
  if (!result.success) {
    return fail(result.error ?? "The timeline's authoring code failed.", logs);
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
      parsed,
      { hermetic: true }
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

  const baked: BakeTimelineCodeResult = {
    ok: true,
    document: captured,
    logs,
    duration_ms: Date.now() - started
  };
  if (retainedProgram !== undefined) baked.retainedProgram = retainedProgram;
  return baked;
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
  sceneIds: ReadonlySet<string>
): string {
  const byId = (a: { id: string }, b: { id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const outsideClips = document.clips
    .filter((clip) => !sceneIds.has(clip.id))
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
 * This is the gate for attaching the retained program `v.save()` printed:
 * only when a hermetic bake of that program reproduces what was saved is it
 * a faithful record of the document. A mismatch means the capture missed
 * something (a scene clip changed after `v.series()`, a value computed with
 * `Math.random()` or `Date.now()`).
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
  const savedSceneIds = sceneClipIds(saved.clips as TimelineClip[], savedGroups);
  const bakedSceneIds = sceneClipIds(baked.clips as TimelineClip[], bakedGroups);
  return (
    nonSceneFingerprint(saved, savedSceneIds) ===
    nonSceneFingerprint(baked, bakedSceneIds)
  );
}
