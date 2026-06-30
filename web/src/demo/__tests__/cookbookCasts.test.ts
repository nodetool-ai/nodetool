/**
 * Cookbook casts (web/src/demo/cookbook) — one synthetic recording per recipe in
 * docs/cookbook/patterns.md, rendered into videos by the Remotion harness.
 *
 * These guard that:
 *   1. Every node type used is a real registry type (the strings were verified
 *      against package source) and every graph node has metadata, and vice versa.
 *   2. Events are sorted ascending by `t` — the DemoEngine's forward seek relies
 *      on it (a linear scan that stops at the first event past the cursor).
 *   3. Replaying through the production reducer lands the state each recipe's
 *      payoff reads — settled images, streamed-then-settled text, list/dataframe
 *      buffers, and the final video clip.
 */
import { DemoEngine } from "../demoEngine";
import { cookbookCasts } from "../cookbook";
import type { DemoCast } from "../castTypes";
import useResultsStore from "../../stores/ResultsStore";
import useWorkflowRunsStore from "../../stores/WorkflowRunsStore";

const resolveAssetUrl = (f: string) => `/demo-assets/${f}`;

/** The real registry node types the cookbook recipes are built from. */
const ALLOWED_NODE_TYPES = new Set([
  "nodetool.input.StringInput",
  "nodetool.input.ImageInput",
  "nodetool.input.AudioInput",
  "nodetool.input.RealtimeAudioInput",
  "nodetool.output.Output",
  "nodetool.workflows.base_node.Preview",
  "nodetool.text.Template",
  "nodetool.agents.Agent",
  "nodetool.agents.Summarizer",
  "nodetool.audio.TextToSpeech",
  "nodetool.image.TextToImage",
  "nodetool.image.Fit",
  "nodetool.generators.ListGenerator",
  "nodetool.generators.DataGenerator",
  "nodetool.generators.ChartGenerator",
  "nodetool.data.ImportCSV",
  "nodetool.data.Filter",
  "lib.image.filter.UnsharpMask",
  "lib.image.enhance.AutoContrast",
  "lib.sqlite.CreateTable",
  "lib.sqlite.Insert",
  "lib.sqlite.Query",
  "lib.mail.GmailSearch",
  "lib.http.GetText",
  "vector.HybridSearch",
  "openai.agents.RealtimeAgent",
  "openai.audio.Transcribe",
  "transformers.ImageToText",
  "fal.image_to_image.StableDiffusionV3MediumImageToImage",
  "fal.image_to_image.TopazUpscaleImage",
  "fal.text_to_video.KlingVideoV16ProTextToVideo",
  "fal.image_to_video.KlingVideoV16StandardImageToVideo",
  "fal.image_to_video.KlingVideoAiAvatarV2Pro",
  "fal.image_to_video.Sora2ImageToVideoPro",
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

const uri = (value: unknown): string | undefined =>
  (value as { uri?: string } | undefined)?.uri;

describe("cookbook casts — structure", () => {
  it("covers all 15 cookbook patterns with unique ids", () => {
    expect(cookbookCasts).toHaveLength(15);
    const ids = cookbookCasts.map((c) => c.id);
    expect(new Set(ids).size).toBe(15);
    ids.forEach((id) => expect(id.startsWith("cookbook-")).toBe(true));
  });

  it.each(cookbookCasts.map((c) => [c.id, c] as const))(
    "%s uses only real node types, with metadata ↔ graph parity",
    (_id, cast: DemoCast) => {
      const graphTypes = cast.workflow.graph.nodes.map((n) => n.type);
      const metaTypes = Object.keys(cast.metadata);
      for (const type of [...graphTypes, ...metaTypes]) {
        expect(ALLOWED_NODE_TYPES.has(type)).toBe(true);
      }
      // Every graph node has metadata, and every metadata entry is used.
      for (const type of graphTypes) expect(cast.metadata[type]).toBeDefined();
      for (const type of metaTypes) expect(graphTypes).toContain(type);
    }
  );

  it.each(cookbookCasts.map((c) => [c.id, c] as const))(
    "%s has events sorted ascending by t, within durationMs",
    (_id, cast: DemoCast) => {
      for (let i = 1; i < cast.events.length; i++) {
        expect(cast.events[i].t).toBeGreaterThanOrEqual(cast.events[i - 1].t);
      }
      expect(cast.events.at(-1)!.t).toBeLessThanOrEqual(cast.durationMs);
    }
  );
});

describe("cookbook casts — replay lands the payoff state", () => {
  it("image-enhancement: the final filter settles with an image", () => {
    const cast = cookbookCasts.find((c) => c.id === "cookbook-image-enhancement")!;
    const engine = new DemoEngine(cast, { resolveAssetUrl });
    try {
      const wf = cast.workflow.id;
      engine.seekToTime(cast.durationMs - 100);
      expect(uri(lastOutputs(wf, "contrast").output)).toBeTruthy();
    } finally {
      engine.dispose();
    }
  });

  it("chat-with-docs: the Agent streams then settles a grounded answer", () => {
    const cast = cookbookCasts.find((c) => c.id === "cookbook-chat-with-docs")!;
    const engine = new DemoEngine(cast, { resolveAssetUrl });
    try {
      const wf = cast.workflow.id;
      engine.seekToTime(10000);
      expect(useResultsStore.getState().getChunk(wf, focused(wf), "answer")).toContain("server");
      engine.seekToTime(cast.durationMs - 100);
      expect(String(lastOutputs(wf, "answer").text)).toContain("7777");
    } finally {
      engine.dispose();
    }
  });

  it("text-to-video: the generator settles with a video clip", () => {
    const cast = cookbookCasts.find((c) => c.id === "cookbook-text-to-video")!;
    const engine = new DemoEngine(cast, { resolveAssetUrl });
    try {
      const wf = cast.workflow.id;
      engine.seekToTime(cast.durationMs - 100);
      expect(uri(lastOutputs(wf, "kling").output)).toContain("data:video/webm");
    } finally {
      engine.dispose();
    }
  });

  it("flashcards-sqlite: the queried dataframe reaches the preview", () => {
    const cast = cookbookCasts.find((c) => c.id === "cookbook-flashcards-sqlite")!;
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

  it("image-to-story: the narration audio reaches the preview", () => {
    const cast = cookbookCasts.find((c) => c.id === "cookbook-image-to-story")!;
    const engine = new DemoEngine(cast, { resolveAssetUrl });
    try {
      const wf = cast.workflow.id;
      engine.seekToTime(cast.durationMs - 100);
      const result = useResultsStore.getState().getOutputResult(wf, focused(wf), "preview");
      expect(uri(result)).toContain("data:audio/wav");
    } finally {
      engine.dispose();
    }
  });
});
