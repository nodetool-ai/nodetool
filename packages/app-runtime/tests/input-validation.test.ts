import { describe, expect, it } from "vitest";

import {
  findWidgetLabel,
  isMissingRequiredMediaValue,
  isMissingRequiredModelValue
} from "../src/input-validation.js";

describe("required media admission", () => {
  it("rejects empty required media values", () => {
    expect(
      isMissingRequiredMediaValue("nodetool.input.ImageInput", undefined)
    ).toBe(true);
    expect(
      isMissingRequiredMediaValue("nodetool.input.VideoListInput", [])
    ).toBe(true);
  });

  it("accepts media references and leaves non-media inputs alone", () => {
    expect(
      isMissingRequiredMediaValue("nodetool.input.ImageInput", {
        asset_id: "asset-1"
      })
    ).toBe(false);
    expect(
      isMissingRequiredMediaValue("nodetool.input.StringInput", undefined)
    ).toBe(false);
  });
});

describe("required model admission", () => {
  const type = "nodetool.input.LanguageModelInput";
  const model = { type: "language_model", provider: "openai", id: "gpt", name: "GPT" };
  const unset = { type: "language_model", provider: "", id: "", name: "" };

  it("rejects an unset model when the node has no model either", () => {
    expect(isMissingRequiredModelValue(type, unset, undefined)).toBe(true);
    expect(isMissingRequiredModelValue(type, undefined, unset)).toBe(true);
    expect(isMissingRequiredModelValue(type, { ...model, id: "" }, undefined)).toBe(true);
    expect(isMissingRequiredModelValue(type, { ...model, provider: "empty" }, undefined)).toBe(true);
  });

  it("accepts a selected model and the node's own model", () => {
    expect(isMissingRequiredModelValue(type, model, undefined)).toBe(false);
    expect(isMissingRequiredModelValue(type, undefined, model)).toBe(false);
  });

  it("ignores other input types", () => {
    expect(isMissingRequiredModelValue("nodetool.input.StringInput", undefined, undefined)).toBe(false);
  });
});

describe("findWidgetLabel", () => {
  const ui = {
    root: { props: {} },
    content: [
      {
        type: "Columns",
        props: {
          id: "c",
          left: [{ type: "ModelSelect", props: { id: "m", label: "Finishing model", binding: "var:finishModel" } }]
        }
      }
    ]
  };

  it("finds the label of a nested widget by binding", () => {
    expect(findWidgetLabel(ui, "var:finishModel")).toBe("Finishing model");
    expect(findWidgetLabel(ui, "var:other")).toBeUndefined();
  });
});
