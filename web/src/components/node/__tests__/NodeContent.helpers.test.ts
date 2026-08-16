/**
 * @jest-environment node
 */
import { arePropsEqual, NodeContentProps } from "../NodeContent.helpers";
import { stub } from "../../../test-utils/doubles";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";

function makeProps(overrides: Partial<NodeContentProps> = {}): NodeContentProps {
  const defaultMeta: NodeMetadata = stub<NodeMetadata>({
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
    description: ""
  });

  const defaultData: NodeData = stub<NodeData>({
    properties: {},
    dynamic_properties: {},
    dynamic_outputs: {},
    exposedInputs: [],
    exposedInputsLabeled: [],
    exposedInputsHidden: [],
    selectable: true,
    workflow_id: "w1"
  });

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
        properties: stub<NodeMetadata["properties"]>([{ name: "x", type: { type: "string" } }])
      }
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects outputs length change", () => {
    const a = makeProps();
    const b = makeProps({
      nodeMetadata: {
        ...a.nodeMetadata,
        outputs: stub<NodeMetadata["outputs"]>([{ name: "out", type: { type: "image" } }])
      }
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects primary output type change", () => {
    const a = makeProps({
      nodeMetadata: {
        ...makeProps().nodeMetadata,
        outputs: stub<NodeMetadata["outputs"]>([{ name: "out", type: { type: "image" } }])
      }
    });
    const b = makeProps({
      nodeMetadata: {
        ...makeProps().nodeMetadata,
        outputs: stub<NodeMetadata["outputs"]>([{ name: "out", type: { type: "audio" } }])
      }
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects data.properties value change", () => {
    const a = makeProps({
      data: stub<NodeData>({ ...makeProps().data, properties: { foo: "bar" } })
    });
    const b = makeProps({
      data: stub<NodeData>({ ...makeProps().data, properties: { foo: "baz" } })
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects data.properties key count change", () => {
    const a = makeProps({
      data: stub<NodeData>({ ...makeProps().data, properties: { a: 1 } })
    });
    const b = makeProps({
      data: stub<NodeData>({ ...makeProps().data, properties: { a: 1, b: 2 } })
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects exposedInputs change", () => {
    const a = makeProps({
      data: stub<NodeData>({ ...makeProps().data, exposedInputs: ["x"] })
    });
    const b = makeProps({
      data: stub<NodeData>({ ...makeProps().data, exposedInputs: ["y"] })
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects dynamic_properties change", () => {
    const a = makeProps({
      data: stub<NodeData>({ ...makeProps().data, dynamic_properties: { a: 1 } })
    });
    const b = makeProps({
      data: stub<NodeData>({ ...makeProps().data, dynamic_properties: { a: 1, b: 2 } })
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects a dynamic_inputs type change with unchanged values", () => {
    // Connecting to an existing slot (or picking a type the current value
    // still fits) writes only `dynamic_inputs`. The handle class is
    // `Slugify(type)` — if this compare skips that map, the handle stays grey.
    const values = { a: "" };
    const a = makeProps({
      data: stub<NodeData>({
        ...makeProps().data,
        dynamic_properties: values,
        dynamic_inputs: {
          a: { type: { type: "any", optional: false, type_args: [] } }
        }
      })
    });
    const b = makeProps({
      data: stub<NodeData>({
        ...makeProps().data,
        dynamic_properties: values,
        dynamic_inputs: {
          a: { type: { type: "image", optional: false, type_args: [] } }
        }
      })
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

  it("detects a dynamic_outputs type change with the same keys", () => {
    const a = makeProps({
      data: stub<NodeData>({
        ...makeProps().data,
        dynamic_outputs: {
          out: { type: "any", optional: false, type_args: [] }
        }
      })
    });
    const b = makeProps({
      data: stub<NodeData>({
        ...makeProps().data,
        dynamic_outputs: {
          out: { type: "str", optional: false, type_args: [] }
        }
      })
    });
    expect(arePropsEqual(a, b)).toBe(false);
  });

});
