import {
  setStoryboardAgentHandler,
  hasStoryboardAgentHandler,
  getStoryboardAgentHandler,
  listOpenStoryboardIds
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
    for (const id of listOpenStoryboardIds()) {
      setStoryboardAgentHandler(id, null);
    }
  });

  describe("hasStoryboardAgentHandler", () => {
    it("returns false when no handler is registered for the id", () => {
      expect(hasStoryboardAgentHandler("board-1")).toBe(false);
    });

    it("returns true after a handler is registered", () => {
      setStoryboardAgentHandler("board-1", makeMockHandler());
      expect(hasStoryboardAgentHandler("board-1")).toBe(true);
    });

    it("returns false for a different id", () => {
      setStoryboardAgentHandler("board-1", makeMockHandler());
      expect(hasStoryboardAgentHandler("board-2")).toBe(false);
    });

    it("returns false after the handler is cleared", () => {
      setStoryboardAgentHandler("board-1", makeMockHandler());
      setStoryboardAgentHandler("board-1", null);
      expect(hasStoryboardAgentHandler("board-1")).toBe(false);
    });
  });

  describe("getStoryboardAgentHandler", () => {
    it("throws and says nothing is open when the registry is empty", () => {
      expect(() => getStoryboardAgentHandler("abc")).toThrow(
        'No storyboard "abc" is open. No storyboards are currently open.'
      );
    });

    it("throws and lists the open ids when the id is unknown", () => {
      setStoryboardAgentHandler("def", makeMockHandler());
      setStoryboardAgentHandler("ghi", makeMockHandler());
      expect(() => getStoryboardAgentHandler("abc")).toThrow(
        'No storyboard "abc" is open. Open storyboards: def, ghi.'
      );
    });

    it("returns the handler registered under the id", () => {
      const handler = makeMockHandler();
      setStoryboardAgentHandler("board-1", handler);
      expect(getStoryboardAgentHandler("board-1")).toBe(handler);
    });

    it("keeps unfocused boards addressable alongside each other", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setStoryboardAgentHandler("board-1", first);
      setStoryboardAgentHandler("board-2", second);
      expect(getStoryboardAgentHandler("board-1")).toBe(first);
      expect(getStoryboardAgentHandler("board-2")).toBe(second);
      expect(listOpenStoryboardIds()).toEqual(["board-1", "board-2"]);
    });

    it("replaces the handler when the same id re-registers", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setStoryboardAgentHandler("board-1", first);
      setStoryboardAgentHandler("board-1", second);
      expect(getStoryboardAgentHandler("board-1")).toBe(second);
    });
  });
});
