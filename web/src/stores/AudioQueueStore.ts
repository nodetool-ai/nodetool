import { create } from "zustand";

interface AudioQueueItem {
  id: string;
  onPlay: () => void;
  onStop: () => void;
}

interface AudioQueueState {
  currentPlayingId: string | null;
  // The item that is currently playing. It is removed from `queue` when it
  // starts playing, so we keep a reference here to be able to stop it later.
  currentItem: AudioQueueItem | null;
  queue: AudioQueueItem[];

  enqueue: (item: AudioQueueItem) => void;
  dequeue: (id: string) => void;
  /** Mark current as finished and play next. */
  finishCurrent: () => void;
  stopAll: () => void;
  isPlaying: (id: string) => boolean;
  isQueued: (id: string) => boolean;
}

/**
 * Global audio queue store to prevent overlapping audio playback.
 * Ensures only one audio output plays at a time.
 */
export const useAudioQueue = create<AudioQueueState>((set, get) => ({
  currentPlayingId: null,
  currentItem: null,
  queue: [],

  enqueue: (item: AudioQueueItem) => {
    const state = get();
    const filtered = state.queue.filter((q) => q.id !== item.id);

    if (!state.currentPlayingId) {
      set({ currentPlayingId: item.id, currentItem: item, queue: filtered });
      item.onPlay();
    } else {
      set({ queue: [...filtered, item] });
    }
  },

  dequeue: (id: string) => {
    const state = get();

    if (state.currentPlayingId === id) {
      // The playing item is being removed — promote the next queued item so
      // the queue doesn't stall (callers stop their own audio before
      // dequeueing, so we don't call onStop here).
      const nextItem = state.queue[0];
      if (nextItem) {
        set({
          currentPlayingId: nextItem.id,
          currentItem: nextItem,
          queue: state.queue.slice(1)
        });
        nextItem.onPlay();
      } else {
        set({ currentPlayingId: null, currentItem: null });
      }
    } else {
      set({ queue: state.queue.filter((q) => q.id !== id) });
    }
  },

  finishCurrent: () => {
    const state = get();
    const nextItem = state.queue[0];

    if (nextItem) {
      set({
        currentPlayingId: nextItem.id,
        currentItem: nextItem,
        queue: state.queue.slice(1)
      });
      nextItem.onPlay();
    } else {
      set({ currentPlayingId: null, currentItem: null });
    }
  },

  stopAll: () => {
    const state = get();
    if (state.currentItem) {
      state.currentItem.onStop();
    }
    set({ currentPlayingId: null, currentItem: null, queue: [] });
  },

  isPlaying: (id: string) => {
    return get().currentPlayingId === id;
  },

  isQueued: (id: string) => {
    return get().queue.some((q) => q.id === id);
  }
}));
