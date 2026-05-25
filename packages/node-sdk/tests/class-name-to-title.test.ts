import { describe, expect, it } from "vitest";

import { classNameToTitle } from "../src/class-name-to-title.js";

describe("classNameToTitle", () => {
  it("returns empty string for empty input", () => {
    expect(classNameToTitle("")).toBe("");
  });

  it("splits underscores as word separators", () => {
    expect(classNameToTitle("Imagen_4_Ultra")).toBe("Imagen 4 Ultra");
    expect(classNameToTitle("Imagen_4_Fast")).toBe("Imagen 4 Fast");
    expect(classNameToTitle("Ideogram_V3_Balanced")).toBe(
      "Ideogram V3 Balanced"
    );
  });

  it("joins consecutive numeric tokens with '.'", () => {
    expect(classNameToTitle("GPT_4_1_Nano")).toBe("GPT 4.1 Nano");
    expect(classNameToTitle("Veo_3_1_Lite")).toBe("Veo 3.1 Lite");
    expect(classNameToTitle("Flux_1_1_Pro_Ultra")).toBe("Flux 1.1 Pro Ultra");
    expect(classNameToTitle("Seedream_4_5")).toBe("Seedream 4.5");
    expect(classNameToTitle("Bria_Image_3_2")).toBe("Bria Image 3.2");
  });

  it("does not collapse numbers separated by a word", () => {
    expect(classNameToTitle("Flux_2_Klein_4B")).toBe("Flux 2 Klein 4B");
  });

  it("splits camelCase boundaries", () => {
    expect(classNameToTitle("StableDiffusion")).toBe("Stable Diffusion");
    expect(classNameToTitle("StickerMaker")).toBe("Sticker Maker");
  });

  it("preserves uppercase acronyms while splitting Pascal boundaries", () => {
    expect(classNameToTitle("StableDiffusionXL")).toBe("Stable Diffusion XL");
    expect(classNameToTitle("StableDiffusionXLLightning")).toBe(
      "Stable Diffusion XL Lightning"
    );
  });

  it("preserves all-uppercase tokens delimited by underscores", () => {
    expect(classNameToTitle("SDXL_Ad_Inpaint")).toBe("SDXL Ad Inpaint");
    expect(classNameToTitle("Recraft_V4_SVG")).toBe("Recraft V4 SVG");
    expect(classNameToTitle("Recraft_20B_SVG")).toBe("Recraft 20B SVG");
  });

  it("handles mixed digits-and-letters tokens like V3, 20B, 4B", () => {
    expect(classNameToTitle("Ideogram_V2A_Turbo")).toBe(
      "Ideogram V2A Turbo"
    );
    expect(classNameToTitle("Recraft_20B")).toBe("Recraft 20B");
  });

  it("handles the StableDiffusion3_5 family", () => {
    expect(classNameToTitle("StableDiffusion3_5_Medium")).toBe(
      "Stable Diffusion 3.5 Medium"
    );
    expect(classNameToTitle("StableDiffusion3_5_Large_Turbo")).toBe(
      "Stable Diffusion 3.5 Large Turbo"
    );
  });

  it("collapses repeated underscores", () => {
    expect(classNameToTitle("Foo__Bar")).toBe("Foo Bar");
  });
});
