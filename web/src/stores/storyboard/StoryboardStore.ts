/**
 * StoryboardStore
 *
 * Singleton Zustand store for the Storyboard workspace surface. Unlike the
 * timeline (one document store per open editor instance), the storyboard keeps
 * every open board in a single `boards` map keyed by ref id, so a board's
 * screenplay + shots survive tab switches without a provider wrapper.
 *
 * A board is the editable spine the Director produces and the shot cards render:
 * a {@link Screenplay} plus a flat `shots` array (the direction the surface
 * mutates as stills/clips are generated and selected).
 *
 * Usage:
 *   const board = useBoard(boardId);           // reactive board view
 *   useStoryboardStore.getState().selectKeyframeVersion(boardId, shotId, 0);
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  Entity,
  ImageRef,
  Scene,
  Screenplay,
  Shot,
  ShotStatus,
  VideoRef
} from "@nodetool-ai/protocol";
import {
  pushHistory,
  undoHistory,
  redoHistory,
  clearHistory,
  canUndo,
  canRedo,
  type HistoryMap
} from "../documentHistory";
import type {
  ImageModelValue,
  LanguageModelValue,
  VideoModelValue
} from "../ApiTypes";
import type { StoryboardSetupStage } from "@nodetool-ai/protocol/api-schemas/storyboards.js";
import {
  sceneOrder,
  scenesAreContiguous
} from "../../lib/storyboard/sceneOrder";
import {
  linkedShots,
  reprojectedShots,
  unlinkedScreenplay,
  unlinkedShots,
  type ScriptProjectionSource
} from "../../lib/scriptStoryboardLink";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StoryboardBoard {
  id: string;
  screenplay: Screenplay | null;
  shots: Shot[];
  title: string;
  brief: string;
  style: string;
  /**
   * Library entity (asset) ids applied to this board. Each shot's still/clip
   * prompt picks up the applicable entities' descriptors for consistency.
   */
  entityIds: string[];
  aspectRatio: string;
  /**
   * Where the board sits in the guided setup. A board built before the flow
   * existed, and one the flow has finished, both read "done".
   */
  setupStage: StoryboardSetupStage;
  /** Genre sits on the board, not the screenplay: it is picked before one exists. */
  genre: string;
  /** Language model the Director run uses. Null until the user picks one. */
  directorModel: LanguageModelValue | null;
  /** Image model every keyframe still is generated with. Null = node default. */
  imageModel: ImageModelValue | null;
  /** Video model every clip is generated with. Null = node default. */
  videoModel: VideoModelValue | null;
  activeShotId: string | null;
  /** Persisted timeline sequence this board was assembled into, if any. */
  timelineId: string | null;
  /** Epoch ms of the last mutation; drives the sidebar's recency sort. */
  updatedAt: number;
}

/** The guided-setup fields one step writes. Omitted keys are left alone. */
export interface StoryboardSetupPatch {
  brief?: string;
  genre?: string;
  stage?: StoryboardSetupStage;
}

/** The scene fields the surface edits; a scene carries no order of its own. */
export type ScenePatch = Partial<Pick<Scene, "slugline" | "lighting">>;

interface StoryboardStoreState {
  boards: Record<string, StoryboardBoard>;
  /** Server `updated_at` token per board — the CAS base for the next save. */
  serverRevisions: Record<string, string>;
  /** Per-board undo/redo checkpoints of the {@link StoryboardBoard} document. */
  history: HistoryMap<StoryboardBoard>;
  setServerRevision: (boardId: string, revision: string | null) => void;

  /** Restore the previous document checkpoint for a board. */
  undo: (boardId: string) => void;
  /** Reapply the next document checkpoint for a board. */
  redo: (boardId: string) => void;

  /** Create an empty board for `id` if one does not already exist. */
  ensureBoard: (id: string) => void;
  /** Delete a board outright (its generated assets stay in the asset library). */
  removeBoard: (id: string) => void;
  /**
   * Hydrate a board from its server document. Overwrites local state for that
   * board and records the server revision for CAS autosaves.
   */
  loadBoard: (
    id: string,
    board: Omit<StoryboardBoard, "id" | "updatedAt">,
    options?: { checkpoint?: boolean }
  ) => void;

  /**
   * Apply a document merged with an external change. Stamps `updatedAt` so
   * autosave picks the result up, and records no undo checkpoint: an external
   * change never enters the undo stack (ADR 0001). Accepting one conflicted
   * value later goes through the normal actions and is undoable.
   */
  applyMerged: (id: string, board: StoryboardBoard) => void;

  /** Load a screenplay, keeping generated media for shots with existing ids. */
  setScreenplay: (boardId: string, screenplay: Screenplay) => void;

  setBrief: (boardId: string, brief: string) => void;
  setStyle: (boardId: string, style: string) => void;
  /**
   * Write the guided-setup fields in one edit. The three move together — a
   * step writes its answer and advances — so they are one undo entry, not
   * three (PRD § 7.7.1).
   */
  setSetup: (boardId: string, patch: StoryboardSetupPatch) => void;
  /** Replace the board's entity selection. */
  setEntityIds: (boardId: string, entityIds: string[]) => void;
  /**
   * Toggle one entity for one shot. Writes the shot's explicit
   * `entity_ids` override, seeding it from `currentIds` (the applicable set
   * shown in the UI) so the first toggle removes/adds exactly one entity.
   */
  toggleShotEntity: (
    boardId: string,
    shotId: string,
    entityId: string,
    currentIds: string[]
  ) => void;
  setTitle: (boardId: string, title: string) => void;
  setAspectRatio: (boardId: string, aspectRatio: string) => void;
  setDirectorModel: (boardId: string, model: LanguageModelValue | null) => void;
  setImageModel: (boardId: string, model: ImageModelValue | null) => void;
  setVideoModel: (boardId: string, model: VideoModelValue | null) => void;
  /** Record the persisted timeline sequence this board assembles into. */
  setTimelineLink: (boardId: string, timelineId: string | null) => void;
  /**
   * Link the board to a script: the screenplay references it, and each shot
   * named in `lineIdsByShotId` records the lines it covers plus the text as
   * projected. No-op on a board with no screenplay — there is nothing to link.
   */
  setScriptLink: (
    boardId: string,
    scriptId: string,
    lineIdsByShotId: Record<string, string[]>,
    textByLineId: Map<string, string>
  ) => void;
  /**
   * Re-project the linked script's words onto the board: every drifted shot's
   * `dialogue`/`narration` and `script_text_snapshot` are re-read from the
   * lines it covers, in one document update. `shotIds` names the shots to pass
   * over instead of the drifted ones. The script text wins — this is the
   * direction that carries a writer's edit onto the board.
   */
  reprojectShots: (
    boardId: string,
    source: ScriptProjectionSource,
    shotIds?: string[]
  ) => void;
  /**
   * Drop the script link, keeping the projected words: with the script gone
   * the shot's dialogue and narration are ordinary shot text.
   */
  clearScriptLink: (boardId: string) => void;

