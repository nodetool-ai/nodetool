import {
  getDynamicInputLabel,
  isContentCardNode
} from "./contentCardRegistry";
import type { NodeMetadata, OutputSlot } from "../../stores/ApiTypes";

const mediaOutput = (kind: string): OutputSlot =>
  ({
    name: "output",
    type: { type: kind }
  }) as unknown as OutputSlot;

const meta = (
  node_type: string,
  outputKind: string = "any",
  body?: string
): NodeMetadata =>
  ({
    node_type,
    namespace: node_type.split(".").slice(0, -1).join("."),
    outputs: [mediaOutput(outputKind)],
    ...(body ? { body } : {})
  }) as unknown as NodeMetadata;

describe("isContentCardNode", () => {
  it("returns false for undefined metadata", () => {
    expect(isContentCardNode(undefined)).toBe(false);
  });

  it("is driven solely by metadata.body === 'content_card'", () => {
    expect(
      isContentCardNode(
        meta("nodetool.image.TextToImage", "image", "content_card")
      )
    ).toBe(true);
    // Any namespace opts in via body — there is no name/namespace matching.
    expect(
      isContentCardNode(meta("comfy.image.SomeModel", "image", "content_card"))
    ).toBe(true);
    expect(
      isContentCardNode(meta("some.pkg.Whatever", "dict", "content_card"))
    ).toBe(true);
  });

  it("returns false when body is absent (no node_type matching)", () => {
    // Node types the old heuristics matched no longer match without body.
    expect(isContentCardNode(meta("nodetool.image.TextToImage", "image"))).toBe(
      false
    );
    expect(isContentCardNode(meta("some.pkg.TextToImage", "image"))).toBe(false);
    expect(isContentCardNode(meta("fal.image_to_image.X", "image"))).toBe(false);
  });

  it("ignores body values other than content_card", () => {
    expect(
      isContentCardNode(meta("some.util.Node", "dict", "default"))
    ).toBe(false);
  });

  it("returns false for metadata missing node_type", () => {
    expect(isContentCardNode({} as unknown as NodeMetadata)).toBe(false);
  });
});

describe("getDynamicInputLabel", () => {
  it("returns 'variable' for prompt/template nodes", () => {
    expect(getDynamicInputLabel(meta("nodetool.agents.Agent"))).toBe(
      "variable"
    );
    expect(getDynamicInputLabel(meta("nodetool.text.Concat"))).toBe(
      "variable"
    );
  });

  it("derives label from primary-output variant", () => {
    expect(getDynamicInputLabel(meta("foo.bar.X", "image"))).toBe("image input");
    expect(getDynamicInputLabel(meta("foo.bar.X", "video"))).toBe("video input");
    expect(getDynamicInputLabel(meta("foo.bar.X", "audio"))).toBe("audio input");
    expect(getDynamicInputLabel(meta("foo.bar.X", "str"))).toBe("text input");
  });

  it("falls back to 'input' for generic outputs", () => {
    expect(getDynamicInputLabel(meta("foo.bar.X", "dict"))).toBe("input");
  });
});
