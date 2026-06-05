/**
 * Lexical 0.45 added a `NormalizeInlineElementsExtension` transform (registered
 * by `registerRichText`/`registerPlainText`) that strips *empty inline elements*.
 * The prompt composer leans on inline `DecoratorNode` chips with no children
 * (asset mentions, `{{ variables }}`), so guard that the rich-text transforms
 * leave them intact and that they survive an editor-state JSON round-trip.
 */
import {
  createEditor,
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  type LexicalEditor
} from "lexical";
import { registerRichText } from "@lexical/rich-text";

import {
  AssetMentionNode,
  $createAssetMentionNode,
  $isAssetMentionNode
} from "../AssetMentionNode";
import {
  VariableNode,
  $createVariableNode,
  $isVariableNode
} from "../VariableNode";
import { $serializePrompt } from "../promptEditorState";

const makeRichTextEditor = (): { editor: LexicalEditor; cleanup: () => void } => {
  const editor = createEditor({
    namespace: "rich-inline-test",
    nodes: [AssetMentionNode, VariableNode],
    onError: (e) => {
      throw e;
    }
  });
  // A live root element makes the editor reconcile (and thus run the
  // registered transforms) on update, matching how the real composer behaves.
  editor.setRootElement(document.createElement("div"));
  const cleanup = registerRichText(editor);
  return { editor, cleanup };
};

const seedChips = (editor: LexicalEditor): void => {
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      const p = $createParagraphNode();
      p.append($createTextNode("a "));
      p.append($createAssetMentionNode("asset://x.png", "x"));
      p.append($createTextNode(" "));
      p.append($createVariableNode("seed"));
      p.append($createTextNode(" b"));
      root.append(p);
    },
    { discrete: true }
  );
};

describe("inline chips under registerRichText", () => {
  it("keeps asset-mention and variable chips after rich-text transforms", () => {
    const { editor, cleanup } = makeRichTextEditor();
    seedChips(editor);

    let prompt = "";
    let mentionCount = 0;
    let variableCount = 0;
    editor.getEditorState().read(() => {
      prompt = $serializePrompt();
      for (const block of $getRoot().getChildren()) {
        if ("getChildren" in block) {
          for (const child of (block as ReturnType<typeof $createParagraphNode>).getChildren()) {
            if ($isAssetMentionNode(child)) mentionCount += 1;
            if ($isVariableNode(child)) variableCount += 1;
          }
        }
      }
    });
    cleanup();

    expect(mentionCount).toBe(1);
    expect(variableCount).toBe(1);
    expect(prompt).toBe("a asset://x.png {{ seed }} b");
  });

  it("round-trips inline chips through editor-state JSON", () => {
    const { editor, cleanup } = makeRichTextEditor();
    seedChips(editor);

    const json = JSON.stringify(editor.getEditorState().toJSON());
    const restored = editor.parseEditorState(json);

    let prompt = "";
    restored.read(() => {
      prompt = $serializePrompt();
    });
    cleanup();

    expect(prompt).toBe("a asset://x.png {{ seed }} b");
  });
});
