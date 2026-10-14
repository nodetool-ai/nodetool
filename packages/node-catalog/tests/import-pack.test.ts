import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { importPack } from "../src/import-pack.js";

// The child loads every core pack while `test:affected` runs other suites in
// parallel. On CI it spent 8.7s loading metadata alone and timed out at 30s.
const CHILD_TIMEOUT_MS = 120_000;
// Actual pack roots and subprocesses load built media dependencies under CI load.
const PACK_IMPORT_TEST_TIMEOUT_MS = CHILD_TIMEOUT_MS + 5_000;

it("rejects unknown pack IDs and specifiers outside the pack's closure", async () => {
  await expect(importPack("unknown-pack")).rejects.toThrow(/Unknown node pack/);
  await expect(importPack("fal", "@nodetool-ai/replicate-nodes")).rejects.toThrow(/does not provide/);
  await expect(importPack("fal", "../cli")).rejects.toThrow(/Invalid specifier/);
  await expect(importPack("fal", "@nodetool-ai/fal-nodes-malicious")).rejects.toThrow(/does not provide/);
});

it("supports a pack's registrar, relative subpaths and provided first-party packages", async () => {
  const pack = await importPack<typeof import("@nodetool-ai/fal-nodes")>("fal");
  expect(pack["registerFalNodes"]).toEqual(expect.any(Function));
  expect(await importPack("document", "lib/pdf-text")).toHaveProperty("extractPdfText");
  expect(await importPack("game", "@nodetool-ai/game-renderer/preparation3d")).toHaveProperty("prepareGameModel");
}, PACK_IMPORT_TEST_TIMEOUT_MS);

it("keeps unavailable packs catalog-only and preserves initialization errors", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const script = `
    import assert from "node:assert/strict";
    import { registerHooks } from "node:module";
    const started = Date.now();
    const phase = message => process.stdout.write("catalog fixture: " + message + " (" + (Date.now() - started) + "ms)\\n");
    const source = ${JSON.stringify(new URL("../dist/index.js", import.meta.url).href)};
    phase("loading metadata");
    const { importPack, registerAvailablePacks, readCatalogIndex, readCatalogNodes, MissingPackError } = await import(source);
    const packs = readCatalogIndex().packs;
    const unavailable = new Set(packs.filter(pack => pack.kind === "node-pack")
      .flatMap(pack => [pack.npm.name, ...pack.provides]));
    assert(unavailable.size > 0);
    assert(unavailable.has("@nodetool-ai/fal-nodes"));
    assert(packs.some(pack => pack.kind === "core" && pack.npm.name === "@nodetool-ai/core-nodes"));
    for (const pack of packs.filter(pack => pack.kind === "core")) assert(!unavailable.has(pack.npm.name));
    phase("metadata ready");
    const hooks = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (unavailable.has(specifier)) {
          const error = new Error("Cannot find package " + specifier);
          error.code = "ERR_MODULE_NOT_FOUND";
          throw error;
        }
        return nextResolve(specifier, context);
      }
    });
    const { NodeRegistry } = await import("@nodetool-ai/node-sdk");
    await assert.rejects(importPack("fal"), error => error instanceof MissingPackError && error.details.install.supported === false);
    const registry = new NodeRegistry();
    phase("registering available core");
    await registerAvailablePacks(registry, { includeOptionalPacks: true });
    phase("core-only registration ready");
    const nodes = readCatalogNodes().filter(node => node.pack === "fal");
    assert(nodes.length > 0);
    for (const node of nodes) {
      assert.equal(registry.availability(node.node_type), "catalog");
      assert.deepEqual(registry.getMetadata(node.node_type), node.metadata);
    }
    assert.equal(registry.availability("nodetool.control.If"), "executable");
    hooks.deregister();
    const failing = registerHooks({
      load(url, context, nextLoad) {
        if (url.endsWith("/fal-nodes/dist/index.js")) {
          return { format: "module", shortCircuit: true, source: 'throw new Error("pack initialization failure");' };
        }
        return nextLoad(url, context);
      }
    });
    await assert.rejects(importPack("fal"), /pack initialization failure/);
    failing.deregister();
    process.stdout.write("catalog fallback and initialization failure verified");
  `;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHILD_TIMEOUT_MS);
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"], signal: controller.signal
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      const failed = (error: Error) => reject(new Error(
        `Catalog fixture child failed: ${error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        { cause: error }
      ));
      child.on("error", failed);
      child.stdout.on("error", failed);
      child.stderr.on("error", failed);
      child.on("close", resolve);
    });
    expect(code, `stdout:\n${stdout}\nstderr:\n${stderr}`).toBe(0);
    expect(stdout).toContain("catalog fallback and initialization failure verified");
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}, PACK_IMPORT_TEST_TIMEOUT_MS);
