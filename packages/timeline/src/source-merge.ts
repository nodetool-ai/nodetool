/**
 * Merging a freshly baked build from a timeline's authoring code into the
 * document it is stored on, scene by scene.
 *
 * A scene is the subtree rooted at a `group` clip carrying `sourceScene`
 * (`v.scene()` in `@nodetool-ai/sandbox-timeline` stamps it). Its identity
 * across bakes is its scene *name* — the pack's own id scheme scopes every
 * clip/effect/animation id it mints to the scene name it was built under, so
 * two bakes of unchanged code (or a change confined to another scene) mint
 * the same ids too, which is what lets the editor's selection survive a
 * rebake. `hashSceneSubtree` is a stable hash of the whole subtree (the
 * group plus every descendant, ids included, keys sorted) as one bake left
 * it; `TimelineDocument.source.scenes[name].hash` is the hash the *previous*
 * bake recorded.
 *
 * The merge rule: a scene whose current subtree still hashes to that recorded
 * value has not been touched since the last bake, so the new build replaces
 * it outright. A scene whose hash has moved was hand-edited — in the editor,
 * or through `edit_timeline` — since the last bake, so it is kept as-is and
 * reported as a conflict, unless the caller forces it. A conflict keeps the
 * hash of the last accepted bake, so the scene stays in conflict on every
 * later bake until the caller forces it or the code is detached from it. A
 * scene with no recorded hash (a detached scene) stays untracked. Everything outside
 * every scene's subtree (markers, tempo, camera2d, media tracks, any clip
 * the code placed outside a scene) always comes from the new build — the
 * code is what authors that state, and there is no hand-editable counterpart
 * to protect.
 *
 * Scene *timing* is not simply inherited from whichever side (built or
 * kept) supplied a scene's clips: every chosen scene is reflowed end to end
 * in series order afterward, because a kept scene's hand-edited length can
 * differ from the length the new build assumed when it placed every scene
 * after it. Reflowing is what keeps scenes from overlapping (or leaving a
 * gap) when that happens — see the sort-and-walk at the bottom of
 * `mergeTimelineSource`.
 */

import { createHash } from "node:crypto";
import { stableSerialize } from "./stableSerialize.js";
import type { TimelineClip } from "./types.js";

/**
 * The one shape this module needs from a whole timeline document: its clip
 * list, plus whatever else the caller's own document type carries. There is
 * no `TimelineDocument` type in this package — the concrete document shape
 * (`tracks`, `markers`, `source`, …) lives on `@nodetool-ai/models`'
 * `TimelineDocument`, and this package cannot import that without a
 * dependency cycle (models depends on timeline, not the reverse). A caller
 * passes its own document type here; structural typing does the rest.
 */
export interface TimelineDocumentLike {
  clips: TimelineClip[];
  storyboardMaterializations?: Array<{ boardId: string; elementKeys: string[] }>;
  [key: string]: unknown;
}

/** Every id whose `parentId` chain (transitively) leads back to `rootId`. */
function descendantIds(
  clips: readonly TimelineClip[],
  rootId: string
): Set<string> {
  const found = new Set<string>();
  let frontier = new Set<string>([rootId]);
  while (frontier.size > 0) {
    const next = new Set<string>();
    for (const clip of clips) {
      if (
        clip.id !== rootId &&
        clip.parentId !== undefined &&
        frontier.has(clip.parentId) &&
        !found.has(clip.id)
      ) {
        found.add(clip.id);
        next.add(clip.id);
      }
    }
    frontier = next;
  }
  return found;
}

/** A scene group's own clip plus every descendant, document order. */
export function sceneSubtreeClips(
  clips: readonly TimelineClip[],
  groupId: string
): TimelineClip[] {
  const ids = descendantIds(clips, groupId);
  ids.add(groupId);
  return clips.filter((clip) => ids.has(clip.id));
}

/**
 * A stable hash of one scene's whole subtree. Sorted by clip id before
 * hashing, so a build that emits the same clips in a different order still
 * hashes the same — only the clips' own content and structure identify a
 * scene as unchanged.
 */
export function hashSceneSubtree(
  clips: readonly TimelineClip[],
  groupId: string
): string {
  const subtree = [...sceneSubtreeClips(clips, groupId)].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  return createHash("sha256")
    .update(`v1:${stableSerialize(subtree)}`, "utf8")
    .digest("hex");
}

/** Scene group clips, keyed by `sourceScene`. Clips with no `sourceScene` are not scenes. */
function sceneGroupsByName(
  clips: readonly TimelineClip[]
): Map<string, TimelineClip> {
  const byName = new Map<string, TimelineClip>();
  for (const clip of clips) {
    if (typeof clip.sourceScene === "string" && clip.sourceScene !== "") {
      byName.set(clip.sourceScene, clip);
    }
  }
  return byName;
}

export interface SourceMergeConflict {
  scene: string;
  reason: string;
}

/** Per-scene bake bookkeeping the merge recorded, keyed by scene name. */
export type SourceMergeScenes = Record<
  string,
  { groupId: string; hash: string }
>;

export interface SourceMergeResult {
  document: TimelineDocumentLike;
  conflicts: SourceMergeConflict[];
  scenes: SourceMergeScenes;
}

export interface MergeTimelineSourceOptions {
  /** `true` overwrites every scene; an array names just the scenes to force. */
  force?: true | readonly string[];
}

/**
 * Merge a fresh build (`built`) against the document a timeline currently
 * holds (`current`), using `previousScenes` — the hashes the last bake
 * recorded — to tell an untouched scene from a hand-edited one. Both
 * documents and the result are typed structurally
 * (`TimelineDocumentLike`) rather than generically over the caller's own
 * concrete document type, so a caller (whose real document carries `tracks`,
 * `markers`, `source`, …) passes its object in directly and casts the
 * result's `document` back to that type — the merge only ever reads and
 * writes `clips`, and spreads the rest of `built` through untouched.
 */
