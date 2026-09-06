/**
 * The storyboard flow's choices, and the two results it reports (PRD § 7.7).
 *
 * A choice that decides what the flow produces or what it costs is a field on
 * the board: how many shots the Director writes (`setupShotCount`) and what
 * the screenplay on the board was directed from (`setupDirectedFrom`). Both
 * reach the server, both survive a reload on another machine, and a headless
 * caller reads the same values.
 *
 * What is held here instead is what neither the document nor the server has
 * any use for: the last shotlist import's report, which the look step shows
 * once and the creator dismisses, and the screenplay a rewrite replaced, which
 * is an undo for the button just pressed. Both are re-derivable or expendable,
 * and neither changes what the board renders.
 */

import { useCallback, useSyncExternalStore } from "react";
import type { Screenplay } from "@nodetool-ai/protocol";
import { DEFAULT_SETUP_SHOT_COUNT } from "@nodetool-ai/protocol/api-schemas/storyboards.js";

import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import type { ShotlistReportEntry } from "../../../lib/storyboard/parseShotlistCsv";
// The Director run records the fingerprint itself, so the comparison the genre
// step makes and the value the run writes cannot drift apart.
import { directionFingerprint } from "../../../hooks/storyboard/directionFingerprint";

export { DEFAULT_SETUP_SHOT_COUNT, directionFingerprint };

/** What a shotlist import wrote, and what it could not read (§ 7.7.8). */
export interface ShotlistImportSummary {
  shotCount: number;
  entries: readonly ShotlistReportEntry[];
}

/** How many shots the Director is asked for on this board. */
export function useSetupShotCount(boardId: string): number {
  return useStoryboardStore(
    (state) => state.boards[boardId]?.setupShotCount ?? DEFAULT_SETUP_SHOT_COUNT
  );
}

/** The inputs the board's current screenplay was directed from, if recorded. */
export function useDirectedFrom(boardId: string): string | null {
  return useStoryboardStore(
    (state) => state.boards[boardId]?.setupDirectedFrom ?? null
  );
}

export function setSetupShotCount(boardId: string, shotCount: number): void {
  useStoryboardStore.getState().setSetup(boardId, { shotCount });
}

// ── Session-only reports ────────────────────────────────────────────────────

const listeners = new Set<() => void>();
const announce = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const shotlistImports = new Map<string, ShotlistImportSummary>();

export function setShotlistImport(
  boardId: string,
  summary: ShotlistImportSummary | null
): void {
  if (summary) {
    shotlistImports.set(boardId, summary);
  } else {
    shotlistImports.delete(boardId);
  }
  announce();
}

/** The last shotlist import's report, until the creator dismisses it. */
export function useShotlistImportSummary(
  boardId: string
): ShotlistImportSummary | undefined {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => shotlistImports.get(boardId), [boardId])
  );
}

/**
 * The screenplay a re-direct replaced, so the review step can put it back
 * (F15). It is an undo for the button just pressed, so it is held for the
 * session rather than saved.
 */
const previous = new Map<string, Screenplay>();

export function keepPreviousScreenplay(
  boardId: string,
  screenplay: Screenplay | null | undefined
): void {
  if (screenplay && screenplay.shots.length > 0) {
    previous.set(boardId, screenplay);
  } else {
    previous.delete(boardId);
  }
  announce();
}

export function getPreviousScreenplay(boardId: string): Screenplay | undefined {
  return previous.get(boardId);
}

export function forgetPreviousScreenplay(boardId: string): void {
  previous.delete(boardId);
  announce();
}

/** The screenplay a rewrite replaced, re-read when one is kept or dropped. */
export function usePreviousScreenplay(
  boardId: string
): Screenplay | undefined {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => getPreviousScreenplay(boardId), [boardId])
  );
}

/** Drop a board's session reports — used by the suites between cases. */
export function clearSetupReports(boardId: string): void {
  shotlistImports.delete(boardId);
  previous.delete(boardId);
  announce();
}
