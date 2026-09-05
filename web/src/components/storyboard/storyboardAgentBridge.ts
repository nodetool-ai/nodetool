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
  ShotDurationSource,
  ShotStatus
} from "@nodetool-ai/protocol";
import type { StoryboardSetupStage } from "@nodetool-ai/protocol/api-schemas/storyboards.js";

/** Serializable view of a single shot the agent reads and edits. */
export interface StoryboardShotNode {
  id: string;
  index: number;
  slug?: string;
  action: string;
  camera?: CameraDirection;
  motion?: string;
  durationSeconds?: number;
  /** Where `durationSeconds` comes from; absent on an unlinked board. */
  durationSource?: ShotDurationSource;
  status: ShotStatus;
  /** The scene this shot sits in, or null under the implicit header. */
  sceneId: string | null;
  dialogue?: string;
  notes?: string;
  /** Whether the shot has a rendered keyframe still. */
  hasKeyframe: boolean;
  /** Whether the shot has a rendered clip. */
  hasClip: boolean;
  /** How many stills and takes are preserved on the shot. */
  keyframeVersionCount: number;
  clipVersionCount: number;
  /**
   * Whether the *selected* still and clip were rendered from inputs the shot
   * no longer has (`isVersionStale`). A version with no render record — an
   * upload, a flip — never reads stale.
   */
  staleKeyframe: boolean;
  staleClip: boolean;
  costEstimate?: number | null;
}

/** A scene as the agent reads it. Order comes from its shots, not the scene. */
export interface StoryboardSceneNode {
  id: string;
  slugline: string;
  lighting?: string;
  /** Ids of the shots in this scene, in board order. */
  shotIds: string[];
}

/** Full snapshot of the open board the agent reads to plan direction. */
export interface StoryboardSnapshot {
  boardId: string;
  title: string;
  brief: string;
  style: string;
  aspectRatio: string;
  /** Where the board sits in the guided setup; "done" once it is finished. */
  setupStage: StoryboardSetupStage;
  /** The genre picked in setup, seasoning the Director run. */
  genre: string;
  /** The board's scenes in order. Empty on a board directed before scenes. */
  scenes: StoryboardSceneNode[];
  /**
   * Library entity (asset) ids cast on this board. Their descriptors season
   * every shot prompt, subject to each shot's own `entity_ids` override.
   */
  entityIds: string[];
  /** True once a screenplay has been loaded onto the board. */
  hasScreenplay: boolean;
  /** Script this board's words come from, or null when it is unlinked. */
  scriptId: string | null;
  selectedShotId: string | null;
  shots: StoryboardShotNode[];
}

/** What an extraction (or a re-projection) left behind. */
interface StoryboardScriptLink {
  scriptId: string;
  /** Lines the script now holds. */
  lineCount: number;
  /** Shots that reference at least one line. */
  linkedShotCount: number;
  /** False when an already-linked script was re-projected. */
  created: boolean;
}

/** What a re-projection rewrote on the board. */
interface StoryboardReprojection {
  scriptId: string;
  /** Shots whose dialogue/narration and snapshot were rewritten. */
  reprojectedShotIds: string[];
  /** Shots that carried drift before the pass ran. */
  driftedShotIds: string[];
}

/** Fields the agent can supply when adding a shot. */
export interface StoryboardAddShotInput {
  action: string;
  /** Short human title for the shot, e.g. "Lighthouse at dusk". */
  slug?: string;
  camera?: CameraDirection;
  motion?: string;
  durationSeconds?: number;
  /** 0-based insertion index; appended when omitted. */
  index?: number;
  /**
   * Insert directly after this shot, in its scene. Wins over `index`, which
   * cannot say which scene a position belongs to.
   */
  afterShotId?: string;
}

/** The guided-setup fields one call writes, as one edit. */
export interface StoryboardSetupInput {
  brief?: string;
  genre?: string;
  stage?: StoryboardSetupStage;
}

/** Which media list a version operation addresses. */
export type StoryboardVersionKind = "keyframe" | "clip";

/** How a render call selects and filters its shots. */
export interface StoryboardRenderOptions {
  /**
   * Render only the selected shots whose current version is stale. Absent or
   * false renders every selected shot, which is the default.
   */
  staleOnly?: boolean;
}

/** What a render call enqueued, and what it passed over. */
export interface StoryboardRenderResult {
  /** The shots a job was started for, in board order. */
  shots: StoryboardShotNode[];
  /** Ids of shots the selection held but `staleOnly` filtered out. */
  skipped: string[];
}

