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

  it("opts in via metadata.body === 'content_card' for any output type", () => {
    expect(
      isContentCardNode(
        meta("nodetool.image.TextToImage", "image", "content_card")
      )
    ).toBe(true);
    // Any namespace opts in via body — there is no name/namespace matching.
    expect(
      isContentCardNode(meta("lib.image.SomeModel", "image", "content_card"))
    ).toBe(true);
    // Non-media (`dict`) output still becomes a card when the body opts in.
    expect(
      isContentCardNode(meta("some.pkg.Whatever", "dict", "content_card"))
    ).toBe(true);
  });

  it("opts in any image-output node, even without the body field", () => {
    expect(isContentCardNode(meta("nodetool.image.TextToImage", "image"))).toBe(
      true
    );
    expect(isContentCardNode(meta("some.pkg.TextToImage", "image"))).toBe(true);
    expect(isContentCardNode(meta("fal.image_to_image.X", "image"))).toBe(true);
    // Masks count as images (rendered on a checker).
    expect(isContentCardNode(meta("some.pkg.MaskNode", "image_mask"))).toBe(true);
  });

  it("excludes constant nodes — they render their value via the overlay", () => {
    // `nodetool.constant.Image` already shows its image without a content card.
    expect(isContentCardNode(meta("nodetool.constant.Image", "image"))).toBe(
      false
    );
  });

  it("excludes ImageInput — it renders its editable value, not a card", () => {
    expect(isContentCardNode(meta("nodetool.input.ImageInput", "image"))).toBe(
      false
    );
  });

  it("returns false for non-image nodes without the body field", () => {
    // Node types the old heuristics matched no longer match without body, and
    // only image output (not other media) opts in implicitly.
    expect(isContentCardNode(meta("some.pkg.VideoModel", "video"))).toBe(false);
    expect(isContentCardNode(meta("some.pkg.AudioModel", "audio"))).toBe(false);
    expect(isContentCardNode(meta("some.pkg.TextModel", "str"))).toBe(false);
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
