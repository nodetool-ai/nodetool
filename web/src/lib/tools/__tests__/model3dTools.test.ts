/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  setModel3DToolHandler,
  type Model3DSceneNode,
  type Model3DToolHandler
} from "../../../components/model_editor/model3DToolBridge";
import "../builtin/model3d";

const node = (overrides: Partial<Model3DSceneNode> = {}): Model3DSceneNode => ({
  uuid: "uuid-1",
  name: "Box",
  type: "Mesh",
  visible: true,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  parentUuid: null,
  ...overrides
});

const createMockHandler = (): jest.Mocked<Model3DToolHandler> => ({
  listScene: jest.fn(),
  getSelected: jest.fn(),
  addPrimitive: jest.fn(),
  selectObject: jest.fn(),
  deleteObject: jest.fn(),
  setTransform: jest.fn(),
  setVisibility: jest.fn(),
  renameObject: jest.fn(),
  setMaterialColor: jest.fn(),
  frameScene: jest.fn()
});

// The 3D tools never touch the workflow state, so a bare stub satisfies the ctx.
const ctx = { getState: () => ({}) as FrontendToolState };

afterEach(() => {
  setModel3DToolHandler(null);
});

describe("ui_3d_* tools", () => {
  it("registers all 3D tools in the manifest", () => {
    const names = FrontendToolRegistry.getManifest().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "ui_3d_list_scene",
        "ui_3d_add_object",
        "ui_3d_select_object",
        "ui_3d_delete_object",
        "ui_3d_set_transform",
        "ui_3d_set_visibility",
        "ui_3d_rename_object",
        "ui_3d_set_material_color",
        "ui_3d_frame_scene"
      ])
    );
  });

  it("rejects with a descriptive error when no editor is open", async () => {
    await expect(
      FrontendToolRegistry.call("ui_3d_list_scene", {}, "tc-1", ctx)
    ).rejects.toThrow("No 3D model editor is open");
  });

  it("adds a primitive via the bridge handler", async () => {
    const handler = createMockHandler();
    handler.addPrimitive.mockReturnValue(node({ name: "Sun" }));
    setModel3DToolHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_3d_add_object",
      { kind: "sphere", name: "Sun" },
      "tc-2",
      ctx
    )) as { ok: boolean; object: Model3DSceneNode };

    expect(handler.addPrimitive).toHaveBeenCalledWith("sphere", "Sun");
    expect(result.ok).toBe(true);
    expect(result.object.name).toBe("Sun");
  });

  it("rejects an unknown primitive kind during validation", async () => {
    setModel3DToolHandler(createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_3d_add_object",
        { kind: "pyramid" },
        "tc-3",
        ctx
      )
    ).rejects.toThrow();
  });

  it("forwards transform patches (rotation in degrees) to the handler", async () => {
    const handler = createMockHandler();
    handler.setTransform.mockReturnValue(node());
    setModel3DToolHandler(handler);

    await FrontendToolRegistry.call(
      "ui_3d_set_transform",
      { target: "Box", position: [1, 2, 3], rotation: [0, 90, 0] },
      "tc-4",
      ctx
    );

    expect(handler.setTransform).toHaveBeenCalledWith("Box", {
      position: [1, 2, 3],
      rotation: [0, 90, 0],
      scale: undefined
    });
  });

  it("lists the scene through the handler", async () => {
    const handler = createMockHandler();
    handler.listScene.mockReturnValue([node({ name: "A" }), node({ name: "B" })]);
    setModel3DToolHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_3d_list_scene",
      {},
      "tc-5",
      ctx
    )) as { ok: boolean; count: number; objects: Model3DSceneNode[] };

    expect(result.count).toBe(2);
    expect(result.objects.map((o) => o.name)).toEqual(["A", "B"]);
  });

  it("sets a material color through the handler", async () => {
    const handler = createMockHandler();
    handler.setMaterialColor.mockReturnValue(node());
    setModel3DToolHandler(handler);

    await FrontendToolRegistry.call(
      "ui_3d_set_material_color",
      { target: "Box", color: "#ff8800" },
      "tc-6",
      ctx
    );

    expect(handler.setMaterialColor).toHaveBeenCalledWith("Box", "#ff8800");
  });
});
