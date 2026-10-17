import {
  TEXT_ASSIST_ACTIONS,
  buildTextAssistPrompt,
  cleanTextAssistReply,
  entityAssistContext
} from "../textAssist";

describe("buildTextAssistPrompt", () => {
  it("includes the field, the current text and the instruction", () => {
    const prompt = buildTextAssistPrompt({
      field: {
        label: "Descriptor",
        description: "Describe only stable visual traits.",
        placeholder: "A young astronaut",
        context: 'The entity is a character named "Hermann".'
      },
      text: "old man with a hat",
      instruction: "Add detail."
    });

    expect(prompt).toContain("Label: Descriptor");
    expect(prompt).toContain("Hint: Describe only stable visual traits.");
    expect(prompt).toContain("A young astronaut");
    expect(prompt).toContain('named "Hermann"');
    expect(prompt).toContain("# Current text\nold man with a hat");
    expect(prompt.endsWith("# Instruction\nAdd detail.")).toBe(true);
  });

  it("marks an empty field and omits absent field parts", () => {
    const prompt = buildTextAssistPrompt({
      field: {},
      text: "   ",
      instruction: "Write it."
    });

    expect(prompt).toContain("# Current text\n(empty)");
    expect(prompt).not.toContain("Label:");
    expect(prompt).not.toContain("# Context");
  });
});

describe("cleanTextAssistReply", () => {
  it("removes a code fence", () => {
    expect(cleanTextAssistReply("```text\nA tall man\n```")).toBe("A tall man");
  });

  it("removes quotation marks around the whole reply", () => {
    expect(cleanTextAssistReply('  "A tall man"  ')).toBe("A tall man");
    expect(cleanTextAssistReply("“A tall man”")).toBe("A tall man");
  });

  it("keeps quotation marks inside the text", () => {
    const text = '"Nova" wears a "worn" suit';
    expect(cleanTextAssistReply(text)).toBe(text);
  });
});

describe("TEXT_ASSIST_ACTIONS", () => {
  it("offers one action for an empty field and rewrites for text", () => {
    expect(TEXT_ASSIST_ACTIONS.filter((a) => !a.needsText)).toHaveLength(1);
    expect(TEXT_ASSIST_ACTIONS.filter((a) => a.needsText).length).toBeGreaterThan(1);
  });
});

describe("entityAssistContext", () => {
  it("names the entity when it has a name", () => {
    expect(entityAssistContext("character", " Hermann ")).toBe(
      'The entity is a character named "Hermann".'
    );
    expect(entityAssistContext("prop", "")).toBe("The entity is a prop.");
  });
});
