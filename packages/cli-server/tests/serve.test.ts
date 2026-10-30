import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("starts the actual installed-pack server and forwards shutdown", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nodetool-classic-server-"));
  const reservation = createServer();
  const port = await new Promise<number>((resolvePort, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") { reject(new Error("No reserved port")); return; }
      resolvePort(address.port);
    });
  });
  await new Promise<void>((resolveClose, reject) => reservation.close(error => error ? reject(error) : resolveClose()));
  const script = join(directory, "serve.mjs");
  const runner = pathToFileURL(resolve(import.meta.dirname, "../dist/index.js")).href;
  await writeFile(script, `import {run} from ${JSON.stringify(runner)}; await run(['serve','--host','127.0.0.1','--port',${JSON.stringify(String(port))}]);`);
  const child = spawn(process.execPath, [script], { env: { ...process.env, XDG_DATA_HOME: directory, NODETOOL_SERVER_PACKS: "[]", SECRETS_MASTER_KEY: "a".repeat(64), NODETOOL_LOG_LEVEL: "error" }, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stdout.on("data", bytes => { diagnostics += bytes.toString(); });
  child.stderr.on("data", bytes => { diagnostics += bytes.toString(); });
  const closed = new Promise<void>((resolveClose, reject) => { child.once("error", reject); child.once("close", () => resolveClose()); });
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 200 && child.exitCode === null; attempt++) {
      try { healthy = (await fetch(`http://127.0.0.1:${port}/health`)).ok; } catch { /* The child has not started listening yet. */ }
      if (healthy) { break; }
      await new Promise(resolveWait => setTimeout(resolveWait, 100));
    }
    expect(healthy, diagnostics.slice(-4000)).toBe(true);
  } finally {
    child.kill("SIGTERM");
    const forced = setTimeout(() => child.kill("SIGKILL"), 5000);
    try { await closed; } finally { clearTimeout(forced); await rm(directory, { recursive: true, force: true }); }
  }
}, 30000);
