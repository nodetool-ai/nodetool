import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import { createEditor } from "lexical";

import { DOCUMENT_TRANSFORMERS } from "../documentTransformers";
import { DOCUMENT_NODES } from "../markdownBlockCodec";

/** Import Markdown and export it again through the document transformers. */
const roundTrip = (markdown: string): string => {
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
  return editor.getEditorState().read(() => $convertToMarkdownString(DOCUMENT_TRANSFORMERS));
};

describe("document transformers", () => {
  it("keeps brackets and backslashes in image descriptions", () => {
    const markdown = "![a \\[b\\] c\\\\d](assets/x.png)";
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("keeps video, audio, asset and storyboard shot embeds byte for byte", () => {
    const markdown = [
      "![Teaser](assets/teaser%20cut.mp4)",
      "",
      "![Voice](../audio/voice.m4a)",
      "",
      "![](asset://0123456789abcdef0123456789abcdef)",
      "",
      "![SH 03 · Rooftop](storyboard://b1#shot=s3 \"Shot\")"
    ].join("\n");
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("keeps escaped pipes and backslashes in table cells", () => {
    const markdown = "| a \\| b | C:\\\\dir |\n| --- | --- |\n| 1 | 2 |";
    expect(roundTrip(markdown)).toBe(markdown);
  });
});
