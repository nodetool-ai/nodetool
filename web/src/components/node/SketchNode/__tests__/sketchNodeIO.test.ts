import {
  getLayerInputHandleName,
  getLayerOutputHandleName,
  parseLayerInputHandleName,
  collectExposedLayerOutputRefs,
  SKETCH_OUTPUT_LAYERS_HANDLE,
  sketchNodeOutputImageTypeMetadata,
  sketchNodeOutputImageListTypeMetadata
} from "../sketchNodeIO";

describe("sketchNodeIO", () => {
  describe("getLayerInputHandleName", () => {
    it("prefixes the layer name", () => {
      expect(getLayerInputHandleName("Background")).toBe("layer_in_Background");
    });

    it("handles empty string", () => {
      expect(getLayerInputHandleName("")).toBe("layer_in_");
    });
  });

  describe("getLayerOutputHandleName", () => {
    it("prefixes the layer name", () => {
      expect(getLayerOutputHandleName("Layer 1")).toBe("layer_out_Layer 1");
    });

    it("handles empty string", () => {
      expect(getLayerOutputHandleName("")).toBe("layer_out_");
    });
  });

  describe("parseLayerInputHandleName", () => {
    it("extracts the layer name from a valid handle", () => {
      expect(parseLayerInputHandleName("layer_in_Background")).toBe(
        "Background"
      );
    });

    it("returns null for non-prefixed handles", () => {
      expect(parseLayerInputHandleName("layer_out_Background")).toBeNull();
    });

    it("returns null for null input", () => {
      expect(parseLayerInputHandleName(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(parseLayerInputHandleName(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseLayerInputHandleName("")).toBeNull();
    });

    it("returns null when only the prefix is present", () => {
      expect(parseLayerInputHandleName("layer_in_")).toBeNull();
    });

    it("round-trips with getLayerInputHandleName", () => {
      const name = "My Layer";
      expect(parseLayerInputHandleName(getLayerInputHandleName(name))).toBe(
        name
      );
    });
  });

  describe("collectExposedLayerOutputRefs", () => {
    const validRef = {
      type: "image" as const,
      uri: "https://example.com/img.png",
      asset_id: "asset-1",
      data: null
    };

    it("collects valid image refs from layer_out_ keys", () => {
      const props = {
        layer_out_Background: validRef,
        layer_out_Overlay: { ...validRef, asset_id: null }
      };
      const result = collectExposedLayerOutputRefs(props);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(validRef);
    });

    it("ignores non-layer_out_ keys", () => {
      const props = {
        layer_out_A: validRef,
        some_other_key: validRef,
        layer_in_B: validRef
      };
      expect(collectExposedLayerOutputRefs(props)).toHaveLength(1);
    });

    it("skips entries that are not valid image refs", () => {
      const props = {
        layer_out_A: validRef,
        layer_out_B: { type: "video", uri: "x" },
        layer_out_C: "not-an-object",
        layer_out_D: null
      };
      expect(collectExposedLayerOutputRefs(props)).toHaveLength(1);
    });

    it("returns empty array for empty props", () => {
      expect(collectExposedLayerOutputRefs({})).toHaveLength(0);
    });
  });

  describe("constants", () => {
    it("exports SKETCH_OUTPUT_LAYERS_HANDLE", () => {
      expect(SKETCH_OUTPUT_LAYERS_HANDLE).toBe("layers");
    });

    it("exports image type metadata", () => {
      expect(sketchNodeOutputImageTypeMetadata.type).toBe("image");
      expect(sketchNodeOutputImageTypeMetadata.optional).toBe(false);
    });

    it("exports image list type metadata wrapping image type", () => {
      expect(sketchNodeOutputImageListTypeMetadata.type).toBe("list");
      expect(sketchNodeOutputImageListTypeMetadata.type_args).toEqual([
        sketchNodeOutputImageTypeMetadata
      ]);
    });
  });
});