  /** Insert a shot, or replace the one with the same id. */
  upsertShot: (boardId: string, shot: Shot) => void;
  /** Patch fields on a single shot. No-op when the shot is gone. */
  updateShot: (boardId: string, shotId: string, patch: Partial<Shot>) => void;
  setShotStatus: (boardId: string, shotId: string, status: ShotStatus) => void;
  setShotKeyframe: (
    boardId: string,
    shotId: string,
    keyframe: ImageRef
  ) => void;
  setShotClip: (boardId: string, shotId: string, clip: VideoRef) => void;
  /** Make one of the shot's preserved stills the selected keyframe. */
  selectKeyframeVersion: (
    boardId: string,
    shotId: string,
    versionIndex: number
  ) => void;
  /**
   * Remove one preserved still from a shot. When the removed still is the
   * selected keyframe, the next still at the same index becomes selected (or
   * the last one when the removed still was at the end). Removing the last
   * still clears the selection and reverts a `keyframe_ready` shot to `planned`.
   */
  removeKeyframeVersion: (
    boardId: string,
    shotId: string,
    versionIndex: number
  ) => void;
  /** Make one of the shot's preserved takes the selected/export clip. */
  selectClipVersion: (
    boardId: string,
    shotId: string,
    versionIndex: number
  ) => void;
  /**
   * Remove one preserved clip from a shot. When the removed clip is the
   * selected clip, the next clip at the same index becomes selected (or the
   * last one when the removed clip was at the end). Removing the last clip
   * clears the selection and reverts a `rendered` shot to `keyframe_ready`
   * (or `planned` when no still remains).
   */
  removeClipVersion: (
    boardId: string,
    shotId: string,
    versionIndex: number
  ) => void;
  removeShot: (boardId: string, shotId: string) => void;
  /**
   * Append a blank planned shot and select it, so the inspector opens on it.
   * Returns the new shot's id, or null when the board is not in the store.
   */
  addShot: (boardId: string) => string | null;
  /**
   * Insert a blank planned shot directly after `afterShotId`, in that shot's
   * scene, and select it. An unknown or omitted `afterShotId` appends to the
   * board. Returns the new shot's id, or null when the board is absent.
   */
  insertShot: (boardId: string, afterShotId?: string | null) => string | null;
  /**
   * Copy a shot directly after itself in the same scene (PRD § 7.7.6). The
   * copy keeps the direction, media versions and selections; it drops the
   * script link (`script_line_ids`, `script_text_snapshot`, `covered_by`) —
   * the copy covers no script line — and reads `duration_source: "manual"`.
   * Returns the copy's id, or null when the shot is absent.
   */
  duplicateShot: (boardId: string, shotId: string) => string | null;
  /**
   * Reorder shots to match `orderedIds`; re-stamps each shot's `index`. An
   * order that splits a scene is refused outright (PRD § 7.7.3).
   */
  reorderShots: (boardId: string, orderedIds: string[]) => void;
  /**
   * Move one shot to `position` within `sceneId` (`null` is the implicit
   * header), clamped to that scene's length. Scene-creating: on a legacy board
   * every unscened shot joins one new scene before the move lands.
   */
  moveShot: (
    boardId: string,
    shotId: string,
    sceneId: string | null,
    position: number
  ) => void;
  /**
   * Move one shot a single position earlier ("up") or later ("down") within
   * its own scene, re-stamping every shot's `index`. No-op at the scene's
   * ends — crossing a header is a {@link moveShot}, which names the scene.
   */
  nudgeShot: (
    boardId: string,
    shotId: string,
    direction: "up" | "down"
  ) => void;
  /** Patch a scene's slugline/lighting. No-op when the scene is gone. */
  updateScene: (boardId: string, sceneId: string, patch: ScenePatch) => void;
  /**
   * Add a scene after `afterSceneId` (or at the end), holding one blank shot.
   * A scene with no shots has no position — the order is derived from its
   * first shot — so it would neither render nor survive the next operation.
   * Scene-creating: a legacy board's unscened shots join one new scene first.
   * Returns the new scene's id, or null when the board is absent.
   */
  createScene: (boardId: string, afterSceneId?: string | null) => string | null;
  /**
   * Fold a scene's shots into the scene before it, dropping the empty scene.
   * No-op on the first scene, which has nothing to merge into.
   */
  mergeSceneIntoPrevious: (boardId: string, sceneId: string) => void;
  /**
   * Apply a style preset (PRD § 7.7.5): the chosen entity replaces every other
   * `style` entity on the board and its descriptor becomes `style`. Character,
   * location and prop selections are untouched; a per-shot exclusion of a
   * style entity is dropped, since a style applies board-wide. Renders nothing.
   *
   * `entities` is the resolved library the ids are read against — the store
   * holds ids, and the kinds and descriptors live in a server query the
   * caller already has.
   */
  setStylePreset: (
    boardId: string,
    entityId: string,
    entities: readonly Entity[]
  ) => void;
  selectShot: (boardId: string, shotId: string | null) => void;

