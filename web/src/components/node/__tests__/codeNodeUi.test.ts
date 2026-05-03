import {
  CODE_NODE_TYPE,
  isCodeNode,
  isSnippetCodeNode,
  resolveCodeNodeTitle,
  resolveVisibleBasicFields,
  isCodeNodeTitleEditable
} from "../codeNodeUi";

describe("codeNodeUi", () => {
  describe("isCodeNode", () => {
    it("returns true for the code node type", () => {
      expect(isCodeNode(CODE_NODE_TYPE)).toBe(true);
    });

    it("returns false for other node types", () => {
      expect(isCodeNode("nodetool.image.Generate")).toBe(false);
      expect(isCodeNode("")).toBe(false);
      expect(isCodeNode("nodetool.code.CodeX")).toBe(false);
    });
  });

  describe("isSnippetCodeNode", () => {
    it("returns true when code node with snippet mode", () => {
      expect(
        isSnippetCodeNode(CODE_NODE_TYPE, { codeNodeMode: "snippet" })
      ).toBe(true);
    });

    it("returns false when code node without snippet mode", () => {
      expect(
        isSnippetCodeNode(CODE_NODE_TYPE, { codeNodeMode: undefined })
      ).toBe(false);
    });

    it("returns false for non-code node types", () => {
      expect(
        isSnippetCodeNode("nodetool.text.Concat", { codeNodeMode: "snippet" })
      ).toBe(false);
    });
  });

  describe("resolveCodeNodeTitle", () => {
    it("returns metadata title for non-code nodes", () => {
      expect(
        resolveCodeNodeTitle("nodetool.text.Concat", "Custom", "Text Concat")
      ).toBe("Text Concat");
    });

    it("returns data title for code nodes when present", () => {
      expect(
        resolveCodeNodeTitle(CODE_NODE_TYPE, "My Script", "Code")
      ).toBe("My Script");
    });

    it("returns metadata title when data title is empty", () => {
      expect(resolveCodeNodeTitle(CODE_NODE_TYPE, "", "Code")).toBe("Code");
    });

    it("returns metadata title when data title is whitespace", () => {
      expect(resolveCodeNodeTitle(CODE_NODE_TYPE, "   ", "Code")).toBe("Code");
    });

    it("returns metadata title when data title is undefined", () => {
      expect(resolveCodeNodeTitle(CODE_NODE_TYPE, undefined, "Code")).toBe(
        "Code"
      );
    });
  });

  describe("resolveVisibleBasicFields", () => {
    const fields = ["code", "language", "timeout"];

    it("returns all fields for non-snippet code nodes", () => {
      expect(
        resolveVisibleBasicFields(CODE_NODE_TYPE, fields, {
          codeNodeMode: undefined
        })
      ).toEqual(fields);
    });

    it("filters out code field for snippet code nodes", () => {
      expect(
        resolveVisibleBasicFields(CODE_NODE_TYPE, fields, {
          codeNodeMode: "snippet"
        })
      ).toEqual(["language", "timeout"]);
    });

    it("returns all fields for non-code node types", () => {
      expect(
        resolveVisibleBasicFields("nodetool.text.Concat", fields, {
          codeNodeMode: "snippet"
        })
      ).toEqual(fields);
    });
  });

  describe("isCodeNodeTitleEditable", () => {
    it("returns true for code nodes that are not snippets", () => {
      expect(
        isCodeNodeTitleEditable(CODE_NODE_TYPE, { codeNodeMode: undefined })
      ).toBe(true);
    });

    it("returns false for snippet code nodes", () => {
      expect(
        isCodeNodeTitleEditable(CODE_NODE_TYPE, { codeNodeMode: "snippet" })
      ).toBe(false);
    });

    it("returns false for non-code nodes", () => {
      expect(
        isCodeNodeTitleEditable("nodetool.text.Concat", {
          codeNodeMode: undefined
        })
      ).toBe(false);
    });
  });
});
