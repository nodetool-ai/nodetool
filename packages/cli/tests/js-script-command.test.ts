/**
 * Tests for the `nodetool jsscript` command registration
 * (src/commands/js-script.ts) and its human-readable validation output. Heavy
 * dependencies are only imported lazily inside the actions, so registration is
 * testable without them.
 */
import { describe, expect, it } from "vitest";
import { Command } from "commander";
import {
  parseInputsOption,
  registerJsScriptCommands,
  renderJsScriptValidation
} from "../src/commands/js-script.js";

function jsScriptSubcommand(name: string) {
  const program = new Command();
  registerJsScriptCommands(program);
  const jsscript = program.commands.find((c) => c.name() === "jsscript");
  if (!jsscript) throw new Error("jsscript command not registered");
  const cmd = jsscript.commands.find((c) => c.name() === name);
  if (!cmd) throw new Error(`jsscript ${name} not registered`);
  return cmd;
}

describe("registerJsScriptCommands", () => {
  it("registers validate with its options and target argument", () => {
    const cmd = jsScriptSubcommand("validate");
    expect(cmd.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--json", "--warnings-as-errors"])
    );
    expect(cmd.registeredArguments.map((a) => a.name())).toContain(
      "script_id_or_file"
    );
  });

  it("registers run with an inputs option", () => {
    const cmd = jsScriptSubcommand("run");
    expect(cmd.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--inputs", "--json"])
    );
  });

  it("registers test", () => {
    const cmd = jsScriptSubcommand("test");
    expect(cmd.options.map((o) => o.long)).toContain("--json");
    expect(cmd.description()).toMatch(/saved test cases/i);
  });

  it("registers debug with the interact, out and json options", () => {
    const cmd = jsScriptSubcommand("debug");
    expect(cmd.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--interact", "--out", "--json"])
    );
  });

  it("keeps the versions group beside them", () => {
    const versions = jsScriptSubcommand("versions");
    expect(versions.commands.map((c) => c.name()).sort()).toEqual([
      "create",
      "delete",
      "list",
      "restore",
      "show"
    ]);
  });

  it("documents both target kinds on validate", () => {
    const description = jsScriptSubcommand("validate").description();
    expect(description).toMatch(/JSON file/i);
    expect(description).toMatch(/js_scripts/);
  });
});

describe("parseInputsOption", () => {
  it("reads a JSON object", () => {
    expect(parseInputsOption('{"a":1}')).toEqual({ a: 1 });
  });

  it("names the problem on bad JSON and on a non-object", () => {
    expect(() => parseInputsOption("{")).toThrow(/not valid JSON/);
    expect(() => parseInputsOption("[1]")).toThrow(/must be a JSON object/);
  });
});

describe("renderJsScriptValidation", () => {
  it("reports a clean document with a check mark and no issue lines", () => {
    const lines = renderJsScriptValidation({
      ok: true,
      errors: [],
      warnings: []
    });
    expect(lines.join("\n")).toContain("✅ 0 error(s), 0 warning(s)");
    expect(lines).toHaveLength(2);
  });

  it("lists errors before warnings, each with its code", () => {
    const lines = renderJsScriptValidation({
      ok: false,
      errors: [
        {
          severity: "error",
          code: "js_script_legacy_contract",
          message: "The body returns its outputs"
        }
      ],
      warnings: [
        {
          severity: "warning",
          code: "js_script_no_tests",
          message: "no saved tests"
        }
      ]
    });
    const text = lines.join("\n");
    expect(text).toContain("❌ 1 error(s), 1 warning(s)");
    expect(text.indexOf("js_script_legacy_contract")).toBeLessThan(
      text.indexOf("js_script_no_tests")
    );
    expect(text).toContain("error The body returns its outputs");
  });

  it("marks a warnings-only document with a warning sign, not a failure", () => {
    const lines = renderJsScriptValidation({
      ok: true,
      errors: [],
      warnings: [
        { severity: "warning", code: "js_script_no_tests", message: "none" }
      ]
    });
    expect(lines.join("\n")).toContain("⚠️ 0 error(s), 1 warning(s)");
  });
});
