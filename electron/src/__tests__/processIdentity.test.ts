import { spawn, type ChildProcess } from "child_process";
import os from "os";
import path from "path";

import { isNodeToolBackendProcess, readProcessCommandLine } from "../processIdentity";

/** Start an idle Node process whose argv ends with `extraArg`. */
function startIdleProcess(extraArg: string): ChildProcess {
  return spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", extraArg], {
    stdio: "ignore",
  });
}

describe("processIdentity", () => {
  const children: ChildProcess[] = [];

  afterEach(() => {
    for (const child of children.splice(0)) {
      child.kill("SIGKILL");
    }
  });

  it("reads the command line of a running process", async () => {
    const child = startIdleProcess("marker-argument");
    children.push(child);
    const commandLine = await readProcessCommandLine(child.pid!);
    expect(commandLine).toContain("marker-argument");
  });

  it("identifies the packaged backend by its server.mjs entry", async () => {
    const child = startIdleProcess(path.join(os.tmpdir(), "resources", "backend", "server.mjs"));
    children.push(child);
    await expect(isNodeToolBackendProcess(child.pid!)).resolves.toBe(true);
  });

  it("identifies the dev backend by its runner script", async () => {
    const child = startIdleProcess(path.join(os.tmpdir(), "electron", "dev-server-runner.cjs"));
    children.push(child);
    await expect(isNodeToolBackendProcess(child.pid!)).resolves.toBe(true);
  });

  it("rejects an unrelated process that reused the PID", async () => {
    // A stale PID file pointing at this process must not get it killed.
    const child = startIdleProcess(path.join(os.tmpdir(), "other-app", "server.mjs"));
    children.push(child);
    await expect(isNodeToolBackendProcess(child.pid!)).resolves.toBe(false);
  });

  it("rejects a PID with no process", async () => {
    const child = startIdleProcess("short-lived");
    const pid = child.pid!;
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
    await expect(isNodeToolBackendProcess(pid)).resolves.toBe(false);
  });
});
