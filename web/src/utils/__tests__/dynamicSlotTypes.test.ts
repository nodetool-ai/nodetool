import type { Node } from "@xyflow/react";

import type { NodeMetadata, TypeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import {
  DYNAMIC_COMFY_NODE_TYPES,
  DYNAMIC_FAL_NODE_TYPE,
  DYNAMIC_KIE_NODE_TYPE,
  SUBGRAPH_NODE_TYPE
} from "../../constants/nodeTypes";
import {
  DYNAMIC_SLOT_TYPE_PALETTE,
  allowedSlotTypes,
  isSchemaDrivenDynamicNode,
  slotTypeKey,
  slotTypeLabel
} from "../dynamicSlotTypes";

const type = (name: string): TypeMetadata => ({
  type: name,
  optional: false,
  values: null,
  type_args: [],
  type_name: null
});

const node = (
  overrides: Partial<Node<NodeData>> = {},
  data: Partial<NodeData> = {}
): Pick<Node<NodeData>, "type" | "data"> => ({
  type: "test.node",
  data: {
    properties: {},
    selectable: true,
    workflow_id: "wf",
    dynamic_properties: {},
    ...data
  },
  ...overrides
});

describe("slot type palette", () => {
  it("covers primitives, asset refs, and their list forms", () => {
    const keys = DYNAMIC_SLOT_TYPE_PALETTE.map(slotTypeKey);
    expect(keys).toContain("any");
    expect(keys).toContain("str");
    expect(keys).toContain("image");
    expect(keys).toContain("list[image]");
    expect(keys).not.toContain("list[any]");
  });

  it("labels list types like the handle tooltips", () => {
    expect(slotTypeLabel(type("image"))).toBe("image");
    expect(
      slotTypeLabel({ ...type("list"), type_args: [type("image")] })
    ).toBe("image[]");
  });

  it("returns the whole palette when the node declares no constraint", () => {
    expect(allowedSlotTypes(undefined)).toBe(DYNAMIC_SLOT_TYPE_PALETTE);
    expect(allowedSlotTypes({} as NodeMetadata)).toBe(
      DYNAMIC_SLOT_TYPE_PALETTE
    );
  });

  it("narrows to allowed_dynamic_slot_types", () => {
    const metadata = {
      allowed_dynamic_slot_types: [type("str"), type("image")]
    } as NodeMetadata;

    expect(allowedSlotTypes(metadata).map(slotTypeKey)).toEqual([
      "str",
      "image"
    ]);
  });

  it("keeps a declared type the palette doesn't cover", () => {
    const metadata = {
      allowed_dynamic_slot_types: [type("exotic.Thing")]
    } as NodeMetadata;

    expect(allowedSlotTypes(metadata).map(slotTypeKey)).toEqual([
      "exotic.Thing"
    ]);
  });
});

describe("isSchemaDrivenDynamicNode", () => {
  it("is false for an ordinary dynamic node", () => {
    expect(isSchemaDrivenDynamicNode(node())).toBe(false);
  });

  it("is true for the dynamic-schema node types", () => {
    expect(isSchemaDrivenDynamicNode(node({ type: DYNAMIC_FAL_NODE_TYPE }))).toBe(
      true
    );
    expect(isSchemaDrivenDynamicNode(node({ type: DYNAMIC_KIE_NODE_TYPE }))).toBe(
      true
    );
    expect(isSchemaDrivenDynamicNode(node({ type: SUBGRAPH_NODE_TYPE }))).toBe(
      true
    );
  });

  it("is true for every ComfyUI runner", () => {
    expect([...DYNAMIC_COMFY_NODE_TYPES]).toEqual([
      "lib.comfy.RunWorkflow",
      "lib.comfy.RunWorkflowOnCloud"
    ]);
    for (const comfyType of DYNAMIC_COMFY_NODE_TYPES) {
      expect(isSchemaDrivenDynamicNode(node({ type: comfyType }))).toBe(true);
    }
  });

  it("is false for a lib.comfy node that is not a runner", () => {
    expect(
      isSchemaDrivenDynamicNode(node({ type: "lib.comfy.SomethingElse" }))
    ).toBe(false);
  });

  it("is false for the worker runner until it adopts the output convention", () => {
    expect(
      isSchemaDrivenDynamicNode(node({ type: "lib.comfy.RunWorkflowOnWorker" }))
    ).toBe(false);
  });

  it("is true once a model schema has resolved", () => {
    expect(isSchemaDrivenDynamicNode(node({}, { endpoint_id: "fal-ai/x" }))).toBe(
      true
    );
    expect(isSchemaDrivenDynamicNode(node({}, { model_id: "owner/m" }))).toBe(
      true
    );
  });
});
