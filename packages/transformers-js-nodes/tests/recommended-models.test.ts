import { describe, expect, it } from "vitest";
import {
  defaultRepoFor,
  recommendedFor,
  TJS_MODEL_TYPES
} from "../src/recommended-models.js";
import { TRANSFORMERS_JS_NODES } from "../src/index.js";

describe("recommended-models registry", () => {
  it("covers every node's model prop type", () => {
    const nodeTypes = new Set<string>();
    for (const cls of TRANSFORMERS_JS_NODES) {
      const props = cls.getDeclaredProperties();
      const model = props.find((p) => p.name === "model");
      expect(model, `${cls.nodeType} has no model prop`).toBeDefined();
      nodeTypes.add(model!.options.type);
    }
    for (const type of nodeTypes) {
      expect(
        TJS_MODEL_TYPES,
        `registry missing entry for ${type}`
      ).toContain(type);
    }
  });

  it("returns a non-empty list for every registered type", () => {
    for (const type of TJS_MODEL_TYPES) {
      const list = recommendedFor(type);
      expect(list.length, `${type} has no recommended models`).toBeGreaterThan(0);
    }
  });

  it("returns empty list for unknown types instead of throwing", () => {
    expect(recommendedFor("tjs.does_not_exist")).toEqual([]);
  });

  it("defaultRepoFor returns the first recommended repo", () => {
    for (const type of TJS_MODEL_TYPES) {
      const first = recommendedFor(type)[0];
      expect(defaultRepoFor(type)).toBe(first.repo_id);
    }
  });

  it("defaultRepoFor throws for unknown types", () => {
    expect(() => defaultRepoFor("tjs.does_not_exist")).toThrow(
      /no recommended models/
    );
  });

  it("each recommended repo id is a non-empty owner/name string", () => {
    for (const type of TJS_MODEL_TYPES) {
      for (const ref of recommendedFor(type)) {
        expect(ref.repo_id).toMatch(/^[^/\s]+\/[^/\s]+$/);
      }
    }
  });
});
