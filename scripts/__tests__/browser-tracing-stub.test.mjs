import assert from "node:assert/strict";
import { test } from "vitest";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { SpanStatusCode } from "@opentelemetry/api";
import * as tracing from "../../web/vite-node-stubs/tracing-stub.js";

test("browser trace context imports do not require Node async-hooks exports", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../../packages/runtime/src/trace-context-manager.ts", import.meta.url))],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    external: ["@nodetool-ai/config", "@opentelemetry/api"],
    plugins: [{
      name: "browser-async-hooks-boundary",
      setup(plugin) {
        plugin.onResolve({ filter: /^node:async_hooks$/ }, () => ({ path: "async-hooks", namespace: "browser-empty" }));
        plugin.onLoad({ filter: /.*/, namespace: "browser-empty" }, () => ({ contents: "export {};", loader: "js" }));
      }
    }]
  });
  assert.equal(result.outputFiles.length, 1);
  assert.ok(result.outputFiles[0].text.includes("NodeTraceContextManager"));
});

test.each([
  "../../web/vite-node-stubs/fs-stub.js",
  "../../packages/workflow-runner/e2e/stubs/fs-stub.js"
])("browser filesystem stub %s exports a throwing renameSync", async (stubPath) => {
  const result = await build({
    stdin: { contents: 'export { renameSync } from "node:fs";', resolveDir: process.cwd() },
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    plugins: [{
      name: "browser-filesystem-boundary",
      setup(plugin) {
        plugin.onResolve({ filter: /^node:fs$/ }, () => ({ path: fileURLToPath(new URL(stubPath, import.meta.url)) }));
      }
    }]
  });
  const stub = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  assert.throws(() => stub.renameSync("before", "after"), /node:fs.renameSync not available in browser/);
});

test("browser tracing helpers preserve callback values and errors without recording", async () => {
  const helpers = [
    (fn) => tracing.withSpan("browser", {}, fn),
    (fn) => tracing.withWorkflowSpan({}, fn),
    (fn) => tracing.withNodeSpan({}, fn),
    (fn) => tracing.withAgentSpan("execute", {}, fn),
    (fn) => tracing.withTaskSpan("io", "browser", {}, fn)
  ];
  for (const helper of helpers) {
    assert.equal(await helper(async (span) => { assert.equal(span, null); return 7; }), 7);
    const failure = new Error("browser failure");
    await assert.rejects(helper(async () => { throw failure; }), (error) => error === failure);
  }
  for (const status of ["UNSET", "OK", "ERROR"]) {
    assert.equal(tracing.SpanStatusCode[status], SpanStatusCode[status]);
  }
});

test("browser tracing generators preserve yields, terminal values and failures", async () => {
  for (const helper of [tracing.withSpanGen, tracing.withAgentSpanGen]) {
    const iterator = helper("browser", {}, async function* () { yield 1; return 2; });
    assert.deepEqual(await iterator.next(), { value: 1, done: false });
    assert.deepEqual(await iterator.next(), { value: 2, done: true });
    const failure = new Error("generator failure");
    const failing = helper("browser", {}, async function* () { yield 1; throw failure; });
    await failing.next();
    await assert.rejects(failing.next(), (error) => error === failure);
  }
});

test("browser usage and modality wrappers preserve the provider callback contract", async () => {
  const slot = tracing.createUsageSlot();
  assert.equal(await slot.runInSlot(async () => 9), 9);
  assert.equal(slot.getUsage(), null);
  assert.equal(slot.getRequest(), null);
  assert.equal(await tracing.withUsageCapture(async () => 11), 11);
  assert.equal(await tracing.withModalityCapture(async (alreadyActive) => alreadyActive), false);
  tracing.setLastUsage({ input_tokens: 1 });
  tracing.setLastRequest({ messages: [] });
  assert.equal(tracing.consumeLastUsage(), null);
  assert.equal(tracing.peekLastUsage(), null);
  assert.equal(tracing.peekLastRequest(), null);
});
