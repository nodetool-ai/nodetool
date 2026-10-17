import { Command } from "commander";
import { afterEach, expect, it, vi } from "vitest";
import { registerAuthoringCommands } from "../src/commands/tools.js";

vi.mock("../src/command-errors.js", () => ({ commandFailureExitCode: vi.fn(() => 1), printCommandError: vi.fn(() => 1) }));
vi.mock("../src/agent-toolbelt.js", () => ({ buildCliToolbelt: vi.fn(() => []) }));
vi.mock("../src/node-registry.js", () => ({ buildFullRegistry: vi.fn(async () => ({})) }));
vi.mock("../src/commands/local-db.js", () => ({ setupLocalDb: vi.fn(), LOCAL_USER_ID: "1" }));
vi.mock("../src/providers.js", () => ({ buildConfiguredProviders: vi.fn() }));
vi.mock("@nodetool-ai/agents", () => ({
  toolForCapabilityName: (name: string) => ({ name, description: "Authoritative model discovery", inputSchema: { type: "object", properties: { provider_hint: { type: "string" } } } })
}));

afterEach(() => vi.restoreAllMocks());

it("lists model discovery metadata without initializing providers or the database", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  const program = new Command();
  registerAuthoringCommands(program);
  await program.parseAsync(["tools", "list", "model"], { from: "user" });
  expect(JSON.parse(output.mock.calls[0]![0])).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "find_model" }),
    expect.objectContaining({ name: "list_models" })
  ]));
  const { buildConfiguredProviders } = await import("../src/providers.js");
  const { setupLocalDb } = await import("../src/commands/local-db.js");
  expect(buildConfiguredProviders).not.toHaveBeenCalled();
  expect(setupLocalDb).not.toHaveBeenCalled();
});
