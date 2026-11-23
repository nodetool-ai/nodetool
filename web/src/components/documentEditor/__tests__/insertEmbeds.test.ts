import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import { $createParagraphNode, $getRoot, createEditor, type LexicalEditor } from "lexical";

import { insertEmbeds } from "../documentCommands";
import { DOCUMENT_TRANSFORMERS } from "../documentTransformers";
import { DOCUMENT_NODES } from "../markdownBlockCodec";

const editorWith = (markdown: string): LexicalEditor => {
  const editor = createEditor({
    namespace: "test",
    nodes: [...DOCUMENT_NODES],
    onError: (error) => {
      throw error;
    }
  });
  editor.update(() => $convertFromMarkdownString(markdown, DOCUMENT_TRANSFORMERS), {
    discrete: true
  });
  return editor;
};

const markdownOf = (editor: LexicalEditor): string =>
  editor.getEditorState().read(() => $convertToMarkdownString(DOCUMENT_TRANSFORMERS));

const insert = (editor: LexicalEditor, place: () => void) => {
  editor.update(place, { discrete: true });
  insertEmbeds(editor, [
    { src: "assets/a.mp4", alt: "A" },
    { src: " ", alt: "skipped" },
    { src: "storyboard://b1/shots/s1", alt: "" }
  ]);
  editor.update(() => undefined, { discrete: true });
};

describe("insertEmbeds", () => {
  it("adds each embed as its own block after the caret's block", () => {
    const editor = editorWith("First line.\n\nSecond line.");
    insert(editor, () => {
      $getRoot().getFirstChildOrThrow().selectEnd();
    });
    expect(markdownOf(editor)).toBe(
      "First line.\n\n![A](assets/a.mp4)\n\n![](storyboard://b1/shots/s1)\n\nSecond line."
    );
  });

  it("fills an empty paragraph at the caret", () => {
    const editor = editorWith("Intro");
    insert(editor, () => {
      const empty = $createParagraphNode();
      $getRoot().append(empty);
      empty.select();
    });
    expect(editor.getEditorState().read(() => $getRoot().getChildrenSize())).toBe(3);
    expect(markdownOf(editor)).toBe(
      "Intro\n\n![A](assets/a.mp4)\n\n![](storyboard://b1/shots/s1)"
    );
  });

  it("appends to the end without a selection", () => {
    const editor = editorWith("Only text");
    insertEmbeds(editor, [{ src: "voice.wav", alt: "Voice" }]);
    editor.update(() => undefined, { discrete: true });
    expect(markdownOf(editor)).toBe("Only text\n\n![Voice](voice.wav)");
  });
});
