/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import {
  setSketchAgentHandler,
  type SketchAgentHandler,
  type SketchLayerNode,
  type SketchSnapshot
} from "../../../components/sketch/sketchAgentBridge";
import "../builtin/sketch";
import { frontendToolContext, manifestParameters } from "../../../test-utils/frontendToolDoubles";

const DOC = "doc-1";

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
  paintStrokes: jest.fn(),
  resizeCanvas: jest.fn(),
  setSelection: jest.fn(),
  fill: jest.fn(),
  gradient: jest.fn(),
  drawShape: jest.fn(),
  setSelectionShape: jest.fn(),
  transform: jest.fn(),
  adjustLayer: jest.fn(),
  crop: jest.fn(),
  pickColor: jest.fn(),
  getLayerImage: jest.fn(),
  renderLayerToAsset: jest.fn(),
  renderLayersToAssets: jest.fn()
});

// The sketch tools never touch the workflow state, so a bare stub satisfies ctx.
const ctx = frontendToolContext();

afterEach(() => {
  setSketchAgentHandler(DOC, null);
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
        "ui_sketch_fill",
        "ui_sketch_gradient",
        "ui_sketch_draw_shape",
        "ui_sketch_set_selection_shape",
        "ui_sketch_transform",
        "ui_sketch_adjust_layer",
        "ui_sketch_crop",
        "ui_sketch_pick_color",
        "ui_sketch_get_layer_image",
        "ui_sketch_render_to_asset"
      ])
    );
  });

  it("exposes set_layer_props schema with target and sketch_id required", () => {
    const schema = manifestParameters("ui_sketch_set_layer_props");
    expect(schema.type).toBe("object");
    expect(schema.properties).toHaveProperty("target");
    expect(schema.required).toContain("target");
    expect(schema.properties).toHaveProperty("sketch_id");
    expect(schema.required).toContain("sketch_id");
  });

  it("rejects with a descriptive error when the document is not open", async () => {
    await expect(
      FrontendToolRegistry.call(
        "ui_sketch_get_state",
        { sketch_id: "missing-doc" },
        "sk-1",
        ctx
      )
    ).rejects.toThrow('No image document "missing-doc" is open');
  });

  it("lists the open document ids when the requested one is absent", async () => {
    setSketchAgentHandler(DOC, createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_sketch_get_state",
        { sketch_id: "other" },
        "sk-1b",
        ctx
      )
    ).rejects.toThrow("Open documents: doc-1.");
  });

  it("returns the document snapshot through the handler", async () => {
    const handler = createMockHandler();
    handler.getSnapshot.mockReturnValue(snapshot());
    setSketchAgentHandler(DOC, handler);

    const result = await FrontendToolRegistry.call(
      "ui_sketch_get_state",
      { sketch_id: DOC },
      "sk-2",
      ctx
    );

    expect(handler.getSnapshot).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.layers).toHaveLength(1);
    expect(result.width).toBe(1024);
  });

  it("adds a layer with a fill color", async () => {
    const handler = createMockHandler();
    handler.addLayer.mockReturnValue(layerNode({ name: "Sky" }));
    setSketchAgentHandler(DOC, handler);

    const result = await FrontendToolRegistry.call(
      "ui_sketch_add_layer",
      { sketch_id: DOC, name: "Sky", fillColor: "#001133" },
      "sk-3",
      ctx
    );

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
    setSketchAgentHandler(DOC, handler);

    const result = await FrontendToolRegistry.call(
      "ui_sketch_generate",
      {
        sketch_id: DOC,
        kind: "text-to-image",
        prompt: "a mountain landscape",
        provider: "fal",
        model: "some-image-model"
      },
      "sk-4",
      ctx
    );

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
    setSketchAgentHandler(DOC, createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_sketch_generate",
        { sketch_id: DOC, kind: "text-to-hologram", prompt: "x" },
        "sk-5",
        ctx
      )
    ).rejects.toThrow();
  });

  it("forwards layer prop patches to the handler", async () => {
    const handler = createMockHandler();
    handler.setLayerProps.mockReturnValue(layerNode({ opacity: 0.5 }));
    setSketchAgentHandler(DOC, handler);

    await FrontendToolRegistry.call(
      "ui_sketch_set_layer_props",
      { sketch_id: DOC, target: "active", opacity: 0.5, blendMode: "multiply" },
      "sk-6",
      ctx
    );

    expect(handler.setLayerProps).toHaveBeenCalledWith("active", {
      opacity: 0.5,
      blendMode: "multiply"
    });
  });

  it("rejects an out-of-range opacity during validation", async () => {
    setSketchAgentHandler(DOC, createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_sketch_set_layer_props",
        { sketch_id: DOC, target: "active", opacity: 5 },
        "sk-7",
        ctx
      )
    ).rejects.toThrow();
  });

  it("sets foreground and background color through the handler", async () => {
    const handler = createMockHandler();
    handler.setForegroundColor.mockReturnValue("#ff0000");
    handler.setBackgroundColor.mockReturnValue("#0000ff");
    setSketchAgentHandler(DOC, handler);

    const result = await FrontendToolRegistry.call(
      "ui_sketch_set_color",
      { sketch_id: DOC, foreground: "#ff0000", background: "#0000ff" },
      "sk-8",
      ctx
    );

    expect(handler.setForegroundColor).toHaveBeenCalledWith("#ff0000");
    expect(handler.setBackgroundColor).toHaveBeenCalledWith("#0000ff");
    expect(result.foreground).toBe("#ff0000");
    expect(result.background).toBe("#0000ff");
  });

  it("rejects an unknown tool during validation", async () => {
    setSketchAgentHandler(DOC, createMockHandler());
    await expect(
      FrontendToolRegistry.call(
        "ui_sketch_set_tool",
        { sketch_id: DOC, tool: "teleport" },
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
    setSketchAgentHandler(DOC, handler);

    const result = await FrontendToolRegistry.call(
      "ui_sketch_get_layer_image",
      { sketch_id: DOC },
      "sk-10",
      ctx
    );

    expect(handler.getLayerImage).toHaveBeenCalledWith(null);
    // Pixels ride image_content, which the server swaps for a temp-asset
    // handle. A raw dataUrl here would land base64 in the model's context.
    expect(result).not.toHaveProperty("dataUrl");
    expect(result.image_content).toEqual({
      uri: "data:image/png;base64,abc",
      mimeType: "image/png"
    });
    expect(result.width).toBe(1024);
    expect(result.height).toBe(1024);
  });

  it("reads a single layer and labels it in the note", async () => {
    const handler = createMockHandler();
    handler.getLayerImage.mockResolvedValue({
      layerId: "layer-2",
      layerName: "Sky",
      width: 512,
      height: 512,
      dataUrl: "data:image/png;base64,xyz"
    });
    setSketchAgentHandler(DOC, handler);

    const result = await FrontendToolRegistry.call(
      "ui_sketch_get_layer_image",
      { sketch_id: DOC, target: "Sky" },
      "sk-10b",
      ctx
    );

    expect(handler.getLayerImage).toHaveBeenCalledWith("Sky");
    expect(result).not.toHaveProperty("dataUrl");
    expect(result.note).toContain("Sky");
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
    setSketchAgentHandler(DOC, handler);

    const result = await FrontendToolRegistry.call(
      "ui_sketch_render_to_asset",
      { sketch_id: DOC },
      "sk-12",
      ctx
    );

    expect(handler.renderLayerToAsset).toHaveBeenCalledWith(null, undefined);
    expect(result.assets[0].assetId).toBe("asset-9");
    expect(result.assets[0].url).toBe("asset://asset-9");
  });

  it("renders multiple layers, each to its own asset", async () => {
    const handler = createMockHandler();
    handler.renderLayersToAssets.mockResolvedValue([
      {
        assetId: "asset-a",
        url: "asset://asset-a.png",
        width: 1024,
        height: 1024,
        layerId: "layer-1",
        layerName: "Sky"
      },
      {
        assetId: "asset-b",
        url: "asset://asset-b.png",
        width: 1024,
        height: 1024,
        layerId: "layer-2",
        layerName: "Hills"
      }
    ]);
    setSketchAgentHandler(DOC, handler);

    const result = await FrontendToolRegistry.call(
      "ui_sketch_render_to_asset",
      { sketch_id: DOC, targets: ["Sky", "Hills"] },
      "sk-multi",
      ctx
    );

    expect(handler.renderLayersToAssets).toHaveBeenCalledWith(["Sky", "Hills"], {
      merge: undefined,
      name: undefined
    });
    expect(handler.renderLayerToAsset).not.toHaveBeenCalled();
    expect(result.assets.map((a) => a.assetId)).toEqual(["asset-a", "asset-b"]);
  });

  it("merges multiple layers into a single asset", async () => {
    const handler = createMockHandler();
    handler.renderLayersToAssets.mockResolvedValue([
      {
        assetId: "asset-merged",
        url: "asset://asset-merged.png",
        width: 1024,
        height: 1024,
        layerId: null,
        layerName: null
      }
    ]);
    setSketchAgentHandler(DOC, handler);

    const result = await FrontendToolRegistry.call(
      "ui_sketch_render_to_asset",
      { sketch_id: DOC, targets: ["Sky", "Hills"], merge: true, name: "scene" },
      "sk-merge",
      ctx
    );

    expect(handler.renderLayersToAssets).toHaveBeenCalledWith(["Sky", "Hills"], {
      merge: true,
      name: "scene"
    });
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].assetId).toBe("asset-merged");
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
    setSketchAgentHandler(DOC, handler);

    const result = await FrontendToolRegistry.call(
      "ui_sketch_render_to_asset",
      { sketch_id: DOC, target: "Sky", name: "sky-export" },
      "sk-13",
      ctx
    );

    expect(handler.renderLayerToAsset).toHaveBeenCalledWith("Sky", "sky-export");
    expect(result.assets[0].assetId).toBe("asset-10");
  });

  it("resizes the canvas through the handler", async () => {
    const handler = createMockHandler();
    handler.resizeCanvas.mockReturnValue({ width: 512, height: 768 });
    setSketchAgentHandler(DOC, handler);

    const result = await FrontendToolRegistry.call(
      "ui_sketch_resize_canvas",
      { sketch_id: DOC, width: 512, height: 768 },
      "sk-11",
      ctx
    );

    expect(handler.resizeCanvas).toHaveBeenCalledWith(512, 768);
    expect(result.width).toBe(512);
    expect(result.height).toBe(768);
  });

  it("forwards flood fill to the handler", async () => {
    const handler = createMockHandler();
    handler.fill.mockResolvedValue({
      layerId: "layer-1",
      layerName: "Layer 1",
      x: 4,
      y: 6,
      color: "#ff0000"
    });
    setSketchAgentHandler(DOC, handler);

    await FrontendToolRegistry.call(
      "ui_sketch_fill",
      { sketch_id: DOC, x: 4, y: 6, color: "#ff0000", tolerance: 8 },
      "sk-fill",
      ctx
    );

    expect(handler.fill).toHaveBeenCalledWith({
      target: undefined,
      x: 4,
      y: 6,
      color: "#ff0000",
      tolerance: 8,
      contiguous: undefined
    });
  });

  it("forwards pick_color to the handler", async () => {
    const handler = createMockHandler();
    handler.pickColor.mockResolvedValue({
      x: 1,
      y: 2,
      color: "#112233",
      rgba: { r: 17, g: 34, b: 51, a: 255 }
    });
    setSketchAgentHandler(DOC, handler);

    const result = await FrontendToolRegistry.call(
      "ui_sketch_pick_color",
      { sketch_id: DOC, x: 1, y: 2 },
      "sk-pick",
      ctx
    );

    expect(handler.pickColor).toHaveBeenCalledWith({
      target: undefined,
      x: 1,
      y: 2
    });
    expect(result.color).toBe("#112233");
  });
});
