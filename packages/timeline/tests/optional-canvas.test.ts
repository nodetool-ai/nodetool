import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("keeps timeline data usable without canvas and reports imaging errors at rendering boundaries", () => {
  const directory = mkdtempSync(join(tmpdir(), "timeline-optional-canvas-"));
  try {
    const script = join(directory, "check.mjs");
    writeFileSync(script, `
      import assert from 'node:assert/strict';
      import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, next) {
        if (specifier === '@napi-rs/canvas') {
          const error = new Error("Cannot find package '@napi-rs/canvas'");
          error.code = 'ERR_MODULE_NOT_FOUND';
          throw error;
        }
        return next(specifier, context);
      } });
      const timeline = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../src/index.ts")).href)});
      assert.ok(Object.keys(timeline).length > 0);
      const imagingError = error => error.name === 'MissingRuntimePackageError' && error.runtimePackage === 'imaging';
      await assert.rejects(import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../src/fonts/register-node.ts")).href)}), imagingError);
      await assert.rejects(import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../src/fonts/google-fonts-node.ts")).href)}), imagingError);
      const { ChartRendererLibNode } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../../data-nodes/dist/nodes/lib-charts.js")).href)});
      const chart = new ChartRendererLibNode();
      chart.data = { rows: [{ category: 'sample', value: 1 }] };
      await assert.rejects(chart.process({}), imagingError);
    `);
    const env = { ...process.env, NODETOOL_HOST: "cli" };
    delete env["NODETOOL_OPTIONAL_NODE_MODULES"];
    const result = spawnSync(process.execPath, ["--import", "tsx", script], {
      cwd: resolve(import.meta.dirname, "../../.."), env, encoding: "utf8", timeout: 30_000
    });
    expect(result.status, result.stderr).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 40_000);
