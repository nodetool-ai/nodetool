import {
  setTimelineAgentHandler,
  hasTimelineAgentHandler,
  getTimelineAgentHandler
} from "../timelineAgentBridge";
import type { TimelineAgentHandler } from "../timelineAgentBridge";

const makeMockHandler = (): TimelineAgentHandler => ({
  getSnapshot: jest.fn(),
  addTrack: jest.fn(),
  generateClip: jest.fn(),
  splitClip: jest.fn(),
  trimClip: jest.fn(),
  moveClip: jest.fn(),
  deleteClip: jest.fn(),
  duplicateClip: jest.fn(),
  setClipParams: jest.fn(),
  setClipBinding: jest.fn(),
  getClipFrames: jest.fn(),
  selectClip: jest.fn(),
  seek: jest.fn()
});

describe("timelineAgentBridge", () => {
  afterEach(() => {
    setTimelineAgentHandler(null);
  });

  describe("hasTimelineAgentHandler", () => {
    it("returns false when no handler is registered", () => {
      expect(hasTimelineAgentHandler()).toBe(false);
    });

    it("returns true after a handler is registered", () => {
      setTimelineAgentHandler(makeMockHandler());
      expect(hasTimelineAgentHandler()).toBe(true);
    });

    it("returns false after handler is cleared", () => {
      setTimelineAgentHandler(makeMockHandler());
      setTimelineAgentHandler(null);
      expect(hasTimelineAgentHandler()).toBe(false);
    });
  });

  describe("getTimelineAgentHandler", () => {
    it("throws when no handler is registered", () => {
      expect(() => getTimelineAgentHandler()).toThrow(
        "No timeline editor is open"
      );
    });

    it("returns the registered handler", () => {
      const handler = makeMockHandler();
      setTimelineAgentHandler(handler);
      expect(getTimelineAgentHandler()).toBe(handler);
    });

    it("returns the most recently registered handler", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setTimelineAgentHandler(first);
      setTimelineAgentHandler(second);
      expect(getTimelineAgentHandler()).toBe(second);
    });
  });

  describe("setTimelineAgentHandler", () => {
    it("replaces a previously registered handler", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setTimelineAgentHandler(first);
      setTimelineAgentHandler(second);
      expect(getTimelineAgentHandler()).not.toBe(first);
      expect(getTimelineAgentHandler()).toBe(second);
    });
  });
});
