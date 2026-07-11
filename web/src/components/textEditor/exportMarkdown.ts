import { $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { LexicalEditor } from "lexical";

export async function copyAsMarkdown(editor: LexicalEditor): Promise<boolean> {
  try {
    let markdown = "";
    editor.getEditorState().read(() => {
      markdown = $convertToMarkdownString(TRANSFORMERS);
    });
    await navigator.clipboard.writeText(markdown);
    return true;
  } catch (error) {
    console.error("Failed to copy markdown:", error);
    return false;
  }
}

