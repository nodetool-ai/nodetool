import {
  setPuckAgentHandler,
  hasPuckAgentHandler,
  getPuckAgentHandler,
  listOpenPuckWorkflowIds
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
    for (const id of listOpenPuckWorkflowIds()) {
      setPuckAgentHandler(id, null);
    }
  });

  describe("hasPuckAgentHandler", () => {
    it("returns false when no handler is registered", () => {
      expect(hasPuckAgentHandler("wf-1")).toBe(false);
    });

    it("returns true after a handler is registered", () => {
      setPuckAgentHandler("wf-1", makeMockHandler());
      expect(hasPuckAgentHandler("wf-1")).toBe(true);
    });

    it("returns false for a workflow that has no app builder open", () => {
      setPuckAgentHandler("wf-1", makeMockHandler());
      expect(hasPuckAgentHandler("wf-2")).toBe(false);
    });

    it("returns false after handler is cleared", () => {
      setPuckAgentHandler("wf-1", makeMockHandler());
      setPuckAgentHandler("wf-1", null);
      expect(hasPuckAgentHandler("wf-1")).toBe(false);
    });
  });

  describe("getPuckAgentHandler", () => {
    it("throws and says nothing is open when no handler is registered", () => {
      expect(() => getPuckAgentHandler("wf-1")).toThrow(
        'No app builder is open for workflow "wf-1". No app builders are currently open.'
      );
    });

    it("lists the open ids when the requested one is missing", () => {
      setPuckAgentHandler("wf-1", makeMockHandler());
      setPuckAgentHandler("wf-2", makeMockHandler());
      expect(() => getPuckAgentHandler("wf-3")).toThrow(
        'No app builder is open for workflow "wf-3". Open app builders: wf-1, wf-2.'
      );
    });

    it("returns the handler registered for that workflow", () => {
      const handler = makeMockHandler();
      setPuckAgentHandler("wf-1", handler);
      expect(getPuckAgentHandler("wf-1")).toBe(handler);
    });

    it("keeps handlers for different workflows independent", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setPuckAgentHandler("wf-1", first);
      setPuckAgentHandler("wf-2", second);
      expect(getPuckAgentHandler("wf-1")).toBe(first);
      expect(getPuckAgentHandler("wf-2")).toBe(second);
    });

    it("does not lose one workflow's handler when another unregisters", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setPuckAgentHandler("wf-1", first);
      setPuckAgentHandler("wf-2", second);
      setPuckAgentHandler("wf-2", null);
      expect(getPuckAgentHandler("wf-1")).toBe(first);
      expect(hasPuckAgentHandler("wf-2")).toBe(false);
    });
  });

  describe("setPuckAgentHandler", () => {
    it("replaces a previously registered handler for the same workflow", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setPuckAgentHandler("wf-1", first);
      setPuckAgentHandler("wf-1", second);
      expect(getPuckAgentHandler("wf-1")).toBe(second);
    });
  });

  describe("listOpenPuckWorkflowIds", () => {
    it("is empty when nothing is open", () => {
      expect(listOpenPuckWorkflowIds()).toEqual([]);
    });

    it("lists every open workflow id", () => {
      setPuckAgentHandler("wf-1", makeMockHandler());
      setPuckAgentHandler("wf-2", makeMockHandler());
      expect(listOpenPuckWorkflowIds()).toEqual(["wf-1", "wf-2"]);
    });
  });
});
