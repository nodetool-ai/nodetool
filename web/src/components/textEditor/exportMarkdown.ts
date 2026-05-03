import { $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { LexicalEditor } from "lexical";

/**
 * Export the current editor content as markdown
 */
export function exportToMarkdown(editor: LexicalEditor): string {
  let markdown = "";

  editor.getEditorState().read(() => {
    markdown = $convertToMarkdownString(TRANSFORMERS);
  });

  return markdown;
}

/**
 * Copy editor content as markdown to clipboard
 */
export async function copyAsMarkdown(editor: LexicalEditor): Promise<boolean> {
  try {
    const markdown = exportToMarkdown(editor);
    await navigator.clipboard.writeText(markdown);
    return true;
  } catch (error) {
    console.error("Failed to copy markdown:", error);
    return false;
  }
}