/** Fields the agent can patch on an existing shot. */
export interface StoryboardUpdateShotPatch {
  action?: string;
  /** Short human title for the shot, e.g. "Lighthouse at dusk". */
  slug?: string;
  camera?: CameraDirection;
  motion?: string;
  status?: ShotStatus;
  /** Spoken line delivered in-shot. Read-only on a board linked to a script. */
  dialogue?: string;
  /** Direction that never reaches a prompt — a note to the crew. */
  notes?: string;
  /** Target clip length in seconds. Pins the shot when it covers script lines. */
  durationSeconds?: number;
  /**
   * Where the shot's length comes from: `"audio"` derives it from the takes of
   * the script lines the shot covers, `"manual"` pins `durationSeconds`.
   */
  durationSource?: ShotDurationSource;
}

/**
 * Operations the live StoryboardSurface exposes to the agent tooling layer.
 * Shots are addressed by id, 0-based index, or the literal `"selected"`.
 */
export interface StoryboardAgentHandler {
  getSnapshot: () => StoryboardSnapshot;
  setScreenplay: (screenplay: Screenplay) => StoryboardSnapshot;
  /** Write brief, genre and setup stage in one edit. */
  setSetup: (input: StoryboardSetupInput) => StoryboardSnapshot;
  /**
   * Run the Director over the board's brief and write the result. `redirect`
   * re-runs over an existing screenplay, keeping the ids and media of the
   * shots the revision retains; without it a board that already has a
   * screenplay is refused, so a rerun is never accidental.
   */
  direct: (options: {
    redirect: boolean;
    shotCount?: number;
  }) => Promise<StoryboardSnapshot>;
  /** Replace the board's entity cast. An empty array clears it. */
  setEntityIds: (entityIds: string[]) => StoryboardSnapshot;
  addShot: (input: StoryboardAddShotInput) => StoryboardShotNode;
  updateShot: (
    target: string,
    patch: StoryboardUpdateShotPatch
  ) => StoryboardShotNode;
  /** Move a shot into `sceneId` at `position` within that scene. */
  moveShot: (
    target: string,
    sceneId: string | null,
    position: number
  ) => StoryboardShotNode;
  /** Copy a shot in after itself, dropping its script link. */
  duplicateShot: (target: string) => StoryboardShotNode;
  removeShot: (target: string) => { removed: string };
  updateScene: (
    sceneId: string,
    patch: { slugline?: string; lighting?: string }
  ) => StoryboardSceneNode;
  /** Add a scene after `afterSceneId` (or last), holding one blank shot. */
  createScene: (afterSceneId?: string | null) => StoryboardSceneNode;
  /** Fold a scene's shots into the scene before it. */
  mergeScene: (sceneId: string) => { merged: string; into: string };
  /**
   * Apply a style: an entity id runs the preset (the entity replaces every
   * other style entity and its descriptor becomes the board style); a bare
   * descriptor with no entity sets the board style alone.
   */
  setStyle: (input: {
    entityId?: string;
    descriptor?: string;
  }) => StoryboardSnapshot;
  /** Select one of a shot's preserved stills or takes. */
  selectVersion: (
    target: string,
    kind: StoryboardVersionKind,
    version: number
  ) => StoryboardShotNode;
  /** Remove one preserved still or take, re-selecting a neighbour. */
  deleteVersion: (
    target: string,
    kind: StoryboardVersionKind,
    version: number
  ) => StoryboardShotNode;
  /**
   * Add a stored asset as a new still on the shot and select it — an upload,
   * a flip, or an image-editor result. Never overwrites a version.
   */
  addKeyframeVersion: (
    target: string,
    assetId: string,
    flipOf?: string
  ) => StoryboardShotNode;
  generateKeyframe: (
    target: string,
    options?: StoryboardRenderOptions
  ) => Promise<StoryboardRenderResult>;
  generateClip: (
    target: string,
    options?: StoryboardRenderOptions
  ) => Promise<StoryboardRenderResult>;
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
   * (plus draft narration/music clips) and open its tab. A board linked to a
   * script cuts the voiced lines in too, and reports the ones it could not.
   * Throws when no shot has a rendered, persisted clip.
   */
  assembleTimeline: () => Promise<{
    sequenceId: string;
    clipCount: number;
    skippedShotIds: string[];
    skippedLineIds: string[];
    reassembled: boolean;
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
