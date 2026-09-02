/**
 * Group clips: the document-level half of transform parenting (D4).
 *
 * A group is a clip with `mediaType: "group"` and no media. Children name it
 * with `parentId` and inherit its transform, its opacity and its window at
 * render time (`render/sceneModel.ts` resolves that). Here is what editing a
 * group does to the clips under it, expressed as pure functions over the clip
 * array so the web store, a headless op and a test all get the same answer:
 * moving a group moves what it holds, deleting one releases them, trimming one
 * pulls them inside the shorter window, and splitting one is refused.
 */

import { trimClip } from "./trimClip.js";
import type { TimelineClip } from "./types.js";

export function isGroupClip(clip: TimelineClip): boolean {
  return clip.mediaType === "group";
}

/**
 * Every clip under `groupId`, transitively. A group may parent another group,
 * so this walks the tree breadth-first; a `parentId` cycle cannot make it loop
 * because a clip already collected is never expanded twice.
 */
export function groupDescendantIds(
  clips: readonly TimelineClip[],
  groupId: string
): Set<string> {
  const childrenByParent = new Map<string, TimelineClip[]>();
  for (const clip of clips) {
    if (!clip.parentId) continue;
    const siblings = childrenByParent.get(clip.parentId);
    if (siblings) siblings.push(clip);
    else childrenByParent.set(clip.parentId, [clip]);
  }

  const found = new Set<string>();
  const queue = [groupId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const child of childrenByParent.get(id) ?? []) {
      if (found.has(child.id)) continue;
      found.add(child.id);
      queue.push(child.id);
    }
  }
  return found;
}

/**
 * Shift a group and everything under it by `deltaMs`. Tracks are untouched: a
 * child keeps its own track (and with it its z-order, I9) the way a linked
 * sibling does. Clips clamp at the timeline origin individually, so dragging a
 * group against zero can compress it — the same thing the store's own move does
 * to a lone clip.
 */
export function moveGroup(
  clips: readonly TimelineClip[],
  groupId: string,
  deltaMs: number
): TimelineClip[] {
  if (deltaMs === 0) return [...clips];
  const moving = groupDescendantIds(clips, groupId);
  moving.add(groupId);
  return clips.map((clip) =>
    moving.has(clip.id)
      ? { ...clip, startMs: Math.max(0, clip.startMs + deltaMs) }
      : clip
  );
}

/**
 * Release a group's direct children. Deleting a group deletes the parent, not
 * the picture: the clips it held stay where they are and stop inheriting.
 * Grandchildren keep their own parent, which is still there.
 */
export function ungroup(
  clips: readonly TimelineClip[],
  groupId: string
): TimelineClip[] {
  return clips.map((clip) => {
    if (clip.parentId !== groupId) return clip;
    const released = { ...clip };
    delete released.parentId;
    return released;
  });
}

/**
 * Trim a group and pull its descendants inside the window that leaves.
 *
 * A child hanging over an edge is trimmed at that edge rather than moved, so
 * its media stays on the same timeline instants (I5 does the source math). A
 * child that the new window cannot hold at all is left alone: the scene model
 * already refuses to draw it while it sits outside, and silently zeroing a
 * clip's duration would lose the media instead of hiding it.
 *
 * Throws whatever {@link trimClip} throws for the group itself, so an invalid
 * trim changes nothing.
 */
export function trimGroup(
  clips: readonly TimelineClip[],
  groupId: string,
  edge: "start" | "end",
  deltaMs: number
): TimelineClip[] {
  const group = clips.find((clip) => clip.id === groupId);
  if (!group) return [...clips];

  const trimmed = trimClip(group, edge, deltaMs);
  const windowStartMs = trimmed.startMs;
  const windowEndMs = trimmed.startMs + trimmed.durationMs;
  const descendants = groupDescendantIds(clips, groupId);

  return clips.map((clip) => {
    if (clip.id === groupId) return trimmed;
    if (!descendants.has(clip.id)) return clip;
    return clampToWindow(clip, windowStartMs, windowEndMs);
  });
}

/** One child pulled inside `[startMs, endMs)`, or unchanged when it cannot fit. */
function clampToWindow(
  clip: TimelineClip,
  startMs: number,
  endMs: number
): TimelineClip {
  let next = clip;
  if (next.startMs < startMs) {
    const trimmedHead = tryTrim(next, "start", next.startMs - startMs);
    if (!trimmedHead) return clip;
    next = trimmedHead;
  }
  const overhang = next.startMs + next.durationMs - endMs;
  if (overhang > 0) {
    const trimmedTail = tryTrim(next, "end", -overhang);
    if (!trimmedTail) return clip;
    next = trimmedTail;
  }
  return next;
}

/** `trimClip`, answering null instead of throwing when the trim is impossible. */
function tryTrim(
  clip: TimelineClip,
  edge: "start" | "end",
  deltaMs: number
): TimelineClip | null {
  try {
    return trimClip(clip, edge, deltaMs);
  } catch {
    // A child the new window cannot hold keeps its own timing; see trimGroup.
    return null;
  }
}
