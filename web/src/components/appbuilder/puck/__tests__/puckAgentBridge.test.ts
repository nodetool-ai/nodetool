import {
  setPuckAgentHandler,
  hasPuckAgentHandler,
  getPuckAgentHandler,
  listOpenPuckApplicationIds
} from "../puckAgentBridge";
import type { PuckAgentHandler } from "../puckAgentBridge";

const makeMockHandler = (): PuckAgentHandler => ({
  getSnapshot: jest.fn(),
  listComponentTypes: jest.fn(),
  addComponent: jest.fn(),
  updateComponent: jest.fn(),
  removeComponent: jest.fn(),
  selectComponent: jest.fn(),
  setRootProps: jest.fn(),
  listOperations: jest.fn(),
  addOperation: jest.fn(),
  updateOperation: jest.fn(),
  removeOperation: jest.fn(),
  listVariables: jest.fn(),
  declareVariable: jest.fn(),
  updateVariable: jest.fn(),
  removeVariable: jest.fn(),
  listResources: jest.fn(),
  addResource: jest.fn(),
  updateResource: jest.fn(),
  removeResource: jest.fn(),
  getBindingTargets: jest.fn(),
  document: jest.fn(),
  applyExternalDocument: jest.fn()
});

describe("puckAgentBridge", () => {
  afterEach(() => {
    for (const id of listOpenPuckApplicationIds()) {
      setPuckAgentHandler(id, null);
    }
  });

  describe("hasPuckAgentHandler", () => {
    it("returns false when no handler is registered", () => {
      expect(hasPuckAgentHandler("app-1")).toBe(false);
    });

    it("returns true after a handler is registered", () => {
      setPuckAgentHandler("app-1", makeMockHandler());
      expect(hasPuckAgentHandler("app-1")).toBe(true);
    });

    it("returns false for a application that has no app builder open", () => {
      setPuckAgentHandler("app-1", makeMockHandler());
      expect(hasPuckAgentHandler("app-2")).toBe(false);
    });

    it("returns false after handler is cleared", () => {
      setPuckAgentHandler("app-1", makeMockHandler());
      setPuckAgentHandler("app-1", null);
      expect(hasPuckAgentHandler("app-1")).toBe(false);
    });
  });

  describe("getPuckAgentHandler", () => {
    it("throws and says nothing is open when no handler is registered", () => {
      expect(() => getPuckAgentHandler("app-1")).toThrow(
        'No app builder is open for application "app-1". No app builders are currently open.'
      );
    });

    it("lists the open ids when the requested one is missing", () => {
      setPuckAgentHandler("app-1", makeMockHandler());
      setPuckAgentHandler("app-2", makeMockHandler());
      expect(() => getPuckAgentHandler("app-3")).toThrow(
        'No app builder is open for application "app-3". Open app builders: app-1, app-2.'
      );
    });

    it("returns the handler registered for that application", () => {
      const handler = makeMockHandler();
      setPuckAgentHandler("app-1", handler);
      expect(getPuckAgentHandler("app-1")).toBe(handler);
    });

    it("keeps handlers for different applications independent", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setPuckAgentHandler("app-1", first);
      setPuckAgentHandler("app-2", second);
      expect(getPuckAgentHandler("app-1")).toBe(first);
      expect(getPuckAgentHandler("app-2")).toBe(second);
    });

    it("does not lose one app's handler when another unregisters", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setPuckAgentHandler("app-1", first);
      setPuckAgentHandler("app-2", second);
      setPuckAgentHandler("app-2", null);
      expect(getPuckAgentHandler("app-1")).toBe(first);
      expect(hasPuckAgentHandler("app-2")).toBe(false);
    });
  });

  describe("setPuckAgentHandler", () => {
    it("replaces a previously registered handler for the same application", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setPuckAgentHandler("app-1", first);
      setPuckAgentHandler("app-1", second);
      expect(getPuckAgentHandler("app-1")).toBe(second);
    });
  });

  describe("listOpenPuckApplicationIds", () => {
    it("is empty when nothing is open", () => {
      expect(listOpenPuckApplicationIds()).toEqual([]);
    });

    it("lists every open application id", () => {
      setPuckAgentHandler("app-1", makeMockHandler());
      setPuckAgentHandler("app-2", makeMockHandler());
      expect(listOpenPuckApplicationIds()).toEqual(["app-1", "app-2"]);
    });
  });
});
