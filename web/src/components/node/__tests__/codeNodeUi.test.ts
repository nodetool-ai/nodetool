import {
  CODE_NODE_TYPE,
  isCodeNode,
  isSnippetCodeNode,
  isCustomCodeNode,
  resolveCodeNodeTitle,
  resolveNodeHeaderTitle,
  isCodeNodeTitleEditable,
  getCodeNodeLanguage,
  codeLanguageLabel,
  hasCodeProperty,
  isCodeBodyNode
} from "../codeNodeUi";
import { stub } from "../../../test-utils/doubles";
import type { NodeMetadata } from "../../../stores/ApiTypes";

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

  describe("isCustomCodeNode", () => {
    it("returns true for a code node materialized from a saved script", () => {
      expect(isCustomCodeNode(CODE_NODE_TYPE, { codeNodeMode: "custom" })).toBe(
        true
      );
    });

    it("returns false for snippet and plain code nodes", () => {
      expect(
        isCustomCodeNode(CODE_NODE_TYPE, { codeNodeMode: "snippet" })
      ).toBe(false);
      expect(isCustomCodeNode(CODE_NODE_TYPE, { codeNodeMode: undefined })).toBe(
        false
      );
      expect(
        isCustomCodeNode("nodetool.text.Concat", { codeNodeMode: "custom" })
      ).toBe(false);
    });
  });

  describe("custom nodes keep the affordances snippets lose", () => {
    it("shows the code body and keeps the title editable", () => {
      const data = { codeNodeMode: "custom" as const };
      expect(isCodeBodyNode(makeMetadata(), data)).toBe(true);
      expect(isCodeNodeTitleEditable(CODE_NODE_TYPE, data)).toBe(true);
      expect(resolveCodeNodeTitle(CODE_NODE_TYPE, "Invoice number", "Code")).toBe(
        "Invoice number"
      );
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

  describe("resolveNodeHeaderTitle", () => {
    it("uses the input node's name as the header title", () => {
      expect(
        resolveNodeHeaderTitle(
          "nodetool.input.StringInput",
          undefined,
          "String Input",
          "prompt"
        )
      ).toBe("prompt");
    });

    it("trims whitespace around the input name", () => {
      expect(
        resolveNodeHeaderTitle(
          "nodetool.input.ImageInput",
          undefined,
          "Image Input",
          "  source  "
        )
      ).toBe("source");
    });

    it("falls back to the metadata title when the input name is empty", () => {
      expect(
        resolveNodeHeaderTitle(
          "nodetool.input.StringInput",
          undefined,
          "String Input",
          ""
        )
      ).toBe("String Input");
      expect(
        resolveNodeHeaderTitle(
          "nodetool.input.StringInput",
          undefined,
          "String Input",
          "   "
        )
      ).toBe("String Input");
      expect(
        resolveNodeHeaderTitle(
          "nodetool.input.StringInput",
          undefined,
          "String Input"
        )
      ).toBe("String Input");
    });

    it("does not use a note title in place of the input name", () => {
      expect(
        resolveNodeHeaderTitle(
          "nodetool.input.StringInput",
          "a note",
          "String Input",
          "prompt"
        )
      ).toBe("prompt");
    });

    it("keeps code-node title resolution for code nodes", () => {
      expect(
        resolveNodeHeaderTitle(CODE_NODE_TYPE, "My Script", "Code")
      ).toBe("My Script");
    });

    it("keeps the metadata title for other node types", () => {
      expect(
        resolveNodeHeaderTitle(
          "nodetool.text.Concat",
          "Custom",
          "Text Concat",
          "ignored"
        )
      ).toBe("Text Concat");
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
