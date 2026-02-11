import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND
} from "lexical";
import { $convertFromMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import { isMarkdownText } from "./editorUtils";

export function MarkdownPastePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) {return false;}

        const text = clipboardData.getData("text/plain");
        if (!text) {return false;}

        // Check if the text looks like markdown
        if (!isMarkdownText(text)) {
          // Not markdown, let default paste behavior handle it
          return false;
        }

        // Prevent default paste behavior
        event.preventDefault();

        // Convert markdown to Lexical
        editor.update(() => {
          const selection = $getSelection();

          if ($isRangeSelection(selection)) {
            // Remove selected content if any
            selection.removeText();

            try {
              // Check if editor is empty - $convertFromMarkdownString replaces
              // the entire root content, so we can only use it on empty editors
              const root = $getRoot();
              const isEmpty = root.getTextContent().trim() === "";

              if (isEmpty) {
                // Safe to replace entire content with parsed markdown
                $convertFromMarkdownString(text, TRANSFORMERS);
              } else {
                // Editor has content - insert as plain text to preserve existing content
                // (markdown formatting is lost, but this is better than replacing everything)
                const textNode = $createTextNode(text);
                selection.insertNodes([textNode]);
              }
            } catch (error) {
              console.error("Error converting markdown:", error);
              // Fallback to plain text if conversion fails
              const textNode = $createTextNode(text);
              selection.insertNodes([textNode]);
            }
          }
        });

        return true; // Command handled
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor]);

  return null;
}
