/** @jest-environment node */

import {
  isContentCardNode,
  getPrimaryOutput,
  getContentCardVariant,
  getContentCardDefaultSize,
  getDynamicInputLabel,
  CONTENT_CARD_SIZES,
  type ContentCardVariant
} from "../contentCardRegistry";
import type { NodeMetadata, OutputSlot } from "../../../stores/ApiTypes";

function mockMetadata(overrides: Partial<NodeMetadata>): NodeMetadata {
  return {
    node_type: "",
    title: "",
    namespace: "",
    description: "",
    layout: "default",
    properties: [],
    outputs: [],
    recommended_models: [],
    required_settings: [],
    supports_dynamic_inputs: false,
    is_streaming_output: false,
    supports_dynamic_outputs: false,
    ...overrides
  } as NodeMetadata;
}

function mockOutputSlot(typeName: string, name = "output"): OutputSlot {
  return {
    name,
    type: { type: typeName, optional: false, type_args: [] },
    stream: false
  };
}

describe("isContentCardNode", () => {
  it("returns false for undefined metadata", () => {
    expect(isContentCardNode(undefined)).toBe(false);
  });

  it("returns true when metadata.body === 'content_card' (any output type)", () => {
    expect(
      isContentCardNode(
        mockMetadata({
          node_type: "nodetool.image.TextToImage",
          body: "content_card"
        })
      )
    ).toBe(true);
    // Any namespace opts in via body alone — no name/namespace matching.
    expect(
      isContentCardNode(mockMetadata({ node_type: "fal.SomeModel", body: "content_card" }))
    ).toBe(true);
    // Opt-in carries non-image content too (video/audio/text/3D generators).
    expect(
      isContentCardNode(
        mockMetadata({
          node_type: "fal.SomeVideoModel",
          body: "content_card",
          outputs: [mockOutputSlot("video")]
        })
      )
    ).toBe(true);
  });

  it("returns true for any image-output node, even without the body opt-in", () => {
    // Every image-producing node gets the content-forward image body.
    expect(
      isContentCardNode(
        mockMetadata({
          node_type: "fal.SomeModel",
          outputs: [mockOutputSlot("image")]
        })
      )
    ).toBe(true);
    // Masks count as images (rendered on a checker).
    expect(
      isContentCardNode(
        mockMetadata({
          node_type: "some.MaskNode",
          outputs: [mockOutputSlot("image_mask")]
        })
      )
    ).toBe(true);
  });

  it("returns false for non-image nodes without the body opt-in", () => {
    // No output type matching beyond image — name/namespace heuristics are gone.
    expect(
      isContentCardNode(mockMetadata({ node_type: "nodetool.image.TextToImage" }))
    ).toBe(false);
    expect(isContentCardNode(mockMetadata({ node_type: "custom.TextToImage" }))).toBe(
      false
    );
    expect(
      isContentCardNode(
        mockMetadata({
          node_type: "some.VideoModel",
          outputs: [mockOutputSlot("video")]
        })
      )
    ).toBe(false);
    expect(
      isContentCardNode(mockMetadata({ node_type: "nodetool.math.Add", body: "default" }))
    ).toBe(false);
  });

  it("returns false for body values other than content_card", () => {
    expect(
      isContentCardNode(mockMetadata({ node_type: "nodetool.math.Add", body: "default" }))
    ).toBe(false);
  });
});

describe("getPrimaryOutput", () => {
  it("returns undefined when no outputs", () => {
    const metadata = mockMetadata({ node_type: "test", outputs: [] });
    expect(getPrimaryOutput(metadata)).toBeUndefined();
  });

  it("returns first output when no primary_output field", () => {
    const first = mockOutputSlot("image", "a");
    const second = mockOutputSlot("text", "b");
    const metadata = mockMetadata({
      node_type: "test",
      outputs: [first, second]
    });
    expect(getPrimaryOutput(metadata)).toEqual(first);
  });

  it("returns named output when primary_output matches", () => {
    const first = mockOutputSlot("image", "a");
    const second = mockOutputSlot("text", "b");
    const metadata = mockMetadata({
      node_type: "test",
      outputs: [first, second],
      primary_output: "b"
    } as Partial<NodeMetadata>);
    expect(getPrimaryOutput(metadata)).toEqual(second);
  });
});

