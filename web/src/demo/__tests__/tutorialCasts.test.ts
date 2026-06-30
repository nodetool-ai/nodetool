/**
 * Tutorial casts use REAL node types and drive the REAL bespoke node bodies.
 *
 * These guard two things the tutorial videos depend on:
 *   1. Every node type used is a real registry type (no fabricated `demo.*` or
 *      since-removed `nodetool.llm.*` / `TextInput` / `FormatText` types), and
 *      the content-forward nodes declare `body: "content_card"`.
 *   2. Replaying the cast through the production reducer lands the state each
 *      bespoke body reads — the image card's settled image, the text card's
 *      streamed-then-settled text, and the List Generator's streamed items.
 */
import { DemoEngine } from "../demoEngine";
import { tutorialCast } from "../tutorialCast";
import { connectRunCast } from "../connectRunCast";
import { listGeneratorCast } from "../listGeneratorCast";
import { chatQaCast } from "../chatQaCast";
import { templateMergeCast } from "../templateMergeCast";
import type { DemoCast } from "../castTypes";
import useResultsStore from "../../stores/ResultsStore";
import useStatusStore from "../../stores/StatusStore";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";

const resolveAssetUrl = (f: string) => `/demo-assets/${f}`;

const TUTORIAL_CASTS: DemoCast[] = [
  tutorialCast,
  connectRunCast,
  listGeneratorCast,
  chatQaCast,
  templateMergeCast,
];

/** Types that must never resurface — fabricated or removed/migrated. */
const FORBIDDEN_NODE_TYPES = new Set([
  "demo.constant.Text",
  "demo.text.Uppercase",
  "demo.text.Generate",
  "nodetool.input.TextInput",
  "nodetool.llm.Enhance",
  "nodetool.llm.Chat",
  "nodetool.llm.ListGenerator",
  "nodetool.llm.GenerateText",
  "nodetool.text.FormatText",
]);

/** The real registry types the tutorials are built from. */
const ALLOWED_NODE_TYPES = new Set([
  "nodetool.input.StringInput",
  "nodetool.agents.EnhancePrompt",
  "nodetool.agents.Agent",
  "nodetool.image.TextToImage",
  "nodetool.generators.ListGenerator",
  "nodetool.text.ToUppercase",
  "nodetool.text.Prompt",
  "nodetool.workflows.base_node.Preview",
]);

const focused = (wf: string): string => {
  const job = useWorkflowRunsStore.getState().getFocusedJob(wf);
  if (!job) throw new Error(`no focused job for ${wf}`);
  return job;
};

/** The latest live generation's outputs for a node (asserts one exists). */
const lastOutputs = (wf: string, nodeId: string): Record<string, unknown> => {
  const gens = useResultsStore.getState().getLiveGenerations(wf, nodeId);
  const last = gens.at(-1);
  expect(last).toBeDefined();
  return (last?.outputs ?? {}) as Record<string, unknown>;
};

describe("tutorial casts — real node types", () => {
  it.each(TUTORIAL_CASTS.map((c) => [c.id, c] as const))(
    "%s uses only real, allowed node types",
    (_id, cast) => {
      const graphTypes = cast.workflow.graph.nodes.map((n) => n.type);
      const metaTypes = Object.keys(cast.metadata);
      for (const type of [...graphTypes, ...metaTypes]) {
        expect(FORBIDDEN_NODE_TYPES.has(type)).toBe(false);
        expect(ALLOWED_NODE_TYPES.has(type)).toBe(true);
      }
      // Every graph node has metadata, and vice versa.
      for (const type of graphTypes) {
        expect(cast.metadata[type]).toBeDefined();
      }
    }
  );

  it("declares content-card bodies on the content-forward nodes", () => {
    expect(tutorialCast.metadata["nodetool.agents.EnhancePrompt"].body).toBe(
      "content_card"
    );
    expect(tutorialCast.metadata["nodetool.image.TextToImage"].body).toBe(
      "content_card"
    );
    expect(chatQaCast.metadata["nodetool.agents.Agent"].body).toBe(
      "content_card"
    );
  });
});

describe("tutorial casts — bespoke bodies get their data", () => {
  it("first-workflow: image card settles with the generated image", () => {
    const engine = new DemoEngine(tutorialCast, { resolveAssetUrl });
    try {
      const wf = tutorialCast.workflow.id;

      // Mid-stream: the enhance text card is receiving chunks.
      engine.seekToTime(5000);
      expect(
        useResultsStore.getState().getChunk(wf, focused(wf), "enhance")
      ).toContain("kitten");

      // End: enhance text settled, image generation completed with an image
      // (after both nodes finish, before the run's terminal job_update).
      engine.seekToTime(15900);
      expect(lastOutputs(wf, "enhance").text).toContain("HELLO WORLD");

      expect(useStatusStore.getState().getStatus(wf, focused(wf), "generate")).toBe(
        "completed"
      );
      const imageOut = lastOutputs(wf, "generate").output as
        | { uri?: string }
        | undefined;
      expect(imageOut?.uri).toBeTruthy();
    } finally {
      engine.dispose();
    }
  });

  it("list-generator: the bespoke list body's output buffer accumulates items", () => {
    const engine = new DemoEngine(listGeneratorCast, { resolveAssetUrl });
    try {
      const wf = listGeneratorCast.workflow.id;
      engine.seekToTime(11000);
      const buffer = useResultsStore
        .getState()
        .getOutputResult(wf, focused(wf), "list");
      // The buffer interleaves item strings and index ints (as a real run does).
      const items = (Array.isArray(buffer) ? buffer : [buffer]).filter(
        (v): v is string => typeof v === "string"
      );
      expect(items).toContain("Lakeside cabin getaway");
      expect(items).toContain("Vineyard & spa retreat");
      expect(items.length).toBe(5);
    } finally {
      engine.dispose();
    }
  });

  it("ask-ai: the Agent text card streams then settles its answer", () => {
    const engine = new DemoEngine(chatQaCast, { resolveAssetUrl });
    try {
      const wf = chatQaCast.workflow.id;
      engine.seekToTime(6000);
      expect(
        useResultsStore.getState().getChunk(wf, focused(wf), "chat")
      ).toContain("API");
      engine.seekToTime(12000);
      expect(lastOutputs(wf, "chat").text).toContain("set of rules");
    } finally {
      engine.dispose();
    }
  });

  it("combine-inputs: the Prompt node feeds the merged result to the preview", () => {
    const engine = new DemoEngine(templateMergeCast, { resolveAssetUrl });
    try {
      const wf = templateMergeCast.workflow.id;
      engine.seekToTime(7000);
      const result = useResultsStore
        .getState()
        .getOutputResult(wf, focused(wf), "preview");
      expect(result).toBe("Hi, I'm Ada and I work in robotics.");
    } finally {
      engine.dispose();
    }
  });

  it("connect-run: the transform output reaches the preview", () => {
    const engine = new DemoEngine(connectRunCast, { resolveAssetUrl });
    try {
      const wf = connectRunCast.workflow.id;
      engine.seekToTime(6800);
      const result = useResultsStore
        .getState()
        .getOutputResult(wf, focused(wf), "preview");
      expect(result).toBe("HELLO NODETOOL");
    } finally {
      engine.dispose();
    }
  });
});
