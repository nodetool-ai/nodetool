import {
  setModel3DToolHandler,
  hasModel3DToolHandler,
  getModel3DToolHandler
} from "../model3DToolBridge";
import type { Model3DToolHandler } from "../model3DToolBridge";

const STUB_NODE = {
  uuid: "u1", name: "Box", type: "Mesh", visible: true,
  position: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: [1, 1, 1] as [number, number, number],
  parentUuid: null
};

const mockHandler: Model3DToolHandler = {
  listScene: () => [],
  getSelected: () => null,
  addPrimitive: () => STUB_NODE,
  selectObject: () => null,
  deleteObject: () => STUB_NODE,
  setTransform: () => STUB_NODE,
  setVisibility: () => STUB_NODE,
  renameObject: () => STUB_NODE,
  setMaterialColor: () => STUB_NODE,
  frameScene: () => {},
  captureView: () => "data:image/png;base64,fake"
};

describe("model3DToolBridge", () => {
  afterEach(() => {
    setModel3DToolHandler(null);
  });

  it("reports no handler when none is set", () => {
    expect(hasModel3DToolHandler()).toBe(false);
  });

  it("throws when getting handler while none is set", () => {
    expect(() => getModel3DToolHandler()).toThrow(
      "No 3D model editor is open"
    );
  });

  it("registers a handler", () => {
    setModel3DToolHandler(mockHandler);
    expect(hasModel3DToolHandler()).toBe(true);
  });

  it("returns the registered handler", () => {
    setModel3DToolHandler(mockHandler);
    expect(getModel3DToolHandler()).toBe(mockHandler);
  });

  it("clears the handler when set to null", () => {
    setModel3DToolHandler(mockHandler);
    expect(hasModel3DToolHandler()).toBe(true);

    setModel3DToolHandler(null);
    expect(hasModel3DToolHandler()).toBe(false);
  });

  it("replaces a previous handler", () => {
    const handler2: Model3DToolHandler = {
      ...mockHandler,
      captureView: () => "data:image/png;base64,other"
    };
    setModel3DToolHandler(mockHandler);
    setModel3DToolHandler(handler2);
    expect(getModel3DToolHandler()).toBe(handler2);
  });
});
