/**
 * storyboardAgentBridge
 *
 * Bridge between the agent tooling layer (the `ui_storyboard_*` frontend tools)
 * and the live Storyboard surface, mirroring {@link timelineAgentBridge}.
 *
 * Every open StoryboardSurface registers a {@link StoryboardAgentHandler} under
 * its board id and clears it on unmount, so the tools address a board explicitly
 * by id — an open board stays addressable whether or not it has focus.
 *
 * Everything crossing the bridge is a plain serializable value: the agent reads
 * {@link StoryboardSnapshot} / {@link StoryboardShotNode} objects and never
 * touches Zustand store handles directly. Shots are addressed by id, 0-based
 * index, or the literal `"selected"`.
 */

import type {
  CameraDirection,
  Screenplay,
  ShotStatus
} from "@nodetool-ai/protocol";

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
  /** Script this board's words come from, or null when it is unlinked. */
  scriptId: string | null;
  selectedShotId: string | null;
  shots: StoryboardShotNode[];
}

/** What an extraction (or a re-projection) left behind. */
export interface StoryboardScriptLink {
  scriptId: string;
  /** Lines the script now holds. */
  lineCount: number;
  /** Shots that reference at least one line. */
  linkedShotCount: number;
  /** False when an already-linked script was re-projected. */
  created: boolean;
}

/** What a re-projection rewrote on the board. */
export interface StoryboardReprojection {
  scriptId: string;
  /** Shots whose dialogue/narration and snapshot were rewritten. */
  reprojectedShotIds: string[];
  /** Shots that carried drift before the pass ran. */
  driftedShotIds: string[];
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
  /**
   * Project the board's dialogue and narration into a script resource and link
   * the two. `relink` re-projects onto the script the board already links;
   * without it, an already-linked board throws.
   */
  extractScript: (options?: {
    relink?: boolean;
  }) => Promise<StoryboardScriptLink>;
  /**
   * Re-read the linked script's words onto the board: each named shot's
   * dialogue, narration and snapshot come from the lines it covers. Without
   * `targets`, every drifted shot. Throws on a board that links no script.
   */
  reprojectShots: (targets?: string[]) => Promise<StoryboardReprojection>;
  /**
   * Assemble the board's rendered shots into a persisted timeline sequence
   * (plus draft narration/music clips) and open its tab. Throws when no shot
   * has a rendered, persisted clip.
   */
  assembleTimeline: () => Promise<{
    sequenceId: string;
    clipCount: number;
    skippedShotIds: string[];
  }>;
}

const handlers = new Map<string, StoryboardAgentHandler>();

/**
 * Register (or clear, with null) the handler for one board id. Each open
 * StoryboardSurface calls this on mount and clears it on unmount, so the
 * ui_storyboard_* tools can address any open board by id.
 */
export function setStoryboardAgentHandler(
  boardId: string,
  next: StoryboardAgentHandler | null
): void {
  if (next) {
    handlers.set(boardId, next);
  } else {
    handlers.delete(boardId);
  }
}

export function hasStoryboardAgentHandler(boardId: string): boolean {
  return handlers.has(boardId);
}

/** Ids of every storyboard currently open, in registration order. */
export function listOpenStoryboardIds(): string[] {
  return [...handlers.keys()];
}

export function getStoryboardAgentHandler(
  boardId: string
): StoryboardAgentHandler {
  const handler = handlers.get(boardId);
  if (!handler) {
    const open = listOpenStoryboardIds();
    throw new Error(
      `No storyboard "${boardId}" is open. ` +
        (open.length > 0
          ? `Open storyboards: ${open.join(", ")}. `
          : "No storyboards are currently open. ") +
        'Call ui_open_document with type "storyboard" to open it.'
    );
  }
  return handler;
}
