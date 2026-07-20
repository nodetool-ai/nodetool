import {
  setScriptAgentHandler,
  hasScriptAgentHandler,
  getScriptAgentHandler,
  listOpenScriptIds
} from "../scriptAgentBridge";
import type { ScriptAgentHandler } from "../scriptAgentBridge";

const makeMockHandler = (): ScriptAgentHandler => ({
  getSnapshot: jest.fn(),
  addSpeaker: jest.fn(),
  setSpeakerVoice: jest.fn(),
  addLine: jest.fn(),
  setLineText: jest.fn(),
  setLineSpeaker: jest.fn(),
  voiceLine: jest.fn(),
  voiceAll: jest.fn(),
  sendToTimeline: jest.fn(),
  exportSubtitles: jest.fn()
});

describe("scriptAgentBridge", () => {
  afterEach(() => {
    for (const id of listOpenScriptIds()) {
      setScriptAgentHandler(id, null);
    }
  });

  describe("hasScriptAgentHandler", () => {
    it("returns false when no handler is registered for the id", () => {
      expect(hasScriptAgentHandler("script-1")).toBe(false);
    });

    it("returns true after a handler is registered", () => {
      setScriptAgentHandler("script-1", makeMockHandler());
      expect(hasScriptAgentHandler("script-1")).toBe(true);
    });

    it("returns false for a different id", () => {
      setScriptAgentHandler("script-1", makeMockHandler());
      expect(hasScriptAgentHandler("script-2")).toBe(false);
    });

    it("returns false after the handler is cleared", () => {
      setScriptAgentHandler("script-1", makeMockHandler());
      setScriptAgentHandler("script-1", null);
      expect(hasScriptAgentHandler("script-1")).toBe(false);
    });
  });

  describe("getScriptAgentHandler", () => {
    it("throws and says nothing is open when the registry is empty", () => {
      expect(() => getScriptAgentHandler("abc")).toThrow(
        'No script "abc" is open. No scripts are currently open.'
      );
    });

    it("throws and lists the open ids when the id is unknown", () => {
      setScriptAgentHandler("def", makeMockHandler());
      setScriptAgentHandler("ghi", makeMockHandler());
      expect(() => getScriptAgentHandler("abc")).toThrow(
        'No script "abc" is open. Open scripts: def, ghi.'
      );
    });

    it("returns the handler registered under the id", () => {
      const handler = makeMockHandler();
      setScriptAgentHandler("script-1", handler);
      expect(getScriptAgentHandler("script-1")).toBe(handler);
    });

    it("keeps unfocused scripts addressable alongside each other", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setScriptAgentHandler("script-1", first);
      setScriptAgentHandler("script-2", second);
      expect(getScriptAgentHandler("script-1")).toBe(first);
      expect(getScriptAgentHandler("script-2")).toBe(second);
      expect(listOpenScriptIds()).toEqual(["script-1", "script-2"]);
    });

    it("replaces the handler when the same id re-registers", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setScriptAgentHandler("script-1", first);
      setScriptAgentHandler("script-1", second);
      expect(getScriptAgentHandler("script-1")).toBe(second);
    });
  });
});
