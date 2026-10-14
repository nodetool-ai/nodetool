import type { Edge, Node } from "@xyflow/react";

import { createNodeStore } from "../../stores/NodeStore";
import type { NodeData } from "../../stores/NodeData";
import { replaceDynamicSlots } from "../replaceDynamicSlots";

const slot = (type: string) => ({
  type: { type, optional: false, values: null, type_args: [], type_name: null }
});
const output = (type: string) => ({ type, optional: false, type_args: [] });

const node = (id: string, data: Partial<NodeData> = {}): Node<NodeData> => ({
  id,
  type: "test.Node",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf",
    ...data
  }
});

const edge = (
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string
): Edge => ({ id, source, sourceHandle, target, targetHandle });

// A fal.ai-style node: `image_url` and `prompt` in, `video` out, plus a
// static `model_info` input that no schema reload owns.
const makeStore = () =>
  createNodeStore(undefined, {
    nodes: [
      node("src"),
      node("dst"),
      node("fal", {
        dynamic_properties: { image_url: "", prompt: "" },
        dynamic_inputs: { image_url: slot("image"), prompt: slot("str") },
        dynamic_outputs: { video: output("video") }
      })
    ],
    edges: [
      edge("in-image", "src", "output", "fal", "image_url"),
      edge("in-prompt", "src", "output", "fal", "prompt"),
      edge("in-static", "src", "output", "fal", "model_info"),
      edge("out-video", "fal", "video", "dst", "input")
    ]
  });

describe("replaceDynamicSlots", () => {
  it("deletes edges on dynamic handles the new schema drops", () => {
    const store = makeStore();

    replaceDynamicSlots(store, "fal", {
      dynamic_properties: { prompt: "" },
      dynamic_inputs: { prompt: slot("str") },
      dynamic_outputs: { images: output("list") }
    });

    const state = store.getState();
    expect(state.edges.map((e) => e.id)).toEqual(["in-prompt", "in-static"]);
    expect(Object.keys(state.findNode("fal")?.data.dynamic_outputs ?? {})).toEqual([
      "images"
    ]);
  });

  it("keeps edges when every handle survives", () => {
    const store = makeStore();

    replaceDynamicSlots(store, "fal", {
      dynamic_properties: { image_url: "", prompt: "", seed: 0 },
      dynamic_outputs: { video: output("video") }
    });

    expect(store.getState().edges).toHaveLength(4);
  });

  it("undoes the slot change and the edge removal in one step", () => {
    const store = makeStore();
    store.temporal.getState().clear();

    replaceDynamicSlots(store, "fal", {
      dynamic_properties: {},
      dynamic_inputs: undefined,
      dynamic_outputs: {}
    });
    expect(store.getState().edges.map((e) => e.id)).toEqual(["in-static"]);

    store.temporal.getState().undo();

    expect(store.getState().edges).toHaveLength(4);
    expect(
      Object.keys(store.getState().findNode("fal")?.data.dynamic_outputs ?? {})
    ).toEqual(["video"]);
  });
});
