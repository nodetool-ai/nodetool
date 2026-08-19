/**
 * @jest-environment node
 */
import type { Property } from "../../../stores/ApiTypes";
import {
  isPropertyConditionSatisfied,
  shouldRenderProperty
} from "../propertyVisibility";

function property(visibleWhen: unknown): Property {
  return {
    name: "reference_audio",
    type: { type: "audio", type_args: [], optional: false },
    required: false,
    json_schema_extra: { visible_when: visibleWhen }
  };
}

describe("property visibility metadata", () => {
  it("matches a capability nested in the selected model", () => {
    const input = property({
      property: "model",
      path: "capabilities",
      includes: "voice_cloning"
    });

    expect(
      isPropertyConditionSatisfied(input, {
        model: { capabilities: ["voice_cloning"] }
      })
    ).toBe(true);
    expect(
      isPropertyConditionSatisfied(input, { model: { capabilities: [] } })
    ).toBe(false);
  });

  it("supports any-of capability conditions", () => {
    const input = property({
      property: "model",
      path: "capabilities",
      includes_any: ["voice_design", "instruction_control"]
    });
    expect(
      isPropertyConditionSatisfied(input, {
        model: { capabilities: ["instruction_control"] }
      })
    ).toBe(true);
  });

  it("fails open for malformed future metadata", () => {
    expect(isPropertyConditionSatisfied(property("future-rule"), {})).toBe(
      true
    );
  });

  it("keeps a connected unsupported property renderable", () => {
    const input = property({
      property: "model",
      path: "capabilities",
      includes: "voice_cloning"
    });
    expect(shouldRenderProperty(input, { model: {} }, true)).toBe(true);
    expect(shouldRenderProperty(input, { model: {} }, false)).toBe(false);
  });
});
