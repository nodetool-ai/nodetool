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
 * mutates as stills/clips are generated and approved).
 *
 * Usage:
 *   const board = useBoard(boardId);           // reactive board view
 *   const shot = useShot(boardId, shotId);     // reactive single shot
 *   useStoryboardStore.getState().approveShot(boardId, shotId);
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
import type { ImageModelValue, LanguageModelValue } from "../ApiTypes";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StoryboardBoard {
  id: string;
  screenplay: Screenplay | null;
  shots: Shot[];
  title: string;
  brief: string;
  style: string;
  aspectRatio: string;
  /** Language model the Director run uses. Null until the user picks one. */
  directorModel: LanguageModelValue | null;
  /** Image model every keyframe still is generated with. Null = node default. */
  imageModel: ImageModelValue | null;
  activeShotId: string | null;
  /** Persisted timeline sequence this board was assembled into, if any. */
  timelineId: string | null;
}

interface StoryboardStoreState {
  boards: Record<string, StoryboardBoard>;

  /** Create an empty board for `id` if one does not already exist. */
  ensureBoard: (id: string) => void;

  /** Load a screenplay into a board, seeding `shots` from `screenplay.shots`. */
  setScreenplay: (boardId: string, screenplay: Screenplay) => void;

  setBrief: (boardId: string, brief: string) => void;
  setStyle: (boardId: string, style: string) => void;
  setTitle: (boardId: string, title: string) => void;
  setAspectRatio: (boardId: string, aspectRatio: string) => void;
  setDirectorModel: (boardId: string, model: LanguageModelValue | null) => void;
  setImageModel: (boardId: string, model: ImageModelValue | null) => void;
  /** Record the persisted timeline sequence this board assembles into. */
  setTimelineLink: (boardId: string, timelineId: string | null) => void;

  /** Insert a shot, or replace the one with the same id. */
  upsertShot: (boardId: string, shot: Shot) => void;
  /** Patch fields on a single shot. No-op when the shot is gone. */
  updateShot: (boardId: string, shotId: string, patch: Partial<Shot>) => void;
  setShotStatus: (boardId: string, shotId: string, status: ShotStatus) => void;
  setShotKeyframe: (boardId: string, shotId: string, keyframe: ImageRef) => void;
  setShotClip: (boardId: string, shotId: string, clip: VideoRef) => void;
  approveShot: (boardId: string, shotId: string) => void;
  removeShot: (boardId: string, shotId: string) => void;
  /** Reorder shots to match `orderedIds`; re-stamps each shot's `index`. */
  reorderShots: (boardId: string, orderedIds: string[]) => void;
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
  aspectRatio: "16:9",
  directorModel: null,
  imageModel: null,
  activeShotId: null,
  timelineId: null
});

/**
 * Apply `mutate` to the board with `boardId`. Returns the SAME state when the
 * board is absent or `mutate` returns `null`, so no-op edits don't churn
 * subscribers.
 */
const withBoard = (
  state: StoryboardStoreState,
  boardId: string,
  mutate: (board: StoryboardBoard) => StoryboardBoard | null
): Partial<StoryboardStoreState> | StoryboardStoreState => {
  const board = state.boards[boardId];
  if (!board) {
    return state;
  }
  const next = mutate(board);
  if (!next || next === board) {
    return state;
  }
  return { boards: { ...state.boards, [boardId]: next } };
};

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

  ensureBoard: (id) =>
    set((state) =>
      state.boards[id]
        ? state
        : { boards: { ...state.boards, [id]: emptyBoard(id) } }
    ),

  setScreenplay: (boardId, screenplay) =>
    set((state) => {
      const board = state.boards[boardId] ?? emptyBoard(boardId);
      const next: StoryboardBoard = {
        ...board,
        screenplay,
        shots: [...screenplay.shots],
        title: screenplay.title || board.title,
        aspectRatio: screenplay.aspect_ratio ?? board.aspectRatio,
        style: screenplay.style_bible ?? board.style
      };
      return { boards: { ...state.boards, [boardId]: next } };
    }),

  setBrief: (boardId, brief) =>
    set((state) =>
      withBoard(state, boardId, (b) =>
        b.brief === brief ? null : { ...b, brief }
      )
    ),

  setStyle: (boardId, style) =>
    set((state) =>
      withBoard(state, boardId, (b) =>
        b.style === style ? null : { ...b, style }
      )
    ),

  setTitle: (boardId, title) =>
    set((state) =>
      withBoard(state, boardId, (b) =>
        b.title === title ? null : { ...b, title }
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

  setTimelineLink: (boardId, timelineId) =>
    set((state) =>
      withBoard(state, boardId, (b) =>
        b.timelineId === timelineId ? null : { ...b, timelineId }
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
    set((state) => withBoard(state, boardId, (b) => patchShot(b, shotId, patch))),

  setShotStatus: (boardId, shotId, status) =>
    set((state) =>
      withBoard(state, boardId, (b) => patchShot(b, shotId, { status }))
    ),

  setShotKeyframe: (boardId, shotId, keyframe) =>
    set((state) =>
      withBoard(state, boardId, (b) => patchShot(b, shotId, { keyframe }))
    ),

  setShotClip: (boardId, shotId, clip) =>
    set((state) =>
      withBoard(state, boardId, (b) => patchShot(b, shotId, { clip }))
    ),

  approveShot: (boardId, shotId) =>
    set((state) =>
      withBoard(state, boardId, (b) =>
        patchShot(b, shotId, { status: "approved" })
      )
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

  selectShot: (boardId, shotId) =>
    set((state) =>
      withBoard(state, boardId, (b) =>
        b.activeShotId === shotId ? null : { ...b, activeShotId: shotId }
      )
    ),

  getBoard: (id) => get().boards[id]
}));

// ── Selector hooks ───────────────────────────────────────────────────────────

const EMPTY_SHOTS: Shot[] = [];

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
  aspectRatio: string;
  directorModel: LanguageModelValue | null;
  imageModel: ImageModelValue | null;
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
        aspectRatio: b?.aspectRatio ?? "16:9",
        directorModel: b?.directorModel ?? null,
        imageModel: b?.imageModel ?? null,
        activeShotId: b?.activeShotId ?? null
      };
    })
  );

/** Reactive single shot, or undefined when absent. */
export const useShot = (
  boardId: string,
  shotId: string
): Shot | undefined =>
  useStoryboardStore((state) =>
    state.boards[boardId]?.shots.find((s) => s.id === shotId)
  );
