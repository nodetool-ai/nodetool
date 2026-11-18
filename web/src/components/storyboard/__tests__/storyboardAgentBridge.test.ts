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
  setSetup: jest.fn(),
  direct: jest.fn(),
  setEntityIds: jest.fn(),
  addShot: jest.fn(),
  updateShot: jest.fn(),
  moveShot: jest.fn(),
  duplicateShot: jest.fn(),
  removeShot: jest.fn(),
  updateScene: jest.fn(),
  createScene: jest.fn(),
  mergeScene: jest.fn(),
  setStyle: jest.fn(),
  selectVersion: jest.fn(),
  deleteVersion: jest.fn(),
  addKeyframeVersion: jest.fn(),
  generateKeyframe: jest.fn(),
  generateClip: jest.fn(),
  reviseShot: jest.fn(),
  assembleTimeline: jest.fn(),
  extractScript: jest.fn(),
  reprojectShots: jest.fn(),
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

    it("resolves the 12-character id that get_storyboard returns", () => {
      const handler = makeMockHandler();
      setStoryboardAgentHandler("0e65dc5610e94b5e8f1a2b3c4d5e6f70", handler);
      expect(hasStoryboardAgentHandler("0e65dc5610e9")).toBe(true);
      expect(getStoryboardAgentHandler("0e65dc5610e9")).toBe(handler);
    });

    it("lists open boards by their 12-character id", () => {
      setStoryboardAgentHandler("0e65dc5610e94b5e8f1a2b3c4d5e6f70", makeMockHandler());
      expect(() => getStoryboardAgentHandler("aaaaaaaaaaaa")).toThrow(
        "Open storyboards: 0e65dc5610e9."
      );
    });

    it("refuses a prefix that matches two open boards", () => {
      setStoryboardAgentHandler("0e65dc5610e94b5e8f1a2b3c4d5e6f70", makeMockHandler());
      setStoryboardAgentHandler("0e65dc5610e9ffffffffffffffffffff", makeMockHandler());
      expect(() => getStoryboardAgentHandler("0e65dc5610e9")).toThrow(
        "Id prefix 0e65dc5610e9 matches 2 open documents"
      );
    });

    it("does not resolve a prefix shorter than 12 characters", () => {
      setStoryboardAgentHandler("0e65dc5610e94b5e8f1a2b3c4d5e6f70", makeMockHandler());
      expect(hasStoryboardAgentHandler("0e65dc5610e")).toBe(false);
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
