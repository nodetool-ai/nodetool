import { describe, it, expect } from "vitest";
import { classifyFields, type ClassifyFieldInput } from "../src/field-classification.js";

describe("classifyFields", () => {
  it("classifies asset types as inputFields", () => {
    const fields: ClassifyFieldInput[] = [
      { name: "input_image", propType: "image" },
      { name: "clip", propType: "video" },
      { name: "track", propType: "audio" },
    ];
    const result = classifyFields(fields);
    expect(result.inputFields).toEqual(["input_image", "clip", "track"]);
    expect(result.inlineFields).toEqual([]);
  });

  it("classifies list asset types as inputFields", () => {
    const fields: ClassifyFieldInput[] = [
      { name: "images", propType: "list[image]" },
      { name: "clips", propType: "list[video]" },
      { name: "tracks", propType: "list[audio]" },
    ];
    const result = classifyFields(fields);
    expect(result.inputFields).toEqual(["images", "clips", "tracks"]);
  });

  it("classifies named text fields as inputFields", () => {
    const fields: ClassifyFieldInput[] = [
      { name: "prompt", propType: "str" },
      { name: "query", propType: "text" },
      { name: "code", propType: "str" },
      { name: "url", propType: "str" },
    ];
    const result = classifyFields(fields);
    expect(result.inputFields).toEqual(["prompt", "query", "code", "url"]);
  });

  it("does not classify arbitrary str fields as inputFields", () => {
    const fields: ClassifyFieldInput[] = [
      { name: "description", propType: "str" },
      { name: "label", propType: "str" },
    ];
    const result = classifyFields(fields);
    expect(result.inputFields).toEqual([]);
  });

  it("does not classify non-asset non-text types", () => {
    const fields: ClassifyFieldInput[] = [
      { name: "steps", propType: "int" },
      { name: "guidance", propType: "float" },
      { name: "enabled", propType: "bool" },
    ];
    const result = classifyFields(fields);
    expect(result.inputFields).toEqual([]);
    expect(result.inlineFields).toEqual([]);
  });

  it("handles empty input", () => {
    const result = classifyFields([]);
    expect(result.inputFields).toEqual([]);
    expect(result.inlineFields).toEqual([]);
  });

  it("handles mixed field types", () => {
    const fields: ClassifyFieldInput[] = [
      { name: "input_image", propType: "image" },
      { name: "prompt", propType: "str" },
      { name: "steps", propType: "int" },
      { name: "mask", propType: "image_mask" },
      { name: "description", propType: "str" },
    ];
    const result = classifyFields(fields);
    expect(result.inputFields).toEqual(["input_image", "prompt", "mask"]);
    expect(result.inlineFields).toEqual([]);
  });

  it("classifies additional asset types", () => {
    const fields: ClassifyFieldInput[] = [
      { name: "doc", propType: "document" },
      { name: "table", propType: "dataframe" },
      { name: "data", propType: "tensor" },
      { name: "mesh", propType: "model_3d" },
      { name: "vids", propType: "video_clip_list" },
    ];
    const result = classifyFields(fields);
    expect(result.inputFields).toEqual(["doc", "table", "data", "mesh", "vids"]);
  });

  it("classifies all recognized inline text field names", () => {
    const names = ["prompt", "system_prompt", "query", "text", "template", "code", "expression", "url"];
    const fields: ClassifyFieldInput[] = names.map(name => ({
      name,
      propType: "str",
    }));
    const result = classifyFields(fields);
    expect(result.inputFields).toEqual(names);
  });
});
