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
