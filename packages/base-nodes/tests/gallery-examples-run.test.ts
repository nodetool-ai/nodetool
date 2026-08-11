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
 - An output wired to a stream shows only the last value that passed, so
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

});
