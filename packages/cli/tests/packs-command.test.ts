/**
 * `nodetool packs compile` wiring: the command exists, takes the flags the
 * docs promise, and reports skips rather than swallowing them.
 */

import { describe, expect, it, vi } from "vitest";
import { Command } from "commander";

import { registerPackCommands } from "../src/commands/packs.js";

const compileSandboxCatalog = vi.fn();
vi.mock("@nodetool-ai/sandbox-compiler", () => ({
  compileSandboxCatalog: (options: unknown) => compileSandboxCatalog(options)
}));

function host(compiled: unknown[]) {
  return {
    compiled,
    catalog: { diagnostics: () => [] }
  };
}

function program(): Command {
  const command = new Command();
  command.exitOverride();
  registerPackCommands(command);
  return command;
}

describe("nodetool packs compile", () => {
  it("shares one lazy packs command with installer management", async () => {
    const load = vi.fn(async () => { throw new Error("Help must not load installer services"); });
    const command = new Command().exitOverride();
    command.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    registerPackCommands(command, load);
    expect(command.commands.map(child => child.name())).toEqual(["packs"]);
    expect(command.commands[0].commands.map(child => child.name())).toEqual(["compile", "list", "add", "remove", "doctor", "why"]);
    await expect(command.parseAsync(["packs", "--help"], { from: "user" })).rejects.toMatchObject({ code: "commander.helpDisplayed" });
    expect(load).not.toHaveBeenCalled();
    expect(compileSandboxCatalog).not.toHaveBeenCalled();
  });

  it("routes compilation and installer management through that same command", async () => {
    compileSandboxCatalog.mockResolvedValueOnce(host([]));
    const add = vi.fn(async () => {});
    const load = vi.fn(async () => ({ list: async () => [], add, remove: async () => {},
      doctor: async () => ({ healthy: true }), why: async () => ({}) }));
    const command = new Command().exitOverride();
    registerPackCommands(command, load);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await command.parseAsync(["packs", "compile"], { from: "user" });
      expect(compileSandboxCatalog).toHaveBeenCalledWith({});
      expect(load).not.toHaveBeenCalled();
      await command.parseAsync(["packs", "add", "game", "--yes"], { from: "user" });
      expect(add).toHaveBeenCalledWith(["game"], { yes: true });
      expect(command.commands.map(child => child.name())).toEqual(["packs"]);
    } finally { log.mockRestore(); }
  });

  it("compiles with the default search paths and reports each module", async () => {
    compileSandboxCatalog.mockResolvedValueOnce(
      host([
        {
          packName: "@acme/pack",
          packDir: "/packs/acme",
          specifier: "@acme/pack",
          npmName: "js-yaml",
          cached: false,
          outcome: {
            status: "compiled",
            artifact: { source: "export const a = 1;", compilerVersion: "1", optionsDigest: "a", inputsDigest: "b" }
          }
        }
      ])
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await program().parseAsync(["packs", "compile"], { from: "user" });
    expect(compileSandboxCatalog).toHaveBeenCalledWith({});
    expect(log.mock.calls.flat().join("\n")).toContain("ok   @acme/pack");
    log.mockRestore();
  });

  it("exits non-zero and names the reason when a module is skipped", async () => {
    compileSandboxCatalog.mockResolvedValueOnce(
      host([
        {
          packName: "@acme/pack",
          packDir: "/packs/acme",
          specifier: "@acme/pack",
          npmName: "cheerio",
          cached: false,
          outcome: {
            status: "skipped",
            code: "npm-module-builtin-import",
            message: "cheerio imports node:fs"
          }
        }
      ])
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const previous = process.exitCode;
    await program().parseAsync(["packs", "compile"], { from: "user" });
    expect(process.exitCode).toBe(1);
    process.exitCode = previous;
    expect(log.mock.calls.flat().join("\n")).toContain("npm-module-builtin-import");
    log.mockRestore();
  });

  it("passes --force through as a cache opt-out and collects repeated search paths", async () => {
    compileSandboxCatalog.mockResolvedValueOnce(host([]));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await program().parseAsync(
      ["packs", "compile", "--force", "--pack-search-path", "/a", "--pack-search-path", "/b"],
      { from: "user" }
    );
    expect(compileSandboxCatalog).toHaveBeenCalledWith({
      searchPaths: ["/a", "/b"],
      noCache: true
    });
    log.mockRestore();
  });

  it("prints the report as JSON when asked", async () => {
    compileSandboxCatalog.mockResolvedValueOnce(host([]));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await program().parseAsync(["packs", "compile", "--json"], { from: "user" });
    const printed: unknown = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(printed).toEqual({ compiled: [], diagnostics: [] });
    log.mockRestore();
  });
});
