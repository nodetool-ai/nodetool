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

function runHidden(specifiers: readonly string[], code: string) {
  const directory = mkdtempSync(join(tmpdir(), "nodetool-runtime-hidden-"));
  directories.push(directory);
  const hook = join(directory, "hide.mjs");
  writeFileSync(hook, `import { registerHooks } from 'node:module';
const hidden = new Set(${JSON.stringify(specifiers)});
registerHooks({ resolve(specifier, context, next) {
  if (hidden.has(specifier)) { const error = new Error('Hidden dependency ' + specifier); error.code = 'ERR_MODULE_NOT_FOUND'; throw error; }
  return next(specifier, context);
} });`);
  const env = { ...process.env };
  for (const name of ["TRACELOOP_API_KEY", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "OTEL_TRACES_EXPORTER", "NODETOOL_TRACE_FILE", "NODETOOL_TRACE_STDOUT", "NODETOOL_OPTIONAL_NODE_MODULES"]) {
    delete env[name];
  }
  return spawnSync(process.execPath, ["--import", hook, "--import", "tsx", "--input-type=module", "--eval", code], {
    cwd: resolve(import.meta.dirname, "../../.."), env, encoding: "utf8", timeout: 30_000
  });
}

const tracingDependencies = ["@opentelemetry/core", "@opentelemetry/resources", "@opentelemetry/sdk-trace-base"];

describe("optional runtime libraries", () => {
  it("imports runtime and skips tracing with all tracing peers hidden when no sink is configured", () => {
    const result = runHidden(tracingDependencies, `
      import { initTelemetry, withSpan } from './packages/runtime/src/index.ts';
      if (await initTelemetry({ silent: true }) !== false) throw new Error('Tracing unexpectedly active');
      if (await withSpan('test', {}, async (span) => span) !== null) throw new Error('Unexpected span');
    `);
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);

  it.each(tracingDependencies)("reports structured tracing details when %s is missing for a requested sink", (specifier) => {
    const result = runHidden([specifier], `
      import { initTelemetry } from './packages/runtime/src/telemetry.ts';
      try { await initTelemetry({ stdout: 'json', silent: true }); throw new Error('Tracing unexpectedly succeeded'); }
      catch (error) {
        if (error.name !== 'MissingRuntimePackageError' || error.runtimePackage !== 'tracing') throw error;
        if (error.details.missing !== ${JSON.stringify(specifier)} || error.details.reason !== 'missing') throw error;
      }
    `);
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);

  it("reports structured imaging details when sharp is missing", () => {
    const result = runHidden(["sharp"], `
      import { encodeRawRgbaToPng } from './packages/runtime/src/image-codec.ts';
      try { await encodeRawRgbaToPng(new Uint8Array([255, 0, 0, 255]), 1, 1); throw new Error('Encoding unexpectedly succeeded'); }
      catch (error) {
        if (error.name !== 'MissingRuntimePackageError' || error.runtimePackage !== 'imaging') throw error;
        if (error.details.missing !== 'sharp' || error.details.reason !== 'missing') throw error;
      }
    `);
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);

  it("reports structured imaging details when Canvas is missing", () => {
    const result = runHidden(["@napi-rs/canvas"], `
      import { loadCanvas } from './packages/runtime/src/index.ts';
      try { await loadCanvas(); throw new Error('Canvas unexpectedly succeeded'); }
      catch (error) {
        if (error.name !== 'MissingRuntimePackageError' || error.runtimePackage !== 'imaging') throw error;
        if (error.details.missing !== '@napi-rs/canvas' || error.details.reason !== 'missing') throw error;
      }
    `);
    expect(result.status, result.stderr).toBe(0);
  }, 40_000);

  it("renders real Canvas and sharp PNGs and traces to a configured sink", () => {
    const result = runHidden([], `
      import { loadCanvas, encodeRawRgbaToPng, initTelemetry, shutdownTelemetry, withSpan } from './packages/runtime/src/index.ts';
      const { createCanvas } = await loadCanvas();
      const canvas = createCanvas(1, 1);
      canvas.getContext('2d').fillRect(0, 0, 1, 1);
      if (canvas.toBuffer('image/png')[1] !== 80) throw new Error('Canvas failed');
      const png = await encodeRawRgbaToPng(new Uint8Array([255, 0, 0, 255]), 1, 1);
      if (png[1] !== 80) throw new Error('Sharp failed');
      if (!await initTelemetry({ stdout: 'json', silent: true })) throw new Error('No tracer');
      await withSpan('node.process', { 'node.id': 'optional-runtime-success' }, async () => 42);
      await shutdownTelemetry();
    `);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"name":"node.process"');
    expect(result.stdout).toContain('"node.id":"optional-runtime-success"');
  }, 40_000);
});
