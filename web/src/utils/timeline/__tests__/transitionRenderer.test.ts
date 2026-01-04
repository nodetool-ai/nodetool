import {
  calculateFadeInOpacity,
  calculateFadeOutOpacity,
  calculateClipOpacity,
  calculateTransitionProgress,
  isInTransition,
  isClipInFade,
  calculateAudioVolume
} from "../transitionRenderer";
import { Clip, Transition } from "../../../stores/TimelineStore";

describe("transitionRenderer", () => {
  // Helper to create a test clip
  const createTestClip = (
    startTime: number,
    duration: number,
    overrides: Partial<Clip> = {}
  ): Clip => ({
    id: `clip-${startTime}`,
    type: "video",
    sourceRef: null,
    sourceUrl: "test.mp4",
    name: "Test Clip",
    startTime,
    duration,
    inPoint: 0,
    outPoint: duration,
    sourceDuration: duration,
    speed: 1,
    ...overrides
  });

  describe("calculateFadeInOpacity", () => {
    it("returns 1 when no fade", () => {
      expect(calculateFadeInOpacity(0, 0)).toBe(1);
      expect(calculateFadeInOpacity(5, 0)).toBe(1);
    });

    it("returns 0 at the start of fade", () => {
      expect(calculateFadeInOpacity(0, 1)).toBe(0);
    });

    it("returns 1 after fade completes", () => {
      expect(calculateFadeInOpacity(1, 1)).toBe(1);
      expect(calculateFadeInOpacity(2, 1)).toBe(1);
    });

    it("returns interpolated value during fade", () => {
      expect(calculateFadeInOpacity(0.5, 1)).toBe(0.5);
      expect(calculateFadeInOpacity(0.25, 1)).toBe(0.25);
      expect(calculateFadeInOpacity(1, 2)).toBe(0.5);
    });
  });

  describe("calculateFadeOutOpacity", () => {
    it("returns 1 when no fade", () => {
      expect(calculateFadeOutOpacity(0, 10, 0)).toBe(1);
      expect(calculateFadeOutOpacity(5, 10, 0)).toBe(1);
    });

    it("returns 1 before fade starts", () => {
      expect(calculateFadeOutOpacity(0, 10, 2)).toBe(1);
      expect(calculateFadeOutOpacity(7, 10, 2)).toBe(1);
    });

    it("returns 0 at clip end", () => {
      expect(calculateFadeOutOpacity(10, 10, 2)).toBe(0);
    });

    it("returns interpolated value during fade", () => {
      expect(calculateFadeOutOpacity(9, 10, 2)).toBe(0.5);
      expect(calculateFadeOutOpacity(8, 10, 2)).toBe(1);
    });
  });

  describe("calculateClipOpacity", () => {
    it("returns base opacity when no fades", () => {
      const clip = createTestClip(0, 10);
      expect(calculateClipOpacity(clip, 5)).toBe(1);
    });

    it("returns base opacity with custom opacity", () => {
      const clip = createTestClip(0, 10, { opacity: 0.5 });
      expect(calculateClipOpacity(clip, 5)).toBe(0.5);
    });

    it("applies fade in", () => {
      const clip = createTestClip(0, 10, { fadeIn: 2 });
      expect(calculateClipOpacity(clip, 0)).toBe(0);
      expect(calculateClipOpacity(clip, 1)).toBe(0.5);
      expect(calculateClipOpacity(clip, 2)).toBe(1);
    });

    it("applies fade out", () => {
      const clip = createTestClip(0, 10, { fadeOut: 2 });
      expect(calculateClipOpacity(clip, 8)).toBe(1);
      expect(calculateClipOpacity(clip, 9)).toBe(0.5);
      expect(calculateClipOpacity(clip, 10)).toBe(0);
    });

    it("combines fades and opacity", () => {
      const clip = createTestClip(0, 10, { fadeIn: 2, fadeOut: 2, opacity: 0.8 });
      expect(calculateClipOpacity(clip, 1)).toBeCloseTo(0.4); // 0.5 * 1 * 0.8
      expect(calculateClipOpacity(clip, 5)).toBeCloseTo(0.8); // 1 * 1 * 0.8
    });
  });

  describe("isClipInFade", () => {
    it("returns false when no fades", () => {
      const clip = createTestClip(0, 10);
      expect(isClipInFade(clip, 0)).toBe(false);
      expect(isClipInFade(clip, 5)).toBe(false);
      expect(isClipInFade(clip, 10)).toBe(false);
    });

    it("returns true during fade in", () => {
      const clip = createTestClip(0, 10, { fadeIn: 2 });
      expect(isClipInFade(clip, 0)).toBe(true);
      expect(isClipInFade(clip, 1)).toBe(true);
      expect(isClipInFade(clip, 1.9)).toBe(true);
      expect(isClipInFade(clip, 2)).toBe(false);
      expect(isClipInFade(clip, 5)).toBe(false);
    });

    it("returns true during fade out", () => {
      const clip = createTestClip(0, 10, { fadeOut: 2 });
      expect(isClipInFade(clip, 5)).toBe(false);
      expect(isClipInFade(clip, 8)).toBe(false);
      expect(isClipInFade(clip, 8.1)).toBe(true);
      expect(isClipInFade(clip, 9)).toBe(true);
      expect(isClipInFade(clip, 10)).toBe(true);
    });

    it("returns true during either fade", () => {
      const clip = createTestClip(0, 10, { fadeIn: 2, fadeOut: 2 });
      expect(isClipInFade(clip, 1)).toBe(true);
      expect(isClipInFade(clip, 5)).toBe(false);
      expect(isClipInFade(clip, 9)).toBe(true);
    });
  });

  describe("isInTransition", () => {
    it("returns false when clips have no transition", () => {
      const clip1 = createTestClip(0, 5);
      const clip2 = createTestClip(5, 5);
      expect(isInTransition(5, clip1, clip2)).toBe(false);
    });

    it("returns false when clips are not adjacent", () => {
      const transition: Transition = { type: "crossfade", duration: 1 };
      const clip1 = createTestClip(0, 5, { transitions: { out: transition } });
      const clip2 = createTestClip(10, 5);
      expect(isInTransition(5, clip1, clip2)).toBe(false);
    });

    it("returns true during transition period", () => {
      const transition: Transition = { type: "crossfade", duration: 1 };
      const clip1 = createTestClip(0, 5, { transitions: { out: transition } });
      const clip2 = createTestClip(5, 5);

      // Transition is from 4.5 to 5.5
      expect(isInTransition(4.6, clip1, clip2)).toBe(true);
      expect(isInTransition(5, clip1, clip2)).toBe(true);
      expect(isInTransition(5.4, clip1, clip2)).toBe(true);
    });

    it("returns false outside transition period", () => {
      const transition: Transition = { type: "crossfade", duration: 1 };
      const clip1 = createTestClip(0, 5, { transitions: { out: transition } });
      const clip2 = createTestClip(5, 5);

      expect(isInTransition(4, clip1, clip2)).toBe(false);
      expect(isInTransition(6, clip1, clip2)).toBe(false);
    });
  });

  describe("calculateTransitionProgress", () => {
    it("returns 0 at transition start", () => {
      const transition: Transition = { type: "crossfade", duration: 1 };
      const clip1 = createTestClip(0, 5);
      const clip2 = createTestClip(5, 5);

      expect(calculateTransitionProgress(4.5, clip1, clip2, transition)).toBe(0);
    });

    it("returns 1 at transition end", () => {
      const transition: Transition = { type: "crossfade", duration: 1 };
      const clip1 = createTestClip(0, 5);
      const clip2 = createTestClip(5, 5);

      expect(calculateTransitionProgress(5.5, clip1, clip2, transition)).toBe(1);
    });

    it("returns 0.5 at transition midpoint", () => {
      const transition: Transition = { type: "crossfade", duration: 1 };
      const clip1 = createTestClip(0, 5);
      const clip2 = createTestClip(5, 5);

      expect(calculateTransitionProgress(5, clip1, clip2, transition)).toBe(0.5);
    });
  });

  describe("calculateAudioVolume", () => {
    it("returns base volume when no fades", () => {
      const clip = createTestClip(0, 10, { type: "audio", volume: 0.8 });
      expect(calculateAudioVolume(clip, 5)).toBe(0.8);
    });

    it("applies fade in to audio", () => {
      const clip = createTestClip(0, 10, { type: "audio", fadeIn: 2, volume: 1 });
      expect(calculateAudioVolume(clip, 0)).toBe(0);
      expect(calculateAudioVolume(clip, 1)).toBe(0.5);
      expect(calculateAudioVolume(clip, 2)).toBe(1);
    });

    it("applies fade out to audio", () => {
      const clip = createTestClip(0, 10, { type: "audio", fadeOut: 2, volume: 1 });
      expect(calculateAudioVolume(clip, 8)).toBe(1);
      expect(calculateAudioVolume(clip, 9)).toBe(0.5);
      expect(calculateAudioVolume(clip, 10)).toBe(0);
    });
  });
});
