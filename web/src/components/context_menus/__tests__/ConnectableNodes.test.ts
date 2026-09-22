import type { NodeMetadata, TypeMetadata } from "../../../stores/ApiTypes";
import {
  getCompatibleConnectableInputs,
  getCompatibleConnectableOutputs
} from "../ConnectableNodes";

const stringType: TypeMetadata = { type: "str" };

const metadata = (
  overrides: Partial<NodeMetadata> = {}
): NodeMetadata => ({
  title: "Node",
  description: "Test node",
  node_type: "test.Node",
  namespace: "test",
  layout: "default",
  properties: [],
  outputs: [],
  recommended_models: [],
  required_settings: [],
  supports_dynamic_inputs: false,
  is_streaming_output: false,
  supports_dynamic_outputs: false,
  ...overrides
});

describe("ConnectableNodes connection choices", () => {
  it("returns every same-type declared input instead of silently choosing one", () => {
    const result = getCompatibleConnectableInputs(
      metadata({
        input_fields: ["prompt", "negative_prompt"],
        properties: [
          { name: "prompt", type: stringType, required: false },
          { name: "negative_prompt", type: stringType, required: false }
        ]
      }),
      stringType
    );

    expect(result.map((property) => property.name)).toEqual([
      "prompt",
      "negative_prompt"
    ]);
  });

  it("returns every same-type output so the caller can ask which one to use", () => {
    const result = getCompatibleConnectableOutputs(
      metadata({
        outputs: [
          { name: "image", type: stringType, stream: false },
          { name: "mask", type: stringType, stream: false }
        ]
      }),
      stringType
    );

    expect(result.map((output) => output.name)).toEqual(["image", "mask"]);
  });

  it("prefers a typed connection over an any fallback", () => {
    const result = getCompatibleConnectableInputs(
      metadata({
        input_fields: ["prompt", "fallback"],
        properties: [
          { name: "prompt", type: stringType, required: false },
          { name: "fallback", type: { type: "any" }, required: false }
        ]
      }),
      stringType
    );

    expect(result.map((property) => property.name)).toEqual(["prompt"]);
  });
});