  getBoard: (id: string) => StoryboardBoard | undefined;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const emptyBoard = (id: string): StoryboardBoard => ({
  id,
  screenplay: null,
  shots: [],
  title: "",
  brief: "",
  style: "",
  entityIds: [],
  aspectRatio: "16:9",
  setupStage: "done",
  genre: "",
  directorModel: null,
  imageModel: null,
  videoModel: null,
  activeShotId: null,
  timelineId: null,
  updatedAt: Date.now()
});

/**
 * How a mutation records undo history: `false` skips the checkpoint (for
 * selection, generation status, and the timeline handoff); an object records
 * one, optionally folding rapid same-field edits under `coalesceKey`.
 */
type Track = false | { coalesceKey?: string };

/**
 * Apply `mutate` to the board with `boardId`. Returns the SAME state when the
 * board is absent or `mutate` returns `null`, so no-op edits don't churn
 * subscribers. Stamps `updatedAt` and records an undo checkpoint (unless
 * `track` is false) on every real mutation.
 */
const withBoard = (
  state: StoryboardStoreState,
  boardId: string,
  mutate: (board: StoryboardBoard) => StoryboardBoard | null,
  track: Track = {}
): Partial<StoryboardStoreState> | StoryboardStoreState => {
  const board = state.boards[boardId];
  if (!board) {
    return state;
  }
  const next = mutate(board);
  if (!next || next === board) {
    return state;
  }
  const now = Date.now();
  const patch: Partial<StoryboardStoreState> = {
    boards: { ...state.boards, [boardId]: { ...next, updatedAt: now } }
  };
  if (track !== false) {
    patch.history = pushHistory(
      state.history,
      boardId,
      board,
      track.coalesceKey ?? null,
      now
    );
  }
  return patch;
};

/**
 * Restore a checkpoint while keeping the live selection and per-shot generation
 * status, so undo/redo never resurrects a stale spinner or jumps the active
 * shot. Content (screenplay, shot media, order, prompts) comes from the
 * checkpoint; `activeShotId` and each surviving shot's `status` stay live.
 */
const withLiveTransient = (
  restored: StoryboardBoard,
  current: StoryboardBoard
): StoryboardBoard => ({
  ...restored,
  // Keep the live selection, but only if that shot survives in the checkpoint;
  // a selection undone out of existence resets rather than dangling.
  activeShotId: restored.shots.some((s) => s.id === current.activeShotId)
    ? current.activeShotId
    : null,
  updatedAt: Date.now(),
  shots: restored.shots.map((s) => {
    const live = current.shots.find((c) => c.id === s.id);
    return live && live.status !== s.status ? { ...s, status: live.status } : s;
  })
});

/** Same generated asset: matched by asset_id when present, else by uri. */
export const sameMediaRef = (
  a: { asset_id?: string | null; uri?: string },
  b: { asset_id?: string | null; uri?: string }
): boolean => (b.asset_id ? a.asset_id === b.asset_id : a.uri === b.uri);

/** Patch the single shot with `shotId`; returns the same board on a no-op. */
/**
 * Re-stamp `index` to the array position. `index` is the field the surface
 * sorts and numbers shots by, so any path that changes the order — a move, a
 * merge that inserted a server shot — must renumber or the board renders out
 * of order. Shots already at their position keep their identity.
 */
const renumberShots = (shots: Shot[]): Shot[] =>
  shots.map((shot, i) => (shot.index === i ? shot : { ...shot, index: i }));

/** The board's scenes. They live on the screenplay; the board reads them. */
const boardScenes = (board: StoryboardBoard): Scene[] =>
  board.screenplay?.scenes ?? [];

/**
 * Write `scenes` back onto the board. A hand-built board (shots added without
 * a Director run) has no screenplay to hang them off, so the first scene
 * materializes a minimal one. Its `shots` stays empty, matching the convention
 * that `screenplay.shots` is what the Director wrote and `board.shots` is the
 * live direction.
 */
const withScenes = (
  board: StoryboardBoard,
  scenes: Scene[]
): StoryboardBoard => {
  if (board.screenplay) {
    return scenes === board.screenplay.scenes
      ? board
      : { ...board, screenplay: { ...board.screenplay, scenes } };
  }
  if (scenes.length === 0) {
    return board;
  }
  return {
    ...board,
    screenplay: {
      type: "screenplay",
      id: crypto.randomUUID(),
      title: board.title,
      shots: [],
      scenes
    }
  };
};

/** Put a shot in a scene, or out of every scene when `sceneId` is null. */
const withScene = (shot: Shot, sceneId: string | null): Shot => {
  if ((shot.scene_id ?? null) === sceneId) {
    return shot;
  }
  if (sceneId === null) {
    // Deleted rather than set to undefined: the key must not survive the
    // document's JSON round-trip as an explicit null-ish scene.
    const next = { ...shot };
    delete next.scene_id;
    return next;
  }
  return { ...shot, scene_id: sceneId };
};

/** Same shots in the same order — identity survives an unchanged renumber. */
const sameShots = (a: readonly Shot[], b: readonly Shot[]): boolean =>
  a.length === b.length && a.every((shot, i) => shot === b[i]);

/**
 * Finish a structural edit (PRD § 7.7.3): collect each scene's shots into one
 * run in the order the board already renders them, re-stamp `index` to
 * `0..n-1`, and drop every scene no shot is in. Returns null when neither
 * shots nor scenes moved, so a no-op records no undo entry.
 */
const structural = (
  board: StoryboardBoard,
  shots: readonly Shot[],
  scenes?: Scene[]
): StoryboardBoard | null => {
  const current = boardScenes(board);
  const source = scenes ?? current;
  // The caller's array order is the intent, so stamp it before grouping:
  // `sceneOrder` reads `index`, which is stale until this runs.
  const proposed = renumberShots([...shots]);
  const next = renumberShots(
    sceneOrder(proposed).flatMap((group) => group.shots)
  );
  const used = new Set(
    next.map((shot) => shot.scene_id).filter((id): id is string => !!id)
  );
  const pruned = source.filter((scene) => used.has(scene.id));
  const kept = pruned.length === source.length ? source : pruned;
  const sameScenes =
    kept.length === current.length &&
    kept.every((scene, i) => scene === current[i]);
  if (sameShots(next, board.shots) && sameScenes) {
    return null;
  }
  return withScenes({ ...board, shots: next }, kept);
};

/**
 * The first scene-creating operation on a legacy board puts every unscened
 * shot in one new scene, in index order (PRD § 7.7.3). Returns the board's own
 * shots and scenes when there is nothing unscened to assign.
 */
const materializeLegacyScene = (
  board: StoryboardBoard
): { shots: readonly Shot[]; scenes: Scene[]; sceneId: string | null } => {
  const scenes = boardScenes(board);
  if (!board.shots.some((shot) => !shot.scene_id)) {
    return { shots: board.shots, scenes, sceneId: null };
  }
  const scene: Scene = {
    type: "scene",
    id: crypto.randomUUID(),
    slugline: ""
  };
  return {
    shots: board.shots.map((shot) =>
      shot.scene_id ? shot : withScene(shot, scene.id)
    ),
    scenes: [...scenes, scene],
    sceneId: scene.id
  };
};

/** A blank planned shot. `index` is stamped by the reindex that follows. */
const blankShot = (id: string, sceneId: string | null): Shot => {
  const shot: Shot = {
    type: "shot",
    id,
    index: 0,
    action: "",
    status: "planned"
  };
  return sceneId === null ? shot : withScene(shot, sceneId);
};

const patchShot = (
  board: StoryboardBoard,
  shotId: string,
  patch: Partial<Shot>
): StoryboardBoard => {
  const target = board.shots.find((s) => s.id === shotId);
  if (!target) {
    return board;
  }
  const keys = Object.keys(patch) as Array<keyof Shot>;
  const unchanged = keys.every((k) => Object.is(target[k], patch[k]));
  if (unchanged) {
    return board;
  }
  return {
    ...board,
    shots: board.shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s))
  };
};

