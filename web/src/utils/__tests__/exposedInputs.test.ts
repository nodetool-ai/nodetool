import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import {
  addExposedInput,
  canPromotePropertyToInputHandle,
  getExposedInputPlacement,
  nextExposedInputPlacement,
  patchExposedInputPlacement,
  removeExposedInput,
  resolveExposedInputLabeledNames,
  resolveExposedInputNames
} from "../exposedInputs";

const baseMetadata = (
  overrides: Partial<NodeMetadata> = {}
): NodeMetadata => ({
  node_type: "test.Node",
  namespace: "test",
  title: "Test",
  description: "",
  properties: [],
  outputs: [],
  the_model_info: {},
  recommended_models: [],
  basic_fields: [],
  inline_fields: [],
  input_fields: [],
  is_dynamic: false,
  is_streaming_input: false,
  is_streaming_output: false,
  is_streaming: false,
  supports_dynamic_outputs: false,
  expose_as_tool: false,
  layout: "default",
  ...overrides
} as NodeMetadata);

const baseData = (overrides: Partial<NodeData> = {}): NodeData =>
  ({
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf",
    ...overrides
  }) as NodeData;

describe("exposedInputs utility", () => {
  describe("resolveExposedInputNames", () => {
    it("returns metadata input_fields when exposedInputs is missing", () => {
      const md = baseMetadata({ input_fields: ["a", "b"] });
      expect(resolveExposedInputNames(md, baseData())).toEqual(["a", "b"]);
    });

    it("appends exposedInputs preserving order", () => {
      const md = baseMetadata({ input_fields: ["a"] });
      const data = baseData({ exposedInputs: ["c", "b"] });
      expect(resolveExposedInputNames(md, data)).toEqual(["a", "c", "b"]);
    });

    it("dedupes overlapping entries", () => {
      const md = baseMetadata({ input_fields: ["a", "b"] });
      const data = baseData({ exposedInputs: ["a", "c"] });
      expect(resolveExposedInputNames(md, data)).toEqual(["a", "b", "c"]);
    });

    it("excludes properties in exposedInputsLabeled from handle column", () => {
      const md = baseMetadata({ input_fields: ["image"] });
      const data = baseData({
        exposedInputs: ["negative_prompt"],
        exposedInputsLabeled: ["prompt"]
      });
      expect(resolveExposedInputNames(md, data)).toEqual([
        "image",
        "negative_prompt"
      ]);
    });

    it("treats an old workflow with no exposedInputs as []", () => {
      const md = baseMetadata({ input_fields: ["a"] });
      const data = baseData();
      expect(resolveExposedInputNames(md, data)).toEqual(["a"]);
    });
  });

  describe("addExposedInput", () => {
    it("appends a new entry", () => {
      expect(addExposedInput(["a"], "b")).toEqual(["a", "b"]);
    });

    it("returns the same reference when entry is already present", () => {
      const list = ["a", "b"];
      expect(addExposedInput(list, "a")).toBe(list);
    });

    it("handles undefined current list", () => {
      expect(addExposedInput(undefined, "x")).toEqual(["x"]);
    });
  });

  describe("canPromotePropertyToInputHandle", () => {
    it("returns false for metadata input_fields and inline_fields", () => {
      const md = baseMetadata({
        input_fields: ["prompt"],
        inline_fields: ["preview"]
      });
      expect(canPromotePropertyToInputHandle(md, "prompt")).toBe(false);
      expect(canPromotePropertyToInputHandle(md, "preview")).toBe(false);
      expect(canPromotePropertyToInputHandle(md, "input_text")).toBe(true);
    });

    it("returns false when metadata is missing", () => {
      expect(canPromotePropertyToInputHandle(undefined, "x")).toBe(false);
    });
  });

  describe("resolveExposedInputLabeledNames", () => {
    it("returns exposedInputsLabeled in order", () => {
      const data = baseData({ exposedInputsLabeled: ["prompt", "seed"] });
      expect(resolveExposedInputLabeledNames(data)).toEqual(["prompt", "seed"]);
    });

    it("treats missing field as empty", () => {
      expect(resolveExposedInputLabeledNames(baseData())).toEqual([]);
    });
  });

  describe("patchExposedInputPlacement", () => {
    it("adds handle placement and clears labeled list for same property", () => {
      const data = baseData({
        exposedInputsLabeled: ["prompt"],
        exposedInputs: []
      });
      const patch = patchExposedInputPlacement(data, "prompt", "handle");
      expect(patch.exposedInputs).toEqual(["prompt"]);
      expect(patch.exposedInputsLabeled).toEqual([]);
    });

    it("adds labeled placement and clears handle list for same property", () => {
      const data = baseData({ exposedInputs: ["prompt"] });
      const patch = patchExposedInputPlacement(data, "prompt", "labeled");
      expect(patch.exposedInputs).toEqual([]);
      expect(patch.exposedInputsLabeled).toEqual(["prompt"]);
    });

    it("removes from both lists when placement is null", () => {
      const data = baseData({
        exposedInputs: ["a"],
        exposedInputsLabeled: ["b"]
      });
      expect(patchExposedInputPlacement(data, "a", null)).toEqual({
        exposedInputs: []
      });
    });
  });

  describe("nextExposedInputPlacement", () => {
    it("cycles off → handle → labeled → off", () => {
      expect(nextExposedInputPlacement(null)).toBe("handle");
      expect(nextExposedInputPlacement("handle")).toBe("labeled");
      expect(nextExposedInputPlacement("labeled")).toBeNull();
    });
  });

  describe("getExposedInputPlacement", () => {
    it("returns handle or labeled or null", () => {
      const data = baseData({
        exposedInputs: ["a"],
        exposedInputsLabeled: ["b"]
      });
      expect(getExposedInputPlacement(data, "a")).toBe("handle");
      expect(getExposedInputPlacement(data, "b")).toBe("labeled");
      expect(getExposedInputPlacement(data, "c")).toBeNull();
    });
  });

  describe("removeExposedInput", () => {
    it("removes a matching entry", () => {
      expect(removeExposedInput(["a", "b"], "a")).toEqual(["b"]);
    });

    it("returns the same reference when entry is missing", () => {
      const list = ["a"];
      expect(removeExposedInput(list, "missing")).toBe(list);
    });

    it("handles undefined current list", () => {
      expect(removeExposedInput(undefined, "x")).toEqual([]);
    });
  });
});
