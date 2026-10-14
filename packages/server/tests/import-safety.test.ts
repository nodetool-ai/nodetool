import { spawn } from "node:child_process";
import { expect, it } from "vitest";

const CHILD_TIMEOUT_MS = 15_000;
const IMPORT_SAFETY_TEST_TIMEOUT_MS = CHILD_TIMEOUT_MS + 5_000;

it("imports the bundled source and server API without starting the host", async () => {
  const server = new URL("../../websocket/dist/server.js", import.meta.url).href;
  const source = new URL("../dist/index.js", import.meta.url).href;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHILD_TIMEOUT_MS);
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    const signals = ["SIGINT", "SIGTERM", "SIGUSR2"];
    const before = signals.map((signal) => process.listenerCount(signal));
    const source = await import(${JSON.stringify(source)});
    const api = await import(${JSON.stringify(server)});
    assert.equal(typeof source.bundledPackSource.register, "function");
    assert.equal(typeof api.startServer, "function");
    assert.deepEqual(signals.map((signal) => process.listenerCount(signal)), before);
    process.stdout.write("imported without startup");
  `], { stdio: ["ignore", "pipe", "pipe"], signal: controller.signal });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    expect(code, stderr).toBe(0);
    expect(stdout).toContain("imported without startup");
  } finally {
    clearTimeout(timeout);
    child.kill();
  }
}, IMPORT_SAFETY_TEST_TIMEOUT_MS);
