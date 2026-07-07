import {
  setPuckAgentHandler,
  hasPuckAgentHandler,
  getPuckAgentHandler
} from "../puckAgentBridge";
import type { PuckAgentHandler } from "../puckAgentBridge";

const makeMockHandler = (): PuckAgentHandler => ({
  getSnapshot: jest.fn(),
  listComponentTypes: jest.fn(),
  addComponent: jest.fn(),
  updateComponent: jest.fn(),
  removeComponent: jest.fn(),
  selectComponent: jest.fn(),
  setRootProps: jest.fn()
});

describe("puckAgentBridge", () => {
  afterEach(() => {
    setPuckAgentHandler(null);
  });

  describe("hasPuckAgentHandler", () => {
    it("returns false when no handler is registered", () => {
      expect(hasPuckAgentHandler()).toBe(false);
    });

    it("returns true after a handler is registered", () => {
      setPuckAgentHandler(makeMockHandler());
      expect(hasPuckAgentHandler()).toBe(true);
    });

    it("returns false after handler is cleared", () => {
      setPuckAgentHandler(makeMockHandler());
      setPuckAgentHandler(null);
      expect(hasPuckAgentHandler()).toBe(false);
    });
  });

  describe("getPuckAgentHandler", () => {
    it("throws when no handler is registered", () => {
      expect(() => getPuckAgentHandler()).toThrow(
        "No app builder is open"
      );
    });

    it("returns the registered handler", () => {
      const handler = makeMockHandler();
      setPuckAgentHandler(handler);
      expect(getPuckAgentHandler()).toBe(handler);
    });

    it("returns the most recently registered handler", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setPuckAgentHandler(first);
      setPuckAgentHandler(second);
      expect(getPuckAgentHandler()).toBe(second);
    });
  });

  describe("setPuckAgentHandler", () => {
    it("replaces a previously registered handler", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setPuckAgentHandler(first);
      setPuckAgentHandler(second);
      expect(getPuckAgentHandler()).not.toBe(first);
      expect(getPuckAgentHandler()).toBe(second);
    });
  });
});
