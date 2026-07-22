/**
 * Tests for `nodetool collections` and `nodetool costs` command registration
 * (src/commands/collections.ts, src/commands/costs.ts).
 *
 * Heavy deps (tRPC client, fetch) are only touched inside the actions, so
 * registration and the option surface are testable without a running server.
 */
import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { registerCollectionCommands } from "../src/commands/collections.js";
import { registerCostsCommands } from "../src/commands/costs.js";

function group(
  register: (program: Command) => void,
  name: string
): Command {
  const program = new Command();
  register(program);
  const cmd = program.commands.find((c) => c.name() === name);
  if (!cmd) throw new Error(`${name} command not registered`);
  return cmd;
}

describe("registerCollectionCommands", () => {
  it("registers the collections command group", () => {
    expect(group(registerCollectionCommands, "collections").description()).toMatch(
      /vector-store collections/i
    );
  });

  it("exposes the full CRUD + index + query surface", () => {
    const subNames = group(registerCollectionCommands, "collections")
      .commands.map((c) => c.name())
      .sort();
    expect(subNames).toEqual([
      "create",
      "delete",
      "get",
      "index",
      "list",
      "query"
    ]);
  });

  it("gives query an --n-results flag and delete a --yes flag", () => {
    const collections = group(registerCollectionCommands, "collections");
    const query = collections.commands.find((c) => c.name() === "query")!;
    const del = collections.commands.find((c) => c.name() === "delete")!;
    expect(query.options.map((o) => o.long)).toContain("--n-results");
    expect(del.options.map((o) => o.long)).toContain("--yes");
  });
});

describe("registerCostsCommands", () => {
  it("registers the costs command group", () => {
    expect(group(registerCostsCommands, "costs").description()).toMatch(
      /spend/i
    );
  });

  it("exposes summary, list, and the aggregate breakdowns", () => {
    const subNames = group(registerCostsCommands, "costs")
      .commands.map((c) => c.name())
      .sort();
    expect(subNames).toEqual(["by-model", "by-provider", "list", "summary"]);
  });

  it("gives list --provider/--model/--limit filters", () => {
    const list = group(registerCostsCommands, "costs").commands.find(
      (c) => c.name() === "list"
    )!;
    const flags = list.options.map((o) => o.long);
    expect(flags).toEqual(
      expect.arrayContaining(["--provider", "--model", "--limit"])
    );
  });
});
