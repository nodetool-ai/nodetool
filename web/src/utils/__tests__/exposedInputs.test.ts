import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import {
  addExposedInput,
  applyExposedPlacementTarget,
  canConfigureExposedPlacement,
  getEffectiveExposedPlacement,
  nextExposedInputPlacement,
  resolveExposedInputLabeledNames,
  resolveExposedInputNames,
  resolveInlineFieldNames
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
  supports_dynamic_inputs: false,
  is_streaming_input: false,
  is_streaming_output: false,
  is_streaming: false,
  supports_dynamic_outputs: false,
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

  describe("getEffectiveExposedPlacement", () => {
    it("uses metadata defaults for input_fields and inline_fields", () => {
      const md = baseMetadata({
        input_fields: ["image"],
        inline_fields: ["prompt"]
      });
      const data = baseData();
      expect(getEffectiveExposedPlacement(md, data, "image")).toBe("handle");
      expect(getEffectiveExposedPlacement(md, data, "prompt")).toBe("labeled");
      expect(getEffectiveExposedPlacement(md, data, "seed")).toBeNull();
    });

    it("respects exposedInputsHidden", () => {
      const md = baseMetadata({ input_fields: ["image"] });
      const data = baseData({ exposedInputsHidden: ["image"] });
      expect(getEffectiveExposedPlacement(md, data, "image")).toBeNull();
    });
  });

  describe("applyExposedPlacementTarget", () => {
    it("hides metadata input_field via exposedInputsHidden", () => {
      const md = baseMetadata({ input_fields: ["image"] });
      const data = baseData();
      const patch = applyExposedPlacementTarget(md, data, "image", null);
      expect(patch.exposedInputsHidden).toEqual(["image"]);
      expect(patch.exposedInputs).toBeUndefined();
    });

    it("moves inline_field to bottom without redundant list when default is labeled", () => {
      const md = baseMetadata({ inline_fields: ["prompt"] });
      const data = baseData();
      expect(applyExposedPlacementTarget(md, data, "prompt", "labeled")).toEqual(
        {}
      );
    });

    it("moves inline_field to top via exposedInputs", () => {
      const md = baseMetadata({ inline_fields: ["prompt"] });
      const data = baseData();
      const patch = applyExposedPlacementTarget(md, data, "prompt", "handle");
      expect(patch.exposedInputs).toEqual(["prompt"]);
    });
  });

  describe("resolveInlineFieldNames", () => {
    it("excludes hidden, labeled override, and handle-forced inline fields", () => {
      const md = baseMetadata({ inline_fields: ["a", "b", "c"] });
      const data = baseData({
        exposedInputsHidden: ["a"],
        exposedInputsLabeled: ["b"],
        exposedInputs: ["c"]
      });
      expect(resolveInlineFieldNames(md, data)).toEqual([]);
    });
  });

  describe("canConfigureExposedPlacement", () => {
    it("allows all metadata properties including input_fields", () => {
      const md = baseMetadata({
        input_fields: ["image"],
        properties: [
          {
            name: "image",
            required: true,
            type: { type: "image", type_args: [], optional: false }
          },
          {
            name: "prompt",
            required: true,
            type: { type: "str", type_args: [], optional: false }
          }
        ]
      });
      expect(canConfigureExposedPlacement(md, "image")).toBe(true);
      expect(canConfigureExposedPlacement(md, "prompt")).toBe(true);
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

  describe("nextExposedInputPlacement", () => {
    it("cycles off → handle → labeled → off", () => {
      expect(nextExposedInputPlacement(null)).toBe("handle");
      expect(nextExposedInputPlacement("handle")).toBe("labeled");
      expect(nextExposedInputPlacement("labeled")).toBeNull();
    });
  });

});
