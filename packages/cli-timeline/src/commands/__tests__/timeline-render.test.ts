import { describe, expect, it } from "vitest";
import {
  parseCoverageFrames,
  parseFrameSpec,
  selectClipSubset
} from "../timeline-render.js";

describe("parseFrameSpec", () => {
  it("reads indices and inclusive ranges into sorted unique frames", () => {
    expect(parseFrameSpec("290, 175,5-7,6", 450)).toEqual([5, 6, 7, 175, 290]);
  });

  it("accepts the last frame and refuses the one after it", () => {
    expect(parseFrameSpec("449", 450)).toEqual([449]);
    expect(() => parseFrameSpec("440-450", 450)).toThrow(/frames 0-449/);
  });

  it.each(["abc", "5-", "-5", "1.5", "3-1"])("refuses %j", (spec) => {
    expect(() => parseFrameSpec(spec, 450)).toThrow();
  });

  it("refuses an empty selection", () => {
    expect(() => parseFrameSpec(" , ", 450)).toThrow(/empty/);
  });
});

describe("selectClipSubset", () => {
  const clips = [
    { id: "S1", name: "S1", mediaType: "group" },
    { id: "g3", name: "streaks", mediaType: "group", parentId: "S1" },
    { id: "s4", name: "streak-far", parentId: "g3" },
    { id: "s6", name: "streak-mid", parentId: "g3" },
    { id: "t11", name: "word-0", parentId: "S1" },
    { id: "t15", name: "text", parentId: "S1" },
    {
      id: "t16",
      name: "text",
      parentId: "S1",
      matte: { sourceClipId: "m1", mode: "alpha" }
    },
    { id: "M", name: "mattes", mediaType: "group" },
    { id: "m1", name: "wipe", parentId: "M" },
    { id: "other", name: "other" }
  ];
  const ids = (list: { id: string }[]) => list.map((c) => c.id);

  it("keeps a clip and its ancestor groups but not its siblings", () => {
    expect(ids(selectClipSubset(clips, "s4"))).toEqual(["S1", "g3", "s4"]);
  });

  it("matches names, every clip that shares one, and ids in one list", () => {
    expect(ids(selectClipSubset(clips, "streak-mid, word-0"))).toEqual([
      "S1",
      "g3",
      "s6",
      "t11"
    ]);
    expect(ids(selectClipSubset(clips, "text"))).toEqual([
      "S1",
      "t15",
      "t16",
      "M",
      "m1"
    ]);
  });

  it("keeps the children of a selected group", () => {
    expect(ids(selectClipSubset(clips, "streaks"))).toEqual([
      "S1",
      "g3",
      "s4",
      "s6"
    ]);
  });

  it("keeps a matte source clip and that source's ancestors", () => {
    expect(ids(selectClipSubset(clips, "t16"))).toEqual([
      "S1",
      "t16",
      "M",
      "m1"
    ]);
  });

  it("names every token that matches no clip", () => {
    expect(() => selectClipSubset(clips, "s4,nope,also-nope")).toThrow(
      /"nope", "also-nope"/
    );
  });

  it("refuses an empty list", () => {
    expect(() => selectClipSubset(clips, " , ")).toThrow(/empty/);
  });
});

describe("parseCoverageFrames", () => {
  const builder = [
    "#!/usr/bin/env tsx",
    "// Kite builder.",
    "//",
    "// | Feature | Clip | Frame |",
    "// |---|---|---|",
    "// | Slow push-in | `street` (S1) | 40 |",
    "// | Music | `drums` | — |",
    "// | Logo reveal | `logo` | 412 |",
    "// | Chart | `chart` | 40 |",
    "",
    "// | Not | leading | 999 |",
    "import x from 'y';",
    "// | Late | table | 7 |"
  ].join("\n");

  it("reads the Frame column of the table in the leading comment", () => {
    const { frames, skipped } = parseCoverageFrames(builder);
    expect(frames).toEqual([40, 412, 40]);
    expect(skipped).toEqual([{ row: "Music | `drums`", value: "—" }]);
  });

  it("reads a table inside a leading block comment", () => {
    const source = [
      "/**",
      " * | Feature | Frame |",
      " * | --- | --- |",
      " * | Push | 12 |",
      " */",
      "export {};"
    ].join("\n");
    expect(parseCoverageFrames(source).frames).toEqual([12]);
  });

  it("refuses a file whose leading comment has no Frame table", () => {
    expect(() =>
      parseCoverageFrames(
        "// | A | B |\n// |---|---|\n// | 1 | 2 |\nexport {};"
      )
    ).toThrow(/Frame/);
    expect(() =>
      parseCoverageFrames(
        "export {};\n// | A | Frame |\n// |---|---|\n// | x | 1 |"
      )
    ).toThrow(/Frame/);
  });
});
