/**
 * storyboardAgentBridge
 *
 * Bridge between the agent tooling layer (the `ui_storyboard_*` frontend tools)
 * and the live Storyboard surface, mirroring {@link timelineAgentBridge}.
 *
 * The open StoryboardSurface registers a {@link StoryboardAgentHandler} while it
 * is the active surface and clears it on unmount, so the tools always operate on
 * the focused board — or fail cleanly when no board is open.
 *
 * Everything crossing the bridge is a plain serializable value: the agent reads
 * {@link StoryboardSnapshot} / {@link StoryboardShotNode} objects and never
 * touches Zustand store handles directly. Shots are addressed by id, 0-based
 * index, or the literal `"selected"`.
 */

import type { CameraDirection, Screenplay, ShotStatus } from "@nodetool-ai/protocol";

/** Serializable view of a single shot the agent reads and edits. */
export interface StoryboardShotNode {
  id: string;
  index: number;
  slug?: string;
  action: string;
  camera?: CameraDirection;
  motion?: string;
  durationSeconds?: number;
  status: ShotStatus;
  /** Whether the shot has a rendered keyframe still. */
  hasKeyframe: boolean;
  /** Whether the shot has a rendered clip. */
  hasClip: boolean;
  costEstimate?: number | null;
}

/** Full snapshot of the open board the agent reads to plan direction. */
export interface StoryboardSnapshot {
  boardId: string;
  title: string;
  brief: string;
  style: string;
  aspectRatio: string;
  /** True once a screenplay has been loaded onto the board. */
  hasScreenplay: boolean;
  selectedShotId: string | null;
  shots: StoryboardShotNode[];
}

/** Fields the agent can supply when adding a shot. */
export interface StoryboardAddShotInput {
  action: string;
  camera?: CameraDirection;
  motion?: string;
  durationSeconds?: number;
  /** 0-based insertion index; appended when omitted. */
  index?: number;
}

/** Fields the agent can patch on an existing shot. */
export interface StoryboardUpdateShotPatch {
  action?: string;
  camera?: CameraDirection;
  motion?: string;
  status?: ShotStatus;
}

/**
 * Operations the live StoryboardSurface exposes to the agent tooling layer.
 * Shots are addressed by id, 0-based index, or the literal `"selected"`.
 */
export interface StoryboardAgentHandler {
  getSnapshot: () => StoryboardSnapshot;
  setScreenplay: (screenplay: Screenplay) => StoryboardSnapshot;
  addShot: (input: StoryboardAddShotInput) => StoryboardShotNode;
  updateShot: (
    target: string,
    patch: StoryboardUpdateShotPatch
  ) => StoryboardShotNode;
  generateKeyframe: (target: string) => Promise<StoryboardShotNode>;
  approveShot: (target: string) => StoryboardShotNode;
  generateClip: (target: string) => Promise<StoryboardShotNode>;
  /**
   * Regenerate an existing shot's clip via video-to-video, seeded by its current
   * clip plus a text instruction (e.g. "make it darker, add rain"). Throws when
   * the shot has no clip to revise.
   */
  reviseShot: (
    target: string,
    instruction: string
  ) => Promise<StoryboardShotNode>;
  selectShot: (target: string | null) => StoryboardShotNode | null;
}

let handler: StoryboardAgentHandler | null = null;

/**
 * Register (or clear, with null) the handler for the currently-focused board.
 * The surface calls this when it becomes active and clears it on unmount so the
 * ui_storyboard_* tools always operate on the live board — or fail cleanly.
 */
export function setStoryboardAgentHandler(
  next: StoryboardAgentHandler | null
): void {
  handler = next;
}

export function hasStoryboardAgentHandler(): boolean {
  return handler !== null;
}

export function getStoryboardAgentHandler(): StoryboardAgentHandler {
  if (!handler) {
    throw new Error("No storyboard is open.");
  }
  return handler;
}
