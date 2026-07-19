import {
  setScriptAgentHandler,
  hasScriptAgentHandler,
  getScriptAgentHandler
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
  sendToTimeline: jest.fn()
});

describe("scriptAgentBridge", () => {
  afterEach(() => {
    setScriptAgentHandler(null);
  });

  describe("hasScriptAgentHandler", () => {
    it("returns false when no handler is registered", () => {
      expect(hasScriptAgentHandler()).toBe(false);
    });

    it("returns true after a handler is registered", () => {
      setScriptAgentHandler(makeMockHandler());
      expect(hasScriptAgentHandler()).toBe(true);
    });

    it("returns false after handler is cleared", () => {
      setScriptAgentHandler(makeMockHandler());
      setScriptAgentHandler(null);
      expect(hasScriptAgentHandler()).toBe(false);
    });
  });

  describe("getScriptAgentHandler", () => {
    it("throws when no handler is registered", () => {
      expect(() => getScriptAgentHandler()).toThrow("No script is open.");
    });

    it("returns the registered handler", () => {
      const handler = makeMockHandler();
      setScriptAgentHandler(handler);
      expect(getScriptAgentHandler()).toBe(handler);
    });

    it("returns the most recently registered handler", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setScriptAgentHandler(first);
      setScriptAgentHandler(second);
      expect(getScriptAgentHandler()).toBe(second);
    });
  });
});
