import {
  setModel3DToolHandler,
  getModel3DToolHandler
} from "../model3DToolBridge";
import type { Model3DToolHandler } from "../model3DToolBridge";

const makeMockHandler = (): Model3DToolHandler => ({
  listScene: jest.fn(),
  getSelected: jest.fn(),
  addPrimitive: jest.fn(),
  selectObject: jest.fn(),
  deleteObject: jest.fn(),
  setTransform: jest.fn(),
  setVisibility: jest.fn(),
  renameObject: jest.fn(),
  setMaterialColor: jest.fn(),
  frameScene: jest.fn(),
  captureView: jest.fn()
});

describe("model3DToolBridge", () => {
  afterEach(() => {
    setModel3DToolHandler(null);
  });

  describe("getModel3DToolHandler", () => {
    it("throws when no handler is registered", () => {
      expect(() => getModel3DToolHandler()).toThrow(
        "No 3D model editor is open"
      );
    });

    it("returns the registered handler", () => {
      const handler = makeMockHandler();
      setModel3DToolHandler(handler);
      expect(getModel3DToolHandler()).toBe(handler);
    });

    it("returns the most recently registered handler", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setModel3DToolHandler(first);
      setModel3DToolHandler(second);
      expect(getModel3DToolHandler()).toBe(second);
    });
  });

  describe("setModel3DToolHandler", () => {
    it("returns a disposer that clears its own handler", () => {
      const dispose = setModel3DToolHandler(makeMockHandler());
      dispose();
      expect(() => getModel3DToolHandler()).toThrow();
    });

    it("keeps a newer handler when an older editor disposes", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      const disposeFirst = setModel3DToolHandler(first);
      setModel3DToolHandler(second);
      disposeFirst();
      expect(getModel3DToolHandler()).toBe(second);
    });

    it("clears the handler when passed null", () => {
      setModel3DToolHandler(makeMockHandler());
      setModel3DToolHandler(null);
      expect(() => getModel3DToolHandler()).toThrow();
    });

    it("replaces a previously registered handler", () => {
      const first = makeMockHandler();
      const second = makeMockHandler();
      setModel3DToolHandler(first);
      setModel3DToolHandler(second);
      expect(getModel3DToolHandler()).not.toBe(first);
      expect(getModel3DToolHandler()).toBe(second);
    });
  });
});
