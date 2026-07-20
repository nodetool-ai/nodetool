/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  setSketchAgentHandler,
  type SketchAgentHandler,
  type SketchLayerNode,
  type SketchSnapshot
} from "../../../components/sketch/sketchAgentBridge";
import "../builtin/sketch";

const layerNode = (
  overrides: Partial<SketchLayerNode> = {}
): SketchLayerNode => ({
  id: "layer-1",
  name: "Layer 1",
  type: "raster",
  visible: true,
  opacity: 1,
  blendMode: "normal",
  locked: false,
  alphaLock: false,
  parentId: null,
  index: 0,
  hasBinding: false,
  ...overrides
});

const snapshot = (): SketchSnapshot => ({
  documentId: "doc-1",
  name: "Untitled",
  width: 1024,
  height: 1024,
  activeLayerId: "layer-1",
  foregroundColor: "#ffffff",
  backgroundColor: "#000000",
  activeTool: "brush",
  hasSelection: false,
  layers: [layerNode()]
});

const createMockHandler = (): jest.Mocked<SketchAgentHandler> => ({
  getSnapshot: jest.fn(),
  addLayer: jest.fn(),
  removeLayer: jest.fn(),
  duplicateLayer: jest.fn(),
  selectLayer: jest.fn(),
  setLayerProps: jest.fn(),
  reorderLayer: jest.fn(),
  mergeLayerDown: jest.fn(),
  flattenVisible: jest.fn(),
  generate: jest.fn(),
  setForegroundColor: jest.fn(),
  setBackgroundColor: jest.fn(),
  setActiveTool: jest.fn(),
  resizeCanvas: jest.fn(),
  setSelection: jest.fn(),
  getLayerImage: jest.fn(),
  renderLayerToAsset: jest.fn()
});

// The sketch tools never touch the workflow state, so a bare stub satisfies ctx.
const ctx = { getState: () => ({}) as FrontendToolState };

afterEach(() => {
  setSketchAgentHandler(null);
});