// ── Store ────────────────────────────────────────────────────────────────────

export const useStoryboardStore = create<StoryboardStoreState>((set, get) => ({
  boards: {},
  serverRevisions: {},
  history: {},

  undo: (boardId) =>
    set((state) => {
      const current = state.boards[boardId];
      if (!current) return state;
      const result = undoHistory(state.history, boardId, current);
      if (!result) return state;
      return {
        boards: {
          ...state.boards,
          [boardId]: withLiveTransient(result.restored, current)
        },
        history: result.history
      };
    }),

  redo: (boardId) =>
    set((state) => {
      const current = state.boards[boardId];
      if (!current) return state;
      const result = redoHistory(state.history, boardId, current);
      if (!result) return state;
      return {
        boards: {
          ...state.boards,
          [boardId]: withLiveTransient(result.restored, current)
        },
        history: result.history
      };
    }),

  setServerRevision: (boardId, revision) =>
    set((state) => {
      const serverRevisions = { ...state.serverRevisions };
      if (revision === null) {
        delete serverRevisions[boardId];
      } else {
        serverRevisions[boardId] = revision;
      }
      return { serverRevisions };
    }),

  loadBoard: (id, board, options) =>
    set((state) => {
      const prev = state.boards[id];
      const next = {
        ...emptyBoard(id),
        ...board,
        id,
        shots: board.shots.map((s) =>
          s.status === "keyframe_generating"
            ? { ...s, status: "planned" as const }
            : s.status === "clip_generating"
              ? { ...s, status: "keyframe_ready" as const }
              : s
        ),
        updatedAt: Date.now()
      };
      const patch: Partial<StoryboardStoreState> = {
        boards: { ...state.boards, [id]: next }
      };
      if (options?.checkpoint && prev) {
        patch.history = pushHistory(state.history, id, prev, null, Date.now());
      }
      return patch;
    }),

  ensureBoard: (id) =>
    set((state) =>
      state.boards[id]
        ? state
        : { boards: { ...state.boards, [id]: emptyBoard(id) } }
    ),

  applyMerged: (id, board) =>
    set((state) => ({
      boards: {
        ...state.boards,
        [id]: {
          ...board,
          id,
          updatedAt: Date.now(),
          // Merged shots keep the draft's order but can carry stale or
          // duplicate indices; renumber so shot N is always index N.
          shots: renumberShots(board.shots)
        }
      }
    })),

  removeBoard: (id) =>
    set((state) => {
      // A board entry can be gone while its revision/history linger — e.g.
      // useStoryboardServerSync sets the CAS token after `create` before any
      // loadBoard. Clear whichever of the three still holds the id.
      if (
        !(id in state.boards) &&
        !(id in state.serverRevisions) &&
        !(id in state.history)
      ) {
        return state;
      }
      const boards = { ...state.boards };
      delete boards[id];
      // Drop the CAS token too, so re-creating this id later can't reuse a
      // stale revision (mirrors ScriptStore.removeScript).
      const serverRevisions = { ...state.serverRevisions };
      delete serverRevisions[id];
      return {
        boards,
        serverRevisions,
        history: clearHistory(state.history, id)
      };
    }),

  setScreenplay: (boardId, screenplay) =>
    set((state) => {
      const prev = state.boards[boardId];
      const board = prev ?? emptyBoard(boardId);
      const currentShots = new Map(board.shots.map((shot) => [shot.id, shot]));
      const shots = screenplay.shots.map((shot) => {
        const current = currentShots.get(shot.id);
        if (!current) return shot;
        // A screenplay describes direction. Its media can predate renders
        // and version selections made on the live board while the agent ran.
        return {
          ...current,
          ...shot,
          keyframe: current.keyframe,
          keyframe_versions: current.keyframe_versions,
          clip: current.clip,
          clip_versions: current.clip_versions,
          covered_by: current.covered_by,
          status: current.status
        };
      });
      const next: StoryboardBoard = {
        ...board,
        screenplay,
        shots,
        title: screenplay.title || board.title,
        aspectRatio: screenplay.aspect_ratio ?? board.aspectRatio,
        style: screenplay.style_bible ?? board.style,
        // The screenplay's cast becomes the board's cast: `entityIds` is what
        // seasons every shot prompt, and a screenplay that names entities the
        // board does not carry would generate them out.
        entityIds: screenplay.entity_ids ?? board.entityIds,
        // An explicit `brief` wins. A logline fills an empty brief only — the
        // editor directs *from* the brief, so a returned logline must never
        // overwrite what the user wrote.
        brief:
          screenplay.brief ??
          (board.brief.trim() ? board.brief : (screenplay.logline ?? "")),
        updatedAt: Date.now()
      };
      const patch: Partial<StoryboardStoreState> = {
        boards: { ...state.boards, [boardId]: next }
      };
      // A (re-)direct that replaces an existing board is undoable; the first
      // screenplay on an empty board has nothing to step back to.
      if (prev) {
        patch.history = pushHistory(
          state.history,
          boardId,
          prev,
          null,
          Date.now()
        );
      }
      return patch;
    }),

  setBrief: (boardId, brief) =>
    set((state) =>
      withBoard(
        state,
        boardId,
        (b) => (b.brief === brief ? null : { ...b, brief }),
        { coalesceKey: "brief" }
      )
    ),

  setStyle: (boardId, style) =>
    set((state) =>
      withBoard(
        state,
        boardId,
        (b) => (b.style === style ? null : { ...b, style }),
        { coalesceKey: "style" }
      )
    ),

  setSetup: (boardId, patch) =>
    set((state) =>
      withBoard(
        state,
        boardId,
        (b) => {
          const next: StoryboardBoard = { ...b };
          if (patch.brief !== undefined) next.brief = patch.brief;
          if (patch.genre !== undefined) next.genre = patch.genre;
          if (patch.stage !== undefined) next.setupStage = patch.stage;
          return next.brief === b.brief &&
            next.genre === b.genre &&
            next.setupStage === b.setupStage
            ? null
            : next;
        },
        // Typing in a setup field coalesces the same way a brief edit does.
        { coalesceKey: `setup:${Object.keys(patch).sort().join(",")}` }
      )
    ),

  setEntityIds: (boardId, entityIds) =>
    set((state) =>
      withBoard(state, boardId, (b) =>
        b.entityIds.length === entityIds.length &&
        b.entityIds.every((id, i) => id === entityIds[i])
          ? null
          : { ...b, entityIds }
      )
    ),

  toggleShotEntity: (boardId, shotId, entityId, currentIds) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const target = b.shots.find((s) => s.id === shotId);
        if (!target) {
          return null;
        }
        const base = target.entity_ids ?? currentIds;
        const entity_ids = base.includes(entityId)
          ? base.filter((id) => id !== entityId)
          : [...base, entityId];
        return patchShot(b, shotId, { entity_ids });
      })
    ),

  setTitle: (boardId, title) =>
    set((state) =>
      withBoard(
        state,
        boardId,
        (b) => (b.title === title ? null : { ...b, title }),
        { coalesceKey: "title" }
      )
    ),

  setAspectRatio: (boardId, aspectRatio) =>
    set((state) =>
      withBoard(state, boardId, (b) =>
        b.aspectRatio === aspectRatio ? null : { ...b, aspectRatio }
      )
    ),

  setDirectorModel: (boardId, model) =>
    set((state) =>
      withBoard(state, boardId, (b) =>
        b.directorModel?.id === model?.id &&
        b.directorModel?.provider === model?.provider
          ? null
          : { ...b, directorModel: model }
      )
    ),

  setImageModel: (boardId, model) =>
    set((state) =>
      withBoard(state, boardId, (b) =>
        b.imageModel?.id === model?.id &&
        b.imageModel?.provider === model?.provider
          ? null
          : { ...b, imageModel: model }
      )
    ),

  setVideoModel: (boardId, model) =>
    set((state) =>
      withBoard(state, boardId, (b) =>
        b.videoModel?.id === model?.id &&
        b.videoModel?.provider === model?.provider
          ? null
          : { ...b, videoModel: model }
      )
    ),

  setTimelineLink: (boardId, timelineId) =>
    set((state) =>
      withBoard(
        state,
        boardId,
        (b) => (b.timelineId === timelineId ? null : { ...b, timelineId }),
        // A timeline handoff isn't an authoring edit — keep it out of undo.
        false
      )
    ),

  setScriptLink: (boardId, scriptId, lineIdsByShotId, textByLineId) =>
    set((state) =>
      withBoard(
        state,
        boardId,
        (b) => {
          if (!b.screenplay) {
            return null;
          }
          const shots = linkedShots(b.shots, lineIdsByShotId, textByLineId);
          return {
            ...b,
            screenplay: { ...b.screenplay, script_id: scriptId, shots },
            shots
          };
        },
        // A link is a handoff between two documents, not an authoring edit.
        false
      )
    ),

  reprojectShots: (boardId, source, shotIds) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const shots = reprojectedShots(b.shots, source, shotIds);
        if (shots === b.shots) {
          return null;
        }
        // Both fields land in one board write, so the autosave sends one CAS
        // update — never a snapshot without the text it snapshots.
        return {
          ...b,
          screenplay: b.screenplay ? { ...b.screenplay, shots } : b.screenplay,
          shots
        };
      })
    ),

  clearScriptLink: (boardId) =>
    set((state) =>
      withBoard(
        state,
        boardId,
        (b) => {
          const shots = unlinkedShots(b.shots);
          const screenplay = unlinkedScreenplay(b.screenplay);
          if (shots === b.shots && screenplay === b.screenplay) {
            return null;
          }
          return {
            ...b,
            screenplay: screenplay ? { ...screenplay, shots } : screenplay,
            shots
          };
        },
        false
      )
    ),

  upsertShot: (boardId, shot) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const exists = b.shots.some((s) => s.id === shot.id);
        return {
          ...b,
          shots: exists
            ? b.shots.map((s) => (s.id === shot.id ? shot : s))
            : [...b.shots, shot]
        };
      })
    ),

  updateShot: (boardId, shotId, patch) =>
    set((state) =>
      withBoard(state, boardId, (b) => patchShot(b, shotId, patch), {
        // Fold a run of edits to the same field(s) of one shot (typing a
        // prompt) into a single undo step.
        coalesceKey: `shot:${shotId}:${Object.keys(patch).sort().join(",")}`
      })
    ),

  setShotStatus: (boardId, shotId, status) =>
    set((state) =>
      // Generation lifecycle, not an authoring edit — keep it out of undo.
      withBoard(state, boardId, (b) => patchShot(b, shotId, { status }), false)
    ),

  setShotKeyframe: (boardId, shotId, keyframe) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const target = b.shots.find((s) => s.id === shotId);
        if (!target) {
          return b;
        }
        // Preserve every still; the new render becomes the selected keyframe.
        const versions =
          target.keyframe_versions ??
          (target.keyframe ? [target.keyframe] : []);
        const exists = versions.some((v) => sameMediaRef(v, keyframe));
        return patchShot(b, shotId, {
          keyframe,
          keyframe_versions: exists ? versions : [...versions, keyframe]
        });
      })
    ),

  setShotClip: (boardId, shotId, clip) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const target = b.shots.find((s) => s.id === shotId);
        if (!target) {
          return b;
        }
        // Preserve every take; the new render becomes the selected clip.
        const versions =
          target.clip_versions ?? (target.clip ? [target.clip] : []);
        const exists = versions.some((v) => sameMediaRef(v, clip));
        return patchShot(b, shotId, {
          clip,
          clip_versions: exists ? versions : [...versions, clip]
        });
      })
    ),

  selectKeyframeVersion: (boardId, shotId, versionIndex) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const target = b.shots.find((s) => s.id === shotId);
        const versions =
          target?.keyframe_versions ??
          (target?.keyframe ? [target.keyframe] : []);
        const keyframe = versions[versionIndex];
        if (!keyframe || keyframe === target?.keyframe) {
          return null;
        }
        return patchShot(b, shotId, { keyframe });
      })
    ),

  removeKeyframeVersion: (boardId, shotId, versionIndex) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const target = b.shots.find((s) => s.id === shotId);
        if (!target) {
          return null;
        }
        const versions =
          target.keyframe_versions ??
          (target.keyframe ? [target.keyframe] : []);
        if (
          versionIndex < 0 ||
          versionIndex >= versions.length ||
          versions.length === 0
        ) {
          return null;
        }
        const remaining = versions.filter((_, i) => i !== versionIndex);
        const selectedIndex = target.keyframe
          ? versions.findIndex((v) =>
              sameMediaRef(v, target.keyframe as ImageRef)
            )
          : -1;
        const removedSelected = selectedIndex === versionIndex;
        let nextKeyframe: ImageRef | null | undefined;
        if (remaining.length === 0) {
          nextKeyframe = null;
        } else if (removedSelected) {
          const nextIndex = Math.min(versionIndex, remaining.length - 1);
          nextKeyframe = remaining[nextIndex];
        } else {
          nextKeyframe = target.keyframe;
        }
        const patch: Partial<Shot> = {
          keyframe: nextKeyframe ?? null,
          keyframe_versions: remaining
        };
        if (
          remaining.length === 0 &&
          (target.status === "keyframe_ready" || target.status === "approved")
        ) {
          patch.status = "planned";
        } else if (
          remaining.length === 0 &&
          target.status === "failed" &&
          !target.clip
        ) {
          patch.status = "planned";
        }
        return patchShot(b, shotId, patch);
      })
    ),

  selectClipVersion: (boardId, shotId, versionIndex) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const target = b.shots.find((s) => s.id === shotId);
        const versions =
          target?.clip_versions ?? (target?.clip ? [target.clip] : []);
        const clip = versions[versionIndex];
        if (!clip || clip === target?.clip) {
          return null;
        }
        return patchShot(b, shotId, { clip });
      })
    ),

  removeClipVersion: (boardId, shotId, versionIndex) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const target = b.shots.find((s) => s.id === shotId);
        if (!target) {
          return null;
        }
        const versions =
          target.clip_versions ?? (target.clip ? [target.clip] : []);
        if (
          versionIndex < 0 ||
          versionIndex >= versions.length ||
          versions.length === 0
        ) {
          return null;
        }
        const remaining = versions.filter((_, i) => i !== versionIndex);
        const selectedIndex = target.clip
          ? versions.findIndex((v) => sameMediaRef(v, target.clip as VideoRef))
          : -1;
        const removedSelected = selectedIndex === versionIndex;
        let nextClip: VideoRef | null | undefined;
        if (remaining.length === 0) {
          nextClip = null;
        } else if (removedSelected) {
          const nextIndex = Math.min(versionIndex, remaining.length - 1);
          nextClip = remaining[nextIndex];
        } else {
          nextClip = target.clip;
        }
        const patch: Partial<Shot> = {
          clip: nextClip ?? null,
          clip_versions: remaining
        };
        if (remaining.length === 0) {
          if (target.status === "rendered") {
            patch.status = target.keyframe ? "keyframe_ready" : "planned";
          } else if (target.status === "failed") {
            patch.status = target.keyframe ? "keyframe_ready" : "planned";
          } else if (target.status === "clip_generating") {
            patch.status = target.keyframe ? "keyframe_ready" : "planned";
          }
        }
        return patchShot(b, shotId, patch);
      })
    ),

  removeShot: (boardId, shotId) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        if (!b.shots.some((s) => s.id === shotId)) {
          return null;
        }
        const next = structural(
          b,
          b.shots.filter((s) => s.id !== shotId)
        );
        return (
          next && {
            ...next,
            activeShotId: b.activeShotId === shotId ? null : b.activeShotId
          }
        );
      })
    ),

  addShot: (boardId) => {
    if (!get().boards[boardId]) {
      return null;
    }
    const id = crypto.randomUUID();
    set((state) =>
      withBoard(state, boardId, (b) => ({
        ...b,
        shots: [
          ...b.shots,
          {
            type: "shot",
            id,
            index: b.shots.length,
            action: "",
            status: "planned"
          }
        ],
        activeShotId: id
      }))
    );
    return id;
  },

  reorderShots: (boardId, orderedIds) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const byId = new Map(b.shots.map((s) => [s.id, s]));
        const reordered = orderedIds
          .map((id) => byId.get(id) ?? null)
          .filter((s): s is Shot => s !== null);
        // Keep any shots not named in orderedIds, appended in their order.
        const named = new Set(orderedIds);
        for (const s of b.shots) {
          if (!named.has(s.id)) {
            reordered.push(s);
          }
        }
        if (!scenesAreContiguous(reordered)) {
          // An order that splits a scene is not a board (PRD § 7.7.3). Refuse
          // it rather than silently regrouping what the caller asked for.
          return null;
        }
        return structural(b, reordered);
      })
    ),

  insertShot: (boardId, afterShotId) => {
    const board = get().boards[boardId];
    if (!board) {
      return null;
    }
    const after = board.shots.find((s) => s.id === afterShotId);
    const id = crypto.randomUUID();
    set((state) =>
      withBoard(state, boardId, (b) => {
        const at = after
          ? b.shots.findIndex((s) => s.id === after.id) + 1
          : b.shots.length;
        const shots = [...b.shots];
        shots.splice(at, 0, blankShot(id, after?.scene_id ?? null));
        const next = structural(b, shots);
        return next && { ...next, activeShotId: id };
      })
    );
    return id;
  },

  duplicateShot: (boardId, shotId) => {
    const source = get().boards[boardId]?.shots.find((s) => s.id === shotId);
    if (!source) {
      return null;
    }
    const id = crypto.randomUUID();
    set((state) =>
      withBoard(state, boardId, (b) => {
        const at = b.shots.findIndex((s) => s.id === shotId);
        if (at === -1) {
          return null;
        }
        const copy: Shot = {
          ...b.shots[at],
          id,
          // The copy covers no script line, so the link fields go with the
          // original; an ERT read off a script line is now the user's own.
          duration_source: "manual"
        };
        delete copy.script_line_ids;
        delete copy.script_text_snapshot;
        delete copy.covered_by;
        const shots = [...b.shots];
        shots.splice(at + 1, 0, copy);
        const next = structural(b, shots);
        return next && { ...next, activeShotId: id };
      })
    );
    return id;
  },

  moveShot: (boardId, shotId, sceneId, position) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        if (!b.shots.some((s) => s.id === shotId)) {
          return null;
        }
        const seeded = materializeLegacyScene(b);
        const targetSceneId = sceneId ?? seeded.sceneId;
        const ordered = sceneOrder(seeded.shots).flatMap((g) => g.shots);
        const from = ordered.findIndex((s) => s.id === shotId);
        const moved = withScene(ordered[from], targetSceneId);
        const rest = ordered.filter((s) => s.id !== shotId);
        const run: number[] = [];
        rest.forEach((s, i) => {
          if ((s.scene_id ?? null) === targetSceneId) {
            run.push(i);
          }
        });
        // A target scene the move empties has no run to count from, so the
        // shot holds its place and only changes scene.
        const at =
          run.length > 0
            ? run[0] + Math.max(0, Math.min(position, run.length))
            : Math.min(Math.max(from, 0), rest.length);
        const shots = [...rest.slice(0, at), moved, ...rest.slice(at)];
        return structural(b, shots, seeded.scenes);
      })
    ),

  nudgeShot: (boardId, shotId, direction) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const groups = sceneOrder(b.shots);
        const group = groups.find((g) => g.shots.some((s) => s.id === shotId));
        if (!group) {
          return null;
        }
        const from = group.shots.findIndex((s) => s.id === shotId);
        const to = direction === "up" ? from - 1 : from + 1;
        if (to < 0 || to >= group.shots.length) {
          return null;
        }
        const swapped = [...group.shots];
        swapped[from] = group.shots[to];
        swapped[to] = group.shots[from];
        return structural(
          b,
          groups.flatMap((g) => (g === group ? swapped : g.shots))
        );
      })
    ),

  updateScene: (boardId, sceneId, patch) =>
    set((state) =>
      withBoard(
        state,
        boardId,
        (b) => {
          const scenes = boardScenes(b);
          const target = scenes.find((scene) => scene.id === sceneId);
          if (!target) {
            return null;
          }
          const keys = Object.keys(patch) as Array<keyof ScenePatch>;
          if (keys.every((k) => Object.is(target[k], patch[k]))) {
            return null;
          }
          return structural(
            b,
            b.shots,
            scenes.map((scene) =>
              scene.id === sceneId ? { ...scene, ...patch } : scene
            )
          );
        },
        // Fold a run of edits to one scene field (typing a slugline) into a
        // single undo step, as updateShot does.
        {
          coalesceKey: `scene:${sceneId}:${Object.keys(patch).sort().join(",")}`
        }
      )
    ),

  createScene: (boardId, afterSceneId) => {
    if (!get().boards[boardId]) {
      return null;
    }
    const sceneId = crypto.randomUUID();
    const shotId = crypto.randomUUID();
    set((state) =>
      withBoard(state, boardId, (b) => {
        const seeded = materializeLegacyScene(b);
        const groups = sceneOrder(seeded.shots, seeded.scenes);
        const after = groups.findIndex((g) => g.sceneId === afterSceneId);
        const ordered = groups.flatMap((g) => g.shots);
        // Right after the last shot of `afterSceneId`, so the new scene lands
        // in the position its first shot's index gives it.
        const at =
          after === -1
            ? ordered.length
            : groups
                .slice(0, after + 1)
                .reduce((n, g) => n + g.shots.length, 0);
        const shots = [...ordered];
        shots.splice(at, 0, blankShot(shotId, sceneId));
        const scene: Scene = { type: "scene", id: sceneId, slugline: "" };
        const next = structural(b, shots, [...seeded.scenes, scene]);
        return next && { ...next, activeShotId: shotId };
      })
    );
    return sceneId;
  },

  mergeSceneIntoPrevious: (boardId, sceneId) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const groups = sceneOrder(b.shots, boardScenes(b));
        const at = groups.findIndex((g) => g.sceneId === sceneId);
        if (at <= 0) {
          return null;
        }
        const into = groups[at - 1].sceneId;
        // The emptied scene is dropped by the reindex that follows.
        return structural(
          b,
          groups.flatMap((g) =>
            g === groups[at] ? g.shots.map((s) => withScene(s, into)) : g.shots
          )
        );
      })
    ),

  setStylePreset: (boardId, entityId, entities) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const chosen = entities.find((e) => e.id === entityId);
        if (!chosen || chosen.kind !== "style") {
          return null;
        }
        const styleIds = new Set(
          entities.filter((e) => e.kind === "style").map((e) => e.id)
        );
        const entityIds = [
          ...b.entityIds.filter((id) => !styleIds.has(id)),
          entityId
        ];
        // A shot's explicit list is its whole selection, so a style missing
        // from it reads as an exclusion. Styles are board-wide: put the chosen
        // one back and drop the ones the board no longer carries.
        const shots = b.shots.map((shot) => {
          if (!shot.entity_ids) {
            return shot;
          }
          const entity_ids = [
            ...shot.entity_ids.filter((id) => !styleIds.has(id)),
            entityId
          ];
          return entity_ids.length === shot.entity_ids.length &&
            entity_ids.every((id, i) => id === shot.entity_ids?.[i])
            ? shot
            : { ...shot, entity_ids };
        });
        const unchanged =
          b.style === chosen.descriptor &&
          entityIds.length === b.entityIds.length &&
          entityIds.every((id, i) => id === b.entityIds[i]) &&
          sameShots(shots, b.shots);
        return unchanged
          ? null
          : { ...b, style: chosen.descriptor, entityIds, shots };
      })
    ),

  selectShot: (boardId, shotId) =>
    set((state) =>
      withBoard(
        state,
        boardId,
        // Idempotent: a repeat select stays selected. The card's
        // click-to-deselect toggle lives in the click handler, so
        // programmatic callers (focus jumps, the agent bridge) can
        // re-select safely.
        (b) =>
          b.activeShotId === shotId ? null : { ...b, activeShotId: shotId },
        // Selection is transient UI state, not an authoring edit.
        false
      )
    ),

  getBoard: (id) => get().boards[id]
}));

