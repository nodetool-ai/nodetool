/**
 * Tests for SketchNode input/output data flow:
 * - Input image layer survives serialization round-trip with imageReference + locked.
 * - collectExposedLayerOutputRefs filters the per-layer output handles into the shared list.
 */

import { serializeDocument, deserializeDocument } from "../serialization";
import {
  SKETCH_OUTPUT_LAYERS_HANDLE,
  collectExposedLayerOutputRefs,
  getLayerOutputHandleName,
  sketchNodeOutputImageListTypeMetadata
} from "../../node/SketchNode/sketchNodeIO";
import {
  createDefaultDocument,
  createDefaultLayer,
  SKETCH_NODE_INPUT_IMAGE_LAYER_NAME
} from "../types";

describe("input image layer serialization", () => {
  it("strips data but preserves locked + imageReference for input layers", () => {
    const doc = createDefaultDocument();
    const inputLayer = createDefaultLayer(SKETCH_NODE_INPUT_IMAGE_LAYER_NAME, "raster");
    inputLayer.data = "data:image/png;base64,testdata";
    inputLayer.locked = true;
    inputLayer.imageReference = {
      uri: "asset://abc",
      naturalWidth: 100,
      naturalHeight: 200,
      sourceCrop: { x: 0, y: 0, width: 100, height: 100 },
      objectFit: "cover"
    };
    doc.layers = [inputLayer, ...doc.layers];

    const restored = deserializeDocument(serializeDocument(doc));

    expect(restored).not.toBeNull();
    expect(restored!.layers).toHaveLength(2);
    expect(restored!.layers[0].name).toBe(SKETCH_NODE_INPUT_IMAGE_LAYER_NAME);
    expect(restored!.layers[0].locked).toBe(true);
    // data is stripped to null for locked layers with imageReference
    expect(restored!.layers[0].data).toBeNull();
    expect(restored!.layers[0].imageReference?.uri).toBe("asset://abc");
    expect(restored!.layers[0].imageReference?.objectFit).toBe("cover");
    expect(restored!.layers[0].imageReference?.sourceCrop?.width).toBe(100);
  });
});

describe("collectExposedLayerOutputRefs", () => {
  it("collects per-layer output refs into the shared list[image] handle", () => {
    const layerOne = {
      type: "image" as const,
      uri: "data:image/png;base64,layer1",
      asset_id: null,
      data: null
    };
    const layerTwo = {
      type: "image" as const,
      uri: "data:image/png;base64,layer2",
      asset_id: null,
      data: null
    };

    const outputProps = {
      image: {
        type: "image" as const,
        uri: "data:image/png;base64,composite",
        asset_id: null,
        data: null
      },
      [getLayerOutputHandleName("Layer 1")]: layerOne,
      [getLayerOutputHandleName("Layer 2")]: layerTwo,
      [SKETCH_OUTPUT_LAYERS_HANDLE]: []
    };

    expect(collectExposedLayerOutputRefs(outputProps)).toEqual([layerOne, layerTwo]);
    expect(sketchNodeOutputImageListTypeMetadata).toEqual({
      type: "list",
      type_args: [{ type: "image", type_args: [], optional: false }],
      optional: false
    });
  });
});
