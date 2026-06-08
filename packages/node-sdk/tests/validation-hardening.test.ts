// @ts-nocheck
/**
 * Mutation-hardening tests for validation.ts.
 *
 * These pin the exact emptiness boundaries of the asset / model "unset"
 * checks and the precise text of formatValidationIssues — behaviour that
 * line coverage exercised but did not assert, so mutants survived.
 */
import { describe, it, expect } from "vitest";
import {
  validateNodeProperties,
  formatValidationIssues
} from "../src/validation.js";

const requiredAsset = (type = "image") => [
  { name: "field", options: { type, required: true } }
];
const modelField = () => [
  { name: "field", options: { type: "language_model" } }
];

const validateAsset = (value: unknown) =>
  validateNodeProperties(requiredAsset(), { field: value });
const validateModel = (value: unknown) =>
  validateNodeProperties(modelField(), { field: value });

describe("required asset emptiness boundaries", () => {
  it("accepts an asset with a non-empty uri", () => {
    expect(validateAsset({ uri: "https://x/y.png" })).toEqual([]);
  });
  it("flags an asset whose uri is the empty string", () => {
    expect(validateAsset({ uri: "" })).toHaveLength(1);
  });
  it("accepts an asset identified only by asset_id", () => {
    expect(validateAsset({ asset_id: "abc" })).toEqual([]);
  });
  it("flags an asset whose asset_id is the empty string", () => {
    expect(validateAsset({ asset_id: "" })).toHaveLength(1);
  });
  it("accepts an asset identified only by temp_id", () => {
    expect(validateAsset({ temp_id: "t-1" })).toEqual([]);
  });
  it("flags an asset whose temp_id is the empty string", () => {
    expect(validateAsset({ temp_id: "" })).toHaveLength(1);
  });
  it("accepts an asset carrying inline string data", () => {
    expect(validateAsset({ data: "ZGF0YQ==" })).toEqual([]);
  });
  it("flags an asset whose inline data is an empty string", () => {
    expect(validateAsset({ data: "" })).toHaveLength(1);
  });
  it("flags an asset whose inline data is an empty array", () => {
    expect(validateAsset({ data: [] })).toHaveLength(1);
  });
  it("accepts an asset whose inline data is a non-empty array", () => {
    expect(validateAsset({ data: [1, 2, 3] })).toEqual([]);
  });
  it("accepts an asset whose inline data is a non-null object", () => {
    expect(validateAsset({ data: { 0: 255 } })).toEqual([]);
  });
  it("flags a null asset value", () => {
    expect(validateAsset(null)).toHaveLength(1);
  });
  it("treats a non-object asset value as set (not flagged)", () => {
    // isUnsetAsset returns false for non-objects, so a scalar is accepted.
    expect(validateAsset(42)).toEqual([]);
  });
  it("flags an empty placeholder asset with the asset-specific message", () => {
    const issues = validateAsset({
      type: "image",
      uri: "",
      asset_id: null,
      data: null
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe(
      'Property "field" requires a image (asset, uri, or inline data)'
    );
  });
});

describe("model field emptiness boundaries", () => {
  it("flags a null model value", () => {
    expect(validateModel(null)).toHaveLength(1);
  });
  it("treats a non-object model value as set (not flagged)", () => {
    expect(validateModel("gpt")).toEqual([]);
  });
  it("flags a model with no provider", () => {
    expect(validateModel({ id: "gpt-5" })).toHaveLength(1);
  });
  it("flags a model whose provider is the empty sentinel", () => {
    expect(validateModel({ provider: "empty", id: "gpt-5" })).toHaveLength(1);
  });
  it("flags a model with a provider but no id", () => {
    expect(validateModel({ provider: "openai" })).toHaveLength(1);
  });
  it("flags a model whose id is the empty string", () => {
    expect(validateModel({ provider: "openai", id: "" })).toHaveLength(1);
  });
  it("accepts a fully-selected model", () => {
    expect(validateModel({ provider: "openai", id: "gpt-5" })).toEqual([]);
  });

  it("treats a non-string id (empty array) as set, not empty", () => {
    // Pins that the id empty-string check is string-guarded: an array id with
    // length 0 must NOT be flagged as an unselected model.
    expect(validateModel({ provider: "openai", id: [] })).toEqual([]);
  });
  it("uses the model-specific message naming the type", () => {
    const issues = validateModel({ provider: "empty", id: "" });
    expect(issues[0].message).toBe(
      'Property "field" requires a language_model to be selected (provider and model id)'
    );
  });
});

describe("type guards and emptiness for non-asset fields", () => {
  it("treats an empty-typed field as neither asset nor model", () => {
    // isAssetType("") and isModelType("") are false, so an object value is not
    // flagged (kills the guards' return-true mutants).
    expect(
      validateNodeProperties([{ name: "f", options: { type: "", required: true } }], {
        f: {}
      })
    ).toEqual([]);
  });

  it("flags an empty required array and accepts a non-empty one", () => {
    const decl = [{ name: "tags", options: { type: "list[str]", required: true } }];
    expect(validateNodeProperties(decl, { tags: [] })).toHaveLength(1);
    expect(validateNodeProperties(decl, { tags: ["a"] })).toEqual([]);
  });

  it("does not treat a non-empty scalar (number) as empty", () => {
    const decl = [{ name: "n", options: { type: "int", required: true } }];
    expect(validateNodeProperties(decl, { n: 0 })).toEqual([]);
    expect(validateNodeProperties(decl, { n: 5 })).toEqual([]);
  });

  it("accepts an asset whose data is a non-empty base64 string and flags empty", () => {
    const decl = [{ name: "img", options: { type: "image", required: true } }];
    expect(validateNodeProperties(decl, { img: { data: "QQ==" } })).toEqual([]);
    expect(validateNodeProperties(decl, { img: { data: "" } })).toHaveLength(1);
  });

  it("skips fields named in an array of connected handles", () => {
    const decl = [{ name: "f", options: { type: "str", required: true } }];
    // f is missing but connected via an upstream edge (passed as an array).
    expect(
      validateNodeProperties(decl, {}, { connectedHandles: ["f"] })
    ).toEqual([]);
    // a Set works identically.
    expect(
      validateNodeProperties(decl, {}, { connectedHandles: new Set(["f"]) })
    ).toEqual([]);
  });
});

describe("formatValidationIssues text", () => {
  it("returns an empty string for no issues", () => {
    expect(formatValidationIssues([])).toBe("");
  });
  it("includes node id and type when both are present", () => {
    const out = formatValidationIssues([
      { property: "x", message: "bad", nodeId: "n1", nodeType: "pkg.Node" }
    ]);
    expect(out).toBe(
      'Graph validation failed with 1 issue(s):\n  - bad on node "n1" (pkg.Node)'
    );
  });
  it("includes node id alone when type is missing", () => {
    const out = formatValidationIssues([
      { property: "x", message: "bad", nodeId: "n1" }
    ]);
    expect(out).toBe(
      'Graph validation failed with 1 issue(s):\n  - bad on node "n1"'
    );
  });
  it("includes node type alone when id is missing", () => {
    const out = formatValidationIssues([
      { property: "x", message: "bad", nodeType: "pkg.Node" }
    ]);
    expect(out).toBe(
      "Graph validation failed with 1 issue(s):\n  - bad on pkg.Node"
    );
  });
  it("omits the location suffix when neither id nor type is present", () => {
    const out = formatValidationIssues([{ property: "x", message: "bad" }]);
    expect(out).toBe("Graph validation failed with 1 issue(s):\n  - bad");
  });
  it("counts every issue in the header", () => {
    const out = formatValidationIssues([
      { property: "a", message: "m1" },
      { property: "b", message: "m2" }
    ]);
    expect(out).toContain("with 2 issue(s):");
    expect(out).toBe(
      "Graph validation failed with 2 issue(s):\n  - m1\n  - m2"
    );
  });
});
