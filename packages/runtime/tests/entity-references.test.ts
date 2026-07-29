import { describe, it, expect } from "vitest";
import {
  applyEntityReferences,
  injectEntityDescriptors
} from "../src/providers/entity-references.js";
import { FakeProvider } from "../src/providers/fake-provider.js";
import type {
  EntityReference,
  ImageToImageParams,
  TextToImageParams
} from "../src/providers/types.js";

const model = { id: "m", name: "m", provider: "fake" };

const marta: EntityReference = {
  name: "Marta",
  descriptor: "red-haired detective in a beige trench coat"
};
const harborImage = new Uint8Array([1, 2, 3]);
const harbor: EntityReference = {
  name: "Harbor",
  descriptor: "foggy industrial harbor at night",
  image: harborImage
};

describe("injectEntityDescriptors", () => {
  it("appends a consistency block", () => {
    expect(injectEntityDescriptors("a shot", [marta])).toBe(
      "a shot\n\nConsistency references:\n- Marta: red-haired detective in a beige trench coat"
    );
  });

  it("stands alone on an empty prompt and skips descriptor-less entities", () => {
    expect(injectEntityDescriptors("", [marta])).toBe(
      "Consistency references:\n- Marta: red-haired detective in a beige trench coat"
    );
    expect(injectEntityDescriptors("a shot", [{ name: "X" }])).toBe("a shot");
  });
});

describe("applyEntityReferences", () => {
  it("expands the prompt and strips entities on textToImage", () => {
    const params: TextToImageParams = {
      model,
      prompt: "a shot",
      entities: [marta, harbor]
    };
    const [out] = applyEntityReferences("textToImage", [params]) as [
      TextToImageParams
    ];
    expect(out.prompt).toContain("Consistency references:");
    expect(out.prompt).toContain("- Harbor: foggy industrial harbor at night");
    expect(out.entities).toBeUndefined();
    // Original params untouched.
    expect(params.prompt).toBe("a shot");
    expect(params.entities).toHaveLength(2);
  });

  it("appends reference images and attributes descriptors to their image position", () => {
    const source = new Uint8Array([9]);
    const params: ImageToImageParams = {
      model,
      prompt: "restyle",
      entities: [marta, harbor]
    };
    const [images, out] = applyEntityReferences("imageToImage", [
      [source],
      params
    ]) as [Uint8Array[], ImageToImageParams];
    expect(images).toEqual([source, harborImage]);
    // Position counts the caller's source image: harbor lands at Image 2.
    expect(out.prompt).toBe(
      "restyle\n\nConsistency references:\n" +
        "- Marta: red-haired detective in a beige trench coat\n" +
        "- Image 2 (Harbor): foggy industrial harbor at night"
    );
    expect(out.entities).toBeUndefined();
  });

  it("attributes an image-only entity without a descriptor tail", () => {
    const [images, out] = applyEntityReferences("imageToImage", [
      [],
      { model, prompt: "compose", entities: [{ name: "Harbor", image: harborImage }] }
    ]) as [Uint8Array[], ImageToImageParams];
    expect(images).toEqual([harborImage]);
    expect(out.prompt).toBe(
      "compose\n\nConsistency references:\n- Image 1 (Harbor)"
    );
  });

  it("does not touch the image list on imageToVideo (text-only)", () => {
    const frame = new Uint8Array([7]);
    const args = applyEntityReferences("imageToVideo", [
      [frame],
      { model, prompt: "pan left", entities: [harbor] }
    ]);
    expect(args[0]).toEqual([frame]);
    expect((args[1] as { prompt: string }).prompt).toContain(
      "Consistency references:"
    );
  });

  it("passes through untouched without entities or on unrelated methods", () => {
    const args = [{ model, prompt: "a shot" }];
    expect(applyEntityReferences("textToImage", args)).toBe(args);
    const upscale = [new Uint8Array([1]), { model, entities: [marta] }];
    expect(applyEntityReferences("upscaleImage", upscale)).toBe(upscale);
  });

  it("applies exactly once through the provider's batch fallback", async () => {
    const seen: Array<{ images: Uint8Array[]; params: ImageToImageParams }> =
      [];
    class Probe extends FakeProvider {
      override async imageToImage(
        images: Uint8Array[],
        params: ImageToImageParams
      ): Promise<Uint8Array> {
        seen.push({ images, params });
        return new Uint8Array([0]);
      }
    }
    const provider = new Probe();
    await provider.imageToImages(
      [new Uint8Array([9])],
      { model, prompt: "restyle", entities: [harbor] },
      2
    );
    expect(seen).toHaveLength(2);
    for (const call of seen) {
      expect(call.images).toHaveLength(2);
      expect(call.params.entities).toBeUndefined();
      const block = call.params.prompt.indexOf("Consistency references:");
      expect(block).toBeGreaterThan(-1);
      expect(
        call.params.prompt.indexOf("Consistency references:", block + 1)
      ).toBe(-1);
    }
  });
});
