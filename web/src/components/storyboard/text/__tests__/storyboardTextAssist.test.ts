import { buildAssistPrompt, buildFollowUp, parseAssistReply, type AssistSelection } from "../storyboardTextAssist";

const selection: AssistSelection = {
  mode: "single",
  text: "Nova kneels",
  marked: "⟦Nova kneels⟧ by a shoot.",
  scope: "Shot 1 · action",
  from: "Shot 1 · action",
  to: "Shot 1 · action",
  heading: false
};
const entities = new Map([["e1", { id: "e1", name: "Nova", kind: "character", descriptor: "A young astronaut" }]]);

describe("buildAssistPrompt", () => {
  it("sends the whole board, the library and the marked selection", () => {
    const prompt = buildAssistPrompt({ markdown: "# Board {#b}\n### Shot {#s1}\nNova kneels by a shoot.", entities, selection, instruction: " tighten " });
    expect(prompt).toContain("## Storyboard\n# Board {#b}\n### Shot {#s1}\nNova kneels by a shoot.");
    expect(prompt).toContain("- Nova (character) entity://e1: A young astronaut");
    expect(prompt).toContain("Location: Shot 1 · action");
    expect(prompt).toContain("⟦Nova kneels⟧ by a shoot.");
    expect(prompt.endsWith("## Instruction\ntighten")).toBe(true);
  });

  it("asks for one line when the selection is a heading", () => {
    expect(buildAssistPrompt({ markdown: "", entities, selection: { ...selection, heading: true }, instruction: "x" })).toContain("on one line");
  });

  it("asks only for a note across several objects", () => {
    const prompt = buildAssistPrompt({ markdown: "", entities: new Map(), selection: { ...selection, mode: "multi", from: "Shot 1 · action", to: "Shot 2 · title" }, instruction: "x" });
    expect(prompt).toContain('always use mode "note"');
    expect(prompt).toContain('runs from "Shot 1 · action" to "Shot 2 · title"');
    expect(prompt).toContain("## Entity library\n(none)");
  });

  it("words a follow-up as a refinement", () => {
    expect(buildFollowUp(" shorter ")).toBe("Follow-up instruction: shorter\nReply in the same format.");
  });
});

describe("parseAssistReply", () => {
  it("reads a replacement", () => {
    expect(parseAssistReply("<mode>replace</mode>\n<text> Nova sinks down </text>\n<why>Shorter.</why>", selection)).toEqual({ mode: "replace", text: "Nova sinks down", why: "Shorter." });
  });

  it("reads a partial reply as far as it got", () => {
    expect(parseAssistReply("<mode>note</mode>\n<text>It is consis", selection)).toEqual({ mode: "note", text: "It is consis", why: "" });
  });

  it("shows a reply that ignored the format as a note", () => {
    expect(parseAssistReply("Looks fine to me.", selection)).toEqual({ mode: "note", text: "Looks fine to me.", why: "" });
  });

  it("never replaces across several objects", () => {
    expect(parseAssistReply("<mode>replace</mode><text>x</text>", { mode: "multi" }).mode).toBe("note");
  });
});
