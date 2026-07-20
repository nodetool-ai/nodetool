import {
  setTimelineAgentHandler,
  hasTimelineAgentHandler,
  getTimelineAgentHandler,
  listOpenTimelineSequenceIds
} from "../timelineAgentBridge";
import type { TimelineAgentHandler } from "../timelineAgentBridge";

const makeMockHandler = (): TimelineAgentHandler => ({
  getSnapshot: jest.fn(),
  addTrack: jest.fn(),
  addTextClip: jest.fn(),
  addShapeClip: jest.fn(),
  generateClip: jest.fn(),
  splitClip: jest.fn(),
  trimClip: jest.fn(),
  moveClip: jest.fn(),
  deleteClip: jest.fn(),
  duplicateClip: jest.fn(),
  setClipParams: jest.fn(),
  setClipBinding: jest.fn(),
  setClipAnimations: jest.fn(),
  clearClipAnimations: jest.fn(),
  getClipFrames: jest.fn(),
  selectClip: jest.fn(),
  seek: jest.fn()
});

describe("timelineAgentBridge", () => {
  afterEach(() => {
    for (const id of listOpenTimelineSequenceIds()) {
      setTimelineAgentHandler(id, null);
    }
  });

  describe("hasTimelineAgentHandler", () => {
    it("returns false when no handler is registered for the id", () => {
      expect(hasTimelineAgentHandler("seq-1")).toBe(false);
    });

    it("returns true after a handler is registered", () => {
      setTimelineAgentHandler("seq-1", makeMockHandler());
      expect(hasTimelineAgentHandler("seq-1")).toBe(true);
    });

    it("returns false after handler is cleared", () => {
      setTimelineAgentHandler("seq-1", makeMockHandler());
      setTimelineAgentHandler("seq-1", null);
      expect(hasTimelineAgentHandler("seq-1")).toBe(false);
    });

    it("does not report other sequences as registered", () => {
      setTimelineAgentHandler("seq-1", makeMockHandler());
      expect(hasTimelineAgentHandler("seq-2")).toBe(false);
    });
  });

  describe("getTimelineAgentHandler", () => {
    it("throws and says nothing is open when no handler is registered", () => {
      expect(() => getTimelineAgentHandler("seq-1")).toThrow(
        'No timeline sequence "seq-1" is open. No timeline sequences are currently open.'
      );
    });

    it("throws and lists the open ids when the requested one is absent", () => {
      setTimelineAgentHandler("seq-a", makeMockHandler());
      setTimelineAgentHandler("seq-b", makeMockHandler());
      expect(() => getTimelineAgentHandler("seq-1")).toThrow(
        'No timeline sequence "seq-1" is open. Open sequences: seq-a, seq-b.'
      );
    });

    it("returns the handler registered for that id", () => {
      const handler = makeMockHandler();
      setTimelineAgentHandler("seq-1", handler);
      expect(getTimelineAgentHandler("seq-1")).toBe(handler);
    });

    it("keeps concurrently open sequences independently addressable", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setTimelineAgentHandler("seq-1", first);
      setTimelineAgentHandler("seq-2", second);
      expect(getTimelineAgentHandler("seq-1")).toBe(first);
      expect(getTimelineAgentHandler("seq-2")).toBe(second);
    });
  });

  describe("setTimelineAgentHandler", () => {
    it("replaces a previously registered handler for the same id", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setTimelineAgentHandler("seq-1", first);
      setTimelineAgentHandler("seq-1", second);
      expect(getTimelineAgentHandler("seq-1")).toBe(second);
    });

    it("clearing one id leaves the others registered", () => {
      setTimelineAgentHandler("seq-1", makeMockHandler());
      setTimelineAgentHandler("seq-2", makeMockHandler());
      setTimelineAgentHandler("seq-1", null);
      expect(listOpenTimelineSequenceIds()).toEqual(["seq-2"]);
    });
  });
});
