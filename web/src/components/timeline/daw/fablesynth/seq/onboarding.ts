// First-run onboarding tour: a small pure model (steps + persistence) the
// store and the coach-mark overlay share. Each step anchors to a live grid
// element by selector; the overlay spotlights it and explains the gesture.

export interface TourStep {
  id: string;
  /** CSS selector of the element the step points at (first match wins). */
  target: string;
  title: string;
  body: string;
  /** Preferred card side relative to the target; flips if it won't fit. */
  side: 'top' | 'bottom';
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'play',
    target: '.sq-play',
    title: 'START THE SONG',
    body: 'Tap PLAY to start the song — from a standstill it launches scene 01 so you hear the whole groove right away. Tap again to stop everything.',
    side: 'bottom',
  },
  {
    id: 'scenes',
    target: '.sq-scene-launch',
    title: 'LAUNCH SCENES',
    body: 'Each row is a scene. Tap its ▶ to launch every clip in the row at the next quantize boundary, or tap a single clip cell to swap just that track. Tap a live cell to stop it.',
    side: 'bottom',
  },
  {
    id: 'devices',
    target: '.sq-track-id-btn',
    title: 'EDIT THE DEVICES',
    body: 'Click a track name to open its real instrument — the full DR-1, BL-1 or WT-1 editor — and tweak the sound or the pattern while it plays. The ✎ on any clip jumps straight to that clip. ESC comes back.',
    side: 'bottom',
  },
  {
    id: 'songs',
    target: '.sq-session-preset',
    title: 'LOAD OTHER SONGS',
    body: 'The SESSION picker loads the other factory songs — a whole new grid of scenes, clips and patches per track. Your edits are saved automatically and come back on reload.',
    side: 'bottom',
  },
];

/** Clamp a step delta; returns null when stepping past the last step. */
export function nextTourStep(step: number, delta: number): number | null {
  const n = step + delta;
  if (n >= TOUR_STEPS.length) return null;
  return Math.max(0, n);
}

const LS_KEY = 'fable.sq4.tour.v1';

export function isTourSeen(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY) === 'done';
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, 'done');
  } catch {
    /* quota / private mode */
  }
}
