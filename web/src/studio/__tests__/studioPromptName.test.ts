import { projectNameFromPrompt } from "../useStudioPromptStart";

describe("projectNameFromPrompt", () => {
  it("names the project after the prompt's first clause", () => {
    expect(
      projectNameFromPrompt("A short film about tides. Calm narration.")
    ).toBe("A short film about tides");
  });

  it("truncates a long clause", () => {
    const name = projectNameFromPrompt("x".repeat(200));
    expect(name).toHaveLength(58);
    expect(name.endsWith("…")).toBe(true);
  });

  it("falls back when the prompt has no words", () => {
    expect(projectNameFromPrompt("  ")).toBe("Untitled project");
  });
});
