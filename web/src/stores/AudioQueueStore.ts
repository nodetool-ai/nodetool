import { create } from "zustand";

interface AudioQueueItem {
  id: string;
  onPlay: () => void;
  onStop: () => void;
}

interface AudioQueueState {
  currentPlayingId: string | null;
  queue: AudioQueueItem[];

  // Register an audio output for playback
  enqueue: (item: AudioQueueItem) => void;

  // Remove from queue
  dequeue: (id: string) => void;

  // Mark current as finished and play next
  finishCurrent: () => void;

  // Stop all playback
  stopAll: () => void;

  // Check if a specific ID is currently playing
  isPlaying: (id: string) => boolean;

  // Check if a specific ID is in queue
  isQueued: (id: string) => boolean;
}

/**
 * Global audio queue store to prevent overlapping audio playback.
 * Ensures only one audio output plays at a time.
 */
export const useAudioQueue = create<AudioQueueState>((set, get) => ({
  currentPlayingId: null,
  queue: [],

  enqueue: (item: AudioQueueItem) => {
    const state = get();

    // Remove if already in queue
    const filtered = state.queue.filter((q) => q.id !== item.id);

    // If nothing is playing, start immediately
    if (!state.currentPlayingId) {
      set({ currentPlayingId: item.id, queue: filtered });
      item.onPlay();
    } else {
      // Add to queue
      set({ queue: [...filtered, item] });
    }
  },

  dequeue: (id: string) => {
    const state = get();

    // If it's currently playing, stop it and move to next
    if (state.currentPlayingId === id) {
      const item = state.queue.find((q) => q.id === state.currentPlayingId);
      if (item) {
        item.onStop();
      }
      get().finishCurrent();
    } else {
      // Just remove from queue
      set({ queue: state.queue.filter((q) => q.id !== id) });
    }
  },

  finishCurrent: () => {
    const state = get();
    const nextItem = state.queue[0];

    if (nextItem) {
      // Play next in queue
      set({
        currentPlayingId: nextItem.id,
        queue: state.queue.slice(1)
      });
      nextItem.onPlay();
    } else {
      // Nothing left to play
      set({ currentPlayingId: null });
    }
  },

  stopAll: () => {
    const state = get();

    // Stop current if playing
    if (state.currentPlayingId) {
      const current = state.queue.find((q) => q.id === state.currentPlayingId);
      if (current) {
        current.onStop();
      }
    }

    // Clear everything
    set({ currentPlayingId: null, queue: [] });
  },

  isPlaying: (id: string) => {
    return get().currentPlayingId === id;
  },

  isQueued: (id: string) => {
    return get().queue.some((q) => q.id === id);
  }
}));
