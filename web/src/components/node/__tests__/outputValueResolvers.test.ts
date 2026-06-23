jest.mock("../../../stores/sketch/persistence", () => ({
  fromPersistedSketchEditorState: jest.fn((candidate: unknown) => ({
    document: candidate
  }))
}));

import {
  isRecord,
  getSketchId,
  isSketchDocumentLike,
  unwrapSketchDocumentCandidate,
  resolveSketchDocument,
  getTimelineId,
  isTimelineSequenceLike,
  unwrapTimelineSequenceCandidate,
  resolveTimelineSequence
} from "../outputValueResolvers";
import { fromPersistedSketchEditorState } from "../../../stores/sketch/persistence";

const mockFromPersisted = fromPersistedSketchEditorState as jest.Mock;

function makeSketchDoc(overrides: Record<string, unknown> = {}) {
  return {
    canvas: { width: 512, height: 512 },
    layers: [{ id: "layer-1" }],
    activeLayerId: "layer-1",
    ...overrides
  };
}

function makeTimeline(overrides: Record<string, unknown> = {}) {
  return {
    id: "seq-1",
    name: "My Sequence",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 10000,
    tracks: [],
    clips: [],
    markers: [],
    ...overrides
  };
}

describe("isRecord", () => {
  it("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("returns true for arrays", () => {
    expect(isRecord([])).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });
});

describe("getSketchId", () => {
  it("returns id when value has a non-empty string id", () => {
    expect(getSketchId({ id: "abc-123" })).toBe("abc-123");
  });

  it("returns null for empty string id", () => {
    expect(getSketchId({ id: "" })).toBeNull();
  });

  it("returns null when id is not a string", () => {
    expect(getSketchId({ id: 42 })).toBeNull();
    expect(getSketchId({ id: null })).toBeNull();
    expect(getSketchId({ id: undefined })).toBeNull();
  });

  it("returns null when value has no id property", () => {
    expect(getSketchId({ name: "test" })).toBeNull();
  });

  it("returns null for non-record values", () => {
    expect(getSketchId(null)).toBeNull();
    expect(getSketchId(undefined)).toBeNull();
    expect(getSketchId("string")).toBeNull();
    expect(getSketchId(42)).toBeNull();
  });
});

