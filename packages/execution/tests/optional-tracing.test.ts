import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runTracing(code: string, hidden?: string, failure: "missing" | "transitive" | "broken" = "missing", sinks: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "nodetool-execution-tracing-"));
  directories.push(directory);
  const hook = join(directory, "tracing.mjs");
  writeFileSync(hook, `import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === ${JSON.stringify(hidden)}) {
    const failure = ${JSON.stringify(failure)};
    const error = new Error(failure === 'broken' ? 'Broken tracing initialization' : "Cannot find package '" + (failure === 'transitive' ? 'missing-tracing-transitive-fixture' : specifier) + "' imported from " + context.parentURL);
    if (failure !== 'broken') error.code = 'ERR_MODULE_NOT_FOUND';
    throw error;
  }
  return next(specifier, context);
} });`);
  const env = { ...process.env };
  for (const name of ["TRACELOOP_API_KEY", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "OTEL_TRACES_EXPORTER", "NODETOOL_TRACE_FILE", "NODETOOL_TRACE_STDOUT", "NODETOOL_OPTIONAL_NODE_MODULES"]) {
    delete env[name];
  }
  return spawnSync(process.execPath, ["--import", hook, "--import", "tsx", "--input-type=module", "--eval", code], {
    cwd: resolve(import.meta.dirname, "../../.."), env: { ...env, ...sinks }, encoding: "utf8", timeout: 30_000
  });
}

const peers = ["@opentelemetry/core", "@opentelemetry/resources", "@opentelemetry/sdk-trace-base"];

describe("automatic durable tracing", () => {
  it.each(peers)("continues automatic registration when %s is absent", (peer) => {
    const result = runTracing(`
      import { ensureRunTraceTelemetry } from './packages/execution/src/run-trace-store.ts';
      import { getTracer } from '@nodetool-ai/runtime';
      await ensureRunTraceTelemetry();
      await ensureRunTraceTelemetry();
      if (getTracer() !== null) throw new Error('Unexpected tracer');
    `, peer);
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);

  it("keeps automatic durable tracing active when the peers are installed", () => {
    const result = runTracing(`
      import { ensureRunTraceTelemetry } from './packages/execution/src/run-trace-store.ts';
      import { getTracer, shutdownTelemetry } from '@nodetool-ai/runtime';
      await ensureRunTraceTelemetry();
      const span = getTracer()?.startSpan('workflow.run');
      if (!span?.isRecording()) throw new Error('Durable tracing disabled');
      span.end();
      await shutdownTelemetry();
    `);
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);

  it.each(["transitive", "broken"] as const)("propagates a %s tracing initialization failure", (failure) => {
    const result = runTracing(`
      import { ensureRunTraceTelemetry } from './packages/execution/src/run-trace-store.ts';
      try { await ensureRunTraceTelemetry(); throw new Error('Failure unexpectedly suppressed'); }
      catch (error) { if (error.name !== 'MissingRuntimePackageError' || error.runtimePackage !== 'tracing') throw error; }
    `, "@opentelemetry/core", failure);
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);

  it.each(["NODETOOL_TRACE_STDOUT", "OTEL_EXPORTER_OTLP_ENDPOINT"])("preserves the missing runtime error for an explicit %s sink", (sink) => {
    const result = runTracing(`
      import { ensureRunTraceTelemetry } from './packages/execution/src/run-trace-store.ts';
      try { await ensureRunTraceTelemetry(); throw new Error('Explicit tracing unexpectedly skipped'); }
      catch (error) { if (error.name !== 'MissingRuntimePackageError' || error.runtimePackage !== 'tracing') throw error; }
    `, "@opentelemetry/core", "missing", { [sink]: sink === "NODETOOL_TRACE_STDOUT" ? "json" : "https://collector.example" });
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);

  it("preserves an explicit programmatic sink error after automatic tracing was skipped", () => {
    const result = runTracing(`
      import { ensureRunTraceTelemetry } from './packages/execution/src/run-trace-store.ts';
      import { initTelemetry } from '@nodetool-ai/runtime';
      await ensureRunTraceTelemetry();
      try { await initTelemetry({ stdout: 'json' }); throw new Error('Explicit tracing unexpectedly skipped'); }
      catch (error) { if (error.name !== 'MissingRuntimePackageError' || error.runtimePackage !== 'tracing') throw error; }
      process.env.NODETOOL_TRACE_STDOUT = 'json';
      try { await ensureRunTraceTelemetry(); throw new Error('New sink unexpectedly skipped'); }
      catch (error) { if (error.name !== 'MissingRuntimePackageError' || error.runtimePackage !== 'tracing') throw error; }
    `, "@opentelemetry/core");
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);

  it("runs a real saved core workflow with a tracing peer absent", () => {
    const result = runTracing(`
      import { initTestDb, Workflow } from '@nodetool-ai/models';
      import { NodeRegistry } from '@nodetool-ai/node-sdk';
      import { ConstantStringNode } from '@nodetool-ai/core-nodes';
      import { runWorkflow } from './packages/execution/src/service/workflow-run.ts';
      initTestDb();
      const registry = new NodeRegistry();
      registry.register(ConstantStringNode);
      const workflow = await Workflow.create({ user_id: 'owner', name: 'Core without tracing', graph: {
        nodes: [{ id: 'constant', type: ConstantStringNode.nodeType, properties: { value: 'core-only-success' } }], edges: []
      } });
      const outcome = await runWorkflow({ workflowId: workflow.id, userId: 'owner', environment: { registry }, resolveWorkspace: async () => null });
      if (outcome.kind !== 'payload' || !JSON.stringify(outcome.payload).includes('core-only-success')) throw new Error(JSON.stringify(outcome));
    `, "@opentelemetry/core");
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);
});
