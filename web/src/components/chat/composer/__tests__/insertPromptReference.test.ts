import { insertPromptReference } from "../insertPromptReference";

describe("insertPromptReference", () => {
  it("inserts into an empty prompt with a trailing space", () => {
    expect(insertPromptReference("", 0, "entity://e1")).toEqual({
      value: "entity://e1 ",
      caret: 12
    });
  });

  it("separates the reference from a word before the caret", () => {
    expect(insertPromptReference("use", 3, "[Hero](sketch://s1)")).toEqual({
      value: "use [Hero](sketch://s1) ",
      caret: 24
    });
  });

  it("does not double the space that already follows the caret", () => {
    expect(insertPromptReference("a  b", 2, "x")).toEqual({
      value: "a x b",
      caret: 3
    });
  });

  it("clamps a caret past the end of the text", () => {
    expect(insertPromptReference("hi", 99, "x").value).toBe("hi x ");
  });
});
