import { act } from "@testing-library/react";
import { useAudioQueue } from "../AudioQueueStore";

describe("AudioQueueStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    const store = useAudioQueue.getState();
    store.stopAll();
  });

  describe("initial state", () => {
    it("has no currently playing item", () => {
      const { currentPlayingId } = useAudioQueue.getState();
      expect(currentPlayingId).toBeNull();
    });

    it("has empty queue", () => {
      const { queue } = useAudioQueue.getState();
      expect(queue).toEqual([]);
    });
  });

  describe("enqueue", () => {
    it("starts playing immediately when queue is empty", () => {
      const onPlay = jest.fn();
      const onStop = jest.fn();
      const item = { id: "audio1", onPlay, onStop };

      act(() => {
        useAudioQueue.getState().enqueue(item);
      });

      expect(onPlay).toHaveBeenCalledTimes(1);
      expect(useAudioQueue.getState().currentPlayingId).toBe("audio1");
    });

    it("adds to queue when something is already playing", () => {
      const onPlay1 = jest.fn();
      const onStop1 = jest.fn();
      const item1 = { id: "audio1", onPlay: onPlay1, onStop: onStop1 };

      const onPlay2 = jest.fn();
      const onStop2 = jest.fn();
      const item2 = { id: "audio2", onPlay: onPlay2, onStop: onStop2 };

      act(() => {
        useAudioQueue.getState().enqueue(item1);
        useAudioQueue.getState().enqueue(item2);
      });

      expect(onPlay1).toHaveBeenCalledTimes(1);
      expect(onPlay2).not.toHaveBeenCalled();
      expect(useAudioQueue.getState().currentPlayingId).toBe("audio1");
      expect(useAudioQueue.getState().queue).toHaveLength(1);
      expect(useAudioQueue.getState().queue[0].id).toBe("audio2");
    });

    it("removes duplicate from queue before adding", () => {
      const onPlay1 = jest.fn();
      const onStop1 = jest.fn();
      const item1 = { id: "audio1", onPlay: onPlay1, onStop: onStop1 };

      const onPlay2 = jest.fn();
      const onStop2 = jest.fn();
      const item2 = { id: "audio2", onPlay: onPlay2, onStop: onStop2 };

      const onPlay2Updated = jest.fn();
      const onStop2Updated = jest.fn();
      const item2Updated = { id: "audio2", onPlay: onPlay2Updated, onStop: onStop2Updated };

      act(() => {
        useAudioQueue.getState().enqueue(item1);
        useAudioQueue.getState().enqueue(item2);
        useAudioQueue.getState().enqueue(item2Updated);
      });

      // Should only have one item in queue with id "audio2"
      const queueItems = useAudioQueue.getState().queue;
      expect(queueItems).toHaveLength(1);
      expect(queueItems[0].id).toBe("audio2");
    });
  });

  describe("dequeue", () => {
    it("clears current playing item without auto-playing next", () => {
      const onPlay1 = jest.fn();
      const onStop1 = jest.fn();
      const item1 = { id: "audio1", onPlay: onPlay1, onStop: onStop1 };

      const onPlay2 = jest.fn();
      const onStop2 = jest.fn();
      const item2 = { id: "audio2", onPlay: onPlay2, onStop: onStop2 };

      act(() => {
        useAudioQueue.getState().enqueue(item1);
        useAudioQueue.getState().enqueue(item2);
        useAudioQueue.getState().dequeue("audio1");
      });

      // Dequeue clears current without auto-playing next
      expect(useAudioQueue.getState().currentPlayingId).toBeNull();
      // The queue still contains the next item
      expect(useAudioQueue.getState().queue).toHaveLength(1);
      expect(useAudioQueue.getState().queue[0].id).toBe("audio2");
    });

    it("removes item from queue without affecting current playback", () => {
      const onPlay1 = jest.fn();
      const onStop1 = jest.fn();
      const item1 = { id: "audio1", onPlay: onPlay1, onStop: onStop1 };

      const onPlay2 = jest.fn();
      const onStop2 = jest.fn();
      const item2 = { id: "audio2", onPlay: onPlay2, onStop: onStop2 };

      const onPlay3 = jest.fn();
      const onStop3 = jest.fn();
      const item3 = { id: "audio3", onPlay: onPlay3, onStop: onStop3 };

      act(() => {
        useAudioQueue.getState().enqueue(item1);
        useAudioQueue.getState().enqueue(item2);
        useAudioQueue.getState().enqueue(item3);
        useAudioQueue.getState().dequeue("audio2");
      });

      expect(useAudioQueue.getState().currentPlayingId).toBe("audio1");
      expect(useAudioQueue.getState().queue).toHaveLength(1);
      expect(useAudioQueue.getState().queue[0].id).toBe("audio3");
    });
  });

  describe("finishCurrent", () => {
    it("plays next item in queue", () => {
      const onPlay1 = jest.fn();
      const onStop1 = jest.fn();
      const item1 = { id: "audio1", onPlay: onPlay1, onStop: onStop1 };

      const onPlay2 = jest.fn();
      const onStop2 = jest.fn();
      const item2 = { id: "audio2", onPlay: onPlay2, onStop: onStop2 };

      act(() => {
        useAudioQueue.getState().enqueue(item1);
        useAudioQueue.getState().enqueue(item2);
        useAudioQueue.getState().finishCurrent();
      });

      expect(onPlay2).toHaveBeenCalledTimes(1);
      expect(useAudioQueue.getState().currentPlayingId).toBe("audio2");
      expect(useAudioQueue.getState().queue).toHaveLength(0);
    });

    it("clears current when queue is empty", () => {
      const onPlay1 = jest.fn();
      const onStop1 = jest.fn();
      const item1 = { id: "audio1", onPlay: onPlay1, onStop: onStop1 };

      act(() => {
        useAudioQueue.getState().enqueue(item1);
        useAudioQueue.getState().finishCurrent();
      });

      expect(useAudioQueue.getState().currentPlayingId).toBeNull();
      expect(useAudioQueue.getState().queue).toHaveLength(0);
    });
  });

  describe("stopAll", () => {
    it("stops current playback and clears queue", () => {
      const onPlay1 = jest.fn();
      const onStop1 = jest.fn();
      const item1 = { id: "audio1", onPlay: onPlay1, onStop: onStop1 };

      const onPlay2 = jest.fn();
      const onStop2 = jest.fn();
      const item2 = { id: "audio2", onPlay: onPlay2, onStop: onStop2 };

      act(() => {
        useAudioQueue.getState().enqueue(item1);
        useAudioQueue.getState().enqueue(item2);
        useAudioQueue.getState().stopAll();
      });

      expect(useAudioQueue.getState().currentPlayingId).toBeNull();
      expect(useAudioQueue.getState().queue).toHaveLength(0);
    });

    it("handles stopAll when nothing is playing", () => {
      act(() => {
        useAudioQueue.getState().stopAll();
      });

      expect(useAudioQueue.getState().currentPlayingId).toBeNull();
      expect(useAudioQueue.getState().queue).toHaveLength(0);
    });
  });

  describe("isPlaying", () => {
    it("returns true when item is currently playing", () => {
      const onPlay = jest.fn();
      const onStop = jest.fn();
      const item = { id: "audio1", onPlay, onStop };

      act(() => {
        useAudioQueue.getState().enqueue(item);
      });

      expect(useAudioQueue.getState().isPlaying("audio1")).toBe(true);
    });

    it("returns false when item is not playing", () => {
      expect(useAudioQueue.getState().isPlaying("audio1")).toBe(false);
    });

    it("returns false when item is in queue but not playing", () => {
      const onPlay1 = jest.fn();
      const onStop1 = jest.fn();
      const item1 = { id: "audio1", onPlay: onPlay1, onStop: onStop1 };

      const onPlay2 = jest.fn();
      const onStop2 = jest.fn();
      const item2 = { id: "audio2", onPlay: onPlay2, onStop: onStop2 };

      act(() => {
        useAudioQueue.getState().enqueue(item1);
        useAudioQueue.getState().enqueue(item2);
      });

      expect(useAudioQueue.getState().isPlaying("audio2")).toBe(false);
    });
  });

  describe("isQueued", () => {
    it("returns true when item is in queue", () => {
      const onPlay1 = jest.fn();
      const onStop1 = jest.fn();
      const item1 = { id: "audio1", onPlay: onPlay1, onStop: onStop1 };

      const onPlay2 = jest.fn();
      const onStop2 = jest.fn();
      const item2 = { id: "audio2", onPlay: onPlay2, onStop: onStop2 };

      act(() => {
        useAudioQueue.getState().enqueue(item1);
        useAudioQueue.getState().enqueue(item2);
      });

      expect(useAudioQueue.getState().isQueued("audio2")).toBe(true);
    });

    it("returns false when item is not in queue", () => {
      expect(useAudioQueue.getState().isQueued("audio1")).toBe(false);
    });

    it("returns false when item is currently playing", () => {
      const onPlay = jest.fn();
      const onStop = jest.fn();
      const item = { id: "audio1", onPlay, onStop };

      act(() => {
        useAudioQueue.getState().enqueue(item);
      });

      expect(useAudioQueue.getState().isQueued("audio1")).toBe(false);
    });
  });
});