describe("getContentCardVariant", () => {
  it("returns generic for undefined output", () => {
    expect(getContentCardVariant(undefined)).toBe("generic");
  });

  it("returns image for type image", () => {
    expect(getContentCardVariant(mockOutputSlot("image", "o"))).toBe("image");
  });

  it("returns image_mask for type image_mask", () => {
    expect(getContentCardVariant(mockOutputSlot("image_mask", "o"))).toBe("image_mask");
  });

  it("returns image_mask for type mask", () => {
    expect(getContentCardVariant(mockOutputSlot("mask", "o"))).toBe("image_mask");
  });

  it("returns video for type video", () => {
    expect(getContentCardVariant(mockOutputSlot("video", "o"))).toBe("video");
  });

  it("returns audio for type audio", () => {
    expect(getContentCardVariant(mockOutputSlot("audio", "o"))).toBe("audio");
  });

  it("returns text for type str", () => {
    expect(getContentCardVariant(mockOutputSlot("str", "o"))).toBe("text");
  });

  it("returns text for type text", () => {
    expect(getContentCardVariant(mockOutputSlot("text", "o"))).toBe("text");
  });

  it("returns model_3d for type model_3d", () => {
    expect(getContentCardVariant(mockOutputSlot("model_3d", "o"))).toBe("model_3d");
  });

  it("returns model_3d for type asset_3d", () => {
    expect(getContentCardVariant(mockOutputSlot("asset_3d", "o"))).toBe("model_3d");
  });

  it("returns generic for unknown type", () => {
    expect(getContentCardVariant(mockOutputSlot("tensor", "o"))).toBe("generic");
  });
});

describe("getContentCardDefaultSize", () => {
  it("returns correct size for image variant", () => {
    const metadata = mockMetadata({
      node_type: "test",
      outputs: [mockOutputSlot("image")]
    });
    expect(getContentCardDefaultSize(metadata)).toEqual(
      CONTENT_CARD_SIZES.image
    );
  });

  it("returns correct size for video variant", () => {
    const metadata = mockMetadata({
      node_type: "test",
      outputs: [mockOutputSlot("video")]
    });
    expect(getContentCardDefaultSize(metadata)).toEqual(
      CONTENT_CARD_SIZES.video
    );
  });

  it("returns correct size for audio variant", () => {
    const metadata = mockMetadata({
      node_type: "test",
      outputs: [mockOutputSlot("audio")]
    });
    expect(getContentCardDefaultSize(metadata)).toEqual(
      CONTENT_CARD_SIZES.audio
    );
  });
});

describe("getDynamicInputLabel", () => {
  it("returns variable for prompt template nodes", () => {
    expect(
      getDynamicInputLabel(mockMetadata({ node_type: "nodetool.agents.Agent" }))
    ).toBe("variable");
  });

  it("returns image input for image-output nodes", () => {
    const metadata = mockMetadata({
      node_type: "some.ImageNode",
      outputs: [mockOutputSlot("image")]
    });
    expect(getDynamicInputLabel(metadata)).toBe("image input");
  });

  it("returns input for generic/unknown", () => {
    const metadata = mockMetadata({
      node_type: "some.Node",
      outputs: [mockOutputSlot("tensor")]
    });
    expect(getDynamicInputLabel(metadata)).toBe("input");
  });
});

describe("CONTENT_CARD_SIZES", () => {
  it("has entries for all variants", () => {
    const expected: ContentCardVariant[] = [
      "image",
      "image_mask",
      "video",
      "text",
      "audio",
      "model_3d",
      "generic"
    ];
    for (const key of expected) {
      expect(CONTENT_CARD_SIZES).toHaveProperty(key);
      expect(CONTENT_CARD_SIZES[key]).toHaveProperty("width");
      expect(CONTENT_CARD_SIZES[key]).toHaveProperty("height");
    }
  });
});
