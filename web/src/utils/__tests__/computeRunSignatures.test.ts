import { Edge, Node } from "@xyflow/react";
import {
  computeRunSignatures,
  computeStampSignature
} from "../computeRunSignatures";
import { createNodeHasher } from "../nodeHash";
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

const node = (
  id: string,
  type: string,
  extraData: Partial<NodeData> = {}
): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "wf",
    ...extraData
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

// A generation whose jobId differs from its id (the realistic case: the live
// id is `${jobId}` for slot 0, but persisted/older variants carry their own).
const genInJob = (
  id: string,
  jobId: string,
  status: Generation["status"],
  createdAt: number
): Generation => ({ id, jobId, createdAt, outputs: {}, status });

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

describe("computeStampSignature — generation actually consumed this job", () => {
  // G (generative, pinned to an OLD generation) → C (computed). A run produces
  // G's NEW generation, which C actually consumes. The dispatch stamp folds the
  // OLD pinned generation (the new one doesn't exist at dispatch); the
  // completion stamp must instead fold the generation produced THIS job, so C's
  // cache is keyed to what it consumed — not to the stale pin.
  const nodes = [
    node("g", "gen.Image", { selected_generation: "g_old" }),
    node("c", "proc.compute")
  ];
  const edges = [edge("e", "g", "c")];
  const gens: Generation[] = [
    genInJob("g_old", "old-job", "completed", 1),
    genInJob("g_new", "new-job", "completed", 2)
  ];
  const args = {
    nodes,
    edges,
    workflowId: "wf",
    getMetadata,
    getGenerations: (_wf: string, id: string) => (id === "g" ? gens : [])
  };

  // Reference: C's signature folding a specific generation id for G.
  const sigFolding = (genId: string): string =>
    createNodeHasher({
      findNode: (id) => nodes.find((n) => n.id === id),
      inboundEdges: (id) => edges.filter((e) => e.target === id),
      getMetadata,
      currentGenerationId: (id) => (id === "g" ? genId : undefined)
    }).inputSignature("c");

  it("folds the generation produced this job, not the stale pinned one", () => {
    const stamped = computeStampSignature("new-job", "c", args);
    expect(stamped).toBe(sigFolding("g_new"));
    expect(stamped).not.toBe(sigFolding("g_old"));
  });
});
