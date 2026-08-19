import { isPropertyHidden } from "../propertyConditions";
import { Property } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";

const property = (extra: Record<string, unknown> | null): Property =>
  ({
    name: "folder",
    type: { type: "str", optional: false, type_args: [] },
    json_schema_extra: extra
  }) as unknown as Property;

const data = (properties: Record<string, unknown>): NodeData =>
  ({ properties }) as unknown as NodeData;

const folder = property({
  hidden_when: { property: "save_to_workspace", equals: true }
});

describe("isPropertyHidden", () => {
  it("hides the field while the condition holds", () => {
    expect(isPropertyHidden(folder, data({ save_to_workspace: true }))).toBe(
      true
    );
  });

  it("shows the field when the condition does not hold", () => {
    expect(isPropertyHidden(folder, data({ save_to_workspace: false }))).toBe(
      false
    );
    expect(isPropertyHidden(folder, data({}))).toBe(false);
  });

  it("shows a property with no condition", () => {
    expect(isPropertyHidden(property(null), data({}))).toBe(false);
  });

  it("ignores a malformed condition", () => {
    expect(
      isPropertyHidden(property({ hidden_when: { equals: true } }), data({}))
    ).toBe(false);
  });

  it("never hides a connected input", () => {
    expect(
      isPropertyHidden(folder, data({ save_to_workspace: true }), true)
    ).toBe(false);
  });
});
