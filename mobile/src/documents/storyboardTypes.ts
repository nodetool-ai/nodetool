/**
 * The agent-facing storyboard contract on mobile.
 *
 * Ported from web's `storyboardAgentBridge`, trimmed to what a phone can
 * actually do: read the board, write shots and board settings, select, save.
 * Generation and timeline assembly are deliberately absent — both are long,
 * expensive jobs that need the desktop surface to supervise, and offering them
 * here would let an agent spend money from a screen that cannot show progress.
 *
 * Everything crossing the bridge is a plain serializable value, so the tool
 * layer never touches a Zustand handle.
 */

import type {
  CameraDirection,
  ImageRef,
  Screenplay,
  Shot,
  ShotStatus,
  VideoRef,
} from '@nodetool-ai/protocol';

/** A model pick as the web pickers emit it. Mobile only reads these through. */
interface StoryboardModelSelection {
  type: string;
  id: string;
  provider: string;
  name?: string;
}

/**
 * The storyboard document body — the wire shape of `storyboardDocument` in
 * `@nodetool-ai/protocol/api-schemas/storyboards`. Declared structurally
 * because the schema module is zod and is not re-exported from the package
 * root, and mobile has no zod. Note the snake_case shot fields: that is the
 * stored shape, not a slip.
 */
export interface StoryboardDocument {
  screenplay: Screenplay | null;
  shots: Shot[];
  brief: string;
  style: string;
  entityIds: string[];
  aspectRatio: string;
  directorModel: StoryboardModelSelection | null;
  imageModel: StoryboardModelSelection | null;
  videoModel: StoryboardModelSelection | null;
}

/** Serializable view of one shot the agent reads and edits. */
export interface StoryboardShotNode {
  id: string;
  index: number;
  slug?: string;
  action: string;
  camera?: CameraDirection;
  motion?: string;
  durationSeconds?: number;
  status: ShotStatus;
  hasKeyframe: boolean;
  hasClip: boolean;
}

/** Snapshot of the open board the agent reads before deciding what to change. */
export interface StoryboardSnapshot {
  boardId: string;
  title: string;
  brief: string;
  style: string;
  aspectRatio: string;
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
  slug?: string;
  durationSeconds?: number;
}

/**
 * Operations the mounted StoryboardEditorScreen exposes to the tool layer.
 * Shots are addressed by id, 0-based index as a string, or `"selected"`.
 */
export interface StoryboardAgentHandler {
  getSnapshot: () => StoryboardSnapshot;
  addShot: (input: StoryboardAddShotInput) => StoryboardShotNode;
  updateShot: (
    target: string,
    patch: StoryboardUpdateShotPatch
  ) => StoryboardShotNode;
  removeShot: (target: string) => StoryboardShotNode;
  reorderShot: (target: string, toIndex: number) => StoryboardShotNode;
  setBrief: (brief: string) => StoryboardSnapshot;
  setStyle: (style: string) => StoryboardSnapshot;
  setAspectRatio: (ratio: string) => StoryboardSnapshot;
  selectShot: (target: string | null) => StoryboardShotNode | null;
  /** Persist the board. Resolves with the server's new `updatedAt`. */
  save: () => Promise<{ ok: true; updatedAt: string | null }>;
}

const hasUri = (ref: ImageRef | VideoRef | null | undefined): boolean =>
  ref?.uri != null && ref.uri.length > 0;

/** Project a stored shot into the agent's view of it. */
export function shotToNode(shot: Shot, index: number): StoryboardShotNode {
  return {
    id: shot.id,
    index,
    slug: shot.slug,
    action: shot.action,
    camera: shot.camera,
    motion: shot.motion,
    durationSeconds: shot.duration_seconds,
    status: shot.status,
    hasKeyframe: hasUri(shot.keyframe),
    hasClip: hasUri(shot.clip),
  };
}

/**
 * Resolve an agent-supplied shot address to an array position.
 *
 * Accepts a shot id, a 0-based index written as a string, or `"selected"`.
 * Throws naming the valid ids, because the message is the agent's only way to
 * recover from a bad guess.
 */
export function resolveShotIndex(
  shots: readonly Shot[],
  target: string,
  selectedShotId: string | null
): number {
  const wanted = target === 'selected' ? selectedShotId : target;
  if (wanted === null || wanted === undefined || wanted === '') {
    throw new Error(
      'No shot is selected. Pass a shot id or 0-based index instead of "selected".'
    );
  }

  const byId = shots.findIndex((shot) => shot.id === wanted);
  if (byId >= 0) {
    return byId;
  }

  if (/^\d+$/.test(wanted)) {
    const position = Number(wanted);
    if (position < shots.length) {
      return position;
    }
  }

  const ids = shots.map((shot) => shot.id).join(', ');
  throw new Error(
    `No shot matches "${target}". Use a shot id, a 0-based index below ${shots.length}, or "selected". ` +
      (ids.length > 0 ? `Shot ids: ${ids}.` : 'This board has no shots yet.')
  );
}

/** Renumber `index` after an insert, delete, or move. */
export function reindexShots(shots: readonly Shot[]): Shot[] {
  return shots.map((shot, index) => (shot.index === index ? shot : { ...shot, index }));
}
