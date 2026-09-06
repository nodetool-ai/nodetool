/**
 * The image flow's contract on the sketch document (PRD § 10.5, § 10.7).
 *
 * Criterion 2's first half lives here: a document with no `setup` still
 * parses, and reads as the plain editor. The rest of the file pins what the
 * flow persists, because a stripped field is the failure that never throws —
 * it survives in memory and disappears on the next autosave.
 */

import { describe, it, expect } from "vitest";
import {
  IMAGE_USE_CASES,
  buildRefineBriefPrompt,
  composeImagePrompt,
  findImageUseCase,
  imageDocumentData,
  layerWorkflowBinding,
  parseRefinedBrief,
  sketchDocumentLike,
  sketchSetup,
  sketchSetupStage
} from "../src/api-schemas/sketch.js";

const minimalSketch = {
  version: 1,
  canvas: { width: 1024, height: 1024 },
  layers: [],
  activeLayerId: "l1"
};

describe("sketch.sketchSetup", () => {
  it("defaults an empty setup to the plain editor", () => {
    const parsed = sketchSetup.parse({});
    expect(parsed.stage).toBe("done");
    expect(parsed.brief).toBe("");
  });

  it("round trips every stage", () => {
    for (const stage of sketchSetupStage.options) {
      expect(sketchSetup.parse({ stage }).stage).toBe(stage);
    }
  });

  it("keeps the refined brief's five fields", () => {
    const parsed = sketchSetup.parse({
      stage: "review",
      brief: "a pour-over dripper",
      use_case: "product",
      variations: 4,
      refined: {
        subject: "a ceramic dripper",
        composition: "centred on seamless white",
        lighting: "soft window light from the left",
        style_words: "product photography, 85mm",
        negative: "hands, text"
      }
    });
    expect(parsed.refined).toEqual({
      subject: "a ceramic dripper",
      composition: "centred on seamless white",
      lighting: "soft window light from the left",
      style_words: "product photography, 85mm",
      negative: "hands, text"
    });
    expect(parsed.variations).toBe(4);
  });
});

describe("sketch.sketchDocumentLike with setup", () => {
  // Criterion 2: a document made before the flow existed must still parse.
  it("accepts a document with no setup at all", () => {
    const result = sketchDocumentLike.safeParse(minimalSketch);
    expect(result.success).toBe(true);
    expect(result.success && result.data.setup).toBeUndefined();
  });

  it("keeps setup through an imageDocumentData round trip", () => {
    const result = imageDocumentData.safeParse({
      sketch: {
        ...minimalSketch,
        setup: { stage: "look", brief: "a violinist backstage", variations: 2 }
      },
      layerBindings: []
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.sketch.setup).toEqual({
      stage: "look",
      brief: "a violinist backstage",
      variations: 2
    });
  });

  it("rejects a stage the flow cannot resume at", () => {
    const result = sketchDocumentLike.safeParse({
      ...minimalSketch,
      setup: { stage: "rendering" }
    });
    expect(result.success).toBe(false);
  });
});

describe("sketch.layerWorkflowBinding seed", () => {
  it("keeps the seed a variation was rendered with", () => {
    const parsed = layerWorkflowBinding.parse({
      layerId: "l1",
      kind: "text-to-image",
      prompt: "a dripper",
      seed: 4242,
      status: "generated",
      versions: []
    });
    expect(parsed.seed).toBe(4242);
  });

  it("still accepts a binding with no seed", () => {
    const parsed = layerWorkflowBinding.parse({
      layerId: "l1",
      status: "draft",
      versions: []
    });
    expect(parsed.seed).toBeUndefined();
  });
});

describe("image use cases", () => {
  it("ships the seven the flow offers", () => {
    expect(IMAGE_USE_CASES.map((useCase) => useCase.id)).toEqual([
      "product",
      "portrait",
      "key-art",
      "social",
      "logo",
      "concept",
      "texture"
    ]);
  });

  it("gives every use case a size, a ratio, guidance and a count", () => {
    for (const useCase of IMAGE_USE_CASES) {
      expect(useCase.defaultSize.width).toBeGreaterThan(0);
      expect(useCase.defaultSize.height).toBeGreaterThan(0);
      expect(useCase.defaultAspectRatio).toMatch(/^\d+:\d+$/);
      expect(useCase.composition.length).toBeGreaterThan(20);
      expect(useCase.defaultVariations).toBeGreaterThan(0);
    }
  });

  it("resolves by id and refuses an unknown one", () => {
    expect(findImageUseCase("logo")?.title).toBe("Logo");
    expect(findImageUseCase("mural")).toBeUndefined();
    expect(findImageUseCase(undefined)).toBeUndefined();
  });
});

describe("buildRefineBriefPrompt", () => {
  it("carries the brief alone when no use case is picked", () => {
    const prompt = buildRefineBriefPrompt("a red bicycle");
    expect(prompt).toContain("a red bicycle");
    expect(prompt).not.toContain("This is a");
  });

  it("adds the use case's composition guidance", () => {
    const prompt = buildRefineBriefPrompt("a red bicycle", "product");
    expect(prompt).toContain("This is a product shot.");
    expect(prompt).toContain("seamless background");
  });
});

describe("parseRefinedBrief", () => {
  it("reads the five fields and trims them", () => {
    expect(
      parseRefinedBrief({
        subject: "  a dripper ",
        composition: "centred",
        lighting: "soft",
        style_words: "85mm",
        negative: ""
      })
    ).toEqual({
      subject: "a dripper",
      composition: "centred",
      lighting: "soft",
      style_words: "85mm",
      negative: ""
    });
  });

  it("treats an answer with neither subject nor composition as no answer", () => {
    expect(parseRefinedBrief({ lighting: "soft" })).toBeNull();
    expect(parseRefinedBrief(null)).toBeNull();
    expect(parseRefinedBrief("subject")).toBeNull();
  });
});

describe("composeImagePrompt", () => {
  it("prefers the reviewed fields over the raw brief", () => {
    const prompt = composeImagePrompt({
      brief: "a bike",
      refined: {
        subject: "a red touring bicycle",
        composition: "three-quarter view",
        lighting: "overcast",
        style_words: "editorial photography",
        negative: "riders"
      }
    });
    expect(prompt).toBe(
      "a red touring bicycle. three-quarter view. overcast. editorial photography. Avoid: riders"
    );
  });

  it("falls back to the brief before it has been refined", () => {
    expect(composeImagePrompt({ brief: "a bike" })).toBe("a bike");
  });

  it("appends the style descriptor after the brief's own words", () => {
    const prompt = composeImagePrompt(
      { brief: "a bike" },
      "high-contrast monochrome, hard shadows"
    );
    expect(prompt).toBe("a bike. high-contrast monochrome, hard shadows");
  });

  it("answers empty for a document with no setup", () => {
    expect(composeImagePrompt(undefined)).toBe("");
  });
});