describe("ui_sketch_* tools", () => {
  it("registers all sketch tools in the manifest", () => {
    const names = FrontendToolRegistry.getManifest().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "ui_sketch_get_state",
        "ui_sketch_add_layer",
        "ui_sketch_remove_layer",
        "ui_sketch_duplicate_layer",
        "ui_sketch_select_layer",
        "ui_sketch_set_layer_props",
        "ui_sketch_reorder_layer",
        "ui_sketch_merge_down",
        "ui_sketch_flatten_visible",
        "ui_sketch_generate",
        "ui_sketch_set_color",
        "ui_sketch_set_tool",
        "ui_sketch_resize_canvas",
        "ui_sketch_selection",
        "ui_sketch_get_layer_image",
        "ui_sketch_render_to_asset"
      ])
    );
  });

  it("exposes set_layer_props schema with target required", () => {
    const tool = FrontendToolRegistry.getManifest().find(
      (t) => t.name === "ui_sketch_set_layer_props"
    );
    expect(tool).toBeDefined();
    const schema = tool?.parameters as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("target");
    expect(schema.required).toContain("target");
  });

  it("rejects with a descriptive error when no editor is open", async () => {
    await expect(
      FrontendToolRegistry.call("ui_sketch_get_state", {}, "sk-1", ctx)
    ).rejects.toThrow("No image editor is open");
  });

  it("returns the document snapshot through the handler", async () => {
    const handler = createMockHandler();
    handler.getSnapshot.mockReturnValue(snapshot());
    setSketchAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_sketch_get_state",
      {},
      "sk-2",
      ctx
    )) as { ok: boolean } & SketchSnapshot;

    expect(handler.getSnapshot).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.layers).toHaveLength(1);
    expect(result.width).toBe(1024);
  });

  it("adds a layer with a fill color", async () => {
    const handler = createMockHandler();
    handler.addLayer.mockReturnValue(layerNode({ name: "Sky" }));
    setSketchAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_sketch_add_layer",
      { name: "Sky", fillColor: "#001133" },
      "sk-3",
      ctx
    )) as { ok: boolean; layer: SketchLayerNode };

    expect(handler.addLayer).toHaveBeenCalledWith({
      name: "Sky",
      fillColor: "#001133",
      type: undefined
    });
    expect(result.layer.name).toBe("Sky");
  });

  it("generates imagery via the handler", async () => {
    const handler = createMockHandler();
    handler.generate.mockResolvedValue({
      layer: layerNode({ name: "Text-to-Image", hasBinding: true }),
      generationStarted: true
    });
    setSketchAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_sketch_generate",
      {
        kind: "text-to-image",
        prompt: "a mountain landscape",
        provider: "fal",
        model: "some-image-model"
      },
      "sk-4",
      ctx
    )) as { ok: boolean; layer: SketchLayerNode; generationStarted: boolean };

    expect(handler.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "text-to-image",
        prompt: "a mountain landscape",
        provider: "fal",
        model: "some-image-model"
      })
    );
    expect(result.generationStarted).toBe(true);
  });

  it("rejects an unknown generation kind during validation", async () => {
    setSketchAgentHandler(createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_sketch_generate",
        { kind: "text-to-hologram", prompt: "x" },
        "sk-5",
        ctx
      )
    ).rejects.toThrow();
  });

  it("forwards layer prop patches to the handler", async () => {
    const handler = createMockHandler();
    handler.setLayerProps.mockReturnValue(layerNode({ opacity: 0.5 }));
    setSketchAgentHandler(handler);

    await FrontendToolRegistry.call(
      "ui_sketch_set_layer_props",
      { target: "active", opacity: 0.5, blendMode: "multiply" },
      "sk-6",
      ctx
    );

    expect(handler.setLayerProps).toHaveBeenCalledWith("active", {
      opacity: 0.5,
      blendMode: "multiply"
    });
  });

  it("rejects an out-of-range opacity during validation", async () => {
    setSketchAgentHandler(createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_sketch_set_layer_props",
        { target: "active", opacity: 5 },
        "sk-7",
        ctx
      )
    ).rejects.toThrow();
  });

  it("sets foreground and background color through the handler", async () => {
    const handler = createMockHandler();
    handler.setForegroundColor.mockReturnValue("#ff0000");
    handler.setBackgroundColor.mockReturnValue("#0000ff");
    setSketchAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_sketch_set_color",
      { foreground: "#ff0000", background: "#0000ff" },
      "sk-8",
      ctx
    )) as { ok: boolean; foreground: string; background: string };

    expect(handler.setForegroundColor).toHaveBeenCalledWith("#ff0000");
    expect(handler.setBackgroundColor).toHaveBeenCalledWith("#0000ff");
    expect(result.foreground).toBe("#ff0000");
    expect(result.background).toBe("#0000ff");
  });

  it("rejects an unknown tool during validation", async () => {
    setSketchAgentHandler(createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_sketch_set_tool",
        { tool: "teleport" },
        "sk-9",
        ctx
      )
    ).rejects.toThrow();
  });

  it("reads the composite image when no target is given", async () => {
    const handler = createMockHandler();
    handler.getLayerImage.mockResolvedValue({
      layerId: null,
      layerName: null,
      width: 1024,
      height: 1024,
      dataUrl: "data:image/png;base64,abc"
    });
    setSketchAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_sketch_get_layer_image",
      {},
      "sk-10",
      ctx
    )) as { ok: boolean; dataUrl: string };

    expect(handler.getLayerImage).toHaveBeenCalledWith(null);
    expect(result.dataUrl).toBe("data:image/png;base64,abc");
  });

  it("renders the composite to a temporary asset", async () => {
    const handler = createMockHandler();
    handler.renderLayerToAsset.mockResolvedValue({
      assetId: "asset-9",
      url: "asset://asset-9.png",
      width: 1024,
      height: 1024,
      layerId: null,
      layerName: null
    });
    setSketchAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_sketch_render_to_asset",
      {},
      "sk-12",
      ctx
    )) as { ok: boolean; assetId: string; url: string };

    expect(handler.renderLayerToAsset).toHaveBeenCalledWith(null, undefined);
    expect(result.assetId).toBe("asset-9");
    expect(result.url).toBe("asset://asset-9.png");
  });

  it("renders a named layer to a temporary asset", async () => {
    const handler = createMockHandler();
    handler.renderLayerToAsset.mockResolvedValue({
      assetId: "asset-10",
      url: "asset://asset-10.png",
      width: 1024,
      height: 1024,
      layerId: "layer-1",
      layerName: "Sky"
    });
    setSketchAgentHandler(handler);

    await FrontendToolRegistry.call(
      "ui_sketch_render_to_asset",
      { target: "Sky", name: "sky-export" },
      "sk-13",
      ctx
    );

    expect(handler.renderLayerToAsset).toHaveBeenCalledWith("Sky", "sky-export");
  });

  it("resizes the canvas through the handler", async () => {
    const handler = createMockHandler();
    handler.resizeCanvas.mockReturnValue({ width: 512, height: 768 });
    setSketchAgentHandler(handler);

    const result = (await FrontendToolRegistry.call(
      "ui_sketch_resize_canvas",
      { width: 512, height: 768 },
      "sk-11",
      ctx
    )) as { ok: boolean; width: number; height: number };

    expect(handler.resizeCanvas).toHaveBeenCalledWith(512, 768);
    expect(result.width).toBe(512);
    expect(result.height).toBe(768);
  });
});
