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
 *   const shot = useShot(boardId, shotId);     // reactive single shot
 *   useStoryboardStore.getState().selectKeyframeVersion(boardId, shotId, 0);
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  ImageRef,
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
  loadBoard: (id: string, board: Omit<StoryboardBoard, "id" | "updatedAt">) => void;

  /** Load a screenplay into a board, seeding `shots` from `screenplay.shots`. */
  setScreenplay: (boardId: string, screenplay: Screenplay) => void;

  setBrief: (boardId: string, brief: string) => void;
  setStyle: (boardId: string, style: string) => void;
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

  /** Insert a shot, or replace the one with the same id. */
  upsertShot: (boardId: string, shot: Shot) => void;
  /** Patch fields on a single shot. No-op when the shot is gone. */
  updateShot: (boardId: string, shotId: string, patch: Partial<Shot>) => void;
  setShotStatus: (boardId: string, shotId: string, status: ShotStatus) => void;
  setShotKeyframe: (boardId: string, shotId: string, keyframe: ImageRef) => void;
  setShotClip: (boardId: string, shotId: string, clip: VideoRef) => void;
  /** Make one of the shot's preserved stills the selected keyframe. */
  selectKeyframeVersion: (
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
  removeShot: (boardId: string, shotId: string) => void;
  /** Reorder shots to match `orderedIds`; re-stamps each shot's `index`. */
  reorderShots: (boardId: string, orderedIds: string[]) => void;
  /**
   * Move one shot a single position earlier ("up") or later ("down") in the
   * board order, re-stamping every shot's `index`. No-op at the ends.
   */
  moveShot: (boardId: string, shotId: string, direction: "up" | "down") => void;
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
    patch.history = pushHistory(state.history, boardId, board, track.coalesceKey ?? null, now);
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
  activeShotId: current.activeShotId,
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
): boolean =>
  b.asset_id ? a.asset_id === b.asset_id : a.uri === b.uri;

/** Patch the single shot with `shotId`; returns the same board on a no-op. */
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

  loadBoard: (id, board) =>
    set((state) => ({
      boards: {
        ...state.boards,
        [id]: {
          ...emptyBoard(id),
          ...board,
          id,
          // Jobs don't survive a reload — settle in-flight statuses back to
          // the state they'd retry from.
          shots: board.shots.map((s) =>
            s.status === "keyframe_generating"
              ? { ...s, status: "planned" as const }
              : s.status === "clip_generating"
                ? { ...s, status: "keyframe_ready" as const }
                : s
          ),
          updatedAt: Date.now()
        }
      }
    })),

  ensureBoard: (id) =>
    set((state) =>
      state.boards[id]
        ? state
        : { boards: { ...state.boards, [id]: emptyBoard(id) } }
    ),

  removeBoard: (id) =>
    set((state) => {
      if (!state.boards[id]) {
        return state;
      }
      const boards = { ...state.boards };
      delete boards[id];
      return { boards, history: clearHistory(state.history, id) };
    }),

  setScreenplay: (boardId, screenplay) =>
    set((state) => {
      const prev = state.boards[boardId];
      const board = prev ?? emptyBoard(boardId);
      const next: StoryboardBoard = {
        ...board,
        screenplay,
        shots: [...screenplay.shots],
        title: screenplay.title || board.title,
        aspectRatio: screenplay.aspect_ratio ?? board.aspectRatio,
        style: screenplay.style_bible ?? board.style,
        updatedAt: Date.now()
      };
      const patch: Partial<StoryboardStoreState> = {
        boards: { ...state.boards, [boardId]: next }
      };
      // A (re-)direct that replaces an existing board is undoable; the first
      // screenplay on an empty board has nothing to step back to.
      if (prev) {
        patch.history = pushHistory(state.history, boardId, prev, null, Date.now());
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
          target.keyframe_versions ?? (target.keyframe ? [target.keyframe] : []);
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
        const versions = target.clip_versions ?? (target.clip ? [target.clip] : []);
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

  removeShot: (boardId, shotId) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        if (!b.shots.some((s) => s.id === shotId)) {
          return null;
        }
        return {
          ...b,
          shots: b.shots.filter((s) => s.id !== shotId),
          activeShotId: b.activeShotId === shotId ? null : b.activeShotId
        };
      })
    ),

  reorderShots: (boardId, orderedIds) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const byId = new Map(b.shots.map((s) => [s.id, s]));
        const reordered = orderedIds
          .map((id, index) => {
            const s = byId.get(id);
            return s ? { ...s, index } : null;
          })
          .filter((s): s is Shot => s !== null);
        // Keep any shots not named in orderedIds, appended in their order.
        const named = new Set(orderedIds);
        for (const s of b.shots) {
          if (!named.has(s.id)) {
            reordered.push({ ...s, index: reordered.length });
          }
        }
        return { ...b, shots: reordered };
      })
    ),

  moveShot: (boardId, shotId, direction) =>
    set((state) =>
      withBoard(state, boardId, (b) => {
        const from = b.shots.findIndex((s) => s.id === shotId);
        if (from === -1) {
          return null;
        }
        const to = direction === "up" ? from - 1 : from + 1;
        if (to < 0 || to >= b.shots.length) {
          return null;
        }
        const shots = [...b.shots];
        const [moved] = shots.splice(from, 1);
        shots.splice(to, 0, moved);
        return {
          ...b,
          shots: shots.map((s, i) => (s.index === i ? s : { ...s, index: i }))
        };
      })
    ),

  selectShot: (boardId, shotId) =>
    set((state) =>
      withBoard(
        state,
        boardId,
        (b) => (b.activeShotId === shotId ? null : { ...b, activeShotId: shotId }),
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

/** Reactive single shot, or undefined when absent. */
export const useShot = (
  boardId: string,
  shotId: string
): Shot | undefined =>
  useStoryboardStore((state) =>
    state.boards[boardId]?.shots.find((s) => s.id === shotId)
  );
