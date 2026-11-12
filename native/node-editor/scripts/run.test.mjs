import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { stopServer } from "./run.mjs";

test("stopping an owned development server also stops its child", { timeout: 15000 }, async () => {
  const code = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
    process.on('SIGTERM', () => {});
    child.once('exit', () => process.exit(0));
    process.stdout.write(String(child.pid));
    setInterval(() => {}, 1000);
  `;
  const server = spawn(process.execPath, ["-e", code], { detached: true, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  let childPid;
  try {
    const [pid] = await once(server.stdout, "data", { signal: AbortSignal.timeout(5000) });
    childPid = Number(pid.toString());
    assert.ok(childPid > 0);
    const exited = once(server, "exit");
    await stopServer(server);
    await exited;
    assert.throws(() => process.kill(childPid, 0), { code: "ESRCH" });
  } finally {
    await stopServer(server);
    if (childPid) {
      try { process.kill(childPid); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
  }
});
