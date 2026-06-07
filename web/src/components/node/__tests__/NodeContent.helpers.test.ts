/**
 * @jest-environment node
 */
import { arePropsEqual, NodeContentProps } from "../NodeContent.helpers";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";

function makeProps(overrides: Partial<NodeContentProps> = {}): NodeContentProps {
  const defaultMeta: NodeMetadata = {
    title: "TestNode",
    node_type: "test.Node",
    namespace: "test",
    layout: "default",
    body: undefined,
    properties: [],
    outputs: [],
    supports_dynamic_inputs: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    description: "",
    primary_field: "",
    secondary_field: "",
    output_type: "",
    color: ""
  } as unknown as NodeMetadata;

  const defaultData: NodeData = {
    properties: {},
    dynamic_properties: {},
    dynamic_outputs: {},
    exposedInputs: [],
    exposedInputsLabeled: [],
    exposedInputsHidden: [],
    selectable: true,
    workflow_id: "w1"
  } as unknown as NodeData;

  return {
    id: "n1",
    nodeType: "test.Node",
    nodeMetadata: defaultMeta,
    isOutputNode: false,
    data: defaultData,
    status: "idle",
    workflowId: "w1",
    ...overrides
  };
}

describe("arePropsEqual", () => {
  it("returns true for identical props", () => {
    const a = makeProps();
    expect(arePropsEqual(a, a)).toBe(true);
  });

  it("detects id change", () => {
    expect(arePropsEqual(makeProps(), makeProps({ id: "n2" }))).toBe(false);
  });

  it("detects nodeType change", () => {
    expect(arePropsEqual(makeProps(), makeProps({ nodeType: "other.Node" }))).toBe(false);
  });

  it("detects status change", () => {
    expect(arePropsEqual(makeProps(), makeProps({ status: "running" }))).toBe(false);
  });

  it("detects metadata title change", () => {
    const a = makeProps();
    const b = makeProps({
      nodeMetadata: { ...a.nodeMetadata, title: "Changed" }
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects metadata layout change", () => {
    const a = makeProps();
    const b = makeProps({
      nodeMetadata: { ...a.nodeMetadata, layout: "compact" }
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects metadata body change", () => {
    const a = makeProps();
    const b = makeProps({
      nodeMetadata: { ...a.nodeMetadata, body: "content_card" }
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects properties length change", () => {
    const a = makeProps();
    const b = makeProps({
      nodeMetadata: {
        ...a.nodeMetadata,
        properties: [{ name: "x", type: { type: "string" } }] as unknown as NodeMetadata["properties"]
      }
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects outputs length change", () => {
    const a = makeProps();
    const b = makeProps({
      nodeMetadata: {
        ...a.nodeMetadata,
        outputs: [{ name: "out", type: { type: "image" } }] as unknown as NodeMetadata["outputs"]
      }
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects primary output type change", () => {
    const a = makeProps({
      nodeMetadata: {
        ...makeProps().nodeMetadata,
        outputs: [{ name: "out", type: { type: "image" } }] as unknown as NodeMetadata["outputs"]
      }
    });
    const b = makeProps({
      nodeMetadata: {
        ...makeProps().nodeMetadata,
        outputs: [{ name: "out", type: { type: "audio" } }] as unknown as NodeMetadata["outputs"]
      }
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects data.properties value change", () => {
    const a = makeProps({
      data: { ...makeProps().data, properties: { foo: "bar" } } as unknown as NodeData
    });
    const b = makeProps({
      data: { ...makeProps().data, properties: { foo: "baz" } } as unknown as NodeData
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects data.properties key count change", () => {
    const a = makeProps({
      data: { ...makeProps().data, properties: { a: 1 } } as unknown as NodeData
    });
    const b = makeProps({
      data: { ...makeProps().data, properties: { a: 1, b: 2 } } as unknown as NodeData
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects exposedInputs change", () => {
    const a = makeProps({
      data: { ...makeProps().data, exposedInputs: ["x"] } as unknown as NodeData
    });
    const b = makeProps({
      data: { ...makeProps().data, exposedInputs: ["y"] } as unknown as NodeData
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects dynamic_properties change", () => {
    const a = makeProps({
      data: { ...makeProps().data, dynamic_properties: { a: 1 } } as unknown as NodeData
    });
    const b = makeProps({
      data: { ...makeProps().data, dynamic_properties: { a: 1, b: 2 } } as unknown as NodeData
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

});
