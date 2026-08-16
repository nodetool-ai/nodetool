import {
  CODE_NODE_TYPE,
  isCodeNode,
  isSnippetCodeNode,
  resolveCodeNodeTitle,
  isCodeNodeTitleEditable,
  getCodeNodeLanguage,
  codeLanguageLabel,
  hasCodeProperty,
  isCodeBodyNode
} from "../codeNodeUi";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import { stub } from "../../../test-utils/doubles";

const makeMetadata = (
  overrides: Partial<NodeMetadata> = {}
): NodeMetadata =>
  stub<NodeMetadata>({
    node_type: CODE_NODE_TYPE,
    inline_fields: ["code"],
    properties: [
      {
        name: "code",
        type: { type: "str", type_args: [], optional: false }
      }
    ],
    ...overrides
  });

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

  describe("getCodeNodeLanguage", () => {
    it("maps the Code node to JavaScript", () => {
      expect(getCodeNodeLanguage(CODE_NODE_TYPE)).toBe("javascript");
    });

    it("falls back to text for unknown node types", () => {
      expect(getCodeNodeLanguage("nodetool.text.Concat")).toBe("text");
    });
  });

  describe("codeLanguageLabel", () => {
    it("returns a human label for known languages", () => {
      expect(codeLanguageLabel("javascript")).toBe("JavaScript");
      expect(codeLanguageLabel("text")).toBe("Code");
    });
  });

  describe("hasCodeProperty", () => {
    it("returns true for a node with an inline str code property", () => {
      expect(hasCodeProperty(makeMetadata())).toBe(true);
    });

    it("returns false when code is not in inline_fields", () => {
      expect(hasCodeProperty(makeMetadata({ inline_fields: [] }))).toBe(false);
    });

    it("returns false when there is no code property", () => {
      expect(hasCodeProperty(makeMetadata({ properties: [] }))).toBe(false);
    });

    it("returns false for undefined metadata", () => {
      expect(hasCodeProperty(undefined)).toBe(false);
    });
  });

  describe("isCodeBodyNode", () => {
    it("returns true for a non-snippet code node", () => {
      expect(isCodeBodyNode(makeMetadata(), { codeNodeMode: undefined })).toBe(
        true
      );
    });

    it("returns false for snippet-backed code nodes", () => {
      expect(
        isCodeBodyNode(makeMetadata(), { codeNodeMode: "snippet" })
      ).toBe(false);
    });

    it("returns false for nodes without a code property", () => {
      expect(
        isCodeBodyNode(
          makeMetadata({ inline_fields: [], properties: [] }),
          { codeNodeMode: undefined }
        )
      ).toBe(false);
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
