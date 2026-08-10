/**
 * The compile pipeline end to end, one fixture per way it can end.
 *
 * Every rejection here is a *named* skip. That is the contract the Package
 * Manager and the catalog diagnostics depend on: a pack author who imported
 * `node:fs` gets told so, not handed "compilation failed".
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compileNpmModule } from "../src/compile.js";
import { CompiledModuleCache } from "../src/cache.js";
import { NPM_BUNDLE_MAX_BYTES } from "../src/options.js";
import { cleanup, materializeOversizedPack, materializePack } from "./fixtures.js";

const workspace = mkdtempSync(join(tmpdir(), "nodetool-compile-test-"));
const cacheRoot = join(workspace, "cache");

afterAll(() => cleanup(workspace));

function compile(packDir: string, npmName: string) {
  return compileNpmModule({
    packDir,
    npmName,
    cache: new CompiledModuleCache(cacheRoot)
  });
}

describe("compileNpmModule", () => {
  it("admits a clean ESM utility", async () => {
    const packDir = materializePack("clean", workspace);
    const { outcome } = await compile(packDir, "fixture-clean");
    expect(outcome.status).toBe("compiled");
    if (outcome.status !== "compiled") return;
    expect(outcome.artifact.source).toContain("slugify");
    expect(outcome.artifact.inputsDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(outcome.artifact.optionsDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(outcome.warnings).toBeUndefined();
  });

  it("names the Node builtin a dependency imports", async () => {
    const packDir = materializePack("builtin", workspace);
    const { outcome } = await compile(packDir, "fixture-builtin");
    expect(outcome.status).toBe("skipped");
    if (outcome.status !== "skipped") return;
    expect(outcome.code).toBe("npm-module-builtin-import");
    expect(outcome.message).toContain("node:fs");
  });

  it("rejects a hard forbidden-global reference and names it", async () => {
    const packDir = materializePack("process-hard", workspace);
    const { outcome } = await compile(packDir, "fixture-process-hard");
    expect(outcome.status).toBe("skipped");
    if (outcome.status !== "skipped") return;
    expect(outcome.code).toBe("npm-module-forbidden-global");
    expect(outcome.message).toContain("process");
  });

  it("admits a feature-detected reference with a warning", async () => {
    const packDir = materializePack("process-detected", workspace);
    const { outcome } = await compile(packDir, "fixture-process-detected");
    expect(outcome.status).toBe("compiled");
    if (outcome.status !== "compiled") return;
    expect(outcome.warnings?.join(" ")).toContain("process");
  });

  it("reports the probe's own error when initialization throws", async () => {
    const packDir = materializePack("throwing", workspace);
    const { outcome } = await compile(packDir, "fixture-throwing");
    expect(outcome.status).toBe("skipped");
    if (outcome.status !== "skipped") return;
    expect(outcome.code).toBe("npm-module-probe-failed");
    expect(outcome.message).toContain("refuses to initialize");
  });

  it("skips a bundle over the size cap and reports the measured size", async () => {
    const packDir = materializeOversizedPack(NPM_BUNDLE_MAX_BYTES + 4096, workspace);
    const { outcome } = await compile(packDir, "fixture-oversized");
    expect(outcome.status).toBe("skipped");
    if (outcome.status !== "skipped") return;
    expect(outcome.code).toBe("npm-module-too-large");
    expect(outcome.message).toMatch(/\d+ bytes/);
  });

  it("reports an unresolvable dependency as its own skip", async () => {
    const packDir = materializePack("clean", workspace);
    const { outcome } = await compile(packDir, "fixture-absent");
    expect(outcome.status).toBe("skipped");
    if (outcome.status !== "skipped") return;
    expect(outcome.code).toBe("npm-module-unresolved");
  });
});
