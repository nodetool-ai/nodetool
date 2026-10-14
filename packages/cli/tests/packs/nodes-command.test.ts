import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerNodesCommands, type NodeCommandServices } from "../../src/commands/nodes.js";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

function program(services: NodeCommandServices) {
  const load = vi.fn(async () => services);
  const command = new Command().exitOverride();
  command.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerNodesCommands(command, load);
  return { command, load };
}
function services(): NodeCommandServices {
  return { list: vi.fn(async () => []), add: vi.fn(async () => {}), remove: vi.fn(async () => {}),
    doctor: vi.fn(async () => ({ healthy: true })), why: vi.fn(async () => ({ id: "game" })) };
}

describe("nodetool nodes command surface", () => {
  it("registers and renders help without reading an install snapshot", async () => {
    const { command, load } = program(services());
    expect(load).not.toHaveBeenCalled();
    await expect(command.parseAsync(["node", "nodetool", "nodes", "--help"])).rejects.toMatchObject({ code: "commander.helpDisplayed" });
    expect(load).not.toHaveBeenCalled();
    expect(command.commands[0].commands.map(child => child.name())).toEqual(["list", "add", "remove", "doctor", "why"]);
  });

  it.each([{ args: [] }, { args: ["game", "--restore"] }, { args: ["--restore", "--for", "flow.json"] }])("rejects ambiguous or missing add selectors before inventory IO: %j", async ({ args }) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { command, load } = program(services());
    await command.parseAsync(["node", "nodetool", "nodes", "add", ...args]);
    expect(process.exitCode).toBe(1);
    expect(load).not.toHaveBeenCalled();
  });

  it("routes explicit local-file authorization, removal and child-load doctor options", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const service = services();
    await program(service).command.parseAsync(["node", "nodetool", "nodes", "add", "--for", "flow.json", "--yes"]);
    expect(service.add).toHaveBeenCalledWith([], { for: "flow.json", yes: true });
    await program(service).command.parseAsync(["node", "nodetool", "nodes", "remove", "game", "rapier"]);
    expect(service.remove).toHaveBeenCalledWith(["game", "rapier"]);
    await program(service).command.parseAsync(["node", "nodetool", "nodes", "doctor", "--installed", "--json", "--pack", "game", "video"]);
    expect(service.doctor).toHaveBeenCalledWith({ installed: true, json: true, pack: ["game", "video"] });
  });

  it("makes an unhealthy doctor report fail with one JSON report", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const service = services();
    service.doctor = async () => ({ healthy: false, issues: [{ kind: "wrong_version" }] });
    await program(service).command.parseAsync(["node", "nodetool", "nodes", "doctor", "--json"]);
    expect(process.exitCode).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ healthy: false });
  });
});
