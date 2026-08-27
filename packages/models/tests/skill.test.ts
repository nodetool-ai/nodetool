import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "../src/db.js";
import { ModelObserver } from "../src/base-model.js";
import { Skill } from "../src/skill.js";

async function createSkill(
  userId = "user-1",
  name = "writing",
  overrides: Record<string, unknown> = {}
): Promise<Skill> {
  const skill = new Skill({
    user_id: userId,
    name,
    description: "A writing skill",
    content: "Write clearly.",
    ...overrides
  });
  await skill.save();
  return skill;
}

describe("Skill model", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("persists and lists skills by user", async () => {
    const mine = await createSkill();
    await createSkill("user-2", "private");

    expect((await Skill.listByUser("user-1")).map((item) => item.id)).toEqual([
      mine.id
    ]);
    expect(await Skill.findByName("user-1", "writing")).not.toBeNull();
    expect(await Skill.findByName("user-2", "writing")).toBeNull();
  });

  it("rejects invalid descriptions and blank content", async () => {
    await expect(
      createSkill("user-1", "bad-description", { description: "" })
    ).rejects.toThrow(/description/i);
    await expect(
      createSkill("user-1", "blank-content", { content: "  \n" })
    ).rejects.toThrow(/content/i);
  });

  it("enforces a unique name within a user but permits another user", async () => {
    await createSkill("user-1", "same");
    await expect(createSkill("user-1", "same")).rejects.toThrow(/unique/i);
    await expect(createSkill("user-2", "same")).resolves.toBeTruthy();
  });

  it("updates only when the updated_at token matches", async () => {
    const skill = await createSkill();
    const token = skill.updated_at;
    const first = await Skill.updateFieldsIfUnchanged(skill.id, token, {
      content: "Updated."
    });
    expect(first?.content).toBe("Updated.");
    await expect(
      Skill.updateFieldsIfUnchanged(skill.id, token, { content: "Stale." })
    ).resolves.toBeNull();
    expect((await Skill.findById(skill.id))?.content).toBe("Updated.");
  });
});
