import { Edge, Node } from "@xyflow/react";
import { computeRunSignatures } from "../computeRunSignatures";
import { NodeData } from "../../stores/NodeData";
import { NodeMetadata } from "../../stores/ApiTypes";
import type { Generation } from "../nodeGenerations";

// Generative nodes use the `gen.` prefix convention (mirrors nodeHash.test.ts).
const getMetadata = (type: string): NodeMetadata =>
  ({
    auto_save_asset: type.startsWith("gen."),
    title: type,
    properties: []
  }) as unknown as NodeMetadata;

const node = (id: string, type: string): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "wf"
  } as NodeData
});

const edge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
  sourceHandle: "output",
  targetHandle: "x",
  type: "default"
});

const generation = (
  id: string,
  status: Generation["status"],
  createdAt: number
): Generation => ({ id, jobId: id, createdAt, outputs: {}, status });

describe("computeRunSignatures — generative upstream stamping", () => {
  // A computed node `t` reads a generative `g`. The dispatch-time stamp folds
  // `g`'s output identity, which must mirror what reuse/replay ACTUALLY emits:
  // the current generation if completed, else the latest completed one. A
  // newer RUNNING placeholder must therefore not shift the stamp (reuse still
  // emits the last completed value), but a newer COMPLETED generation must.
  const nodes = [node("g", "gen.Image"), node("t", "proc.compute")];
  const edges = [edge("e", "g", "t")];
  const stampForGenerations = (gens: Generation[]): string =>
    computeRunSignatures(["t"], {
      nodes,
      edges,
      workflowId: "wf",
      getMetadata,
      getGenerations: (_wf, id) => (id === "g" ? gens : [])
    })["t"];

  const Y = generation("Y", "completed", 1);
  const Xrunning = generation("X", "running", 2);
  const Xdone = generation("X", "completed", 2);

  it("a running placeholder over a completed gen leaves the downstream stamp unchanged", () => {
    const onlyCompleted = stampForGenerations([Y]);
    const withRunningPlaceholder = stampForGenerations([Y, Xrunning]);
    // reuse emits Y in both cases → identical stamp.
    expect(withRunningPlaceholder).toBe(onlyCompleted);
  });

  it("a newly completed generation changes the downstream stamp", () => {
    const onlyCompleted = stampForGenerations([Y]);
    const withNewCompleted = stampForGenerations([Y, Xdone]);
    // reuse now emits X → stamp must change (guards against over-collapsing).
    expect(withNewCompleted).not.toBe(onlyCompleted);
  });
});