/** One scene's chosen subtree (built or kept), waiting to be reflowed into series order. */
interface ChosenScene {
  group: TimelineClip;
  subtree: TimelineClip[];
  /** Its un-reflowed `startMs` — decides series order, nothing else. */
  orderMs: number;
}

export function mergeTimelineSource(
  current: TimelineDocumentLike,
  built: TimelineDocumentLike,
  previousScenes: SourceMergeScenes,
  options: MergeTimelineSourceOptions = {}
): SourceMergeResult {
  const forceAll = options.force === true;
  const forced = new Set(
    Array.isArray(options.force) ? options.force : []
  );

  const builtGroups = sceneGroupsByName(built.clips);
  const currentGroups = sceneGroupsByName(current.clips);

  const builtSceneClipIds = new Set<string>();
  for (const group of builtGroups.values()) {
    for (const clip of sceneSubtreeClips(built.clips, group.id)) {
      builtSceneClipIds.add(clip.id);
    }
  }

  // Everything the new build produced outside a scene subtree — the code is
  // the sole author of it, so it always rides straight through, unshifted.
  const passthroughClips: TimelineClip[] = built.clips.filter(
    (clip) => !builtSceneClipIds.has(clip.id)
  );

  const conflicts: SourceMergeConflict[] = [];
  const scenes: SourceMergeScenes = {};
  const chosen: ChosenScene[] = [];
  /** Scenes the build supplied. Their hashes are recorded after the reflow. */
  const accepted: string[] = [];

  const sceneNames = new Set([...builtGroups.keys(), ...currentGroups.keys()]);
  for (const name of sceneNames) {
    const builtGroup = builtGroups.get(name);
    const currentGroup = currentGroups.get(name);
    const previous = previousScenes[name];
    const isForced = forceAll || forced.has(name);

    if (builtGroup === undefined) {
      // The new build no longer has this scene.
      if (currentGroup === undefined) continue;
      const currentHash = hashSceneSubtree(current.clips, currentGroup.id);
      const untouched = previous !== undefined && previous.hash === currentHash;
      if (untouched || isForced) {
        continue; // Drop it — the build is authoritative for this scene.
      }
      conflicts.push({
        scene: name,
        reason:
          "edited since the last bake; the new build no longer has this " +
          "scene, so it was kept rather than removed"
      });
      chosen.push({
        group: currentGroup,
        subtree: sceneSubtreeClips(current.clips, currentGroup.id),
        orderMs: currentGroup.startMs
      });
      if (previous !== undefined) {
        scenes[name] = { groupId: currentGroup.id, hash: previous.hash };
      }
      continue;
    }

    if (currentGroup === undefined) {
      // A scene the current document does not have yet.
      chosen.push({
        group: builtGroup,
        subtree: sceneSubtreeClips(built.clips, builtGroup.id),
        orderMs: builtGroup.startMs
      });
      accepted.push(name);
      continue;
    }

    const currentHash = hashSceneSubtree(current.clips, currentGroup.id);
    const untouched = previous !== undefined && previous.hash === currentHash;

    if (untouched || isForced) {
      chosen.push({
        group: builtGroup,
        subtree: sceneSubtreeClips(built.clips, builtGroup.id),
        orderMs: builtGroup.startMs
      });
      accepted.push(name);
    } else {
      conflicts.push({ scene: name, reason: "edited since the last bake" });
      chosen.push({
        group: currentGroup,
        subtree: sceneSubtreeClips(current.clips, currentGroup.id),
        orderMs: currentGroup.startMs
      });
      if (previous !== undefined) {
        scenes[name] = { groupId: currentGroup.id, hash: previous.hash };
      }
    }
  }

  // Reflow in series order. A kept (hand-edited) scene's actual length can
  // differ from what the new build assumed when it placed every later scene
  // — trusting each scene's already-carried `startMs` would leave scenes
  // overlapping or gapped. `orderMs` — each scene's un-reflowed `startMs` —
  // decides the sequence: the built document expresses "series order" for
  // every scene the rebuild still has, and a scene the build dropped (kept
  // only because it conflicted) keeps roughly the position it already held.
  // Every chosen scene is then laid end to end again, using its own real
  // duration and its own `transitionIn` overlap — the same arithmetic
  // `v.series()` uses to place scenes in the first place.
  chosen.sort((a, b) => a.orderMs - b.orderMs);
  const resultClips: TimelineClip[] = [...passthroughClips];
  let cursorMs = 0;
  for (const scene of chosen) {
    const overlapMs = scene.group.transitionIn?.durationMs ?? 0;
    const absStart = Math.max(0, cursorMs - overlapMs);
    const delta = absStart - scene.group.startMs;
    for (const clip of scene.subtree) {
      resultClips.push(delta === 0 ? clip : { ...clip, startMs: clip.startMs + delta });
    }
    cursorMs = absStart + scene.group.durationMs;
  }

  // The reflow can move a scene, and its hash includes clip times, so the
  // baseline must describe the placement that is persisted.
  for (const name of accepted) {
    const groupId = builtGroups.get(name)!.id;
    scenes[name] = { groupId, hash: hashSceneSubtree(resultClips, groupId) };
  }

  const document: TimelineDocumentLike = { ...built, clips: resultClips };
  if (current.storyboardMaterializations) document.storyboardMaterializations = structuredClone(current.storyboardMaterializations);
  return { document, conflicts, scenes };
}
