/**
 * Workflow-gallery casts (web/src/demo/workflows) — one synthetic recording per
 * docs Workflow Gallery example that has no matching cookbook video, rendered
 * into videos by the Remotion harness.
 *
 * These guard that:
 *   1. Every node type used is a real registry type (the strings were verified
 *      against package source) and every graph node has metadata, and vice versa.
 *   2. Events are sorted ascending by `t` (the DemoEngine forward-seek relies on
 *      it) and stay within durationMs.
 *   3. Replaying through the production reducer lands the state each example's
 *      payoff reads.
 */
import { DemoEngine } from "../demoEngine";
import { workflowCasts } from "../workflows";
import type { DemoCast } from "../castTypes";
import useResultsStore from "../../stores/ResultsStore";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";

const resolveAssetUrl = (f: string) => `/demo-assets/${f}`;

/** The real registry node types the workflow-gallery examples are built from. */
const ALLOWED_NODE_TYPES = new Set([
  "nodetool.input.StringInput",
  "nodetool.input.AudioInput",
  "nodetool.output.Output",
  "nodetool.workflows.base_node.Preview",
  "nodetool.text.AutomaticSpeechRecognition",
  "nodetool.text.Prompt",
  "nodetool.text.Template",
  "nodetool.agents.Summarizer",
  "nodetool.agents.Classifier",
  "nodetool.generators.DataGenerator",
  "nodetool.generators.ListGenerator",
  "lib.mail.GmailSearch",
  "lib.mail.AddLabel",
  "nodetool.constant.Video",
  "nodetool.video.ForEachFrame",
  "nodetool.video.FrameToVideo",
  "lib.image.color_grading.Exposure",
  "lib.image.color_grading.SaturationVibrance",
  "lib.http.GetText",
  "lib.markdown.ExtractLinks",
  "nodetool.data.Filter",
  "nodetool.control.ForEach",
  "lib.browser.DownloadFile",
  "nodetool.control.Collect",
]);

const focused = (wf: string): string => {
  const job = useWorkflowRunsStore.getState().getFocusedJob(wf);
  if (!job) throw new Error(`no focused job for ${wf}`);
  return job;
};

const lastOutputs = (wf: string, nodeId: string): Record<string, unknown> => {
  const gens = useResultsStore.getState().getLiveGenerations(wf, nodeId);
  const last = gens.at(-1);
  expect(last).toBeDefined();
  return (last?.outputs ?? {}) as Record<string, unknown>;
};

const uri = (value: unknown): string | undefined =>
  (value as { uri?: string } | undefined)?.uri;

describe("workflow casts — structure", () => {
  it("has unique cookbook-style ids", () => {
    const ids = workflowCasts.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id.startsWith("workflow-")).toBe(true));
  });

  it.each(workflowCasts.map((c) => [c.id, c] as const))(
    "%s uses only real node types, with metadata ↔ graph parity",
    (_id, cast: DemoCast) => {
      const graphTypes = cast.workflow.graph.nodes.map((n) => n.type);
      const metaTypes = Object.keys(cast.metadata);
      for (const type of [...graphTypes, ...metaTypes]) {
        expect(ALLOWED_NODE_TYPES.has(type)).toBe(true);
      }
      for (const type of graphTypes) expect(cast.metadata[type]).toBeDefined();
      for (const type of metaTypes) expect(graphTypes).toContain(type);
    }
  );

  it.each(workflowCasts.map((c) => [c.id, c] as const))(
    "%s has events sorted ascending by t, within durationMs",
    (_id, cast: DemoCast) => {
      for (let i = 1; i < cast.events.length; i++) {
        expect(cast.events[i].t).toBeGreaterThanOrEqual(cast.events[i - 1].t);
      }
      expect(cast.events.at(-1)!.t).toBeLessThanOrEqual(cast.durationMs);
    }
  );
});

describe("workflow casts — replay lands the payoff state", () => {
  it("transcribe-audio: the ASR streams then settles a transcript", () => {
    const cast = workflowCasts.find((c) => c.id === "workflow-transcribe-audio")!;
    const engine = new DemoEngine(cast, { resolveAssetUrl });
    try {
      const wf = cast.workflow.id;
      engine.seekToTime(cast.durationMs - 100);
      expect(String(lastOutputs(wf, "asr").text)).toContain("workflow gallery");
    } finally {
      engine.dispose();
    }
  });

  it("data-generator: the dataframe reaches the preview", () => {
    const cast = workflowCasts.find((c) => c.id === "workflow-data-generator")!;
    const engine = new DemoEngine(cast, { resolveAssetUrl });
    try {
      const wf = cast.workflow.id;
      engine.seekToTime(cast.durationMs - 100);
      const result = useResultsStore.getState().getOutputResult(wf, focused(wf), "preview") as
        | { type?: string }
        | undefined;
      expect(result?.type).toBe("dataframe");
    } finally {
      engine.dispose();
    }
  });

  it("color-boost-video: the assembled clip is a video", () => {
    const cast = workflowCasts.find((c) => c.id === "workflow-color-boost-video")!;
    const engine = new DemoEngine(cast, { resolveAssetUrl });
    try {
      const wf = cast.workflow.id;
      engine.seekToTime(cast.durationMs - 100);
      expect(uri(lastOutputs(wf, "assemble").output)).toContain("data:video/webm");
    } finally {
      engine.dispose();
    }
  });
});
