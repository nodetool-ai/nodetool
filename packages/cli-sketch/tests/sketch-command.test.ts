/**
 * Tests for the `nodetool sketch` command registration (src/commands/sketch.ts)
 * and its human-readable validation output. Heavy dependencies are only
 * imported lazily inside the actions, so registration is testable without them.
 */
import { describe, expect, it } from "vitest";
import { Command } from "commander";
import {
  registerSketchCommands,
  renderSketchValidation
} from "../src/commands/sketch.js";

function sketchSubcommand(name: string) {
  const program = new Command();
  registerSketchCommands(program);
  const sketch = program.commands.find((c) => c.name() === "sketch");
  if (!sketch) throw new Error("sketch command not registered");
  const cmd = sketch.commands.find((c) => c.name() === name);
  if (!cmd) throw new Error(`sketch ${name} not registered`);
  return cmd;
}

describe("registerSketchCommands", () => {
  it("registers validate with its options and target argument", () => {
    const cmd = sketchSubcommand("validate");
    expect(cmd.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--json", "--warnings-as-errors"])
    );
    expect(cmd.registeredArguments.map((a) => a.name())).toContain(
      "sketch_id_or_file"
    );
  });

  it("registers debug with the interact, out and json options", () => {
    const cmd = sketchSubcommand("debug");
    expect(cmd.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--interact", "--out", "--json"])
    );
  });

  it("keeps the versions group beside them", () => {
    const versions = sketchSubcommand("versions");
    expect(versions.commands.map((c) => c.name()).sort()).toEqual([
      "create",
      "delete",
      "list",
      "restore",
      "show"
    ]);
  });

  it("documents both target kinds on validate", () => {
    const description = sketchSubcommand("validate").description();
    expect(description).toMatch(/JSON file/i);
    expect(description).toMatch(/image_documents/);
  });
});

describe("renderSketchValidation", () => {
  it("reports a clean document with a check mark and no issue lines", () => {
    const lines = renderSketchValidation({ ok: true, errors: [], warnings: [] });
    expect(lines.join("\n")).toContain("✅ 0 error(s), 0 warning(s)");
    expect(lines).toHaveLength(2);
  });

  it("lists errors before warnings, each with its code and location", () => {
    const lines = renderSketchValidation({
      ok: false,
      errors: [
        {
          severity: "error",
          code: "binding_layer_missing",
          message: "binding generates a layer the document does not contain",
          layerId: "layer-9"
        }
      ],
      warnings: [
        {
          severity: "warning",
          code: "field_stripped",
          message: "field is dropped by the schema",
          path: "sketch.notes"
        }
      ]
    });

    expect(lines[3]).toContain("error");
    expect(lines[3]).toContain("[layer layer-9]");
    expect(lines[3]).toContain("(binding_layer_missing)");
    expect(lines[4]).toContain("warn");
    expect(lines[4]).toContain("[sketch.notes]");
  });

  it("marks a warning-only document as a warning, not a failure", () => {
    const lines = renderSketchValidation({
      ok: true,
      errors: [],
      warnings: [
        {
          severity: "warning",
          code: "document_empty",
          message: "the sketch has no layers"
        }
      ]
    });
    expect(lines[1]).toContain("⚠️ 0 error(s), 1 warning(s)");
  });
});
