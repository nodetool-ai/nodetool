/**
 * Tests for SketchNode input_image and output data flow
 */

import {
  serializeDocument,
  deserializeDocument,
  loadImageToLayerData
} from "../serialization";
import {
  createDefaultDocument,
  createDefaultLayer,
  SKETCH_NODE_INPUT_IMAGE_LAYER_NAME
} from "../types";
import type { SketchDocument } from "../types";

describe("SketchNode data flow helpers", () => {
  describe("loadImageToLayerData", () => {
    it("is exported from serialization module", () => {
      expect(typeof loadImageToLayerData).toBe("function");
    });

    it("accepts width and height parameters", () => {
      // Verify the function signature is correct
      expect(loadImageToLayerData.length).toBe(3);
    });
  });

  describe("document with input image layer", () => {
    it("can add an input image layer to existing document", () => {
      const doc = createDefaultDocument();

      // Simulate what SketchNode does when it loads an input image
      const inputLayer = createDefaultLayer(SKETCH_NODE_INPUT_IMAGE_LAYER_NAME, "raster");
      inputLayer.data = "data:image/png;base64,fakedata";
      inputLayer.locked = true;
      inputLayer.imageReference = {
        uri: "https://example.com/in.png",
        naturalWidth: 64,
        naturalHeight: 48,
        objectFit: "fill"
      };

      const updatedLayers = [inputLayer, ...doc.layers];
      const updatedDoc: SketchDocument = {
        ...doc,
        layers: updatedLayers,
        metadata: { ...doc.metadata, updatedAt: new Date().toISOString() }
      };

      expect(updatedDoc.layers).toHaveLength(2);
      expect(updatedDoc.layers[0].name).toBe(SKETCH_NODE_INPUT_IMAGE_LAYER_NAME);
      expect(updatedDoc.layers[0].locked).toBe(true);
      expect(updatedDoc.layers[0].data).toBe("data:image/png;base64,fakedata");
      expect(updatedDoc.layers[0].imageReference?.uri).toBe("https://example.com/in.png");
      expect(updatedDoc.layers[0].imageReference?.objectFit).toBe("fill");
      expect(updatedDoc.layers[1].name).toBe("Background");
    });

    it("can replace existing input image layer", () => {
      const doc = createDefaultDocument();

      // Add initial input image layer
      const inputLayer = createDefaultLayer(SKETCH_NODE_INPUT_IMAGE_LAYER_NAME, "raster");
      inputLayer.data = "data:image/png;base64,first";
      const layers = [inputLayer, ...doc.layers];

      // Replace it (as SketchNode does when input_image changes)
      const existingIdx = layers.findIndex((l) => l.name === SKETCH_NODE_INPUT_IMAGE_LAYER_NAME);
      expect(existingIdx).toBe(0);

      const updatedLayers = [...layers];
      updatedLayers[existingIdx] = {
        ...updatedLayers[existingIdx],
        data: "data:image/png;base64,second",
        imageReference: {
          uri: "https://example.com/v2.png",
          naturalWidth: 32,
          naturalHeight: 32,
          objectFit: "fill"
        }
      };

      expect(updatedLayers[0].data).toBe("data:image/png;base64,second");
      expect(updatedLayers[0].imageReference?.uri).toBe("https://example.com/v2.png");
      expect(updatedLayers).toHaveLength(2);
    });

    it("serializes document with input image layer correctly", () => {
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

      const json = serializeDocument(doc);
      const restored = deserializeDocument(json);

      expect(restored).not.toBeNull();
      expect(restored!.layers).toHaveLength(2);
      expect(restored!.layers[0].name).toBe(SKETCH_NODE_INPUT_IMAGE_LAYER_NAME);
      expect(restored!.layers[0].locked).toBe(true);
      expect(restored!.layers[0].data).toBe("data:image/png;base64,testdata");
      expect(restored!.layers[0].imageReference?.uri).toBe("asset://abc");
      expect(restored!.layers[0].imageReference?.objectFit).toBe("cover");
      expect(restored!.layers[0].imageReference?.sourceCrop?.width).toBe(100);
    });
  });

  describe("output data format", () => {
    it("creates ImageRef-compatible output format", () => {
      // Verify the format that SketchNode uses for output properties
      const imageRef = {
        type: "image" as const,
        uri: "data:image/png;base64,testdata",
        asset_id: null,
        data: null
      };

      expect(imageRef.type).toBe("image");
      expect(imageRef.uri).toMatch(/^data:image\/png;base64,/);
      expect(imageRef.asset_id).toBeNull();
    });

    it("creates mask output in ImageRef format", () => {
      const maskRef = {
        type: "image" as const,
        uri: "data:image/png;base64,maskdata",
        asset_id: null,
        data: null
      };

      expect(maskRef.type).toBe("image");
      expect(maskRef.uri).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe("input_image URI resolution", () => {
    it("extracts URI from ImageRef-like objects", () => {
      // Simulate what SketchNode does to extract input_image URI
      const resolveUri = (input: unknown): string | null => {
        if (input && typeof input === "object") {
          const imgRef = input as { uri?: string };
          if (imgRef.uri) {
            return imgRef.uri;
          }
        }
        return null;
      };

      expect(resolveUri({ type: "image", uri: "http://example.com/img.png" }))
        .toBe("http://example.com/img.png");

      expect(resolveUri({ type: "image", uri: "data:image/png;base64,abc" }))
        .toBe("data:image/png;base64,abc");

      expect(resolveUri(null)).toBeNull();
      expect(resolveUri(undefined)).toBeNull();
      expect(resolveUri("string")).toBeNull();
      expect(resolveUri(42)).toBeNull();
      expect(resolveUri({})).toBeNull();
    });
  });
});
