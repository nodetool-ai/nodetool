import {
  setStoryboardAgentHandler,
  hasStoryboardAgentHandler,
  getStoryboardAgentHandler
} from "../storyboardAgentBridge";
import type { StoryboardAgentHandler } from "../storyboardAgentBridge";

const makeMockHandler = (): StoryboardAgentHandler => ({
  getSnapshot: jest.fn(),
  setScreenplay: jest.fn(),
  addShot: jest.fn(),
  updateShot: jest.fn(),
  generateKeyframe: jest.fn(),
  generateClip: jest.fn(),
  reviseShot: jest.fn(),
  assembleTimeline: jest.fn(),
  selectShot: jest.fn()
});

describe("storyboardAgentBridge", () => {
  afterEach(() => {
    setStoryboardAgentHandler(null);
  });

  describe("hasStoryboardAgentHandler", () => {
    it("returns false when no handler is registered", () => {
      expect(hasStoryboardAgentHandler()).toBe(false);
    });

    it("returns true after a handler is registered", () => {
      setStoryboardAgentHandler(makeMockHandler());
      expect(hasStoryboardAgentHandler()).toBe(true);
    });

    it("returns false after handler is cleared", () => {
      setStoryboardAgentHandler(makeMockHandler());
      setStoryboardAgentHandler(null);
      expect(hasStoryboardAgentHandler()).toBe(false);
    });
  });

  describe("getStoryboardAgentHandler", () => {
    it("throws when no handler is registered", () => {
      expect(() => getStoryboardAgentHandler()).toThrow(
        "No storyboard is open."
      );
    });

    it("returns the registered handler", () => {
      const handler = makeMockHandler();
      setStoryboardAgentHandler(handler);
      expect(getStoryboardAgentHandler()).toBe(handler);
    });

    it("returns the most recently registered handler", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setStoryboardAgentHandler(first);
      setStoryboardAgentHandler(second);
      expect(getStoryboardAgentHandler()).toBe(second);
    });
  });
});
