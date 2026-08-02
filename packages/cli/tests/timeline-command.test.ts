/**
 * Tests for the `nodetool timeline` command registration
 * (src/commands/timeline.ts) and its human-readable validation output. Heavy
 * dependencies are only imported lazily inside the actions, so registration is
 * testable without them.
 */
import { describe, expect, it } from "vitest";
import { Command } from "commander";
import {
  registerTimelineCommands,
  renderTimelineValidation
} from "../src/commands/timeline.js";

function timelineSubcommand(name: string) {
  const program = new Command();
  registerTimelineCommands(program);
  const timeline = program.commands.find((c) => c.name() === "timeline");
  if (!timeline) throw new Error("timeline command not registered");
  const cmd = timeline.commands.find((c) => c.name() === name);
  if (!cmd) throw new Error(`timeline ${name} not registered`);
  return cmd;
}

describe("registerTimelineCommands", () => {
  it("registers validate with its options and target argument", () => {
    const cmd = timelineSubcommand("validate");
    expect(cmd.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--json", "--warnings-as-errors"])
    );
    expect(cmd.registeredArguments.map((a) => a.name())).toContain(
      "timeline_id_or_file"
    );
  });

  it("registers debug with the interact, out and json options", () => {
    const cmd = timelineSubcommand("debug");
    expect(cmd.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--interact", "--out", "--json"])
    );
  });

  it("documents both target kinds on validate", () => {
    const description = timelineSubcommand("validate").description();
    expect(description).toMatch(/JSON file/i);
    expect(description).toMatch(/timeline_sequences/);
  });
});

describe("renderTimelineValidation", () => {
  it("reports a clean document with a check mark and no issue lines", () => {
    const lines = renderTimelineValidation({ ok: true, errors: [], warnings: [] });
    expect(lines.join("\n")).toContain("✅ 0 error(s), 0 warning(s)");
    expect(lines).toHaveLength(2);
  });

  it("lists errors before warnings, each with its code and location", () => {
    const lines = renderTimelineValidation({
      ok: false,
      errors: [
        {
          severity: "error",
          code: "clip_track_missing",
          message: "clip references a track the document does not have",
          clipId: "c1"
        }
      ],
      warnings: [
        {
          severity: "warning",
          code: "field_stripped",
          message: "field is dropped by the schema",
          path: "clips[0].mystery"
        }
      ]
    });
    const text = lines.join("\n");
    expect(text).toContain("❌ 1 error(s), 1 warning(s)");
    expect(text).toContain("error clip references a track the document does not have [clip c1] (clip_track_missing)");
    expect(text).toContain("warn  field is dropped by the schema [clips[0].mystery] (field_stripped)");
    expect(text.indexOf("clip_track_missing")).toBeLessThan(
      text.indexOf("field_stripped")
    );
  });
});
