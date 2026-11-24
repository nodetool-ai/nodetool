/**
 * The keyboard shortcuts of the document editor that Lexical does not bind
 * itself (PRD R2). Bold, italic, underline, undo and redo come with the rich
 * text plugin.
 */
import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COMMAND_PRIORITY_NORMAL, KEY_DOWN_COMMAND } from "lexical";
import type { HeadingTagType } from "@lexical/rich-text";

import {
  $readSelectionState,
  setBlockType,
  toggleFormat,
  toggleList
} from "./documentCommands";

interface DocumentShortcutsPluginProps {
  /** Open the link field (Mod+K). */
  onLink: () => void;
  /** Take a manual snapshot (Mod+S). */
  onSave?: () => void;
}

const HEADINGS: Record<string, "paragraph" | HeadingTagType> = {
  Digit0: "paragraph",
  Digit1: "h1",
  Digit2: "h2",
  Digit3: "h3"
};

const LISTS = { Digit7: "number", Digit8: "bullet", Digit9: "check" } as const;

export function DocumentShortcutsPlugin({
  onLink,
  onSave
}: DocumentShortcutsPluginProps): null {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent) => {
          if (!(event.metaKey || event.ctrlKey)) {
            return false;
          }
          const block = () => editor.getEditorState().read($readSelectionState).block;
          // `code` names the key, so Alt and Shift layouts do not change it.
          const code = event.code;
          let handled = true;
          if (event.altKey && !event.shiftKey && code in HEADINGS) {
            setBlockType(editor, HEADINGS[code], block());
          } else if (event.shiftKey && !event.altKey && code in LISTS) {
            toggleList(editor, LISTS[code as keyof typeof LISTS], block());
          } else if (event.shiftKey && !event.altKey && code === "KeyX") {
            toggleFormat(editor, "strikethrough");
          } else if (!event.shiftKey && !event.altKey && code === "KeyE") {
            toggleFormat(editor, "code");
          } else if (!event.shiftKey && !event.altKey && code === "KeyK") {
            onLink();
          } else if (!event.shiftKey && !event.altKey && code === "KeyS" && onSave) {
            onSave();
          } else {
            handled = false;
          }
          if (handled) {
            event.preventDefault();
          }
          return handled;
        },
        COMMAND_PRIORITY_NORMAL
      ),
    [editor, onLink, onSave]
  );
  return null;
}
