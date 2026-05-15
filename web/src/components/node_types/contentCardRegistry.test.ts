import {
  CONTENT_CARD_REGISTRY,
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
  outputKind: string = "any"
): NodeMetadata =>
  ({
    node_type,
    namespace: node_type.split(".").slice(0, -1).join("."),
    outputs: [mediaOutput(outputKind)]
  }) as unknown as NodeMetadata;

describe("isContentCardNode", () => {
  it("returns false for undefined metadata", () => {
    expect(isContentCardNode(undefined)).toBe(false);
  });

  it("returns false for utility nodes", () => {
    expect(isContentCardNode(meta("nodetool.control.If"))).toBe(false);
    expect(isContentCardNode(meta("nodetool.control.Loop"))).toBe(false);
    expect(isContentCardNode(meta("nodetool.constant.String", "str"))).toBe(
      false
    );
  });

  it("matches explicit registry entries", () => {
    for (const t of CONTENT_CARD_REGISTRY) {
      expect(isContentCardNode(meta(t))).toBe(true);
    }
  });

  it("matches conventional generator name patterns in any namespace", () => {
    expect(isContentCardNode(meta("some.pkg.TextToImage"))).toBe(true);
    expect(isContentCardNode(meta("some.pkg.ImageToImage"))).toBe(true);
    expect(isContentCardNode(meta("some.pkg.TextToVideo"))).toBe(true);
    expect(isContentCardNode(meta("some.pkg.ImageToVideo"))).toBe(true);
    expect(isContentCardNode(meta("some.pkg.TextToAudio"))).toBe(true);
    expect(isContentCardNode(meta("some.pkg.TextTo3D"))).toBe(true);
    expect(isContentCardNode(meta("some.pkg.CreateImage"))).toBe(true);
    expect(isContentCardNode(meta("some.pkg.ImageGeneration"))).toBe(true);
  });

  it("does not match generator-shaped names embedded in longer words", () => {
    expect(isContentCardNode(meta("foo.TextToImagePromptBuilder"))).toBe(false);
  });

  it("matches fal.* / replicate.* / kie.* nodes with media output", () => {
    expect(isContentCardNode(meta("fal.image_to_image.Ultrashape", "image"))).toBe(
      true
    );
    expect(
      isContentCardNode(meta("replicate.video.SomeModel", "video"))
    ).toBe(true);
    expect(isContentCardNode(meta("kie.audio.SomeModel", "audio"))).toBe(true);
    expect(
      isContentCardNode(meta("fal.threed.MeshyV5Retexture", "model_3d"))
    ).toBe(true);
  });

  it("does not match fal/replicate/kie nodes with non-media outputs", () => {
    expect(isContentCardNode(meta("fal.misc.SomeUtil", "dict"))).toBe(false);
    expect(isContentCardNode(meta("replicate.text.Summarize", "str"))).toBe(
      false
    );
    expect(isContentCardNode(meta("kie.misc.Util", "any"))).toBe(false);
  });

  it("does not match arbitrary third-party namespaces", () => {
    expect(
      isContentCardNode(meta("comfy.image.SomeModel", "image"))
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
