import { modelInfoToEndpointId } from "./falDynamicSchema";

describe("falDynamicSchema", () => {
  describe("modelInfoToEndpointId", () => {
    it("returns null for empty input", () => {
      expect(modelInfoToEndpointId("")).toBeNull();
      expect(modelInfoToEndpointId("   ")).toBeNull();
    });

    it("passes through endpoint id strings", () => {
      expect(modelInfoToEndpointId("fal-ai/flux-2/klein/4b/base/edit")).toBe(
        "fal-ai/flux-2/klein/4b/base/edit"
      );
    });

    it("trims whitespace from endpoint ids", () => {
      expect(modelInfoToEndpointId("  fal-ai/flux-lora  ")).toBe("fal-ai/flux-lora");
    });

    it("strips trailing punctuation from endpoint ids", () => {
      expect(modelInfoToEndpointId("fal-ai/flux-lora.")).toBe("fal-ai/flux-lora");
      expect(modelInfoToEndpointId("fal-ai/flux-lora)")).toBe("fal-ai/flux-lora");
      expect(modelInfoToEndpointId("fal-ai/flux-lora;")).toBe("fal-ai/flux-lora");
    });

    it("extracts endpoint from fal.ai model URL", () => {
      expect(
        modelInfoToEndpointId("https://fal.ai/models/fal-ai/flux-lora")
      ).toBe("fal-ai/flux-lora");
    });

    it("extracts endpoint from fal.ai URL with trailing slash", () => {
      expect(
        modelInfoToEndpointId("https://fal.ai/models/fal-ai/flux-lora/")
      ).toBe("fal-ai/flux-lora");
    });

    it("returns null for non-fal HTTP URLs", () => {
      expect(
        modelInfoToEndpointId("https://example.com/models/something")
      ).toBeNull();
    });

    it("returns null for fal URLs without /models/ path", () => {
      expect(
        modelInfoToEndpointId("https://fal.ai/pricing")
      ).toBeNull();
    });

    it("returns null for plain text that is not an endpoint id", () => {
      expect(modelInfoToEndpointId("some random text here")).toBeNull();
    });

    it("returns null for JSON input", () => {
      expect(modelInfoToEndpointId('{"openapi":"3.0.0"}')).toBeNull();
    });
  });
});
