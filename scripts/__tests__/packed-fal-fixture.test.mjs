import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runFalFixture } from "../packed-fal-fixture.mjs";
const roots = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
const preload = resolve(import.meta.dirname, "../fixtures/packed-fal-preload.mjs");
const origin = "https://queue.fal.run/openrouter/router";
function fixture(source) {
  const root = mkdtempSync(join(tmpdir(), "packed-fal-test-")); roots.push(root);
  const trace = join(root, "trace.jsonl");
  return { root, trace, result: spawnSync(process.execPath, ["--import", preload, "--input-type=module", "-e", source], {
    env: { PATH: process.env.PATH, FAL_API_KEY: "outside-key", FAL_FIXTURE_TRACE: trace }, encoding: "utf8", timeout: 10000
  }) };
}
const submit = `await fetch('${origin}',{method:'POST',headers:{Authorization:'Key packed-fal-fixture-sentinel'},body:JSON.stringify({prompt:'Return the fixture response',model:'fixture/model'})});`;
it("overwrites the outside key and records exactly the deterministic queue exchange", () => {
  const { result, trace } = fixture(`if(process.env.FAL_API_KEY!=='packed-fal-fixture-sentinel')throw Error('key');${submit}
const headers={Authorization:'Key packed-fal-fixture-sentinel'};
await fetch('${origin}/requests/packed-fixture/status',{headers});
const r=await fetch('${origin}/requests/packed-fixture',{headers});console.log((await r.json()).output);`);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe("packed FAL fixture");
  expect(readFileSync(trace,"utf8").trim().split("\n").map(JSON.parse).map(x=>x.method)).toEqual(["POST","GET","GET"]);
});
it.each([
  "await fetch('https://queue.fal.run/unexpected');",
  `await fetch('${origin}');`,
  submit + submit,
  submit.replace("Return the fixture response", "wrong prompt"),
  submit.replace("Key packed-fal-fixture-sentinel", "Key outside-key")
])("rejects unexpected queue requests without network fallback", source => {
  const { result }=fixture(source); expect(result.status).toBe(1); expect(result.stderr).toContain("AssertionError");
});
it("rejects a failed workflow even if its output contains the expected text", () => {
  const { root }=fixture("");
  expect(()=>runFalFixture("cli",root,{},()=>JSON.stringify({status:"failed",outputs:{fal_result:["packed FAL fixture"]}}))).toThrow();
});
it("rejects a successful-looking workflow without a queue exchange", () => {
  const { root }=fixture("");
  expect(()=>runFalFixture("cli",root,{},()=>JSON.stringify({status:"completed",outputs:{fal_result:["packed FAL fixture"]}}))).toThrow();
});
