import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  LexicalCommand,
  $getSelection,
  $isRangeSelection
} from "lexical";
import { $createHorizontalRuleNode } from "./HorizontalRuleNode";
import { $insertNodeToNearestRoot } from "@lexical/utils";

export const INSERT_HORIZONTAL_RULE_COMMAND: LexicalCommand<void> =
  createCommand("INSERT_HORIZONTAL_RULE_COMMAND");

export function HorizontalRulePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      INSERT_HORIZONTAL_RULE_COMMAND,
      () => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection)) {
          return false;
        }

        const focusNode = selection.focus.getNode();
        if (focusNode !== null) {
          const horizontalRuleNode = $createHorizontalRuleNode();
          $insertNodeToNearestRoot(horizontalRuleNode);
        }

        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  return null;
}
