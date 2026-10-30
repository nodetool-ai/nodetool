/**
 * The threadpool module sizes libuv's pool when a process entry imports it
 * first. Each child holds eight pool threads on FIFO opens that have no
 * writer, then asks for one more file system call: with libuv's default four
 * threads that call waits, with the module's size it runs.
 */

import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const MODULE = fileURLToPath(new URL("../src/threadpool.ts", import.meta.url));

const PROBE = `
import { closeSync, constants, mkdtempSync, openSync, rmSync } from "node:fs";
import { open, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "nt-threadpool-"));
const fifos = Array.from({ length: 8 }, (_, i) => join(dir, "f" + i));
for (const fifo of fifos) execFileSync("mkfifo", [fifo]);
const readers = Promise.all(fifos.map((fifo) => open(fifo, "r")));
const ran = await Promise.race([
  stat(dir).then(() => true),
  new Promise((resolve) => setTimeout(() => resolve(false), 1000))
]);
// A reader still queued has no end of its FIFO open, so keep offering writers.
const pending = new Set(fifos);
while (pending.size > 0) {
  for (const fifo of [...pending]) {
    try {
      closeSync(openSync(fifo, constants.O_WRONLY | constants.O_NONBLOCK));
      pending.delete(fifo);
    } catch {
      // No reader on this FIFO yet.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
}
for (const handle of await readers) await handle.close();
rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ size: process.env.UV_THREADPOOL_SIZE ?? null, ran }));
`;

async function probe(importModule: boolean, env: NodeJS.ProcessEnv = {}): Promise<{ size: string | null; ran: boolean }> {
  const script = (importModule ? `import ${JSON.stringify(MODULE)};\n` : "") + PROBE;
  const childEnv = { ...process.env, ...env };
  if (!("UV_THREADPOOL_SIZE" in env)) delete childEnv["UV_THREADPOOL_SIZE"];
  const { stdout } = await run(
    process.execPath,
    ["--input-type=module", "-e", script],
    { env: childEnv, timeout: 30_000 }
  );
  return JSON.parse(stdout.trim()) as { size: string | null; ran: boolean };
}

describe.skipIf(process.platform === "win32")("threadpool", () => {
  it("leaves a busy default pool with no room", async () => {
    expect(await probe(false)).toEqual({ size: null, ran: false });
  }, 40_000);

  it("gives the pool room when imported first", async () => {
    expect(await probe(true)).toEqual({ size: "128", ran: true });
  }, 40_000);

  it("keeps a size the environment sets", async () => {
    expect(await probe(true, { UV_THREADPOOL_SIZE: "6" })).toEqual({ size: "6", ran: false });
  }, 40_000);
});
