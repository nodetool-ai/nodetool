import { describe, expect, it } from "vitest";

import {
  MAX_SANDBOX_DESCRIPTION,
  isValidSkillDescription,
  isValidSkillName,
  parseFrontmatter,
  parseSkillDocument,
  sanitizeSandboxDescription,
  skillSections
} from "../src/index.js";

const skill = [
  "---",
  "name: acme-geo",
  'description: "Great-circle distance helpers."',
  "---",
  "Use `distance(a, b)` for kilometres.",
  "",
  "## @acme/geo/distance",
  "Takes two {lat, lon} points.",
  "",
  "## @acme/geo/bearing",
  "Returns degrees from north.",
  ""
].join("\n");

describe("parseSkillDocument", () => {
  it("reads the frontmatter and keeps the whole body", () => {
    const parsed = parseSkillDocument(skill);
    expect(parsed?.name).toBe("acme-geo");
    expect(parsed?.description).toBe("Great-circle distance helpers.");
    expect(parsed?.instructions).toContain("## @acme/geo/bearing");
  });

  it("keeps a horizontal rule inside the body", () => {
    const parsed = parseSkillDocument(
      "---\nname: acme\ndescription: d\n---\nbefore\n---\nafter\n"
    );
    expect(parsed?.instructions).toContain("after");
  });

  it("keeps a `---` inside a frontmatter value out of the body", () => {
    const parsed = parseSkillDocument(
      "---\nname: acme\ndescription: Extract data --- fast.\n---\n\nBody text.\n"
    );
    expect(parsed?.description).toBe("Extract data --- fast.");
    expect(parsed?.instructions).toBe("Body text.");
  });

  it("does not read a frontmatter tail as the body of an empty document", () => {
    expect(
      parseSkillDocument(
        "---\nname: acme\ndescription: Extract data --- fast.\n---\n"
      )
    ).toBeNull();
  });

  it("takes the opening `---` even with trailing junk on the line", () => {
    const parsed = parseSkillDocument(
      "---x\nname: acme\ndescription: d\n---\nbody"
    );
    expect(parsed?.name).toBe("acme");
  });

  it("rejects a document without frontmatter, name, description, or body", () => {
    expect(parseSkillDocument("not frontmatter")).toBeNull();
    expect(parseSkillDocument("---\ndescription: d\n---\nbody")).toBeNull();
    expect(parseSkillDocument("---\nname: acme\n---\nbody")).toBeNull();
    expect(parseSkillDocument("---\nname: acme\ndescription: d\n---\n")).toBeNull();
  });

  it("rejects a name that claims a vendor or is not a slug", () => {
    expect(
      parseSkillDocument("---\nname: claude-geo\ndescription: d\n---\nbody")
    ).toBeNull();
    expect(
      parseSkillDocument("---\nname: Acme Geo\ndescription: d\n---\nbody")
    ).toBeNull();
  });

  it("parses quoted frontmatter values", () => {
    expect(parseFrontmatter("name: 'acme'\n# comment\nnope")).toEqual({
      name: "acme"
    });
  });
});

describe("skillSections", () => {
  it("keys each `##` section by its lowercased heading", () => {
    const parsed = parseSkillDocument(skill);
    const sections = skillSections(parsed?.instructions ?? "");
    expect(Object.keys(sections)).toEqual([
      "@acme/geo/distance",
      "@acme/geo/bearing"
    ]);
    expect(sections["@acme/geo/distance"]).toBe("Takes two {lat, lon} points.");
  });

  it("has no section for a body with no headings", () => {
    expect(skillSections("just prose")).toEqual({});
  });

  it("takes `###` as body text, not as a section", () => {
    expect(skillSections("### deeper\ntext")).toEqual({});
  });

  it("ignores a `##` marker with nothing after it", () => {
    expect(skillSections("##\ntext")).toEqual({});
    expect(skillSections("##   \ntext")).toEqual({});
  });

  /**
   * A pack's SKILL.md is third-party text. The heading scan used to be
   * `/^##\s+(.+?)\s*$/`, whose adjacent `\s+`/lazy/`\s*$` quantifiers
   * backtrack polynomially on exactly this input (CodeQL alert 311). The scan
   * is linear by construction now; this pins both the timing and the answer.
   */
  it("parses a heading padded with tens of thousands of spaces", () => {
    const padded = `## acme${" ".repeat(80_000)}\nbody`;
    const started = Date.now();
    expect(skillSections(padded)).toEqual({ acme: "body" });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("sanitizeSandboxDescription", () => {
  it("flattens control characters and newlines to one line", () => {
    expect(
      sanitizeSandboxDescription("line one\n\u0007line\ttwo\u0000")
    ).toBe("line one line two");
  });

  it("caps runaway length", () => {
    const long = sanitizeSandboxDescription("x".repeat(500));
    expect(long.length).toBe(MAX_SANDBOX_DESCRIPTION);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("isValidSkillName", () => {
  it.each([
    ["acme-geo", true],
    ["a", true],
    ["0-9", true],
    ["a".repeat(64), true],
    ["", false],
    ["a".repeat(65), false],
    ["Acme", false],
    ["acme_geo", false],
    ["acme geo", false],
    ["café", false],
    ["claude-helper", false],
    ["my-anthropic-skill", false]
  ])("%j -> %s", (name, expected) => {
    expect(isValidSkillName(name)).toBe(expected);
  });
});

describe("isValidSkillDescription", () => {
  it.each([
    ["Use when plotting.", true],
    ["a".repeat(1024), true],
    ["1 < 2", true],
    ["", false],
    ["a".repeat(1025), false],
    ["has <b>markup</b>", false],
    ["line one\nline two", false],
    ["line one\r\nline two", false],
    ["trailing newline\n", false],
    ["line one line two", false]
  ])("%j -> %s", (description, expected) => {
    expect(isValidSkillDescription(description)).toBe(expected);
  });
});
