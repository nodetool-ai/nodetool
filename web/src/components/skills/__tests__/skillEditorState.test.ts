import {
  preserveEditAfterSubmit,
  shouldApplyServerSkill
} from "../skillEditorState";

describe("skill editor state", () => {
  it("preserves an edit made after a save was submitted", () => {
    expect(
      preserveEditAfterSubmit(
        "typed while saving",
        "submitted content",
        "saved content"
      )
    ).toBe("typed while saving");
  });

  it("accepts the saved response when the field has not changed", () => {
    expect(
      preserveEditAfterSubmit(
        "submitted content",
        "submitted content",
        "saved content"
      )
    ).toBe("saved content");
  });

  it("does not re-seed a dirty draft from a query-cache update", () => {
    expect(
      shouldApplyServerSkill({
        initializedSkillId: "skill-1",
        incomingSkillId: "skill-1",
        hasLocalChanges: true,
        incomingUpdatedAt: "revision-2",
        baseUpdatedAt: "revision-1"
      })
    ).toBe(false);
  });
});
