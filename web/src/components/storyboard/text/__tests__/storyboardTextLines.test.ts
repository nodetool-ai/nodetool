import { $createRangeSelection, $getRoot, $setSelection, ParagraphNode, createEditor, type LexicalEditor } from "lexical";
import { registerRichText } from "@lexical/rich-text";
import { parseStoryboardMarkdown } from "@nodetool-ai/protocol";

import { $lines, $loadText, $locateSelection, $replaceRange, type LineRange } from "../storyboardTextLines";
import { $setPoint, StoryboardLineNode, StoryboardTokenNode } from "../storyboardTextNodes";

const TEXT = [
  "# Board {#b1}",
  "### First light {#s1}",
  "Nova kneels by a shoot.",
  "- **Motion:** Slow push in",
  "with a tilt up",
  "### Second {#s2}",
  "Close on the shoot."
].join("\n");

function editorWith(text: string): LexicalEditor {
  const editor = createEditor({
    namespace: "test",
    nodes: [StoryboardLineNode, StoryboardTokenNode, { replace: ParagraphNode, with: () => new StoryboardLineNode(), withKlass: StoryboardLineNode }],
    onError: (error) => {
      throw error;
    }
  });
  registerRichText(editor);
  editor.update(() => $loadText(text), { discrete: true });
  return editor;
}

const select = (editor: LexicalEditor, range: LineRange): void => {
  editor.update(
    () => {
      const lines = $lines();
      const selection = $createRangeSelection();
      $setPoint(selection.anchor, lines[range.startLine], range.startOffset);
      $setPoint(selection.focus, lines[range.endLine], range.endOffset);
      $setSelection(selection);
    },
    { discrete: true }
  );
};

const locate = (editor: LexicalEditor) => {
  const result = parseStoryboardMarkdown(TEXT);
  return editor.getEditorState().read(() => $locateSelection(result));
};

describe("$locateSelection", () => {
  it("describes a selection inside an action", () => {
    const editor = editorWith(TEXT);
    select(editor, { startLine: 2, startOffset: 0, endLine: 2, endOffset: 11 });
    expect(locate(editor)?.selection).toMatchObject({ mode: "single", text: "Nova kneels", scope: "Shot 1 · action", marked: "⟦Nova kneels⟧ by a shoot.", heading: false });
  });

  it("never starts inside a field's syntax", () => {
    const editor = editorWith(TEXT);
    select(editor, { startLine: 3, startOffset: 0, endLine: 3, endOffset: 26 });
    expect(locate(editor)?.selection.text).toBe("Slow push in");
  });

  it("treats a field and its continuation line as one selection", () => {
    const editor = editorWith(TEXT);
    select(editor, { startLine: 3, startOffset: 14, endLine: 4, endOffset: 14 });
    expect(locate(editor)?.selection).toMatchObject({ mode: "single", text: "Slow push in\nwith a tilt up" });
  });

  it("stops a heading selection before its id", () => {
    const editor = editorWith(TEXT);
    select(editor, { startLine: 1, startOffset: 0, endLine: 1, endOffset: 21 });
    expect(locate(editor)?.selection).toMatchObject({ text: "First light", heading: true });
  });

  it("reports a selection across shots as several lines", () => {
    const editor = editorWith(TEXT);
    select(editor, { startLine: 2, startOffset: 5, endLine: 6, endOffset: 5 });
    expect(locate(editor)?.selection).toMatchObject({ mode: "multi", from: "Shot 1 · action", to: "Shot 2 · action" });
  });

  it("ignores an empty selection", () => {
    const editor = editorWith(TEXT);
    select(editor, { startLine: 2, startOffset: 3, endLine: 2, endOffset: 3 });
    expect(locate(editor)).toBeNull();
  });
});

describe("$replaceRange", () => {
  it("replaces the located text", () => {
    const editor = editorWith(TEXT);
    let ok = false;
    editor.update(() => {
      ok = $replaceRange({ startLine: 2, startOffset: 0, endLine: 2, endOffset: 11 }, "Nova kneels", "Nova sinks down", false);
    }, { discrete: true });
    expect(ok).toBe(true);
    expect(editor.getEditorState().read(() => $getRoot().getChildren()[2].getTextContent())).toBe("Nova sinks down by a shoot.");
  });

  it("keeps the spaces a mouse selection took at its ends", () => {
    const editor = editorWith(TEXT);
    editor.update(() => {
      $replaceRange({ startLine: 2, startOffset: 0, endLine: 2, endOffset: 12 }, "Nova kneels ", "Nova sinks down,", false);
    }, { discrete: true });
    expect(editor.getEditorState().read(() => $getRoot().getChildren()[2].getTextContent())).toBe("Nova sinks down, by a shoot.");
  });

  it("refuses when the text changed since it was selected", () => {
    const editor = editorWith(TEXT);
    let ok = true;
    editor.update(() => {
      ok = $replaceRange({ startLine: 2, startOffset: 0, endLine: 2, endOffset: 11 }, "Someone else", "x", false);
    }, { discrete: true });
    expect(ok).toBe(false);
  });

  it("keeps a heading on one line", () => {
    const editor = editorWith(TEXT);
    editor.update(() => {
      $replaceRange({ startLine: 1, startOffset: 4, endLine: 1, endOffset: 15 }, "First light", "Dawn\nunder glass", true);
    }, { discrete: true });
    expect(editor.getEditorState().read(() => $getRoot().getChildren()[1].getTextContent())).toBe("### Dawn under glass {#s1}");
  });
});
