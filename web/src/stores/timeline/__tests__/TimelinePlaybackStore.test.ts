import { act } from "@testing-library/react";
import { useTimelinePlaybackStore } from "../TimelinePlaybackStore";

describe("TimelinePlaybackStore", () => {
  beforeEach(() => {
    act(() => {
      useTimelinePlaybackStore.getState().stop();
      useTimelinePlaybackStore.getState().setRate(1);
    });
  });

  describe("initial state", () => {
    it("starts at time 0", () => {
      expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(0);
    });

    it("is not playing", () => {
      expect(useTimelinePlaybackStore.getState().isPlaying).toBe(false);
    });

    it("has rate 1", () => {
      expect(useTimelinePlaybackStore.getState().rate).toBe(1);
    });
  });

  describe("play", () => {
    it("sets isPlaying to true", () => {
      act(() => {
        useTimelinePlaybackStore.getState().play();
      });
      expect(useTimelinePlaybackStore.getState().isPlaying).toBe(true);
    });
  });

  describe("pause", () => {
    it("sets isPlaying to false", () => {
      act(() => {
        useTimelinePlaybackStore.getState().play();
        useTimelinePlaybackStore.getState().pause();
      });
      expect(useTimelinePlaybackStore.getState().isPlaying).toBe(false);
    });

    it("preserves currentTimeMs", () => {
      act(() => {
        useTimelinePlaybackStore.getState().setCurrentTimeMs(5000);
        useTimelinePlaybackStore.getState().play();
        useTimelinePlaybackStore.getState().pause();
      });
      expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(5000);
    });
  });

  describe("stop", () => {
    it("sets isPlaying to false and resets time to 0", () => {
      act(() => {
        useTimelinePlaybackStore.getState().setCurrentTimeMs(5000);
        useTimelinePlaybackStore.getState().play();
        useTimelinePlaybackStore.getState().stop();
      });
      expect(useTimelinePlaybackStore.getState().isPlaying).toBe(false);
      expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(0);
    });
  });

  describe("setCurrentTimeMs", () => {
    it("updates currentTimeMs", () => {
      act(() => {
        useTimelinePlaybackStore.getState().setCurrentTimeMs(12345);
      });
      expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(12345);
    });
  });

  describe("setRate", () => {
    it("updates playback rate", () => {
      act(() => {
        useTimelinePlaybackStore.getState().setRate(2);
      });
      expect(useTimelinePlaybackStore.getState().rate).toBe(2);
    });

    it("allows fractional rates", () => {
      act(() => {
        useTimelinePlaybackStore.getState().setRate(0.5);
      });
      expect(useTimelinePlaybackStore.getState().rate).toBe(0.5);
    });
  });

  describe("setIsPlaying", () => {
    it("directly sets playing state", () => {
      act(() => {
        useTimelinePlaybackStore.getState().setIsPlaying(true);
      });
      expect(useTimelinePlaybackStore.getState().isPlaying).toBe(true);
      act(() => {
        useTimelinePlaybackStore.getState().setIsPlaying(false);
      });
      expect(useTimelinePlaybackStore.getState().isPlaying).toBe(false);
    });
  });

  describe("transient time channel", () => {
    it("setTimeMs updates the live value without touching reactive state", () => {
      const store = useTimelinePlaybackStore.getState();
      act(() => {
        store.setCurrentTimeMs(0);
      });
      act(() => {
        store.setTimeMs(4200);
      });
      // Live value advanced …
      expect(useTimelinePlaybackStore.getState().getTimeMs()).toBe(4200);
      // … but the reactive snapshot did NOT (no re-render path).
      expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(0);
    });

    it("notifies transient subscribers on setTimeMs and seek", () => {
      const seen: number[] = [];
      const unsub = useTimelinePlaybackStore.getState().subscribeTime((ms) =>
        seen.push(ms)
      );
      act(() => {
        useTimelinePlaybackStore.getState().setTimeMs(100);
        useTimelinePlaybackStore.getState().seek(250);
      });
      expect(seen).toEqual([100, 250]);
      unsub();
      act(() => {
        useTimelinePlaybackStore.getState().setTimeMs(999);
      });
      expect(seen).toEqual([100, 250]);
    });

    it("pause syncs reactive currentTimeMs to the live position", () => {
      act(() => {
        useTimelinePlaybackStore.getState().setCurrentTimeMs(0);
        useTimelinePlaybackStore.getState().play();
        useTimelinePlaybackStore.getState().setTimeMs(7777);
        useTimelinePlaybackStore.getState().pause();
      });
      expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(7777);
    });
  });
});
