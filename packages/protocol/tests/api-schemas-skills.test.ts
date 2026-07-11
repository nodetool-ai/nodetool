import { describe, it, expect } from "vitest";
import { skillInfo, listOutput } from "../src/api-schemas/skills.js";

const validSkill = {
  name: "my-skill",
  description: null,
  path: "/skills/my-skill",
  instructions: null
};

describe("skills.skillInfo", () => {
  it("parses with null description/instructions", () => {
    expect(skillInfo.safeParse(validSkill).success).toBe(true);
  });

  it("parses with populated description/instructions", () => {
    expect(
      skillInfo.safeParse({
        ...validSkill,
        description: "does things",
        instructions: "step 1"
      }).success
    ).toBe(true);
  });

  it("rejects a missing path", () => {
    const { path, ...rest } = validSkill;
    expect(skillInfo.safeParse(rest).success).toBe(false);
  });

  it("rejects a non-nullable-missing description", () => {
    const { description, ...rest } = validSkill;
    expect(skillInfo.safeParse(rest).success).toBe(false);
  });
});

describe("skills.listOutput", () => {
  it("parses count + skills array", () => {
    expect(
      listOutput.safeParse({ count: 1, skills: [validSkill] }).success
    ).toBe(true);
  });

  it("parses an empty skills list", () => {
    expect(listOutput.safeParse({ count: 0, skills: [] }).success).toBe(true);
  });

  it("rejects a non-number count", () => {
    expect(
      listOutput.safeParse({ count: "1", skills: [] }).success
    ).toBe(false);
  });
});
