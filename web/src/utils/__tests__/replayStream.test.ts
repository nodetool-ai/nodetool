import { buildReplayForEach, replayNodeId } from "../replayStream";

describe("replayNodeId", () => {
  it("is deterministic for the same coordinates", () => {
    expect(replayNodeId("s", "out", "t", "in")).toBe(
      replayNodeId("s", "out", "t", "in")
    );
  });

  it("differs when any coordinate differs", () => {
    const base = replayNodeId("s", "out", "t", "in");
    expect(replayNodeId("s2", "out", "t", "in")).not.toBe(base);
    expect(replayNodeId("s", "out2", "t", "in")).not.toBe(base);
    expect(replayNodeId("s", "out", "t2", "in")).not.toBe(base);
    expect(replayNodeId("s", "out", "t", "in2")).not.toBe(base);
  });

  it("treats a null/undefined source handle as empty (stable)", () => {
    expect(replayNodeId("s", null, "t", "in")).toBe(
      replayNodeId("s", undefined, "t", "in")
    );
  });
});

describe("buildReplayForEach", () => {
  const args = {
    sourceId: "src",
    sourceHandle: "output",
    targetId: "tgt",
    targetHandle: "image",
    values: [{ uri: "a.png" }, { uri: "b.png" }],
    workflowId: "wf-1"
  };

  it("builds a ForEach node carrying input_list=values and limit=-1", () => {
    const { node } = buildReplayForEach(args);
    expect(node.id).toBe(
      replayNodeId(
        args.sourceId,
        args.sourceHandle,
        args.targetId,
        args.targetHandle
      )
    );
    expect(node.type).toBe("nodetool.control.ForEach");
    expect(node.position).toEqual({ x: 0, y: 0 });
    expect(node.data.properties).toEqual({
      input_list: args.values,
      limit: -1
    });
    expect(node.data.dynamic_properties).toEqual({});
    expect(node.data.workflow_id).toBe("wf-1");
  });

  it("wires the ForEach output handle to the target handle", () => {
    const { node, edge } = buildReplayForEach(args);
    expect(edge.id).toBe(`${node.id}->tgt:image`);
    expect(edge.source).toBe(node.id);
    expect(edge.sourceHandle).toBe("output");
    expect(edge.target).toBe("tgt");
    expect(edge.targetHandle).toBe("image");
  });

  it("preserves the pick order of the values in input_list", () => {
    const { node } = buildReplayForEach({
      ...args,
      values: ["x", "y", "z"]
    });
    expect((node.data.properties as { input_list: unknown[] }).input_list).toEqual([
      "x",
      "y",
      "z"
    ]);
  });
});
