/** @jest-environment node */

import {
  isContentCardNode,
  getPrimaryOutput,
  getContentCardVariant,
  getContentCardDefaultSize,
  getDynamicInputLabel,
  CONTENT_CARD_REGISTRY,
  CONTENT_CARD_SIZES
} from "../contentCardRegistry";

type OutputSlot = { name: string; type: { type: string } };
type TestMetadata = {
  node_type: string;
  outputs?: OutputSlot[];
  primary_output?: string;
};

describe("isContentCardNode", () => {
  it("returns false for undefined metadata", () => {
    expect(isContentCardNode(undefined)).toBe(false);
  });

  it("returns false for metadata with empty node_type", () => {
    expect(isContentCardNode({ node_type: "" } as any)).toBe(false);
  });

  it("returns true for explicit registry entries", () => {
    expect(
      isContentCardNode({ node_type: "nodetool.image.TextToImage" } as any)
    ).toBe(true);
  });

  it("returns true for generator pattern match", () => {
    expect(
      isContentCardNode({ node_type: "custom.TextToImage" } as any)
    ).toBe(true);
  });

  it("returns true for provider namespace with media output", () => {
    const metadata: TestMetadata = {
      node_type: "fal.SomeModel",
      outputs: [{ name: "output", type: { type: "image" } }]
    };
    expect(isContentCardNode(metadata as any)).toBe(true);
  });

  it("returns false for provider namespace with non-media output", () => {
    const metadata: TestMetadata = {
      node_type: "fal.SomeModel",
      outputs: [{ name: "output", type: { type: "int" } }]
    };
    expect(isContentCardNode(metadata as any)).toBe(false);
  });

  it("returns false for non-matching nodes", () => {
    expect(
      isContentCardNode({ node_type: "nodetool.math.Add" } as any)
    ).toBe(false);
  });
});

describe("getPrimaryOutput", () => {
  it("returns undefined when no outputs", () => {
    const metadata: TestMetadata = { node_type: "test", outputs: [] };
    expect(getPrimaryOutput(metadata as any)).toBeUndefined();
  });

  it("returns first output when no primary_output field", () => {
    const first: OutputSlot = { name: "a", type: { type: "image" } };
    const second: OutputSlot = { name: "b", type: { type: "text" } };
    const metadata: TestMetadata = {
      node_type: "test",
      outputs: [first, second]
    };
    expect(getPrimaryOutput(metadata as any)).toEqual(first);
  });

  it("returns named output when primary_output matches", () => {
    const first: OutputSlot = { name: "a", type: { type: "image" } };
    const second: OutputSlot = { name: "b", type: { type: "text" } };
    const metadata: TestMetadata = {
      node_type: "test",
      outputs: [first, second],
      primary_output: "b"
    };
    expect(getPrimaryOutput(metadata as any)).toEqual(second);
  });
});

describe("getContentCardVariant", () => {
  it("returns generic for undefined output", () => {
    expect(getContentCardVariant(undefined)).toBe("generic");
  });

  it("returns image for type image", () => {
    expect(
      getContentCardVariant({ name: "o", type: { type: "image" } } as any)
    ).toBe("image");
  });

  it("returns image_mask for type image_mask", () => {
    expect(
      getContentCardVariant({ name: "o", type: { type: "image_mask" } } as any)
    ).toBe("image_mask");
  });

  it("returns image_mask for type mask", () => {
    expect(
      getContentCardVariant({ name: "o", type: { type: "mask" } } as any)
    ).toBe("image_mask");
  });

  it("returns video for type video", () => {
    expect(
      getContentCardVariant({ name: "o", type: { type: "video" } } as any)
    ).toBe("video");
  });

  it("returns audio for type audio", () => {
    expect(
      getContentCardVariant({ name: "o", type: { type: "audio" } } as any)
    ).toBe("audio");
  });

  it("returns text for type str", () => {
    expect(
      getContentCardVariant({ name: "o", type: { type: "str" } } as any)
    ).toBe("text");
  });

  it("returns text for type text", () => {
    expect(
      getContentCardVariant({ name: "o", type: { type: "text" } } as any)
    ).toBe("text");
  });

  it("returns model_3d for type model_3d", () => {
    expect(
      getContentCardVariant({ name: "o", type: { type: "model_3d" } } as any)
    ).toBe("model_3d");
  });

  it("returns model_3d for type asset_3d", () => {
    expect(
      getContentCardVariant({ name: "o", type: { type: "asset_3d" } } as any)
    ).toBe("model_3d");
  });

  it("returns generic for unknown type", () => {
    expect(
      getContentCardVariant({ name: "o", type: { type: "tensor" } } as any)
    ).toBe("generic");
  });
});

describe("getContentCardDefaultSize", () => {
  it("returns correct size for image variant", () => {
    const metadata: TestMetadata = {
      node_type: "test",
      outputs: [{ name: "o", type: { type: "image" } }]
    };
    expect(getContentCardDefaultSize(metadata as any)).toEqual(
      CONTENT_CARD_SIZES.image
    );
  });

  it("returns correct size for video variant", () => {
    const metadata: TestMetadata = {
      node_type: "test",
      outputs: [{ name: "o", type: { type: "video" } }]
    };
    expect(getContentCardDefaultSize(metadata as any)).toEqual(
      CONTENT_CARD_SIZES.video
    );
  });

  it("returns correct size for audio variant", () => {
    const metadata: TestMetadata = {
      node_type: "test",
      outputs: [{ name: "o", type: { type: "audio" } }]
    };
    expect(getContentCardDefaultSize(metadata as any)).toEqual(
      CONTENT_CARD_SIZES.audio
    );
  });
});

describe("getDynamicInputLabel", () => {
  it("returns variable for prompt template nodes", () => {
    expect(
      getDynamicInputLabel({ node_type: "nodetool.agents.Agent" } as any)
    ).toBe("variable");
  });

  it("returns image input for image-output nodes", () => {
    const metadata: TestMetadata = {
      node_type: "some.ImageNode",
      outputs: [{ name: "o", type: { type: "image" } }]
    };
    expect(getDynamicInputLabel(metadata as any)).toBe("image input");
  });

  it("returns input for generic/unknown", () => {
    const metadata: TestMetadata = {
      node_type: "some.Node",
      outputs: [{ name: "o", type: { type: "tensor" } }]
    };
    expect(getDynamicInputLabel(metadata as any)).toBe("input");
  });
});

describe("CONTENT_CARD_REGISTRY", () => {
  it("is a non-empty set", () => {
    expect(CONTENT_CARD_REGISTRY.size).toBeGreaterThan(0);
  });

  it("contains known entries", () => {
    expect(CONTENT_CARD_REGISTRY.has("nodetool.image.TextToImage")).toBe(true);
    expect(CONTENT_CARD_REGISTRY.has("openai.image.CreateImage")).toBe(true);
  });
});

describe("CONTENT_CARD_SIZES", () => {
  it("has entries for all variants", () => {
    const expected = [
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
      expect(
        (CONTENT_CARD_SIZES as any)[key]
      ).toHaveProperty("width");
      expect(
        (CONTENT_CARD_SIZES as any)[key]
      ).toHaveProperty("height");
    }
  });
});
