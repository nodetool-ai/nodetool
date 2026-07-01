import { isTimelineDemoCast, TIMELINE_CAST_VERSION } from "../timelineCastTypes";
import { makeSequence } from "@nodetool-ai/timeline";

describe("timelineCastTypes", () => {
  describe("isTimelineDemoCast", () => {
    const validCast = {
      version: TIMELINE_CAST_VERSION,
      kind: "timeline",
      id: "timeline-1",
      name: "Timeline demo",
      createdAt: "2026-01-01T00:00:00Z",
      durationMs: 5000,
      sequence: makeSequence({ id: "seq-1" }),
      assets: [],
      events: [],
    };

    it("returns true for a valid cast object", () => {
      expect(isTimelineDemoCast(validCast)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isTimelineDemoCast(null)).toBe(false);
    });

    it("returns false for the wrong kind", () => {
      expect(isTimelineDemoCast({ ...validCast, kind: "chat" })).toBe(false);
    });

    it("returns false for wrong version", () => {
      expect(isTimelineDemoCast({ ...validCast, version: 999 })).toBe(false);
    });

    it("returns false when sequence is missing", () => {
      const { sequence: _sequence, ...rest } = validCast;
      expect(isTimelineDemoCast(rest)).toBe(false);
    });

    it("returns false when events is not an array", () => {
      expect(isTimelineDemoCast({ ...validCast, events: "not-array" })).toBe(false);
    });
  });
});
