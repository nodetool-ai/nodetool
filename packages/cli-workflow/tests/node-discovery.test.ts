import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerNodeCommands } from "../src/commands/node.js";

vi.mock("@nodetool-ai/pack-manager/command-errors", () => ({ printCommandError: vi.fn(() => 1), commandMissingRuntime: vi.fn(), commandMissingPack: vi.fn() }));
vi.mock("../src/commands/install-missing-packs.js", () => ({ installMissingPacksAndReexec: vi.fn() }));

const installed = { node_type: "nodetool.text.Join", title: "Join", namespace: "nodetool.text", properties: [{ name: "separator", type: { type: "str" }, default: " " }], outputs: [{ name: "text", type: { type: "str" } }] };
const absent = { ...installed, node_type: "optional.Absent" };
vi.mock("@nodetool-ai/cli-execution/node-registry", () => ({
  buildFullRegistry: vi.fn(async () => ({
    listMetadata: () => [absent, installed],
    has: (type: string) => type === installed.node_type,
    getMetadata: (type: string) => type === installed.node_type ? installed : undefined
  }))
}));

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

async function run(args: string[]): Promise<string> {
  const output: string[] = [];
  vi.spyOn(console, "log").mockImplementation((value: unknown) => { output.push(String(value)); });
  const program = new Command();
  program.exitOverride();
  registerNodeCommands(program);
  await program.parseAsync(["node", "nodetool", "node", ...args]);
  return output.join("\n");
}

describe("installed node discovery", () => {
  it("lists only installed executable nodes, excluding catalog-only metadata", async () => {
    const result = JSON.parse(await run(["list", "--json"]));
    expect(result).toEqual([installed]);
  });
  it("filters types and titles without requiring a package workspace", async () => {
    expect(JSON.parse(await run(["list", "join", "--json"]))).toEqual([installed]);
    expect(JSON.parse(await run(["list", "absent", "--json"]))).toEqual([]);
  });
  it("rejects metadata for an unavailable catalog node", async () => {
    const { printCommandError } = await import("@nodetool-ai/pack-manager/command-errors");
    await run(["info", absent.node_type, "--json"]);
    expect(printCommandError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("nodetool node list") }), true);
    expect(process.exitCode).toBe(1);
  });
  it("returns properties and outputs for the exact runnable type", async () => {
    expect(JSON.parse(await run(["info", installed.node_type, "--json"]))).toEqual(installed);
  });
});
