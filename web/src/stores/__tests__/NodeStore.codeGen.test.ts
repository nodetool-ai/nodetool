jest.mock("../../components/node_types/PlaceholderNode", () => () => null);

import { Position, Node } from "@xyflow/react";
import { createNodeStore } from "../NodeStore";
import { NodeData } from "../NodeData";
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

const CODE_NODE_TYPE = "nodetool.code.Code";

const makeCodeNode = (workflowId: string): Node<NodeData> => ({
  id: "code-1",
  type: CODE_NODE_TYPE,
  position: { x: 0, y: 0 },
  targetPosition: Position.Left,
  data: {
    properties: { code: "return { old: 1 };", timeout: 30 },
    dynamic_properties: { legacy: "keep me" },
    dynamic_inputs: {
      legacy: {
        type: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        }
      }
    },
    dynamic_outputs: {
      old: {
        type: "int",
        optional: false,
        values: null,
        type_args: [],
        type_name: null
      }
    },
    title: "Old title",
    selectable: true,
    workflow_id: workflowId
  }
});

const submission: codeGen.CodeGenSubmission = {
  title: "Merge rows on id",
  summary: "Joins two lists on their id field.",
  code: "return { merged: left.map((l) => ({ ...l })) };",
  inputs: [
    {
      name: "left",
      type: { type: "list", type_args: [], optional: false },
      description: "Left rows"
    },
    {
      name: "count",
      type: { type: "int", type_args: [], optional: false },
      default: 5,
      required: true
    }
  ],
  outputs: [{ name: "merged", type: { type: "list", type_args: [] } }]
};

describe("NodeStore.applyCodeGenSubmission", () => {
  it("writes code, title, typed slots and defaults in one step", () => {
    const store = createNodeStore();
    const workflowId = store.getState().workflow.id;
    store.getState().addNode(makeCodeNode(workflowId));

    store.getState().applyCodeGenSubmission("code-1", submission);

    const data = store.getState().findNode("code-1")?.data as NodeData;
    expect(data.title).toBe("Merge rows on id");
    expect(data.properties.code).toBe(submission.code);
    // Unrelated inline properties survive generation.
    expect(data.properties.timeout).toBe(30);

    expect(Object.keys(data.dynamic_inputs ?? {})).toEqual(["left", "count"]);
    expect(data.dynamic_inputs?.left).toEqual({
      type: {
        type: "list",
        optional: false,
        values: null,
        type_args: [],
        type_name: null
      },
      description: "Left rows"
    });
    expect(data.dynamic_inputs?.count.default).toBe(5);
    expect(data.dynamic_inputs?.count.required).toBe(true);

    // Slots are replaced wholesale — the submission is the whole interface.
    expect(data.dynamic_properties).toEqual({ left: [], count: 5 });
    expect(Object.keys(data.dynamic_outputs ?? {})).toEqual(["merged"]);
    expect(data.dynamic_outputs?.merged.type).toBe("list");
  });

  it("registers exactly one undo entry that restores the node", () => {
    const store = createNodeStore();
    const workflowId = store.getState().workflow.id;
    store.getState().addNode(makeCodeNode(workflowId));
    store.temporal.getState().clear();

    const before = store.getState().findNode("code-1")?.data as NodeData;

    store.getState().applyCodeGenSubmission("code-1", submission);

    expect(store.temporal.getState().pastStates).toHaveLength(1);

    store.temporal.getState().undo();

    const after = store.getState().findNode("code-1")?.data as NodeData;
    expect(after.title).toBe(before.title);
    expect(after.properties).toEqual(before.properties);
    expect(after.dynamic_properties).toEqual(before.dynamic_properties);
    expect(after.dynamic_inputs).toEqual(before.dynamic_inputs);
    expect(after.dynamic_outputs).toEqual(before.dynamic_outputs);
  });

  it("leaves the graph untouched for an unknown node id", () => {
    const store = createNodeStore();
    const workflowId = store.getState().workflow.id;
    store.getState().addNode(makeCodeNode(workflowId));
    store.temporal.getState().clear();

    store.getState().applyCodeGenSubmission("missing", submission);

    expect(store.temporal.getState().pastStates).toHaveLength(0);
    expect(store.getState().findNode("code-1")?.data.title).toBe("Old title");
  });
});
