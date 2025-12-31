import {
  formatTimecode,
  formatTime,
  formatTimeShort,
  secondsToFrames,
  framesToSeconds,
  pixelsToTime,
  timeToPixels,
  snapToFrame,
  snapToGrid,
  clamp,
  getVisibleTimeRange,
  generateRulerTicks,
  rangesOverlap,
  generateTimelineId
} from "../timelineUtils";

describe("timelineUtils", () => {
  describe("formatTimecode", () => {
    it("formats zero time correctly", () => {
      expect(formatTimecode(0)).toBe("00:00:00:00");
    });

    it("formats seconds correctly", () => {
      expect(formatTimecode(5, 30)).toBe("00:00:05:00");
    });

    it("formats minutes correctly", () => {
      expect(formatTimecode(65, 30)).toBe("00:01:05:00");
    });

    it("formats hours correctly", () => {
      expect(formatTimecode(3665, 30)).toBe("01:01:05:00");
    });

    it("formats frames correctly at 30fps", () => {
      expect(formatTimecode(1.5, 30)).toBe("00:00:01:15");
    });

    it("formats frames correctly at 24fps", () => {
      expect(formatTimecode(1.5, 24)).toBe("00:00:01:12");
    });

    it("handles negative time by returning zero", () => {
      expect(formatTimecode(-5)).toBe("00:00:00:00");
    });
  });

  describe("formatTime", () => {
    it("formats zero time correctly", () => {
      expect(formatTime(0)).toBe("00:00.000");
    });

    it("formats seconds and milliseconds", () => {
      expect(formatTime(5.5)).toBe("00:05.500");
    });

    it("formats minutes", () => {
      expect(formatTime(65.123)).toBe("01:05.123");
    });

    it("handles negative time", () => {
      expect(formatTime(-5)).toBe("00:00.000");
    });
  });

  describe("formatTimeShort", () => {
    it("formats short time without hours", () => {
      expect(formatTimeShort(65)).toBe("1:05");
    });

    it("formats time with hours", () => {
      expect(formatTimeShort(3665)).toBe("1:01:05");
    });

    it("formats zero correctly", () => {
      expect(formatTimeShort(0)).toBe("0:00");
    });

    it("handles negative time", () => {
      expect(formatTimeShort(-5)).toBe("0:00");
    });
  });

  describe("secondsToFrames", () => {
    it("converts seconds to frames at 30fps", () => {
      expect(secondsToFrames(1, 30)).toBe(30);
    });

    it("converts seconds to frames at 24fps", () => {
      expect(secondsToFrames(1, 24)).toBe(24);
    });

    it("rounds to nearest frame", () => {
      expect(secondsToFrames(0.5, 30)).toBe(15);
    });
  });

  describe("framesToSeconds", () => {
    it("converts frames to seconds at 30fps", () => {
      expect(framesToSeconds(30, 30)).toBe(1);
    });

    it("converts frames to seconds at 24fps", () => {
      expect(framesToSeconds(24, 24)).toBe(1);
    });

    it("handles partial frames", () => {
      expect(framesToSeconds(15, 30)).toBe(0.5);
    });
  });

  describe("pixelsToTime", () => {
    it("converts pixels to time", () => {
      expect(pixelsToTime(100, 50)).toBe(2);
    });

    it("handles zero pixels", () => {
      expect(pixelsToTime(0, 50)).toBe(0);
    });

    it("handles different zoom levels", () => {
      expect(pixelsToTime(100, 100)).toBe(1);
      expect(pixelsToTime(100, 25)).toBe(4);
    });
  });

  describe("timeToPixels", () => {
    it("converts time to pixels", () => {
      expect(timeToPixels(2, 50)).toBe(100);
    });

    it("handles zero time", () => {
      expect(timeToPixels(0, 50)).toBe(0);
    });

    it("handles different zoom levels", () => {
      expect(timeToPixels(1, 100)).toBe(100);
      expect(timeToPixels(1, 25)).toBe(25);
    });
  });

  describe("snapToFrame", () => {
    it("snaps to nearest frame at 30fps", () => {
      const snapped = snapToFrame(1.017, 30);
      // 1.017s at 30fps = 30.51 frames, should snap to 31 frames = 1.0333...s
      expect(snapped).toBeCloseTo(31 / 30, 5);
    });

    it("returns exact frame time for frame-aligned input", () => {
      const snapped = snapToFrame(1, 30);
      expect(snapped).toBe(1);
    });
  });

  describe("snapToGrid", () => {
    it("snaps to nearest grid interval", () => {
      expect(snapToGrid(1.7, 0.5)).toBe(1.5);
      expect(snapToGrid(1.8, 0.5)).toBe(2);
    });

    it("returns original time for zero interval", () => {
      expect(snapToGrid(1.7, 0)).toBe(1.7);
    });

    it("handles negative interval", () => {
      expect(snapToGrid(1.7, -0.5)).toBe(1.7);
    });
  });

  describe("clamp", () => {
    it("clamps value below minimum", () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it("clamps value above maximum", () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it("returns value within range", () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it("handles edge cases", () => {
      expect(clamp(0, 0, 10)).toBe(0);
      expect(clamp(10, 0, 10)).toBe(10);
    });
  });

  describe("getVisibleTimeRange", () => {
    it("calculates visible time range", () => {
      const range = getVisibleTimeRange(100, 400, 50);
      expect(range.start).toBe(2);
      expect(range.end).toBe(10);
    });

    it("handles zero scroll", () => {
      const range = getVisibleTimeRange(0, 400, 50);
      expect(range.start).toBe(0);
      expect(range.end).toBe(8);
    });
  });

  describe("generateRulerTicks", () => {
    it("generates ticks for a time range", () => {
      const ticks = generateRulerTicks(0, 10, 50);
      expect(ticks.length).toBeGreaterThan(0);
    });

    it("includes major ticks", () => {
      const ticks = generateRulerTicks(0, 10, 50);
      const majorTicks = ticks.filter(t => t.type === "major");
      expect(majorTicks.length).toBeGreaterThan(0);
    });

    it("includes minor ticks", () => {
      const ticks = generateRulerTicks(0, 10, 50);
      const minorTicks = ticks.filter(t => t.type === "minor");
      expect(minorTicks.length).toBeGreaterThan(0);
    });

    it("has ticks at increasing times", () => {
      const ticks = generateRulerTicks(0, 10, 50);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i].time).toBeGreaterThanOrEqual(ticks[i - 1].time);
      }
    });
  });

  describe("rangesOverlap", () => {
    it("returns true for overlapping ranges", () => {
      expect(rangesOverlap(0, 5, 3, 8)).toBe(true);
    });

    it("returns true for contained ranges", () => {
      expect(rangesOverlap(0, 10, 3, 7)).toBe(true);
    });

    it("returns false for non-overlapping ranges", () => {
      expect(rangesOverlap(0, 5, 6, 10)).toBe(false);
    });

    it("returns false for adjacent ranges (touching at edge)", () => {
      expect(rangesOverlap(0, 5, 5, 10)).toBe(false);
    });

    it("returns true for identical ranges", () => {
      expect(rangesOverlap(0, 5, 0, 5)).toBe(true);
    });
  });

  describe("generateTimelineId", () => {
    it("generates unique ids", () => {
      const id1 = generateTimelineId();
      const id2 = generateTimelineId();
      expect(id1).not.toBe(id2);
    });

    it("generates ids with tl_ prefix", () => {
      const id = generateTimelineId();
      expect(id.startsWith("tl_")).toBe(true);
    });

    it("generates ids of reasonable length", () => {
      const id = generateTimelineId();
      expect(id.length).toBeGreaterThan(10);
      expect(id.length).toBeLessThan(50);
    });
  });
});
