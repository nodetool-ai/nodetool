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

/**
 * Download editor content as a markdown file
 */
export function downloadAsMarkdown(
  editor: LexicalEditor,
  filename: string = "document.md"
): void {
  const markdown = exportToMarkdown(editor);
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
