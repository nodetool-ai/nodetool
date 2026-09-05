/**
 * Scene ordering — the derived view of the one stored order.
 *
 * `shot.index` is the whole order (PRD § 7.7.3): a scene is the set of shots
 * sharing its `scene_id`, those shots are contiguous in `index`, and a scene's
 * position is the index of its first shot. Nothing here is stored — the board
 * renders these groups, the card caption reads `displayNumber`, and the store
 * uses `scenesAreContiguous` to reject a reorder that would break the
 * invariant.
 *
 * Both functions are pure and total: a board whose scenes are interleaved (a
 * partial import, a hand-edited document) still groups, with each scene's
 * shots collected under its first appearance.
 */

import type { Scene, Shot } from "@nodetool-ai/protocol";

/** One scene header and the shots under it. */
export interface SceneGroup {
  /** `null` is the implicit header unscened legacy shots render under. */
  sceneId: string | null;
  /** The scene record, or null for the implicit header. */
  scene: Scene | null;
  /** The group's shots, in index order. */
  shots: Shot[];
}

/** A shot's group key. Unscened shots share the one implicit `null` group. */
const sceneKey = (shot: Shot): string | null => shot.scene_id ?? null;

/**
 * Scenes in derived order, each with its shots. Scenes carrying no shot have
 * no position, so they do not appear; a `scene_id` with no {@link Scene}
 * record still gets a group, with `scene: null`.
 */
export function sceneOrder(
  shots: readonly Shot[],
  scenes?: readonly Scene[] | null
): SceneGroup[] {
  const byId = new Map((scenes ?? []).map((scene) => [scene.id, scene]));
  const groups: SceneGroup[] = [];
  const byKey = new Map<string | null, SceneGroup>();
  // Sort is stable, so shots sharing an index keep their array order.
  for (const shot of [...shots].sort((a, b) => a.index - b.index)) {
    const key = sceneKey(shot);
    let group = byKey.get(key);
    if (!group) {
      group = {
        sceneId: key,
        scene: key === null ? null : (byId.get(key) ?? null),
        shots: []
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.shots.push(shot);
  }
  return groups;
}

/**
 * `Scene N | Shot N` for a card caption, both 1-based and both derived. A shot
 * that is not in `shots` reads `{ scene: 0, shot: 0 }` — it has no position.
 */
export function displayNumber(
  shot: Shot,
  shots: readonly Shot[]
): { scene: number; shot: number } {
  const groups = sceneOrder(shots);
  for (let i = 0; i < groups.length; i++) {
    const position = groups[i].shots.findIndex((s) => s.id === shot.id);
    if (position !== -1) {
      return { scene: i + 1, shot: position + 1 };
    }
  }
  return { scene: 0, shot: 0 };
}

/**
 * Whether every scene's shots form one unbroken run, judged in the order the
 * array itself is in — callers pass a *proposed* order, before any index is
 * stamped on it.
 */
export function scenesAreContiguous(shots: readonly Shot[]): boolean {
  const started = new Set<string | null>();
  let previous: string | null = null;
  for (let i = 0; i < shots.length; i++) {
    const key = sceneKey(shots[i]);
    if (i > 0 && key === previous) {
      continue;
    }
    if (started.has(key)) {
      return false;
    }
    started.add(key);
    previous = key;
  }
  return true;
}
