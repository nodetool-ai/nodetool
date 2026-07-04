import { describe, it, expect } from "vitest";
import {
  buildImageModels,
  imageConstraints,
  sizeEnumToAspect
} from "../../src/providers/manifest-models.js";

describe("sizeEnumToAspect", () => {
  it("maps named FAL image_size enums onto aspect ratios", () => {
    expect(sizeEnumToAspect("landscape_16_9")).toBe("16:9");
    expect(sizeEnumToAspect("portrait_4_3")).toBe("3:4");
    expect(sizeEnumToAspect("square_hd")).toBe("1:1");
    expect(sizeEnumToAspect("landscape_3_2")).toBe("3:2");
  });

  it("maps explicit WxH sizes onto aspect ratios", () => {
    expect(sizeEnumToAspect("1024x1536")).toBe("2:3");
  });

  it("returns undefined for auto sizes and unknown values", () => {
    expect(sizeEnumToAspect("auto_4K")).toBeUndefined();
    expect(sizeEnumToAspect("garbage")).toBeUndefined();
  });
});

describe("imageConstraints", () => {
  it("derives aspect ratios from an image_size enum (source order, deduped)", () => {
    const constraints = imageConstraints({
      endpointId: "vendor/img-size",
      className: "ImgSize",
      outputType: "image",
      inputFields: [
        {
          name: "image_size",
          propType: "enum",
          enumValues: [
            "square_hd",
            "landscape_16_9",
            "portrait_16_9",
            "landscape_4_3",
            "portrait_4_3"
          ]
        }
      ]
    });
    expect(constraints.aspectRatios).toEqual([
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4"
    ]);
    expect(constraints.resolutions).toBeUndefined();
  });

  it("uses an aspect_ratio enum directly when present", () => {
    const constraints = imageConstraints({
      endpointId: "vendor/aspect",
      className: "Aspect",
      outputType: "image",
      inputFields: [
        {
          name: "aspect_ratio",
          propType: "enum",
          enumValues: ["16:9", "1:1"]
        }
      ]
    });
    expect(constraints.aspectRatios).toEqual(["16:9", "1:1"]);
    expect(constraints.resolutions).toBeUndefined();
  });

  it("extracts a resolution enum verbatim", () => {
    const constraints = imageConstraints({
      endpointId: "vendor/res",
      className: "Res",
      outputType: "image",
      inputFields: [
        { name: "resolution", propType: "enum", enumValues: ["1K", "2K"] }
      ]
    });
    expect(constraints.resolutions).toEqual(["1K", "2K"]);
    expect(constraints.aspectRatios).toBeUndefined();
  });
});

describe("buildImageModels constraint propagation", () => {
  it("carries aspectRatios and resolutions onto the produced model", () => {
    const models = buildImageModels(
      [
        {
          endpointId: "vendor/img-gen",
          className: "ImgGen",
          outputType: "image",
          inputFields: [
            {
              name: "aspect_ratio",
              propType: "enum",
              enumValues: ["16:9", "1:1"]
            },
            {
              name: "resolution",
              propType: "enum",
              enumValues: ["1K", "2K"]
            }
          ]
        }
      ],
      "fal_ai"
    );
    expect(models).toHaveLength(1);
    const model = models[0] as {
      id: string;
      aspectRatios?: string[];
      resolutions?: string[];
    };
    expect(model.id).toBe("vendor/img-gen");
    expect(model.aspectRatios).toEqual(["16:9", "1:1"]);
    expect(model.resolutions).toEqual(["1K", "2K"]);
  });
});
