import type { ScriptSetup } from "@nodetool-ai/protocol/api-schemas/scripts.js";

import type { ImportedScript } from "../../../lib/script/importedScript";
import {
  isWrittenFrom,
  writerSignature,
  writerSignaturePatch
} from "../scriptWriteSignature";

const setup = (): ScriptSetup => ({ brief: "", format: "dialogue" }) as ScriptSetup;

const fdx = (speakers: [string, string]): ImportedScript => ({
  kind: "fdx",
  preserve: "verbatim",
  lines: [
    { text: "Hello.", speakerName: speakers[0] },
    { text: "Hi.", speakerName: speakers[1] }
  ],
  speakers: [...speakers],
  attributed: true,
  text: "Hello.\nHi.",
  label: "Final Draft screenplay"
});

const writtenFrom = (source: ImportedScript): ScriptSetup => ({
  ...setup(),
  ...writerSignaturePatch(writerSignature(setup(), source))
});

describe("isWrittenFrom", () => {
  it("matches the source the lines were written from", () => {
    expect(isWrittenFrom(writtenFrom(fdx(["ANNA", "BEN"])), fdx(["ANNA", "BEN"]))).toBe(true);
  });

  it("does not match when the same words are attributed to other speakers", () => {
    expect(isWrittenFrom(writtenFrom(fdx(["ANNA", "BEN"])), fdx(["BEN", "ANNA"]))).toBe(false);
  });

  it("does not match when a line's direction changes", () => {
    const base = fdx(["ANNA", "BEN"]);
    const directed: ImportedScript = {
      ...base,
      lines: [{ ...base.lines[0], direction: "whispers" }, base.lines[1]]
    };
    expect(isWrittenFrom(writtenFrom(base), directed)).toBe(false);
  });

  it("does not match when cue timings change under the same words", () => {
    const timed = (ms: number): ImportedScript => ({
      ...fdx(["Narrator", "Narrator"]),
      kind: "subtitles",
      lines: [
        { text: "Hello.", speakerName: "Narrator", targetDurationMs: ms },
        { text: "Hi.", speakerName: "Narrator", targetDurationMs: ms }
      ]
    });
    expect(isWrittenFrom(writtenFrom(timed(1000)), timed(2000))).toBe(false);
  });

  it("still matches a signature stored before line structure was counted", () => {
    const source = fdx(["ANNA", "BEN"]);
    const legacy = [
      "",
      "dialogue",
      "",
      "",
      "",
      "",
      `${source.kind}:${source.lines.length}:${source.text}`
    ].join("\u0001");
    expect(isWrittenFrom({ ...setup(), ...writerSignaturePatch(legacy) }, source)).toBe(true);
  });
});
