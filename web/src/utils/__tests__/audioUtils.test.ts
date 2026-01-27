import {
  formatTime,
  AUDIO_ANALYSER_CONFIG,
  calculateSignalLevel
} from "../audioUtils";

describe("audioUtils", () => {
  describe("formatTime", () => {
    it("formats 0 seconds as 00:00", () => {
      expect(formatTime(0)).toBe("00:00");
    });

    it("formats single digit seconds correctly", () => {
      expect(formatTime(5)).toBe("00:05");
    });

    it("formats double digit seconds correctly", () => {
      expect(formatTime(45)).toBe("00:45");
    });

    it("formats minutes and seconds correctly", () => {
      expect(formatTime(65)).toBe("01:05");
    });

    it("formats multiple minutes correctly", () => {
      expect(formatTime(185)).toBe("03:05");
    });

    it("formats exactly one minute", () => {
      expect(formatTime(60)).toBe("01:00");
    });

    it("formats large values correctly", () => {
      expect(formatTime(3661)).toBe("61:01");
    });
  });

  describe("AUDIO_ANALYSER_CONFIG", () => {
    it("has correct fftSize", () => {
      expect(AUDIO_ANALYSER_CONFIG.fftSize).toBe(256);
    });

    it("has correct smoothingTimeConstant", () => {
      expect(AUDIO_ANALYSER_CONFIG.smoothingTimeConstant).toBe(0.5);
    });
  });

  describe("calculateSignalLevel", () => {
    it("returns 0 for silent input", () => {
      const silentData = new Uint8Array(128).fill(0);
      expect(calculateSignalLevel(silentData)).toBe(0);
    });

    it("returns 1 for maximum input", () => {
      const maxData = new Uint8Array(128).fill(255);
      const level = calculateSignalLevel(maxData);
      expect(level).toBe(1);
    });

    it("returns value between 0 and 1 for mid-level input", () => {
      const midData = new Uint8Array(128).fill(64);
      const level = calculateSignalLevel(midData);
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThan(1);
    });

    it("calculates RMS correctly", () => {
      // Create data where RMS should be 64 (half of 128)
      const data = new Uint8Array(128).fill(64);
      const level = calculateSignalLevel(data);
      // RMS of 64 / 128 = 0.5
      expect(level).toBeCloseTo(0.5, 1);
    });
  });
});
