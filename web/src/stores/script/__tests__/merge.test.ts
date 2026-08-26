/**
 * The script merge adapter's op attribution.
 *
 * One case per op the `edit_script` and `voice_script_lines` capabilities
 * broadcast, because a mis-attributed op is silent: the unit it touched is
 * merged as "differs from base" and a draft edit elsewhere reads as a
 * conflict that never happened.
 */
import type { DocumentOp } from "@nodetool-ai/protocol";
import { scriptMergeAdapter } from "../merge";

const touched = (op: DocumentOp): { kind: string; unitId?: string }[] =>
  scriptMergeAdapter.unitsTouchedByOp?.(op) ?? [];

describe("scriptMergeAdapter.unitsTouchedByOp", () => {
  it("attributes a line op to the line, by line_id", () => {
    for (const tool of ["set_line_text", "set_line_speaker", "remove_line"]) {
      expect(touched({ tool, input: { line_id: "L4", id: "L4" } })).toEqual([
        { kind: "section.lines", unitId: "L4" }
      ]);
    }
  });

  it("reads line_id ahead of the caller's own fuzzy target", () => {
    // `edit_script` leaves the caller's `target` as written — a name, an
    // index, a text prefix — and stamps the resolved id under `line_id`.
    expect(
      touched({
        tool: "set_line_text",
        input: { target: "the greeting", line_id: "L4", id: "L4" }
      })
    ).toEqual([{ kind: "section.lines", unitId: "L4" }]);
  });

  it("attributes a speaker op to the speaker, never to a line", () => {
    for (const tool of ["set_speaker", "set_speaker_voice", "remove_speaker"]) {
      expect(touched({ tool, input: { target: "sp1", id: "sp1" } })).toEqual([
        { kind: "speaker", unitId: "sp1" }
      ]);
    }
  });

  it("attributes a take to the take, by take_id", () => {
    expect(
      touched({ tool: "append_take", input: { line_id: "L4", take_id: "t4" } })
    ).toEqual([{ kind: "section.lines.takes", unitId: "t4" }]);
  });

  it("attributes nothing for an op that adds or reorders", () => {
    // An addition resolves through existence, and a reorder changes no
    // content — attributing either would invent a conflict.
    expect(touched({ tool: "add_line", input: { id: "L9", section_id: "sec-1" } })).toEqual([]);
    expect(touched({ tool: "add_section", input: { id: "sec-2" } })).toEqual([]);
    expect(touched({ tool: "add_speaker", input: { id: "sp2" } })).toEqual([]);
  });

  it("attributes nothing when the op names no unit", () => {
    expect(touched({ tool: "set_line_text", input: {} })).toEqual([]);
    expect(touched({ tool: "set_speaker", input: {} })).toEqual([]);
    expect(touched({ tool: "append_take", input: { line_id: "L4" } })).toEqual([]);
  });
});
