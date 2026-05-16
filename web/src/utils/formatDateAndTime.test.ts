import {
  secondsToHMS,
  relativeTime,
} from "./formatDateAndTime";

describe("formatDateAndTime", () => {
  describe("secondsToHMS", () => {
    it("formats 0 seconds", () => {
      expect(secondsToHMS(0)).toBe("00:00:00");
    });

    it("formats seconds only", () => {
      expect(secondsToHMS(45)).toBe("00:00:45");
    });

    it("formats minutes and seconds", () => {
      expect(secondsToHMS(125)).toBe("00:02:05");
    });

    it("formats hours, minutes, and seconds", () => {
      expect(secondsToHMS(3661)).toBe("01:01:01");
    });

    it("handles large values", () => {
      expect(secondsToHMS(86400)).toBe("24:00:00");
    });

    it("truncates fractional seconds", () => {
      expect(secondsToHMS(1.9)).toBe("00:00:01");
    });
  });

  describe("relativeTime", () => {
    it("returns 'just now' for the current time", () => {
      expect(relativeTime(new Date())).toBe("just now");
    });

    it("formats seconds ago", () => {
      const past = new Date(Date.now() - 30 * 1000);
      expect(relativeTime(past)).toBe("30 sec ago");
    });

    it("formats 1 second singular", () => {
      const past = new Date(Date.now() - 1000);
      expect(relativeTime(past)).toBe("1 sec ago");
    });

    it("formats minutes ago", () => {
      const past = new Date(Date.now() - 5 * 60 * 1000);
      expect(relativeTime(past)).toBe("5 min ago");
    });

    it("formats 1 minute singular", () => {
      const past = new Date(Date.now() - 60 * 1000);
      expect(relativeTime(past)).toBe("1 min ago");
    });

    it("formats hours ago", () => {
      const past = new Date(Date.now() - 3 * 3600 * 1000);
      expect(relativeTime(past)).toBe("3 hours ago");
    });

    it("formats 1 hour singular", () => {
      const past = new Date(Date.now() - 3600 * 1000);
      expect(relativeTime(past)).toBe("1 hour ago");
    });

    it("formats days ago", () => {
      const past = new Date(Date.now() - 2 * 86400 * 1000);
      expect(relativeTime(past)).toBe("2 days ago");
    });

    it("accepts a string date", () => {
      const past = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
      expect(relativeTime(past)).toBe("1 week ago");
    });
  });

});
