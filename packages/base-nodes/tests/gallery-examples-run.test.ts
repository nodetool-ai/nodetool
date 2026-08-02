/**
 * Executes a set of shipped gallery examples and asserts what they emit.
 *
 * `example-workflows-validation.test.ts` hydrates all 200-odd gallery examples
 * and checks their shape; it never runs one. A structurally valid example can
 * still teach the opposite of its own description, and three of the seven
 * added alongside this file did exactly that before being corrected:
 *
 *  - `nodetool.text.Chunk` counts `length`/`overlap` in WORDS. A value of 90
 *    on a 38-word passage returned one chunk, so an example titled "chunk a
 *    transcript" shipped a single unsplit chunk.
 *  - `lib.html.ExtractLinks` does not rewrite relative hrefs against
 *    `base_url`; it classifies each link internal or external. The example's
 *    prose claimed resolution the node never performs.
 *  - An output wired to a stream shows only the last value that passed, so
 *    "keep only the long lines" displayed one line out of two until
 *    `nodetool.control.Collect` gathered the stream back into a list.
 *
 * Validation caught none of those, which is the point of this file. Each
 * assertion pins a concrete value — the chunk count, the classified link type,
 * the gathered list — because "something was emitted" would have passed
 * against all three.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeRegistry, createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import { ExecutionSession } from "@nodetool-ai/execution";
import { registerBaseNodes } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY = path.resolve(__dirname, "../nodetool/examples/nodetool-base");

function load(name: string): unknown {
  const raw = JSON.parse(
    fs.readFileSync(path.join(GALLERY, `${name}.json`), "utf8")
  ) as { graph: unknown };
  return raw.graph;
}

/** Mirrors the CLI and the websocket server: registry plus `resolveNodeType`. */
async function run(name: string): Promise<Record<string, unknown[]>> {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  const session = await ExecutionSession.create({
    graph: load(name),
    registry,
    resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
    jobId: `gallery-${name}`,
    params: {}
  } as never);
  const result = await session.result;
  expect(result.error ?? null).toBeNull();
  expect(result.status).toBe("completed");
  return (result.outputs ?? {}) as Record<string, unknown[]>;
}

describe("shipped gallery examples produce what they claim", () => {
  it("Validate a Signup Payload normalises a messy address", async () => {
    const out = await run("Validate a Signup Payload");
    // Leading/trailing space and mixed case, still a valid address.
    expect(out["is_email"]).toEqual([true]);
    // '@' and '+' are not alphanumeric — the check that stops people using
    // is_alphanumeric as a username test on an email field.
    expect(out["is_alphanumeric"]).toEqual([false]);
    expect(out["normalized_email"]).toEqual([
      "ada.lovelace+signup@example.com"
    ]);
  });

  it("Check a URL and an IP reports the address family, not just validity", async () => {
    const out = await run("Check a URL and an IP");
    expect(out["url_ok"]).toEqual([true]);
    expect(out["is_ipv6"]).toEqual([true]);
    expect(out["is_ipv4"]).toEqual([false]);
  });

  it("Map a README's Structure returns the outline with heading levels", async () => {
    const out = await run("Map a README's Structure");
    expect(out["headers"]?.[0]).toEqual([
      { level: 1, text: "NodeTool", index: 0 },
      { level: 2, text: "Install", index: 1 },
      { level: 3, text: "Notes", index: 2 }
    ]);
    expect(out["code"]?.[0]).toEqual([
      { language: "bash", code: "npm install" }
    ]);
  });

  it("Keep Only the Long Lines gathers every survivor, not just the last", async () => {
    const out = await run("Keep Only the Long Lines");
    // Without Collect this was ["another long enough line"] — one of two.
    expect(out["kept"]?.[0]).toEqual([
      "a much longer line worth keeping",
      "another long enough line"
    ]);
    expect(out["count"]).toEqual([2]);
  });

  it("Chunk a Transcript splits into overlapping windows", async () => {
    const out = await run("Chunk a Transcript for Indexing");
    const chunks = out["chunks"]?.[0] as string[];
    // length/overlap are words. At 90 this was a single unsplit chunk.
    expect(chunks.length).toBeGreaterThan(1);
    expect(out["chunk_count"]).toEqual([chunks.length]);
    // The 3-word overlap is the feature: the tail of one chunk opens the next.
    const tail = chunks[0].split(" ").slice(-3).join(" ");
    expect(chunks[1].startsWith(tail)).toBe(true);
  });

  it("Redact and Tidy a Log Line redacts before it scans", async () => {
    const out = await run("Redact and Tidy a Log Line");
    expect(out["redacted"]).toEqual([
      "2026-08-02 WARN user=<email> ip=<ip> retry=3"
    ]);
    // The IP's digits are gone because redaction ran first — the ordering the
    // description calls out. 10, 0, 0 and 7 are absent by construction.
    expect(out["numbers"]?.[0]).toEqual(["2026", "08", "02", "3"]);
  });

  it("Read the Links Out of a Page classifies rather than resolves", async () => {
    const out = await run("Read the Links Out of a Page");
    expect(out["base"]).toEqual(["https://nodetool.ai"]);
    // href stays exactly as authored; base_url only decides internal/external.
    expect(out["links"]?.[0]).toEqual([
      { href: "/docs", text: "Docs", type: "internal" },
      {
        href: "https://github.com/nodetool-ai/nodetool",
        text: "Source",
        type: "external"
      }
    ]);
  });
});
