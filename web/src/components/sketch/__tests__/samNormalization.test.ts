import * as SamServiceFal from "../sam/SamServiceFal";
import { SamServiceNode } from "../sam/SamServiceNode";
import { WebSocketNodeExecutor, setNodeExecutor } from "../sam/NodeExecutor";
import { normalizeSamMasks } from "../sam/normalizeSamMasks";
import { DEFAULT_SEGMENT_SETTINGS } from "../types";
import type { SegmentationSourceMetadata } from "../types";
import useMetadataStore from "../../../stores/MetadataStore";

const LOCAL_SAM3_NODE_TYPE = "huggingface.image_segmentation.MaskGeneration";
const LOCAL_SAM3_MODEL_ID = "facebook/sam3";

function createSourceMetadata(): SegmentationSourceMetadata {
  return {
    layerId: "layer-1",
    layerTransform: {
      x: 12,
      y: 24,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    },
    contentBounds: {
      x: -10,
      y: 6,
      width: 320,
      height: 180
    },
    canvasSize: {
      width: 1024,
      height: 768
    },
    documentOrigin: {
      x: 2,
      y: 30
    }
  };
}

describe("normalizeSamMasks", () => {
  it("normalizes ordered Local SAM3 ImageRef output into sketch masks", () => {
    const sourceMetadata = createSourceMetadata();

    const response = normalizeSamMasks({
      rawOutput: [
        { uri: "asset://mask-a.png", width: 160, height: 90 },
        { url: "https://example.com/mask-b.png", width: 80, height: 45 }
      ],
      backendId: "local-sam3",
      modelId: LOCAL_SAM3_MODEL_ID,
      nodeType: LOCAL_SAM3_NODE_TYPE,
      scale: 0.5,
      sourceMetadata
    });

    expect(response.masks).toHaveLength(2);
    expect(response.nodeType).toBe(LOCAL_SAM3_NODE_TYPE);
    expect(response.sourceMetadata).toEqual(sourceMetadata);
    expect(response.masks.map((mask) => mask.id)).toEqual(["mask_0", "mask_1"]);
    expect(response.masks.map((mask) => mask.label)).toEqual(["Mask 1", "Mask 2"]);
    expect(response.masks[0]).toMatchObject({
      kind: "mask",
      maskDataUrl: expect.stringContaining("/api/storage/mask-a.png"),
      backendId: "local-sam3",
      modelId: LOCAL_SAM3_MODEL_ID,
      nodeType: LOCAL_SAM3_NODE_TYPE,
      sourceMetadata,
      bounds: {
        x: 0,
        y: 0,
        width: 320,
        height: 180
      }
    });
    expect(response.masks[1].maskDataUrl).toBe("https://example.com/mask-b.png");
    expect(response.masks[1].bounds).toEqual({
      x: 0,
      y: 0,
      width: 160,
      height: 90
    });
  });

  it("returns a clear empty result for zero-mask outputs", () => {
    const sourceMetadata = createSourceMetadata();

    const response = normalizeSamMasks({
      rawOutput: [],
      backendId: "local-sam3",
      modelId: LOCAL_SAM3_MODEL_ID,
      nodeType: LOCAL_SAM3_NODE_TYPE,
      sourceMetadata
    });

    expect(response).toEqual({
      masks: [],
      modelId: LOCAL_SAM3_MODEL_ID,
      backendId: "local-sam3",
      nodeType: LOCAL_SAM3_NODE_TYPE,
      sourceMetadata
    });
  });

  it("returns a clear empty result for malformed outputs", () => {
    const response = normalizeSamMasks({
      rawOutput: { output: { uri: "asset://not-a-list.png" } },
      backendId: "local-sam3",
      modelId: LOCAL_SAM3_MODEL_ID,
      nodeType: LOCAL_SAM3_NODE_TYPE
    });

    expect(response).toEqual({
      masks: [],
      modelId: LOCAL_SAM3_MODEL_ID,
      backendId: "local-sam3",
      nodeType: LOCAL_SAM3_NODE_TYPE,
      sourceMetadata: undefined
    });
  });

  it("filters partial outputs while preserving valid ordering", () => {
    const sourceMetadata = createSourceMetadata();

    const response = normalizeSamMasks({
      rawOutput: {
        output: [
          { uri: "asset://first.png" },
          { invalid: true },
          { url: "https://example.com/third.png", name: "Third mask", width: 64, height: 32 }
        ]
      },
      backendId: "local-sam3",
      modelId: LOCAL_SAM3_MODEL_ID,
      nodeType: LOCAL_SAM3_NODE_TYPE,
      sourceMetadata
    });

    expect(response.masks).toHaveLength(2);
    expect(response.masks.map((mask) => mask.id)).toEqual(["mask_0", "mask_2"]);
    expect(response.masks.map((mask) => mask.label)).toEqual([
      "Mask 1",
      "Third mask"
    ]);
    expect(response.masks[0].bounds).toEqual({
      x: 0,
      y: 0,
      width: sourceMetadata.contentBounds.width,
      height: sourceMetadata.contentBounds.height
    });
    expect(response.masks[1].maskDataUrl).toBe("https://example.com/third.png");
  });
});

describe("SamServiceNode normalization", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setNodeExecutor(new WebSocketNodeExecutor());
    useMetadataStore.setState({ metadata: {} });
  });

  it("normalizes executor output independently from graph execution", async () => {
    const sourceMetadata = createSourceMetadata();
    useMetadataStore.setState({
      metadata: {
        [LOCAL_SAM3_NODE_TYPE]: {
          node_type: LOCAL_SAM3_NODE_TYPE,
          properties: [
            { name: "image" },
            { name: "model" },
            { name: "points_per_side" },
            { name: "pred_iou_thresh" }
          ]
        } as any
      }
    });
    jest.spyOn(SamServiceFal, "resizeForInference").mockResolvedValue({
      dataUrl: "data:image/png;base64,small",
      scale: 1
    });

    setNodeExecutor({
      execute: jest.fn().mockResolvedValue({
        success: true,
        outputs: {
          sam_node: [
            {
              uri: "asset://executor-mask.png",
              width: 320,
              height: 180
            }
          ]
        }
      })
    });

    const response = await new SamServiceNode("local-sam3").runSegmentation({
      imageDataUrl: "data:image/png;base64,input",
      pointPrompts: [],
      boxPrompt: null,
      settings: {
        ...DEFAULT_SEGMENT_SETTINGS,
        backend: "local-sam3",
        promptMode: "auto"
      },
      sourceMetadata
    });

    expect(response).toMatchObject({
      modelId: LOCAL_SAM3_MODEL_ID,
      backendId: "local-sam3",
      nodeType: LOCAL_SAM3_NODE_TYPE,
      sourceMetadata
    });
    expect(response.masks[0]).toMatchObject({
      kind: "mask",
      maskDataUrl: expect.stringContaining("/api/storage/executor-mask.png"),
      sourceMetadata
    });
  });
});
