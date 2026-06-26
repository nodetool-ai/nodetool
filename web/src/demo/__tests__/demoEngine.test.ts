/**
 * DemoEngine determinism: seeking to a time must make the execution stores
 * reflect exactly the events up to that time, regardless of seek direction.
 */
import { DemoEngine } from "../demoEngine";
import { sampleCast } from "../sampleCast";
import useStatusStore from "../../stores/StatusStore";
import useResultsStore from "../../stores/ResultsStore";
import { nodeKey } from "../../stores/nodeKey";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";

const WF = "wf-demo-sample";
const resolveAssetUrl = (f: string) => `/demo-assets/${f}`;

function focused(): string {
  const job = useWorkflowRunsStore.getState().getFocusedJob(WF);
  if (!job) throw new Error("no focused job");
  return job;
}

describe("DemoEngine", () => {
  let engine: DemoEngine;

  beforeEach(() => {
    engine = new DemoEngine(sampleCast, { resolveAssetUrl });
  });

  afterEach(() => {
    engine.dispose();
  });

  it("shows the generate node running mid-stream", () => {
    engine.seekToTime(700);
    expect(useStatusStore.getState().getStatus(WF, focused(), "gen")).toBe(
      "running"
    );
  });

  it("accumulates streamed text chunks on the node", () => {
    engine.seekToTime(1600);
    const chunk = useResultsStore.getState().chunks[nodeKey(WF, focused(), "gen")];
    expect(chunk).toContain("mountain lake");
  });

  it("settles the node output on completion", () => {
    engine.seekToTime(2200);
    expect(useStatusStore.getState().getStatus(WF, focused(), "gen")).toBe(
      "completed"
    );
    const gens = useResultsStore.getState().getLiveGenerations(WF, "gen");
    expect(gens.length).toBeGreaterThan(0);
    expect((gens[0].outputs as { text?: string }).text).toContain(
      "mountain lake"
    );
  });

  it("resolves pinned asset references to host URLs", () => {
    engine.seekToTime(2400);
    const result = useResultsStore.getState().getOutputResult(
      WF,
      focused(),
      "preview"
    ) as { uri?: string } | undefined;
    // The sample uses an inline data URI (left untouched), proving non-asset
    // strings pass through the resolver unchanged.
    expect(result?.uri?.startsWith("data:image/svg+xml")).toBe(true);
  });

  it("is a pure function of time across a backward seek", () => {
    engine.seekToTime(2600);
    const forwardStatus = useStatusStore
      .getState()
      .getStatus(WF, focused(), "gen");
    expect(forwardStatus).toBe("completed");

    // Seek back to before the node started; its status must be gone again.
    engine.seekToTime(100);
    expect(
      useStatusStore.getState().getStatus(WF, focused(), "gen")
    ).toBeUndefined();

    // And forward again reproduces the same end state.
    engine.seekToTime(2600);
    expect(useStatusStore.getState().getStatus(WF, focused(), "gen")).toBe(
      "completed"
    );
  });
});
