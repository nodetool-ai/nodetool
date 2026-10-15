import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function falFixtureGraph() {
  return { nodes: [
    { id: "fal", type: "fal.llm.OpenRouter", data: { prompt: "Return the fixture response", model: "fixture/model" } },
    { id: "out", type: "nodetool.control.Reroute", name: "fal_result" }
  ], edges: [{ id: "fal-output", source: "fal", sourceHandle: "output", target: "out", targetHandle: "input_value" }] };
}

/** Execute the installed FAL node, substituting only the external queue transport. */
export function runFalFixture(cliEntry, cwd, env, run) {
  const file = join(cwd, "packed-fal.json");
  const trace = join(cwd, "packed-fal-trace.jsonl");
  writeFileSync(file, JSON.stringify({ graph: falFixtureGraph(), params: {} }));
  writeFileSync(trace, "");
  const result = JSON.parse(run(process.execPath, ["--import", fileURLToPath(new URL("./fixtures/packed-fal-preload.mjs", import.meta.url)),
    cliEntry, "workflows", "run", file, "--json"], { cwd, timeout: 120_000,
    env: { ...env, SECRETS_MASTER_KEY: randomBytes(32).toString("base64"), FAL_FIXTURE_TRACE: trace, FAL_API_KEY: "packed-fal-fixture-sentinel" } }));
  assert.equal(result.status, "completed");
  assert.deepEqual(result.outputs, { fal_result: ["packed FAL fixture"] });
  const requests = readFileSync(trace, "utf8").trim().split("\n").map(JSON.parse);
  const origin = "https://queue.fal.run/openrouter/router";
  assert.deepEqual(requests, [
    { step: 0, method: "POST", url: origin },
    { step: 1, method: "GET", url: `${origin}/requests/packed-fixture/status` },
    { step: 2, method: "GET", url: `${origin}/requests/packed-fixture` }
  ]);
}
