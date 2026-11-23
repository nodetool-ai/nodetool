/**
 * The storyboard agent handler: the operations behind every `ui_storyboard_*`
 * tool, written against the open board's `documentStore`.
 *
 * Kept out of `StoryboardEditorScreen` so it has no React or React Native
 * dependency. The screen supplies the store and its selection state and
 * registers the result on the agent bridge. The keyless mobile document harness
 * (`packages/agents/tests/mobile-storyboard-tool-loop.test.ts`) builds the same
 * handler over a store backed by an in-memory server, so the code it drives is
 * the code the phone runs.
 */

import type { DocumentState } from './documentStore';
import {
  reindexShots,
  resolveShotIndex,
  shotToNode,
  type Shot,
  type StoryboardAddShotInput,
  type StoryboardAgentHandler,
  type StoryboardDocument,
  type StoryboardShotNode,
  type StoryboardSnapshot,
  type StoryboardUpdateShotPatch,
} from './storyboardTypes';

export const DEFAULT_ASPECT_RATIO = '16:9';

/** Short, collision-resistant enough for ids that only have to be unique in one board. */
export const newShotId = (): string =>
  `shot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export interface StoryboardHandlerHost {
  boardId: string;
  /** The board's document store. Read through `getState()` on every call. */
  store: { getState: () => DocumentState<StoryboardDocument> };
  /** Title used while the store has no name yet. */
  fallbackTitle?: string;
  /** The selected shot id. The handler runs outside React, so it reads, not subscribes. */
  getSelectedShotId: () => string | null;
  selectShot: (shotId: string | null) => void;
}

export function createStoryboardAgentHandler(
  host: StoryboardHandlerHost
): StoryboardAgentHandler {
  const { boardId, store, fallbackTitle, getSelectedShotId } = host;

  const requireDoc = (): StoryboardDocument => {
    const current = store.getState().doc;
    if (current === null) {
      throw new Error(
        `Storyboard "${boardId}" has not finished loading. Retry in a moment.`
      );
    }
    return current;
  };

  const edit = (mutate: (board: StoryboardDocument) => StoryboardDocument): void => {
    store.getState().edit(mutate);
  };

  const snapshot = (): StoryboardSnapshot => {
    const state = store.getState();
    const board = state.doc;
    return {
      boardId,
      title: state.name || fallbackTitle || 'Untitled storyboard',
      brief: board?.brief ?? '',
      style: board?.style ?? '',
      aspectRatio: board?.aspectRatio ?? DEFAULT_ASPECT_RATIO,
      hasScreenplay: board?.screenplay != null,
      selectedShotId: getSelectedShotId(),
      shots: (board?.shots ?? []).map(shotToNode),
    };
  };

  const writeShots = (shots: Shot[]): void => {
    edit((board) => ({ ...board, shots: reindexShots(shots) }));
  };

  return {
    getSnapshot: snapshot,

    addShot: (input: StoryboardAddShotInput): StoryboardShotNode => {
      const shots = requireDoc().shots;
      const at =
        input.index === undefined
          ? shots.length
          : clamp(Math.trunc(input.index), 0, shots.length);
      const shot: Shot = {
        type: 'shot',
        id: newShotId(),
        index: at,
        action: input.action,
        camera: input.camera,
        motion: input.motion,
        duration_seconds: input.durationSeconds,
        status: 'planned',
      };
      writeShots([...shots.slice(0, at), shot, ...shots.slice(at)]);
      return shotToNode(shot, at);
    },

    updateShot: (
      target: string,
      patch: StoryboardUpdateShotPatch
    ): StoryboardShotNode => {
      const shots = requireDoc().shots;
      const at = resolveShotIndex(shots, target, getSelectedShotId());
      const updated: Shot = {
        ...shots[at],
        action: patch.action ?? shots[at].action,
        camera: patch.camera ?? shots[at].camera,
        motion: patch.motion ?? shots[at].motion,
        slug: patch.slug ?? shots[at].slug,
        duration_seconds: patch.durationSeconds ?? shots[at].duration_seconds,
        status: patch.status ?? shots[at].status,
      };
      writeShots(shots.map((shot, index) => (index === at ? updated : shot)));
      return shotToNode(updated, at);
    },

    removeShot: (target: string): StoryboardShotNode => {
      const shots = requireDoc().shots;
      const at = resolveShotIndex(shots, target, getSelectedShotId());
      const removed = shots[at];
      writeShots(shots.filter((_, index) => index !== at));
      if (getSelectedShotId() === removed.id) {
        host.selectShot(null);
      }
      return shotToNode(removed, at);
    },

    reorderShot: (target: string, toIndex: number): StoryboardShotNode => {
      const shots = requireDoc().shots;
      const from = resolveShotIndex(shots, target, getSelectedShotId());
      const rest = shots.filter((_, index) => index !== from);
      const to = clamp(Math.trunc(toIndex), 0, rest.length);
      const moved = shots[from];
      writeShots([...rest.slice(0, to), moved, ...rest.slice(to)]);
      return shotToNode(moved, to);
    },

    setBrief: (brief: string): StoryboardSnapshot => {
      requireDoc();
      edit((board) => ({ ...board, brief }));
      return snapshot();
    },

    setStyle: (style: string): StoryboardSnapshot => {
      requireDoc();
      edit((board) => ({ ...board, style }));
      return snapshot();
    },

    setAspectRatio: (aspectRatio: string): StoryboardSnapshot => {
      requireDoc();
      edit((board) => ({ ...board, aspectRatio }));
      return snapshot();
    },

    selectShot: (target: string | null): StoryboardShotNode | null => {
      if (target === null) {
        host.selectShot(null);
        return null;
      }
      const shots = requireDoc().shots;
      const at = resolveShotIndex(shots, target, getSelectedShotId());
      host.selectShot(shots[at].id);
      return shotToNode(shots[at], at);
    },

    save: async (): Promise<{ ok: true; updatedAt: string | null }> => {
      await store.getState().save();
      const state = store.getState();
      if (state.status === 'conflict' || state.status === 'error') {
        throw new Error(state.error ?? 'Failed to save the storyboard.');
      }
      return { ok: true, updatedAt: state.updatedAt };
    },
  };
}
