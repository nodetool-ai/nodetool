/**
 * StoryboardViewStore
 *
 * How the creator likes to look at a board, apart from the board itself: the
 * shot cards' size, and whether cards show clips or only stills. It is a viewing preference, so it is persisted per browser
 * and shared by every board rather than saved into any one of them.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** The narrowest a card may get, in `ch`: the footer buttons still fit. */
export const MIN_CARD_SIZE = 24;
/** The widest a card may get, in `ch`: about one card per row on a laptop. */
export const MAX_CARD_SIZE = 72;
export const CARD_SIZE_STEP = 4;
/** The size the grid always had before the slider. */
export const DEFAULT_CARD_SIZE = 36;

const clampCardSize = (size: number): number =>
  Number.isFinite(size)
    ? Math.min(MAX_CARD_SIZE, Math.max(MIN_CARD_SIZE, Math.round(size)))
    : DEFAULT_CARD_SIZE;

interface StoryboardViewState {
  /** The minimum width of a shot card, in `ch`. */
  cardSize: number;
  setCardSize: (size: number) => void;
  /** Cards show each shot's still even when the shot has a clip. */
  stillsOnly: boolean;
  setStillsOnly: (stillsOnly: boolean) => void;
}

export const useStoryboardViewStore = create<StoryboardViewState>()(
  persist(
    (set) => ({
      cardSize: DEFAULT_CARD_SIZE,
      setCardSize: (size) => set({ cardSize: clampCardSize(size) }),
      stillsOnly: false,
      setStillsOnly: (stillsOnly) => set({ stillsOnly })
    }),
    {
      name: "storyboard-view",
      version: 1,
      merge: (persisted, current) => {
        const saved = persisted as Partial<StoryboardViewState> | undefined;
        return {
          ...current,
          cardSize: clampCardSize(saved?.cardSize ?? DEFAULT_CARD_SIZE),
          stillsOnly: saved?.stillsOnly === true
        };
      }
    }
  )
);
