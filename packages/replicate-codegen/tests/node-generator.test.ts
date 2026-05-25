import { describe, it, expect } from "vitest";
import { NodeGenerator } from "../src/node-generator.js";
import type { NodeSpec, FieldDef, EnumDef } from "../src/types.js";

function makeField(overrides: Partial<FieldDef> & { name: string }): FieldDef {
  return {
    tsType: "string",
    propType: "str",
    default: "",
    description: "",
    fieldType: "input",
    required: false,
    ...overrides
  };
}

function makeSpec(overrides: Partial<NodeSpec> = {}): NodeSpec {
  return {
    endpointId:
      "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e68b3c9e1d0d8f37e2f4b09bb",
    className: "StabilityAiSdxl",
    docstring: "A text-to-image generative AI model.",
    tags: ["image", "generation", "sdxl"],
    useCases: [],
    inputFields: [makeField({ name: "prompt", propType: "str", default: "" })],
    outputType: "image",
    outputFields: [],
    enums: [],
    ...overrides
  };
}

describe("NodeGenerator.applyConfig()", () => {
  const gen = new NodeGenerator();

  it("overrides className", () => {
    const spec = makeSpec({ className: "StabilityAiSdxl" });
    const result = gen.applyConfig(spec, { className: "Sdxl" });
    expect(result.className).toBe("Sdxl");
  });

  it("overrides docstring", () => {
    const spec = makeSpec({ docstring: "Old doc" });
    const result = gen.applyConfig(spec, { docstring: "New doc" });
    expect(result.docstring).toBe("New doc");
  });

  it("overrides tags", () => {
    const spec = makeSpec({ tags: ["old"] });
    const result = gen.applyConfig(spec, { tags: ["image", "text-to-image"] });
    expect(result.tags).toEqual(["image", "text-to-image"]);
  });

  it("overrides returnType (outputType)", () => {
    const spec = makeSpec({ outputType: "str" });
    const result = gen.applyConfig(spec, { returnType: "image" });
    expect(result.outputType).toBe("image");
  });

  it("applies field override — description", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "seed",
          propType: "int",
          default: 0,
          description: "Old description"
        })
      ]
    });
    const result = gen.applyConfig(spec, {
      fieldOverrides: { seed: { description: "New description" } }
    });
    expect(result.inputFields[0].description).toBe("New description");
  });

  it("applies field override — default value", () => {
    const spec = makeSpec({
      inputFields: [makeField({ name: "seed", propType: "int", default: 0 })]
    });
    const result = gen.applyConfig(spec, {
      fieldOverrides: { seed: { default: -1 } }
    });
    expect(result.inputFields[0].default).toBe(-1);
  });

  it("applies field override — propType change", () => {
    const spec = makeSpec({
      inputFields: [
        makeField({ name: "image_path", propType: "str", default: "" })
      ]
    });
    const result = gen.applyConfig(spec, {
      fieldOverrides: { image_path: { propType: "image" } }
    });
    expect(result.inputFields[0].propType).toBe("image");
  });

  it("renames enum via enumOverrides", () => {
    const enumDef: EnumDef = {
      name: "Scheduler",
      values: [
        ["DDIM", "DDIM"],
        ["K_EULER", "K_EULER"]
      ]
    };
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "scheduler",
          propType: "enum",
          enumRef: "Scheduler",
          enumValues: ["DDIM"]
        })
      ],
      enums: [enumDef]
    });
    const result = gen.applyConfig(spec, {
      enumOverrides: { Scheduler: "SchedulerType" }
    });
    expect(result.enums[0].name).toBe("SchedulerType");
    expect(result.inputFields[0].enumRef).toBe("SchedulerType");
  });

  it("applies enumValueOverrides to rename enum keys", () => {
    const enumDef: EnumDef = {
      name: "Refine",
      values: [
        ["NO_REFINER", "no_refiner"],
        ["BASE_IMAGE_REFINER", "base_image_refiner"]
      ]
    };
    const spec = makeSpec({
      inputFields: [
        makeField({
          name: "refine",
          propType: "enum",
          enumRef: "Refine",
          enumValues: ["no_refiner", "base_image_refiner"]
        })
      ],
      enums: [enumDef]
    });
    const result = gen.applyConfig(spec, {
      enumValueOverrides: {
        Refine: { NO_REFINER: "NONE", BASE_IMAGE_REFINER: "BASE" }
      }
    });
    const keys = result.enums[0].values.map(([k]) => k);
    expect(keys).toContain("NONE");
    expect(keys).toContain("BASE");
    expect(keys).not.toContain("NO_REFINER");
  });

  it("does not mutate the original spec", () => {
    const spec = makeSpec({ className: "StabilityAiSdxl" });
    gen.applyConfig(spec, { className: "Sdxl" });
    expect(spec.className).toBe("StabilityAiSdxl");
  });

  it("does not mutate original inputFields array", () => {
    const original = makeField({
      name: "prompt",
      propType: "str",
      default: ""
    });
    const spec = makeSpec({ inputFields: [original] });
    gen.applyConfig(spec, {
      fieldOverrides: { prompt: { description: "Changed" } }
    });
    expect(original.description).toBe("");
  });
});
