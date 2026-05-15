import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import {
  addExposedInput,
  isBasicProperty,
  removeExposedInput,
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
  describe("isBasicProperty", () => {
    it("treats inline_fields as basic", () => {
      const md = baseMetadata({ inline_fields: ["prompt"] });
      expect(isBasicProperty(md, "prompt")).toBe(true);
    });

    it("treats input_fields as basic", () => {
      const md = baseMetadata({ input_fields: ["image"] });
      expect(isBasicProperty(md, "image")).toBe(true);
    });

    it("treats everything else as advanced", () => {
      const md = baseMetadata({
        inline_fields: ["prompt"],
        input_fields: ["image"]
      });
      expect(isBasicProperty(md, "seed")).toBe(false);
    });

    it("handles missing field lists gracefully", () => {
      const md = baseMetadata({});
      expect(isBasicProperty(md, "anything")).toBe(false);
    });
  });

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
