/**
 * The staged opening turn: it reaches the panel that binds the project's
 * thread, and it is sent once.
 */

import {
  projectSystemPrompt,
  stageProjectFirstTurn,
  takeProjectFirstTurn
} from "../projectAgent";

describe("projectSystemPrompt", () => {
  it("names the project the agent works in", () => {
    const prompt = projectSystemPrompt("Aurora Launch Spot", "p1");
    expect(prompt).toContain("Aurora Launch Spot");
    expect(prompt).toContain("p1");
  });
});

describe("staged first turn", () => {
  it("hands the content over once, then has nothing left", () => {
    const content = [{ type: "text" as const, text: "A spot for our lamp" }];
    stageProjectFirstTurn("p1", content);
    expect(takeProjectFirstTurn("p1")).toEqual(content);
    expect(takeProjectFirstTurn("p1")).toBeNull();
  });

  it("has nothing for a project nobody staged a prompt for", () => {
    expect(takeProjectFirstTurn("p-unknown")).toBeNull();
  });
});
