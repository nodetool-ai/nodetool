import { formatTime } from "../../../utils/audioUtils";

describe("WaveRecorder utilities", () => {
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
});