/**
 * One-time migration: boards saved by the short-lived localStorage
 * persistence land in the in-memory store, and the server-sync upsert
 * publishes them the next time their tab is opened.
 */
try {
  const legacy = localStorage.getItem("storyboard-boards");
  if (legacy) {
    const parsed = JSON.parse(legacy) as {
      state?: { boards?: Record<string, StoryboardBoard> };
    };
    const boards = parsed.state?.boards ?? {};
    for (const [id, b] of Object.entries(boards)) {
      useStoryboardStore.getState().loadBoard(id, { ...emptyBoard(id), ...b });
    }
    localStorage.removeItem("storyboard-boards");
  }
} catch {
  // Corrupt legacy blob — nothing worth keeping.
}

// ── Selector hooks ───────────────────────────────────────────────────────────

const EMPTY_SHOTS: Shot[] = [];
const EMPTY_ENTITY_IDS: string[] = [];

/**
 * Reactive multi-value view of a board. Uses `useShallow` so the returned
 * object's identity churn (a fresh object every render) doesn't force a
 * re-render — only a changed field value does.
 */
export const useBoard = (
  id: string
): {
  screenplay: Screenplay | null;
  shots: Shot[];
  title: string;
  brief: string;
  style: string;
  entityIds: string[];
  aspectRatio: string;
  setupStage: StoryboardSetupStage;
  genre: string;
  directorModel: LanguageModelValue | null;
  imageModel: ImageModelValue | null;
  videoModel: VideoModelValue | null;
  activeShotId: string | null;
} =>
  useStoryboardStore(
    useShallow((state) => {
      const b = state.boards[id];
      return {
        screenplay: b?.screenplay ?? null,
        shots: b?.shots ?? EMPTY_SHOTS,
        title: b?.title ?? "",
        brief: b?.brief ?? "",
        style: b?.style ?? "",
        entityIds: b?.entityIds ?? EMPTY_ENTITY_IDS,
        aspectRatio: b?.aspectRatio ?? "16:9",
        setupStage: b?.setupStage ?? "done",
        genre: b?.genre ?? "",
        directorModel: b?.directorModel ?? null,
        imageModel: b?.imageModel ?? null,
        videoModel: b?.videoModel ?? null,
        activeShotId: b?.activeShotId ?? null
      };
    })
  );

/** Reactive "an undo step is available" flag for a board. */
export const useStoryboardCanUndo = (boardId: string): boolean =>
  useStoryboardStore((state) => canUndo(state.history, boardId));

/** Reactive "a redo step is available" flag for a board. */
export const useStoryboardCanRedo = (boardId: string): boolean =>
  useStoryboardStore((state) => canRedo(state.history, boardId));