describe("isSketchDocumentLike", () => {
  it("returns true for a valid sketch document shape", () => {
    expect(isSketchDocumentLike(makeSketchDoc())).toBe(true);
  });

  it("returns false when canvas is missing", () => {
    expect(isSketchDocumentLike({ layers: [], activeLayerId: "x" })).toBe(
      false
    );
  });

  it("returns false when canvas.width is not a number", () => {
    expect(
      isSketchDocumentLike(
        makeSketchDoc({ canvas: { width: "512", height: 512 } })
      )
    ).toBe(false);
  });

  it("returns false when canvas.height is not a number", () => {
    expect(
      isSketchDocumentLike(
        makeSketchDoc({ canvas: { width: 512, height: null } })
      )
    ).toBe(false);
  });

  it("returns false when layers is not an array", () => {
    expect(isSketchDocumentLike(makeSketchDoc({ layers: "not-array" }))).toBe(
      false
    );
  });

  it("returns false when activeLayerId is not a string", () => {
    expect(
      isSketchDocumentLike(makeSketchDoc({ activeLayerId: 123 }))
    ).toBe(false);
  });

  it("returns false for null", () => {
    expect(isSketchDocumentLike(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isSketchDocumentLike(undefined)).toBe(false);
  });

  it("returns false for a primitive", () => {
    expect(isSketchDocumentLike("string")).toBe(false);
  });
});

describe("unwrapSketchDocumentCandidate", () => {
  it("returns a sketch-document-like value as-is", () => {
    const doc = makeSketchDoc();
    expect(unwrapSketchDocumentCandidate(doc)).toBe(doc);
  });

  it("unwraps .document envelope", () => {
    const doc = makeSketchDoc();
    const wrapped = { document: doc };
    expect(unwrapSketchDocumentCandidate(wrapped)).toBe(doc);
  });

  it("unwraps .sketch envelope", () => {
    const doc = makeSketchDoc();
    const wrapped = { sketch: doc };
    expect(unwrapSketchDocumentCandidate(wrapped)).toBe(doc);
  });

  it("unwraps {type:'sketch', data} envelope", () => {
    const doc = makeSketchDoc();
    const wrapped = { type: "sketch", data: doc };
    expect(unwrapSketchDocumentCandidate(wrapped)).toBe(doc);
  });

  it("unwraps nested envelopes", () => {
    const doc = makeSketchDoc();
    const wrapped = { document: { sketch: doc } };
    expect(unwrapSketchDocumentCandidate(wrapped)).toBe(doc);
  });

  it("stops unwrapping beyond depth 4", () => {
    const deep = {
      document: {
        document: {
          document: {
            document: { document: { document: makeSketchDoc() } }
          }
        }
      }
    };
    const result = unwrapSketchDocumentCandidate(deep);
    expect(isSketchDocumentLike(result)).toBe(false);
  });

  it("returns non-record values as-is", () => {
    expect(unwrapSketchDocumentCandidate(null)).toBeNull();
    expect(unwrapSketchDocumentCandidate(undefined)).toBeUndefined();
    expect(unwrapSketchDocumentCandidate("string")).toBe("string");
    expect(unwrapSketchDocumentCandidate(42)).toBe(42);
  });

  it("returns value as-is when no known envelope key exists", () => {
    const obj = { unknown: "data" };
    expect(unwrapSketchDocumentCandidate(obj)).toBe(obj);
  });
});

describe("resolveSketchDocument", () => {
  beforeEach(() => {
    mockFromPersisted.mockClear();
    mockFromPersisted.mockImplementation((candidate: unknown) => ({
      document: candidate
    }));
  });

  it("resolves a valid sketch document", () => {
    const doc = makeSketchDoc();
    const result = resolveSketchDocument(doc);
    expect(result).toBe(doc);
    expect(mockFromPersisted).toHaveBeenCalledWith(doc);
  });

  it("resolves through envelope wrappers", () => {
    const doc = makeSketchDoc();
    const wrapped = { document: doc };
    const result = resolveSketchDocument(wrapped);
    expect(result).toBe(doc);
  });

  it("returns null for non-sketch values", () => {
    expect(resolveSketchDocument({ foo: "bar" })).toBeNull();
    expect(resolveSketchDocument(null)).toBeNull();
    expect(resolveSketchDocument(42)).toBeNull();
  });

  it("returns null when fromPersistedSketchEditorState throws", () => {
    mockFromPersisted.mockImplementation(() => {
      throw new Error("parse error");
    });
    const doc = makeSketchDoc();
    expect(resolveSketchDocument(doc)).toBeNull();
  });
});

describe("getTimelineId", () => {
  it("returns id when value has a non-empty string id", () => {
    expect(getTimelineId({ id: "timeline-1" })).toBe("timeline-1");
  });

  it("returns null for empty string id", () => {
    expect(getTimelineId({ id: "" })).toBeNull();
  });

  it("returns null when id is not a string", () => {
    expect(getTimelineId({ id: 42 })).toBeNull();
  });

  it("returns null for non-record values", () => {
    expect(getTimelineId(null)).toBeNull();
    expect(getTimelineId(undefined)).toBeNull();
    expect(getTimelineId("string")).toBeNull();
  });
});

describe("isTimelineSequenceLike", () => {
  it("returns true for a valid timeline sequence shape", () => {
    expect(isTimelineSequenceLike(makeTimeline())).toBe(true);
  });

  it("returns false when id is missing", () => {
    const { id: _, ...rest } = makeTimeline();
    expect(isTimelineSequenceLike(rest)).toBe(false);
  });

  it("returns false when name is not a string", () => {
    expect(isTimelineSequenceLike(makeTimeline({ name: 42 }))).toBe(false);
  });

  it("returns false when fps is not a number", () => {
    expect(isTimelineSequenceLike(makeTimeline({ fps: "30" }))).toBe(false);
  });

  it("returns false when width is not a number", () => {
    expect(isTimelineSequenceLike(makeTimeline({ width: null }))).toBe(false);
  });

  it("returns false when height is not a number", () => {
    expect(isTimelineSequenceLike(makeTimeline({ height: undefined }))).toBe(
      false
    );
  });

  it("returns false when durationMs is not a number", () => {
    expect(isTimelineSequenceLike(makeTimeline({ durationMs: "10000" }))).toBe(
      false
    );
  });

  it("returns false when tracks is not an array", () => {
    expect(isTimelineSequenceLike(makeTimeline({ tracks: {} }))).toBe(false);
  });

  it("returns false when clips is not an array", () => {
    expect(isTimelineSequenceLike(makeTimeline({ clips: null }))).toBe(false);
  });

  it("returns false when markers is not an array", () => {
    expect(isTimelineSequenceLike(makeTimeline({ markers: "none" }))).toBe(
      false
    );
  });

  it("returns false for null", () => {
    expect(isTimelineSequenceLike(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isTimelineSequenceLike(undefined)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isTimelineSequenceLike("string")).toBe(false);
    expect(isTimelineSequenceLike(42)).toBe(false);
  });
});

describe("unwrapTimelineSequenceCandidate", () => {
  it("returns a timeline-sequence-like value as-is", () => {
    const seq = makeTimeline();
    expect(unwrapTimelineSequenceCandidate(seq)).toBe(seq);
  });

  it("unwraps .sequence envelope", () => {
    const seq = makeTimeline();
    const wrapped = { sequence: seq };
    expect(unwrapTimelineSequenceCandidate(wrapped)).toBe(seq);
  });

  it("unwraps .document envelope", () => {
    const seq = makeTimeline();
    const wrapped = { document: seq };
    expect(unwrapTimelineSequenceCandidate(wrapped)).toBe(seq);
  });

  it("unwraps .timeline envelope", () => {
    const seq = makeTimeline();
    const wrapped = { timeline: seq };
    expect(unwrapTimelineSequenceCandidate(wrapped)).toBe(seq);
  });

  it("unwraps {type:'timeline', data} envelope", () => {
    const seq = makeTimeline();
    const wrapped = { type: "timeline", data: seq };
    expect(unwrapTimelineSequenceCandidate(wrapped)).toBe(seq);
  });

  it("unwraps nested envelopes", () => {
    const seq = makeTimeline();
    const wrapped = { sequence: { document: seq } };
    expect(unwrapTimelineSequenceCandidate(wrapped)).toBe(seq);
  });

  it("stops unwrapping beyond depth 4", () => {
    const deep = {
      document: {
        document: {
          document: {
            document: { document: { document: makeTimeline() } }
          }
        }
      }
    };
    const result = unwrapTimelineSequenceCandidate(deep);
    expect(isTimelineSequenceLike(result)).toBe(false);
  });

  it("returns non-record values as-is", () => {
    expect(unwrapTimelineSequenceCandidate(null)).toBeNull();
    expect(unwrapTimelineSequenceCandidate(undefined)).toBeUndefined();
    expect(unwrapTimelineSequenceCandidate("string")).toBe("string");
    expect(unwrapTimelineSequenceCandidate(42)).toBe(42);
  });

  it("returns value as-is when no known envelope key exists", () => {
    const obj = { unknown: "data" };
    expect(unwrapTimelineSequenceCandidate(obj)).toBe(obj);
  });
});

describe("resolveTimelineSequence", () => {
  it("resolves a valid timeline sequence", () => {
    const seq = makeTimeline();
    expect(resolveTimelineSequence(seq)).toBe(seq);
  });

  it("resolves through envelope wrappers", () => {
    const seq = makeTimeline();
    const wrapped = { sequence: seq };
    expect(resolveTimelineSequence(wrapped)).toBe(seq);
  });

  it("returns null for non-timeline values", () => {
    expect(resolveTimelineSequence({ foo: "bar" })).toBeNull();
    expect(resolveTimelineSequence(null)).toBeNull();
    expect(resolveTimelineSequence(42)).toBeNull();
    expect(resolveTimelineSequence(undefined)).toBeNull();
  });
});
