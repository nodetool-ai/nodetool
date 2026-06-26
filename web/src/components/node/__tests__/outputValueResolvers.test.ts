import {
  isRecord,
  getSketchId,
  isSketchDocumentLike,
  unwrapSketchDocumentCandidate,
  getTimelineId,
  isTimelineSequenceLike,
  unwrapTimelineSequenceCandidate,
  resolveTimelineSequence,
} from "../outputValueResolvers";

describe("outputValueResolvers", () => {
  describe("isRecord", () => {
    it("returns true for plain objects", () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
    });

    it("returns false for null", () => {
      expect(isRecord(null)).toBe(false);
    });

    it("returns false for primitives", () => {
      expect(isRecord("string")).toBe(false);
      expect(isRecord(42)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord(true)).toBe(false);
    });

    it("returns true for arrays (they are objects)", () => {
      expect(isRecord([])).toBe(true);
    });
  });

  describe("getSketchId", () => {
    it("returns id for a valid sketch-like object", () => {
      expect(getSketchId({ id: "sketch-1" })).toBe("sketch-1");
    });

    it("returns null for non-objects", () => {
      expect(getSketchId(null)).toBeNull();
      expect(getSketchId("string")).toBeNull();
      expect(getSketchId(42)).toBeNull();
    });

    it("returns null when id is not a string", () => {
      expect(getSketchId({ id: 123 })).toBeNull();
    });

    it("returns null for empty string id", () => {
      expect(getSketchId({ id: "" })).toBeNull();
    });

    it("returns null when id is missing", () => {
      expect(getSketchId({ name: "test" })).toBeNull();
    });
  });

  describe("isSketchDocumentLike", () => {
    const validDoc = {
      canvas: { width: 800, height: 600 },
      layers: [{ id: "layer-1" }],
      activeLayerId: "layer-1",
    };

    it("returns true for a valid sketch document shape", () => {
      expect(isSketchDocumentLike(validDoc)).toBe(true);
    });

    it("returns false for non-objects", () => {
      expect(isSketchDocumentLike(null)).toBe(false);
      expect(isSketchDocumentLike("string")).toBe(false);
    });

    it("returns false when canvas is missing", () => {
      expect(
        isSketchDocumentLike({ layers: [], activeLayerId: "a" })
      ).toBe(false);
    });

    it("returns false when canvas dimensions are wrong type", () => {
      expect(
        isSketchDocumentLike({
          canvas: { width: "800", height: 600 },
          layers: [],
          activeLayerId: "a",
        })
      ).toBe(false);
    });

    it("returns false when layers is not an array", () => {
      expect(
        isSketchDocumentLike({
          canvas: { width: 800, height: 600 },
          layers: "not-array",
          activeLayerId: "a",
        })
      ).toBe(false);
    });

    it("returns false when activeLayerId is not a string", () => {
      expect(
        isSketchDocumentLike({
          canvas: { width: 800, height: 600 },
          layers: [],
          activeLayerId: 123,
        })
      ).toBe(false);
    });
  });

  describe("unwrapSketchDocumentCandidate", () => {
    const doc = {
      canvas: { width: 800, height: 600 },
      layers: [],
      activeLayerId: "a",
    };

    it("returns the value itself if it looks like a sketch document", () => {
      expect(unwrapSketchDocumentCandidate(doc)).toBe(doc);
    });

    it("unwraps from a document envelope", () => {
      expect(unwrapSketchDocumentCandidate({ document: doc })).toBe(doc);
    });

    it("unwraps from a sketch envelope", () => {
      expect(unwrapSketchDocumentCandidate({ sketch: doc })).toBe(doc);
    });

    it("unwraps from a typed envelope", () => {
      expect(
        unwrapSketchDocumentCandidate({ type: "sketch", data: doc })
      ).toBe(doc);
    });

    it("unwraps nested envelopes", () => {
      expect(
        unwrapSketchDocumentCandidate({ document: { sketch: doc } })
      ).toBe(doc);
    });

    it("stops recursing beyond depth limit", () => {
      // depth > 4 means depths 0..4 are allowed (5 unwrap levels)
      // 6 levels of nesting exceeds the limit
      const deep = {
        document: {
          document: {
            document: { document: { document: { document: doc } } },
          },
        },
      };
      const result = unwrapSketchDocumentCandidate(deep);
      expect(result).not.toBe(doc);
    });

    it("returns non-objects unchanged", () => {
      expect(unwrapSketchDocumentCandidate("string")).toBe("string");
      expect(unwrapSketchDocumentCandidate(42)).toBe(42);
      expect(unwrapSketchDocumentCandidate(null)).toBeNull();
    });

    it("returns record unchanged when no envelope keys match", () => {
      const val = { foo: "bar" };
      expect(unwrapSketchDocumentCandidate(val)).toBe(val);
    });
  });

  describe("getTimelineId", () => {
    it("returns id for a valid object", () => {
      expect(getTimelineId({ id: "timeline-1" })).toBe("timeline-1");
    });

    it("returns null for non-objects", () => {
      expect(getTimelineId(null)).toBeNull();
      expect(getTimelineId(42)).toBeNull();
    });

    it("returns null for empty string id", () => {
      expect(getTimelineId({ id: "" })).toBeNull();
    });

    it("returns null when id is not a string", () => {
      expect(getTimelineId({ id: 123 })).toBeNull();
    });
  });

  describe("isTimelineSequenceLike", () => {
    const validSequence = {
      id: "seq-1",
      name: "Test",
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs: 5000,
      tracks: [],
      clips: [],
      markers: [],
    };

    it("returns true for a valid timeline sequence shape", () => {
      expect(isTimelineSequenceLike(validSequence)).toBe(true);
    });

    it("returns false for non-objects", () => {
      expect(isTimelineSequenceLike(null)).toBe(false);
      expect(isTimelineSequenceLike("string")).toBe(false);
    });

    it("returns false when required fields are missing", () => {
      const { fps: _, ...missing } = validSequence;
      expect(isTimelineSequenceLike(missing)).toBe(false);
    });

    it("returns false when arrays are wrong type", () => {
      expect(
        isTimelineSequenceLike({ ...validSequence, tracks: "not-array" })
      ).toBe(false);
    });
  });

  describe("unwrapTimelineSequenceCandidate", () => {
    const seq = {
      id: "s",
      name: "S",
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs: 5000,
      tracks: [],
      clips: [],
      markers: [],
    };

    it("returns the value itself if it looks like a timeline sequence", () => {
      expect(unwrapTimelineSequenceCandidate(seq)).toBe(seq);
    });

    it("unwraps from a sequence envelope", () => {
      expect(unwrapTimelineSequenceCandidate({ sequence: seq })).toBe(seq);
    });

    it("unwraps from a document envelope", () => {
      expect(unwrapTimelineSequenceCandidate({ document: seq })).toBe(seq);
    });

    it("unwraps from a timeline envelope", () => {
      expect(unwrapTimelineSequenceCandidate({ timeline: seq })).toBe(seq);
    });

    it("unwraps from a typed envelope", () => {
      expect(
        unwrapTimelineSequenceCandidate({ type: "timeline", data: seq })
      ).toBe(seq);
    });

    it("stops recursing beyond depth limit", () => {
      const deep = {
        sequence: {
          sequence: {
            sequence: { sequence: { sequence: { sequence: seq } } },
          },
        },
      };
      const result = unwrapTimelineSequenceCandidate(deep);
      expect(result).not.toBe(seq);
    });
  });

  describe("resolveTimelineSequence", () => {
    const seq = {
      id: "s",
      name: "S",
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs: 5000,
      tracks: [],
      clips: [],
      markers: [],
    };

    it("returns the sequence when directly valid", () => {
      expect(resolveTimelineSequence(seq)).toBe(seq);
    });

    it("unwraps and returns from an envelope", () => {
      expect(resolveTimelineSequence({ sequence: seq })).toBe(seq);
    });

    it("returns null for non-sequence values", () => {
      expect(resolveTimelineSequence({ foo: "bar" })).toBeNull();
      expect(resolveTimelineSequence("string")).toBeNull();
      expect(resolveTimelineSequence(null)).toBeNull();
    });
  });
});
