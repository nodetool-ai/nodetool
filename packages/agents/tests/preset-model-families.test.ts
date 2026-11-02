import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { promptingSkillFor } from "../src/model-prompting-skills.js";

it("maps every shipped Dreamina Seedance 2.x id to its prompting guide", () => {
  const source = readFileSync(new URL("../../runtime/src/providers/dreamina-models.ts", import.meta.url), "utf8");
  const ids = [...source.matchAll(/"(dreamina_seedance_[^"]+)"/g)].map((match) => match[1]);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) { expect(promptingSkillFor(id)).toBe("seedance-2-prompting"); }
});
