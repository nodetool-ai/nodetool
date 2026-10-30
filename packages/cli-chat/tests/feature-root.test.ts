import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 0, null));
    return child;
  })
}));
vi.mock("@nodetool-ai/cli-providers", () => ({ closePythonProviders: vi.fn() }));
vi.mock("@nodetool-ai/cli-common/runtime-env", () => ({ initializeCliRuntime: vi.fn() }));
vi.mock("@nodetool-ai/cli-execution/packs/host", () => ({ configureCliPackHost: vi.fn() }));
vi.mock("../src/commands/agent.js", () => ({ registerAgentCommands: vi.fn() }));
vi.mock("../src/commands/tools.js", () => ({ registerAuthoringCommands: vi.fn() }));

import { spawn } from "node:child_process";
import { createProgram, run } from "../src/index.js";

describe("chat feature root", () => {
  it("advertises chat without starting its terminal process", () => {
    expect(createProgram().helpInformation()).toMatch(/^  chat\s+.*interactive/m);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("keeps chat options on the dedicated subprocess entry", async () => {
    await run(["chat", "--help"]);
    expect(spawn).toHaveBeenCalledWith(process.execPath, expect.arrayContaining(["--help"]), { stdio: "inherit" });
    const args = vi.mocked(spawn).mock.calls[0]?.[1];
    expect(args?.some(arg => /chat-entry\.(?:ts|js)$/.test(arg))).toBe(true);
  });
});
