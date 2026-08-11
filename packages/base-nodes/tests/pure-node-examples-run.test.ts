/**
 * Executes the offline example workflows in `examples/workflows/` and asserts
 * the value every node produced.
 *
 * The companion to `trigger-examples-run.test.ts`, for the same reason. The
 * gallery harness (`example-workflows-execute.test.ts`) runs 216 examples
 * against a fake context and asserts only that each one *completes or fails
 * with a recognised error class*. A node that returns the wrong answer passes
 * that check, and 491 of the 689 registered node types had no example at all.
 * These cases pin behaviour: every assertion is on a value, computed by hand
 * from the input, so a node that silently changes its output fails here.
 *
 * Nothing here touches a model, the network, or the filesystem — the graphs are
 * string constants and pure transforms, so the assertions are exact and the
 * suite is deterministic.
 *
 * Runs through `ExecutionSession` with `resolveNodeType`: the path
 * `nodetool workflows run` and the websocket server both take.
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

async function run(file: string): Promise<Record<string, unknown[]>> {
  const { graph } = JSON.parse(
    fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8")
  ) as { graph: unknown };
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  const session = await ExecutionSession.create({
    graph,
    registry,
    resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
    jobId: `pure-example-${file}`,
    params: {}
  } as never);
  const result = await session.result;
  expect(result.error ?? null, `${file} errored`).toBeNull();
  expect(result.status, `${file} did not complete`).toBe("completed");
  return (result.outputs ?? {}) as Record<string, unknown[]>;
}

describe("text_transforms_cli", () => {
  it("applies each string transform to the same trimmed source", async () => {
    const out = await run("text_transforms_cli.json");
    // The constant is "  hello nodetool  "; every other node reads the trimmed
    // form, so the offsets below are into "hello nodetool" (14 chars).
    expect(out["trimmed"]).toEqual(["hello nodetool"]);
    expect(out["upper"]).toEqual(["HELLO NODETOOL"]);
    // Capitalize raises the first letter only — it is not title case.
    expect(out["capitalized"]).toEqual(["Hello nodetool"]);
    expect(out["starts_with_hello"]).toEqual([true]);
    expect(out["ends_with_tool"]).toEqual([true]);
    expect(out["index_of_node"]).toEqual([6]);
    expect(out["has_length_14"]).toEqual([true]);
    expect(out["slice_6_14"]).toEqual(["nodetool"]);
  });
});

describe("text_regex_parse_cli", () => {
  it("matches, extracts, filters, parses and chunks", async () => {
    const out = await run("text_regex_parse_cli.json");

    // RegexMatch returns a list; `group` selects which capture to return,
    // 0 being the whole match.
    expect(out["date"]).toEqual([["2026-08-02"]]);
    expect(out["year"]).toEqual([["2026"]]);

    // ExtractRegex returns the capture groups, not the whole match.
    expect(out["parts"]).toEqual([["1042", "2026-08-02"]]);

    // FilterRegexString is a filter, not an extractor: on a match it forwards
    // the *whole* value through, and on a miss it emits nothing at all. The
    // empty array for the miss is the assertion that matters — it is what
    // distinguishes a filter from a node that returns "".
    expect(out["kept"]).toEqual([
      "order-1042 shipped 2026-08-02 to matti@nodetool.ai"
    ]);
    expect(out["dropped"]).toEqual([]);

    expect(out["parsed"]).toEqual([{ repo: "nodetool", stars: 1200 }]);

    // Chunk's `length` counts separator-delimited tokens, not characters:
    // "alpha beta gamma delta" at length 2 splits into two 2-word chunks.
    expect(out["chunks"]).toEqual([["alpha beta", "gamma delta"]]);
    // overlap 1 slides the window one token at a time, so the final chunk is
    // the one-token tail.
    expect(out["chunks_overlap"]).toEqual([
      ["alpha beta", "beta gamma", "gamma delta", "delta"]
    ]);
  });
});

describe("control_flow_stream_cli", () => {
  it("filters, drops, taps and collects a stream, and routes a switch", async () => {
    const out = await run("control_flow_stream_cli.json");

    // Each of these is a Collect away from its Output on purpose. A terminal
    // Output records the value its actor holds at completion, so wiring a
    // stream straight into one keeps the *last* item and silently loses the
    // rest — [4] instead of [0, 2, 4]. Collect is what materializes a stream.
    expect(out["evens"]).toEqual([[0, 2, 4]]);
    expect(out["after_warmup"]).toEqual([[3, 4, 5]]);
    expect(out["tapped"]).toEqual([[0, 1, 2, 3, 4, 5]]);
    expect(out["present"]).toEqual([["alpha", "beta", "gamma"]]);

    // Switch emits on exactly one of matched/default, never both.
    expect(out["matched"]).toEqual(["payload"]);
    expect(out["matched_index"]).toEqual([1]);
    expect(out["routed_to_default"]).toEqual(["payload"]);
    expect(out["default_index"]).toEqual([-1]);

    // TryCatch swaps in the fallback for a null value; it does not catch
    // thrown errors, despite the name.
    expect(out["fallback"]).toEqual(["default-value"]);
    expect(out["fallback_flag"]).toEqual([true]);
    expect(out["passthrough"]).toEqual(["present"]);
    expect(out["passthrough_flag"]).toEqual([false]);
  });
});

describe("variables_cli", () => {
  it("writes a workflow variable and reads it back", async () => {
    const out = await run("variables_cli.json");
    // SetVariable forwards the value it stored, which is what sequences
    // GetVariable behind it through the `trigger` input. Without that edge
    // the read can run first and return nothing.
    expect(out["set_returns"]).toEqual(["nightly-42"]);
    expect(out["read_back"]).toEqual(["nightly-42"]);
  });
});
