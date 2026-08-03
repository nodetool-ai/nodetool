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
 * suite is deterministic. `lib.datetime.Now` is the one exception, and it is
 * asserted on shape.
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

describe("markdown_extract_cli", () => {
  it("pulls headers, lists, code blocks and tables out of one document", async () => {
    const out = await run("markdown_extract_cli.json");

    expect(out["headers"]).toEqual([
      [
        { level: 1, text: "Release Notes", index: 0 },
        { level: 2, text: "Added", index: 1 },
        { level: 2, text: "Steps", index: 2 }
      ]
    ]);
    // max_level is a ceiling, so the same document yields only the h1.
    expect(out["headers_h1"]).toEqual([
      [{ level: 1, text: "Release Notes", index: 0 }]
    ]);

    // Lists nest one level: a list *per list block* in the document.
    expect(out["bullets"]).toEqual([
      [[{ text: "trigger examples" }, { text: "an executing test" }]]
    ]);
    expect(out["numbered"]).toEqual([
      [["build the packages", "run the suite"]]
    ]);

    expect(out["code_blocks"]).toEqual([
      [{ language: "bash", code: "npm run test" }]
    ]);

    expect(out["tables"]).toEqual([
      {
        rows: [
          { node: "Concat", covered: "yes" },
          { node: "Chunk", covered: "no" }
        ]
      }
    ]);
  });
});

describe("validate_strings_cli", () => {
  it("classifies emails, URLs and IPs, and sanitizes untrusted text", async () => {
    const out = await run("validate_strings_cli.json");

    expect(out["is_email"]).toEqual([true]);
    expect(out["is_url"]).toEqual([true]);
    expect(out["is_url_negative"]).toEqual([false]);

    expect(out["ipv4_flag"]).toEqual([true]);
    expect(out["ipv6_flag"]).toEqual([true]);
    // The v4/v6 flags are independent, not a single "is an IP" bit.
    expect(out["ipv4_is_v6"]).toEqual([false]);

    expect(out["url_is_url"]).toEqual([true]);
    expect(out["url_is_uuid"]).toEqual([false]);

    // Sanitize does not trim before escaping, and escapes the forward slash
    // too — both are load-bearing if you compare the output to a fixture.
    expect(out["escaped"]).toEqual([
      "  &lt;script&gt;alert(1)&lt;&#x2F;script&gt;  "
    ]);
    expect(out["trimmed"]).toEqual(["<script>alert(1)</script>"]);
    // Normalizing lowercases the address and drops surrounding whitespace.
    expect(out["normalized_email"]).toEqual(["matti@nodetool.ai"]);
  });
});

describe("list_build_cli", () => {
  it("builds lists by range, repetition and tiling", async () => {
    const out = await run("list_build_cli.json");
    // stop is exclusive: 0..10 step 2 stops at 8.
    expect(out["range"]).toEqual([[0, 2, 4, 6, 8]]);
    expect(out["repeat_value"]).toEqual([["ok", "ok", "ok"]]);
    // Tile repeats the whole list; RepeatEach repeats each element in place.
    // Same inputs, different order — that is the only thing separating them.
    expect(out["tile"]).toEqual([["a", "b", "a", "b", "a", "b"]]);
    expect(out["repeat_each"]).toEqual([["a", "a", "a", "b", "b", "b"]]);
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

describe("datetime_cli", () => {
  it("formats, shifts and compares fixed dates", async () => {
    const out = await run("datetime_cli.json");

    expect(out["formatted"]).toEqual(["2026-08-02"]);
    // 2026-08-02 + 30 days. August has 31 days, so this lands on Sep 1.
    expect(out["added_iso"]).toEqual(["2026-09-01T00:00:00.000Z"]);

    // Diff is date_a - date_b, so an earlier `a` gives a negative number.
    // The sign is the thing worth pinning; is_before says the same in a
    // form that does not depend on argument order.
    expect(out["diff_days"]).toEqual([-30]);
    expect(out["a_is_before_b"]).toEqual([true]);

    // The period end is inclusive, to the last millisecond.
    expect(out["month_start"]).toEqual(["2026-08-01T00:00:00.000Z"]);
    expect(out["month_end"]).toEqual(["2026-08-31T23:59:59.999Z"]);

    // Now is the one non-deterministic node here, so it is asserted on shape.
    const [epoch] = out["now_epoch_ms"] as number[];
    expect(typeof epoch).toBe("number");
    expect(epoch).toBeGreaterThan(1_700_000_000_000);
  });
});

describe("html_extract_cli", () => {
  it("extracts metadata, links and media from one HTML document", async () => {
    const out = await run("html_extract_cli.json");

    expect(out["title"]).toEqual(["NodeTool Docs"]);
    expect(out["description"]).toEqual(["Visual AI workflows"]);
    expect(out["keywords"]).toEqual(["workflow, nodes, ai"]);

    // href stays relative; base_url is used to classify internal vs external,
    // not to rewrite the link.
    expect(out["links"]).toEqual([
      [
        { href: "/workflows", text: "workflow guide", type: "internal" },
        {
          href: "https://github.com/nodetool-ai/nodetool",
          text: "source",
          type: "external"
        }
      ]
    ]);

    // Media refs are the opposite: base_url *is* applied, and each comes back
    // as a typed asset ref rather than a bare string.
    expect(out["images"]).toEqual([
      [{ uri: "https://docs.nodetool.ai/img/editor.png", type: "image" }]
    ]);
    expect(out["videos"]).toEqual([
      [{ uri: "https://docs.nodetool.ai/media/tour.mp4", type: "video" }]
    ]);
    expect(out["audios"]).toEqual([
      [{ uri: "https://docs.nodetool.ai/media/intro.mp3", type: "audio" }]
    ]);

    expect(out["text"]).toEqual([
      "DOCS\n\nStart with the workflow guide [/workflows] or the source " +
        "[https://github.com/nodetool-ai/nodetool].\n\neditor [/img/editor.png]"
    ]);

    // BaseUrl drops the path, query and fragment.
    expect(out["base_url"]).toEqual(["https://docs.nodetool.ai"]);
  });
});

describe("dataframe_query_cli", () => {
  it("queries a dataframe parsed out of a markdown table", async () => {
    const out = await run("dataframe_query_cli.json");

    // Markdown cells arrive as strings — including the numeric column.
    expect(out["table"]).toEqual([
      {
        rows: [
          { node: "Concat", runs: "12", status: "ok" },
          { node: "Chunk", runs: "48", status: "ok" },
          { node: "Pivot", runs: "3", status: "failed" }
        ]
      }
    ]);

    expect(out["first_failed"]).toEqual([
      { rows: [{ node: "Pivot", runs: "3", status: "failed" }] }
    ]);

    // `runs > 20` still compares numerically against those strings, so it
    // picks 48 and not the lexicographically larger "3".
    expect(out["first_busy"]).toEqual([
      { rows: [{ node: "Chunk", runs: "48", status: "ok" }] }
    ]);
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
