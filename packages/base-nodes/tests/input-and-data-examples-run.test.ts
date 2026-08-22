/**
 * Executes the input and dataframe examples in `examples/workflows/` and
 * asserts what they produce — including what happens when a caller supplies
 * `params`.
 *
 * Input nodes had almost no example coverage, which is odd given every workflow
 * starts with one and their whole contract is the `params` mapping: the runner
 * matches a param to an input node by the node's `name`, and falls back to the
 * node's own `value` when no param is supplied. Nothing executed that mapping,
 * so nothing would have caught it breaking.
 *
 * Each case runs the same graph twice, once bare and once with params, because
 * only the pair distinguishes "the param was applied" from "the default
 * happened to match".
 *
 * Everything here is offline and deterministic — the inputs are constants and
 * the model-selector nodes only pass a model reference through, never contacting
 * a provider.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NodeRegistry,
  createGraphNodeTypeResolver
} from "@nodetool-ai/node-sdk";
import { ExecutionSession } from "@nodetool-ai/execution";
import { registerBaseNodes } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(__dirname, "../../../examples/workflows");

interface RunResult {
  status: string;
  error?: string;
  outputs: Record<string, unknown[]>;
}

/** Runs an example, optionally with `params`, and returns the raw result. */
async function execute(
  file: string,
  params: Record<string, unknown> = {}
): Promise<RunResult> {
  const { graph } = JSON.parse(
    fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8")
  ) as { graph: unknown };
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  const session = await ExecutionSession.create({
    graph,
    registry,
    resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
    jobId: `input-example-${file}`,
    params,
    // These examples carry model references but never call a provider — the
    // model-selector nodes pass the reference through as a value. The run
    // preflight cannot tell that apart from a node about to spend money, so
    // it would demand ANTHROPIC_API_KEY/FAL_API_KEY/OPENAI_API_KEY for a
    // suite that contacts nothing. Declaring "no provider configuration
    // required" states here what this file's header already claims.
    providerConfiguration: () => []
  } as never);
  const result = await session.result;
  return {
    status: result.status,
    error: result.error,
    outputs: (result.outputs ?? {}) as Record<string, unknown[]>
  };
}

