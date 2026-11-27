/**
 * BlockoutReferenceStore
 *
 * Progress and failure of Blockout reference renders, per clip. A render is
 * started from the 3D inspector section or from a shot's render dialog, and
 * the dialog closes while the render still runs, so the state lives here and
 * every surface that names the clip reads it.
 *
 * Keys are `sequenceId` plus `clipId`: a format adaptation keeps its source's
 * clip ids, so a clip id alone names two clips.
 */

import { create } from "zustand";

export interface BlockoutReferenceRender {
  /** Frames drawn so far and in total. Null until the first frame. */
  progress: { done: number; total: number } | null;
}

interface BlockoutReferenceState {
  /** Renders in flight, by {@link blockoutReferenceKey}. */
  renders: Record<string, BlockoutReferenceRender>;
  /** The last failure of a clip's render, by the same key. */
  errors: Record<string, string>;
  start: (key: string) => void;
  setProgress: (key: string, done: number, total: number) => void;
  finish: (key: string) => void;
  fail: (key: string, message: string) => void;
  clearError: (key: string) => void;
}

export const blockoutReferenceKey = (
  sequenceId: string | null,
  clipId: string
): string => `${sequenceId ?? ""}:${clipId}`;

const without = <T>(record: Record<string, T>, key: string): Record<string, T> => {
  if (!(key in record)) return record;
  const { [key]: _removed, ...rest } = record;
  return rest;
};

export const useBlockoutReferenceStore = create<BlockoutReferenceState>((set) => ({
  renders: {},
  errors: {},
  start: (key) =>
    set((state) => ({
      renders: { ...state.renders, [key]: { progress: null } },
      errors: without(state.errors, key)
    })),
  setProgress: (key, done, total) =>
    set((state) =>
      key in state.renders
        ? { renders: { ...state.renders, [key]: { progress: { done, total } } } }
        : state
    ),
  finish: (key) => set((state) => ({ renders: without(state.renders, key) })),
  fail: (key, message) =>
    set((state) => ({
      renders: without(state.renders, key),
      errors: { ...state.errors, [key]: message }
    })),
  clearError: (key) => set((state) => ({ errors: without(state.errors, key) }))
}));
