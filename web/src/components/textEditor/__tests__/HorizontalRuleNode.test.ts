/**
 * Regression guards for the custom {@link HorizontalRuleNode}, exercising the
 * Lexical APIs most exposed to version bumps: `importDOM` (HTML paste / clipboard
 * import), `exportDOM` (HTML/markdown export), and editor-state JSON round-trip
 * (importJSON / exportJSON / clone). These broke historically across the
 * generalized DOMSlot / DOMImport refactors, so pin the behavior the app relies on.
 */
import { createEditor, $getRoot, type LexicalEditor } from "lexical";
import { $generateNodesFromDOM } from "@lexical/html";

import {
  HorizontalRuleNode,
  $createHorizontalRuleNode,
  $isHorizontalRuleNode
} from "../HorizontalRuleNode";

const makeEditor = (): LexicalEditor =>
  createEditor({
    namespace: "hr-test",
    nodes: [HorizontalRuleNode],
    onError: (e) => {
      throw e;
    }
  });

describe("HorizontalRuleNode", () => {
  it("converts an <hr> element back into a HorizontalRuleNode (importDOM)", () => {
    const editor = makeEditor();
    let isHr = false;
    editor.update(
      () => {
        const dom = new DOMParser().parseFromString(
          "<p>before</p><hr><p>after</p>",
          "text/html"
        );
        const nodes = $generateNodesFromDOM(editor, dom);
        isHr = nodes.some((n) => $isHorizontalRuleNode(n));
      },
      { discrete: true }
    );
    expect(isHr).toBe(true);
  });

  it("exports to an <hr> element (exportDOM)", () => {
    const editor = makeEditor();
    let tag = "";
    editor.update(
      () => {
        const node = $createHorizontalRuleNode();
        const { element } = node.exportDOM();
        tag = (element as HTMLElement | null)?.tagName ?? "";
      },
      { discrete: true }
    );
    expect(tag).toBe("HR");
  });

  it("survives an editor-state JSON round-trip", () => {
    const editor = makeEditor();
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append($createHorizontalRuleNode());
      },
      { discrete: true }
    );

    const json = editor.getEditorState().toJSON();
    const restored = editor.parseEditorState(JSON.stringify(json));

    let restoredIsHr = false;
    restored.read(() => {
      const [child] = $getRoot().getChildren();
      restoredIsHr = $isHorizontalRuleNode(child);
    });
    expect(restoredIsHr).toBe(true);
  });

  it("is a non-inline, type-stable node", () => {
    const editor = makeEditor();
    editor.update(
      () => {
        const node = $createHorizontalRuleNode();
        expect(HorizontalRuleNode.getType()).toBe("horizontal-rule");
        expect(node.isInline()).toBe(false);
        expect(node.getTextContent()).toBe("\n");
      },
      { discrete: true }
    );
  });
});
