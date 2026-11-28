/**
 * The first assistant turn a game is owed when its editor opens.
 *
 * The Game flow builds the template's room and its art, then hands off to the
 * game editor. The rest of the game (level, behaviours, win and lose) is the
 * assistant's job, so the build parks a prompt here keyed by the game id, and
 * the editor's assistant panel sends it once it can.
 *
 * `claim` reads and clears in one step: the 2D editor mounts a desktop and a
 * mobile assistant panel, and only one of them may send. Persisted so a reload
 * between the build and the editor opening still continues. An entry older
 * than a day is dropped rather than sent into a game the creator moved on from.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const GAME_KICKOFF_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface GameAssistantKickoff {
  prompt: string;
  createdAt: number;
}

interface GameAssistantKickoffState {
  kickoffs: Record<string, GameAssistantKickoff>;
  /** Park the prompt the game's assistant sends when its editor opens. */
  queue: (gameId: string, prompt: string) => void;
  /** Take the game's prompt and clear it. Null when none is owed. */
  claim: (gameId: string) => string | null;
}

const isFresh = (kickoff: GameAssistantKickoff | undefined): boolean =>
  kickoff !== undefined &&
  Date.now() - kickoff.createdAt < GAME_KICKOFF_MAX_AGE_MS;

export const useGameAssistantKickoffStore = create<GameAssistantKickoffState>()(
  persist(
    (set, get) => ({
      kickoffs: {},
      queue: (gameId, prompt) => {
        set((state) => ({
          kickoffs: {
            ...state.kickoffs,
            [gameId]: { prompt, createdAt: Date.now() }
          }
        }));
      },
      claim: (gameId) => {
        const kickoff = get().kickoffs[gameId];
        if (kickoff === undefined) {
          return null;
        }
        set((state) => {
          const { [gameId]: _claimed, ...rest } = state.kickoffs;
          return { kickoffs: rest };
        });
        return isFresh(kickoff) ? kickoff.prompt : null;
      }
    }),
    {
      name: "nodetool-game-assistant-kickoffs",
      partialize: (state) => ({ kickoffs: state.kickoffs })
    }
  )
);

/** The game's owed prompt, without claiming it. Null when none is owed. */
export const usePendingGameKickoff = (gameId: string): string | null =>
  useGameAssistantKickoffStore((state) => {
    const kickoff = state.kickoffs[gameId];
    return isFresh(kickoff) ? (kickoff?.prompt ?? null) : null;
  });
