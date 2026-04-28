import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import {
  shellExec,
  shellView,
  shellWait,
  shellKillProcess,
  _resetSessionsForTests
} from "../src/tools/shell.js";

const tmuxAvailable = spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;
const describeTmux = tmuxAvailable ? describe : describe.skip;

beforeEach(() => {
  _resetSessionsForTests();
});

afterAll(() => {
  if (tmuxAvailable) {
    // Best-effort: kill any leftover sessions we created.
    spawnSync("tmux", ["kill-server"], { stdio: "ignore" });
  }
});

describeTmux("shell tools (tmux required)", () => {
  it("runs a command and captures its exit code", async () => {
    const exec = await shellExec({ id: "t1", command: "echo hi" });
    expect(exec.started).toBe(true);

    const waited = await shellWait({ id: "t1", seconds: 10 });
    expect(waited.running).toBe(false);
    expect(waited.exit_code).toBe(0);
    expect(waited.output).toBe("hi");
    expect(waited.output).not.toContain("__NODETOOL_DONE_");
    expect(waited.output).not.toContain("__NT_EC");
    expect(waited.timed_out).toBe(false);

    await shellKillProcess({ id: "t1" });
  });

  it("hides internal wrapper lines for commands with no stdout", async () => {
    await shellExec({ id: "t-empty", command: "true" });
    const waited = await shellWait({ id: "t-empty", seconds: 10 });
    expect(waited.output).toBe("");
    expect(waited.output).not.toContain("__NODETOOL_DONE_");
    expect(waited.output).not.toContain("__NT_EC");
    await shellKillProcess({ id: "t-empty" });
  });

  it("propagates non-zero exit codes", async () => {
    await shellExec({ id: "t2", command: "false" });
    const waited = await shellWait({ id: "t2", seconds: 10 });
    expect(waited.exit_code).toBe(1);
    await shellKillProcess({ id: "t2" });
  });

  it("reports running=true while a command is in-flight", async () => {
    await shellExec({ id: "t3", command: "sleep 2" });
    const view = await shellView({ id: "t3" });
    expect(view.running).toBe(true);
    expect(view.exit_code).toBeNull();
    const waited = await shellWait({ id: "t3", seconds: 15 });
    expect(waited.running).toBe(false);
    expect(waited.exit_code).toBe(0);
    await shellKillProcess({ id: "t3" });
  });

  it("reuses a named session across commands", async () => {
    await shellExec({ id: "t4", command: "A=42; echo one" });
    await shellWait({ id: "t4", seconds: 5 });
    await shellExec({ id: "t4", command: "echo two-$A" });
    const waited = await shellWait({ id: "t4", seconds: 5 });
    expect(waited.output).toMatch(/two-42/);
    await shellKillProcess({ id: "t4" });
  });

  it("reports timed_out when the command runs past the deadline", async () => {
    await shellExec({ id: "t5", command: "sleep 5" });
    const waited = await shellWait({ id: "t5", seconds: 1 });
    expect(waited.timed_out).toBe(true);
    expect(waited.running).toBe(true);
    await shellKillProcess({ id: "t5" });
  });

  it("throws on view/wait of an unknown session", async () => {
    await expect(shellView({ id: "nope" })).rejects.toThrow();
  });

  it("idempotent kill returns killed=false for unknown sessions", async () => {
    const out = await shellKillProcess({ id: "never-existed" });
    expect(out.killed).toBe(false);
  });
});
