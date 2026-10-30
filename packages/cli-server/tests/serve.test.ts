import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { feature } from "../src/index.js";

it("starts the actual installed-pack server and forwards shutdown", async () => {
  expect(feature.descriptor.requires).toEqual(["core", "text"]);
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
  const child = spawn(process.execPath, [script], { env: { ...process.env, XDG_DATA_HOME: directory, NODETOOL_SERVER_PACKS: '["core","text"]', SECRETS_MASTER_KEY: "a".repeat(64), NODETOOL_LOG_LEVEL: "error" }, stdio: ["ignore", "pipe", "pipe"] });
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
    const graph = {
      nodes: [
        { id: "input", type: "nodetool.input.StringInput", properties: { name: "text", value: "baseline server" } },
        { id: "text", type: "nodetool.text.Concat" },
        { id: "out", type: "nodetool.control.Reroute" }
      ],
      edges: [
        { source: "input", target: "text", sourceHandle: "output", targetHandle: "value" },
        { source: "text", target: "out", sourceHandle: "output", targetHandle: "input_value" }
      ]
    };
    const created = await fetch(`http://127.0.0.1:${port}/api/workflows`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Core and text prerequisites", graph }) });
    expect(created.status, await created.clone().text()).toBe(200);
    const workflow = await created.json();
    const executed = await fetch(`http://127.0.0.1:${port}/api/workflows/${workflow.id}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ params: { text: "baseline server" } }) });
    expect(executed.status, await executed.clone().text()).toBe(200);
    const result = await executed.json();
    expect(result.status, JSON.stringify(result)).toBe("completed");
    expect(JSON.stringify(result.outputs)).toContain("baseline server");
  } finally {
    child.kill("SIGTERM");
    const forced = setTimeout(() => child.kill("SIGKILL"), 5000);
    try { await closed; } finally { clearTimeout(forced); await rm(directory, { recursive: true, force: true }); }
  }
}, 30000);
