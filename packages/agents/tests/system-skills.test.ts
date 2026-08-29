/**
 * The immutable skill tier: read from disk, merged into one catalog, and
 * refused by every authoring call.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearSystemSkillCache,
  findSystemSkill,
  isSystemSkillName,
  loadSystemSkills,
  mergeSystemSkills,
  parseSkillMarkdown
} from "../src/system-skills.js";

let dir: string;

function writeSkill(name: string, body: string): void {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), body);
}

const wellFormed = (name: string): string =>
  `---\nname: ${name}\ndescription: What ${name} is for\n---\n\n# ${name}\n\nDo the thing.\n`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nodetool-skills-"));
  process.env["NODETOOL_SYSTEM_SKILLS_DIR"] = dir;
  clearSystemSkillCache();
});

afterEach(() => {
  delete process.env["NODETOOL_SYSTEM_SKILLS_DIR"];
  clearSystemSkillCache();
  rmSync(dir, { recursive: true, force: true });
});

describe("parseSkillMarkdown", () => {
  it("reads name, description and body", () => {
    const parsed = parseSkillMarkdown(wellFormed("alpha"));
    expect(parsed).toMatchObject({
      name: "alpha",
      description: "What alpha is for"
    });
    expect(parsed?.content).toContain("Do the thing.");
    // The frontmatter must not survive into the body the model reads.
    expect(parsed?.content).not.toContain("description:");
  });

  it("rejects a file with no frontmatter, an empty field, or a bad name", () => {
    expect(parseSkillMarkdown("# Just a heading")).toBeNull();
    expect(parseSkillMarkdown("---\nname: a\n---\n\nbody")).toBeNull();
    expect(parseSkillMarkdown("---\nname: a\ndescription: d\n---\n\n")).toBeNull();
    expect(
      parseSkillMarkdown("---\nname: Not A Name\ndescription: d\n---\n\nbody")
    ).toBeNull();
  });

  // A quote is only a quote when it wraps the whole value. Stripping a leading
  // and a trailing one independently ate the closing quote off a description
  // that quotes a trigger phrase — the text a model reads to pick the skill.
  it.each([
    ['description: Use when the user says "go"', 'Use when the user says "go"'],
    ['description: "go" is the trigger', '"go" is the trigger'],
    ["description: for the users'", "for the users'"],
    ["description: \"d'", "\"d'"],
    ['description: "', '"'],
    ['description: "d"', "d"],
    ["description: 'd'", "d"]
  ])("takes %j as a value", (line, description) => {
    expect(parseSkillMarkdown(`---\nname: alpha\n${line}\n---\nbody`)).toEqual({
      name: "alpha",
      description,
      content: "body"
    });
  });

  it("strips a matched quote pair from a name", () => {
    expect(
      parseSkillMarkdown('---\nname: "alpha"\ndescription: d\n---\nbody')?.name
    ).toBe("alpha");
    // Unmatched, so the quote is part of the name — which is not a valid one.
    expect(
      parseSkillMarkdown('---\nname: "alpha\ndescription: d\n---\nbody')
    ).toBeNull();
  });

  // A value is the rest of its own line. `\s*` matches newlines, so an empty
  // field used to read the next line as its value — a skill described by
  // whatever key happened to follow it.
  it("does not read the next line as the value of an empty field", () => {
    expect(
      parseSkillMarkdown(
        "---\nname: alpha\ndescription:\nlicense: MIT\n---\nbody"
      )
    ).toBeNull();
  });

  // A fence is a whole line. A frontmatter line that merely starts with "---"
  // used to end the frontmatter, spilling the rest of it into the body the
  // model reads as instructions — or dropping the fields below it entirely.
  it("does not end the frontmatter on a line that only starts with ---", () => {
    expect(
      parseSkillMarkdown(
        "---\nname: alpha\ndescription: d\n--- and more\n---\nbody"
      )
    ).toEqual({ name: "alpha", description: "d", content: "body" });
    expect(
      parseSkillMarkdown(
        "---\nname: alpha\n--- and more\ndescription: d\n---\nbody"
      )
    ).toEqual({ name: "alpha", description: "d", content: "body" });
  });

  // Pinned by enumeration rather than chosen: these are the readings the
  // parser already had, and nothing here adjudicates them as wrong.
  it.each([
    ["lowercases the name", "---\nname: ALPHA\ndescription: d\n---\nbody", {
      name: "alpha",
      description: "d",
      content: "body"
    }],
    ["keeps a body horizontal rule", "---\nname: alpha\ndescription: d\n---\na\n\n---\n\nb", {
      name: "alpha",
      description: "d",
      content: "a\n\n---\n\nb"
    }],
    ["reads CRLF", "---\r\nname: alpha\r\ndescription: d\r\n---\r\nbody\r\n", {
      name: "alpha",
      description: "d",
      content: "body"
    }],
    ["takes the first of a repeated key", "---\nname: alpha\ndescription: one\ndescription: two\n---\nbody", {
      name: "alpha",
      description: "one",
      content: "body"
    }],
    ["ignores a comment line", "---\n#name: fake\nname: alpha\ndescription: d\n---\nbody", {
      name: "alpha",
      description: "d",
      content: "body"
    }],
    ["keeps a colon inside a value", "---\nname: alpha\ndescription: Use when: it matters\n---\nbody", {
      name: "alpha",
      description: "Use when: it matters",
      content: "body"
    }],
    ["keeps dashes inside a value", "---\nname: alpha\ndescription: a --- b\n---\nbody", {
      name: "alpha",
      description: "a --- b",
      content: "body"
    }]
  ])("%s", (_label, source, expected) => {
    expect(parseSkillMarkdown(source)).toEqual(expected);
  });

  it.each([
    ["an indented key", "---\n  name: alpha\n  description: d\n---\nbody"],
    ["a space before the colon", "---\nname : alpha\ndescription : d\n---\nbody"],
    ["an indented closing fence", "---\nname: alpha\ndescription: d\n  ---\nbody"],
    ["a four-dash closing fence", "---\nname: alpha\ndescription: d\n----\nbody"],
    ["no closing fence", "---\nname: alpha\ndescription: d\nbody"],
    ["markup in the description", "---\nname: alpha\ndescription: use <b>this</b>\n---\nbody"]
  ])("rejects %s", (_label, source) => {
    expect(parseSkillMarkdown(source)).toBeNull();
  });
});

describe("loadSystemSkills", () => {
  it("reads every well-formed skill in the directory", () => {
    writeSkill("alpha", wellFormed("alpha"));
    writeSkill("beta", wellFormed("beta"));
    expect(loadSystemSkills().map((s) => s.name)).toEqual(["alpha", "beta"]);
  });

  it("skips a malformed skill without losing the others", () => {
    writeSkill("alpha", wellFormed("alpha"));
    writeSkill("broken", "no frontmatter here");
    expect(loadSystemSkills().map((s) => s.name)).toEqual(["alpha"]);
  });

  it("skips a skill whose frontmatter name disagrees with its directory", () => {
    writeSkill("alpha", wellFormed("somethingelse"));
    expect(loadSystemSkills()).toEqual([]);
  });

  it("reports an empty list when no directory exists", () => {
    process.env["NODETOOL_SYSTEM_SKILLS_DIR"] = join(dir, "nope");
    clearSystemSkillCache();
    expect(loadSystemSkills()).toEqual([]);
  });
});

describe("reservation and merge", () => {
  beforeEach(() => {
    writeSkill("alpha", wellFormed("alpha"));
    clearSystemSkillCache();
  });

  it("recognizes a shipped name, with or without a leading slash", () => {
    expect(isSystemSkillName("alpha")).toBe(true);
    expect(isSystemSkillName("/alpha")).toBe(true);
    expect(isSystemSkillName("ALPHA")).toBe(true);
    expect(isSystemSkillName("mine")).toBe(false);
  });

  it("finds a shipped skill body by name", () => {
    expect(findSystemSkill("alpha")?.content).toContain("Do the thing.");
    expect(findSystemSkill("mine")).toBeNull();
  });

  it("appends shipped skills to the user's own", () => {
    const merged = mergeSystemSkills([
      { name: "mine", description: "mine" }
    ]);
    expect(merged.map((s) => s.name)).toEqual(["mine", "alpha"]);
  });

  it("lets a pre-existing user row of the same name win, listed once", () => {
    const merged = mergeSystemSkills([
      { name: "alpha", description: "the user's own alpha" }
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.description).toBe("the user's own alpha");
  });
});
