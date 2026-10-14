import { spawn } from "node:child_process";
import { expect, it } from "vitest";

// The bundled source imports every node pack and provider before the server API.
// CI runs this graph alongside other suites and exceeded the former 15s budget.
const CHILD_TIMEOUT_MS = 120_000;
const IMPORT_SAFETY_TEST_TIMEOUT_MS = CHILD_TIMEOUT_MS + 5_000;

it("imports the bundled source and server API without starting the host", async () => {
  const server = new URL("../../websocket/dist/server.js", import.meta.url).href;
  const source = new URL("../dist/index.js", import.meta.url).href;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHILD_TIMEOUT_MS);
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    const started = Date.now();
    const phase = message => process.stdout.write("server import fixture: " + message + " (" + (Date.now() - started) + "ms)\\n");
    const signals = ["SIGINT", "SIGTERM", "SIGUSR2"];
    const before = signals.map((signal) => process.listenerCount(signal));
    phase("loading bundled pack source");
    const source = await import(${JSON.stringify(source)});
    phase("bundled pack source ready; loading server API");
    const api = await import(${JSON.stringify(server)});
    phase("server API ready");
    assert.equal(typeof source.bundledPackSource.register, "function");
    assert.equal(typeof api.startServer, "function");
    assert.deepEqual(signals.map((signal) => process.listenerCount(signal)), before);
    phase("assertions passed; waiting for natural exit");
    process.stdout.write("imported without startup");
  `], { stdio: ["ignore", "pipe", "pipe"], signal: controller.signal });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", (error) => reject(new Error(
        `Server import fixture child failed: ${error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        { cause: error }
      )));
      child.on("close", resolve);
    });
    expect(code, `stdout:\n${stdout}\nstderr:\n${stderr}`).toBe(0);
    expect(stdout).toContain("imported without startup");
  } finally {
    clearTimeout(timeout);
    child.kill();
  }
}, IMPORT_SAFETY_TEST_TIMEOUT_MS);