/** Runs an example that is expected to succeed. */
async function run(
  file: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown[]>> {
  const r = await execute(file, params);
  expect(r.error ?? null, `${file} errored`).toBeNull();
  expect(r.status, `${file} did not complete`).toBe("completed");
  return r.outputs;
}

describe("inputs_scalar_cli", () => {
  it("falls back to each node's own value when no params are supplied", async () => {
    const out = await run("inputs_scalar_cli.json");
    expect(out["flag"]).toEqual([false]);
    expect(out["count"]).toEqual([7]);
    expect(out["ratio"]).toEqual([0.25]);
    expect(out["title"]).toEqual(["untitled"]);
    expect(out["mode"]).toEqual(["fast"]);
    expect(out["tags"]).toEqual([["alpha", "beta"]]);
    expect(out["lines"]).toEqual([["first", "second"]]);
  });

  it("applies params matched to each input node by name", async () => {
    // Every value here differs from the graph's own, so a param that failed to
    // apply would show up as the default rather than passing silently.
    const out = await run("inputs_scalar_cli.json", {
      flag: true,
      count: 42,
      ratio: 0.75,
      title: "overridden",
      mode: "thorough",
      tags: ["x", "y", "z"],
      lines: ["only"]
    });
    expect(out["flag"]).toEqual([true]);
    expect(out["count"]).toEqual([42]);
    expect(out["ratio"]).toEqual([0.75]);
    expect(out["title"]).toEqual(["overridden"]);
    expect(out["mode"]).toEqual(["thorough"]);
    expect(out["tags"]).toEqual([["x", "y", "z"]]);
    expect(out["lines"]).toEqual([["only"]]);
  });

  it("clamps a numeric param to the node's min/max rather than rejecting it", async () => {
    // This is the one worth pinning: an out-of-range param is neither an error
    // nor passed through — it is silently clamped. `count` is capped at 100 and
    // `ratio` at 1, so a caller asking for 500 gets 100 and never hears about
    // it.
    const out = await run("inputs_scalar_cli.json", { count: 500, ratio: 2.5 });
    expect(out["count"]).toEqual([100]);
    expect(out["ratio"]).toEqual([1]);
  });

  it("rejects a SelectInput value outside its options", async () => {
    // SelectInput is the exception to the clamping above: it fails the run
    // instead of coercing, and names the allowed set.
    const r = await execute("inputs_scalar_cli.json", { mode: "not-an-option" });
    expect(r.status).not.toBe("completed");
    expect(r.error).toContain("not-an-option");
    expect(r.error).toContain("fast, balanced, thorough");
  });
});

describe("inputs_typed_cli", () => {
  it("carries typed references through untouched", async () => {
    const out = await run("inputs_typed_cli.json");

    expect(out["table"]).toEqual([
      {
        type: "dataframe",
        columns: [
          { name: "node", data_type: "string" },
          { name: "runs", data_type: "int" }
        ],
        data: [
          ["Concat", 12],
          ["Chunk", 48]
        ]
      }
    ]);
    expect(out["doc"]).toEqual([
      { type: "document", uri: "memory://notes.txt" }
    ]);
    expect(out["size"]).toEqual([
      { type: "image_size", width: 1024, height: 576 }
    ]);
    expect(out["tint"]).toEqual([{ type: "color", value: "#1e88e5" }]);

    // Path inputs are plain strings — they are not resolved or checked for
    // existence, which is why nothing here needs the paths to exist.
    expect(out["file_path"]).toEqual(["/data/inbox/report.json"]);
    expect(out["folder_path"]).toEqual(["/data/inbox"]);

    // MessageDeconstructor splits one message into its parts.
    expect(out["role"]).toEqual(["user"]);
    expect(out["text"]).toEqual(["summarise the release notes"]);
    expect(out["thread_id"]).toEqual(["t-9"]);
  });

  it("replaces a whole typed reference when a param supplies one", async () => {
    const out = await run("inputs_typed_cli.json", {
      size: { type: "image_size", width: 256, height: 256 },
      file: "/tmp/other.json"
    });
    expect(out["size"]).toEqual([
      { type: "image_size", width: 256, height: 256 }
    ]);
    expect(out["file_path"]).toEqual(["/tmp/other.json"]);
  });
});

describe("inputs_model_selectors_cli", () => {
  it("passes each model reference through without contacting a provider", async () => {
    // Selecting a model is not using one: these nodes emit the reference and
    // nothing dials out, which is what makes them safe to assert offline.
    const out = await run("inputs_model_selectors_cli.json");

    expect(out["llm"]).toEqual([
      {
        type: "language_model",
        provider: "anthropic",
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6"
      }
    ]);
    expect(out["image_model"]).toEqual([
      {
        type: "image_model",
        provider: "fal_ai",
        id: "fal-ai/flux/schnell",
        name: "FLUX schnell"
      }
    ]);
    expect(out["video_model"]).toEqual([
      {
        type: "video_model",
        provider: "fal_ai",
        id: "fal-ai/kling-video/v3/standard/text-to-video",
        name: "Kling v3"
      }
    ]);
    expect(out["asr"]).toEqual([
      { type: "asr_model", provider: "openai", id: "whisper-1", name: "Whisper" }
    ]);
    // The TTS reference carries its voice list and selection with it.
    expect(out["tts"]).toEqual([
      {
        type: "tts_model",
        provider: "openai",
        id: "tts-1",
        name: "TTS 1",
        voices: ["alloy", "echo"],
        selected_voice: "echo"
      }
    ]);
    expect(out["embedding"]).toEqual([
      {
        type: "embedding_model",
        provider: "openai",
        id: "text-embedding-3-small",
        name: "Text Embedding 3 Small",
        dimensions: 1536
      }
    ]);
    expect(out["hf"]).toEqual([
      { type: "hf.model", repo_id: "black-forest-labs/FLUX.1-schnell" }
    ]);
  });
});
