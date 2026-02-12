// Mock heavy transitive imports to avoid React resolution issues in tests
jest.mock("../NodeInputs", () => ({ NodeInputs: () => null }));
jest.mock("../NodeOutputs", () => ({ NodeOutputs: () => null }));
jest.mock("../NodeProgress", () => ({ __esModule: true, default: () => null }));
jest.mock("../NodePropertyForm", () => ({ __esModule: true, default: () => null }));
jest.mock("../ResultOverlay", () => ({ __esModule: true, default: () => null }));
jest.mock("../../../hooks/nodes/useDynamicProperty", () => ({
  useDynamicProperty: () => ({ handleAddProperty: jest.fn() })
}));

import { arePropsEqual } from "../NodeContent";
import { NodeData } from "../../../stores/NodeData";

// Minimal valid NodeContentProps for testing arePropsEqual
function makeProps(overrides: Record<string, unknown> = {}) {
  const base = {
    id: "node-1",
    nodeType: "nodetool.constant.String",
    nodeMetadata: {
      title: "String",
      layout: "default",
      is_dynamic: false,
      supports_dynamic_outputs: false,
      is_streaming_output: false,
      properties: [{ name: "value", type: { type: "str", type_args: [], optional: false } }],
      outputs: []
    },
    isConstantNode: true,
    isOutputNode: false,
    data: {
      properties: { value: "" },
      selectable: undefined,
      dynamic_properties: {},
      workflow_id: "wf-1"
    } as NodeData,
    basicFields: ["value"],
    showAdvancedFields: false,
    hasAdvancedFields: false,
    onToggleAdvancedFields: () => {},
    status: undefined,
    workflowId: "wf-1",
    showResultOverlay: false,
    result: null,
    onShowInputs: () => {},
    onShowResults: () => {},
    ...overrides
  };
  return base as any;
}

describe("NodeContent arePropsEqual", () => {
  it("returns true when props are identical", () => {
    const props = makeProps();
    expect(arePropsEqual(props, props)).toBe(true);
  });

  it("returns false when a property value changes", () => {
    const prev = makeProps();
    const next = makeProps({
      data: {
        ...prev.data,
        selectable: undefined,
        properties: { value: "hello" }
      }
    });
    expect(arePropsEqual(prev, next)).toBe(false);
  });

  it("returns false when a dynamic property value changes", () => {
    const prev = makeProps({
      data: {
        properties: { value: "" },
        selectable: undefined,
        dynamic_properties: { custom: "old" },
        workflow_id: "wf-1"
      }
    });
    const next = makeProps({
      data: {
        properties: { value: "" },
        selectable: undefined,
        dynamic_properties: { custom: "new" },
        workflow_id: "wf-1"
      }
    });
    expect(arePropsEqual(prev, next)).toBe(false);
  });

  it("returns false when a new property key is added", () => {
    const prev = makeProps();
    const next = makeProps({
      data: {
        ...prev.data,
        selectable: undefined,
        properties: { value: "", newProp: "test" }
      }
    });
    expect(arePropsEqual(prev, next)).toBe(false);
  });

  it("returns true when property values are the same", () => {
    const stableToggle = () => {};
    const stableShowInputs = () => {};
    const stableShowResults = () => {};
    const prev = makeProps({
      data: {
        properties: { value: "hello" },
        selectable: undefined,
        dynamic_properties: {},
        workflow_id: "wf-1"
      },
      onToggleAdvancedFields: stableToggle,
      onShowInputs: stableShowInputs,
      onShowResults: stableShowResults
    });
    const next = makeProps({
      data: {
        properties: { value: "hello" },
        selectable: undefined,
        dynamic_properties: {},
        workflow_id: "wf-1"
      },
      onToggleAdvancedFields: stableToggle,
      onShowInputs: stableShowInputs,
      onShowResults: stableShowResults
    });
    expect(arePropsEqual(prev, next)).toBe(true);
  });
});
