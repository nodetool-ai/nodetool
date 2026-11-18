/**
 * Every chat turn carries the product knowledge, so it holds what each turn
 * needs and names the shipped skill that explains the rest.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { NODETOOL_PRODUCT_KNOWLEDGE } from "../src/prompts/product-knowledge.js";
import { formatSkillCatalogForPrompt } from "../src/skill-prompt.js";
import { parseSkillMarkdown } from "../src/system-skills.js";

const CONCEPTS_SKILL = fileURLToPath(
  new URL("../../system-skills/nodetool-concepts/SKILL.md", import.meta.url)
);

describe("product knowledge", () => {
  it("names the skill that explains each concept in depth", () => {
    expect(NODETOOL_PRODUCT_KNOWLEDGE).toContain("`nodetool-concepts`");
  });

  it("ships that skill featured, so the always-on catalog lists it", () => {
    const skill = parseSkillMarkdown(readFileSync(CONCEPTS_SKILL, "utf8"));
    expect(skill?.name).toBe("nodetool-concepts");
    expect(skill?.featured).toBe(true);
    const catalog = formatSkillCatalogForPrompt([
      { ...skill!, system: true, featured: skill!.featured }
    ]);
    expect(catalog).toContain("`/nodetool-concepts`");
  });

  it("moves the detail into the skill rather than dropping it", () => {
    const body = parseSkillMarkdown(readFileSync(CONCEPTS_SKILL, "utf8"))!.content;
    for (const detail of [
      "Keyframe stills are the cheap step",
      "word timings for captions",
      "deterministic playtest",
      "Never guess model ids"
    ]) {
      expect(body).toContain(detail);
    }
    expect(NODETOOL_PRODUCT_KNOWLEDGE).not.toContain("Keyframe stills");
  });
});
