/**
 * The formatting actions of the document editor, shared by the toolbar and
 * the keyboard shortcuts so both apply the same edit.
 */
import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  type ListType
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  type HeadingTagType
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import { $findMatchingParent, $getNearestNodeOfType } from "@lexical/utils";
import {
  $createParagraphNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $isRootOrShadowRoot,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type TextFormatType
} from "lexical";
import { ListNode } from "@lexical/list";

import { INSERT_HORIZONTAL_RULE_COMMAND } from "../textEditor/horizontalRuleCommand";
import { $createDocumentImageNode } from "./nodes/DocumentImageNode";

/** The block the caret is in, as the toolbar names it. */
export type DocumentBlockType =
  | "paragraph"
  | HeadingTagType
  | "quote"
  | "code"
  | ListType;

export interface DocumentSelectionState {
  block: DocumentBlockType;
  formats: ReadonlySet<TextFormatType>;
  link: boolean;
}

const INLINE_FORMATS: readonly TextFormatType[] = [
  "bold",
  "italic",
  "strikethrough",
  "code"
];

/** Read the toolbar state of the current selection. Call inside a read. */
export function $readSelectionState(): DocumentSelectionState {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return { block: "paragraph", formats: new Set(), link: false };
  }
  const anchor = selection.anchor.getNode();
  const top: LexicalNode =
    anchor.getKey() === "root"
      ? anchor
      : ($findMatchingParent(anchor, (node) => {
          const parent = node.getParent();
          return parent !== null && $isRootOrShadowRoot(parent);
        }) ?? anchor.getTopLevelElementOrThrow());
  let block: DocumentBlockType = "paragraph";
  if ($isListNode(top)) {
    const list = $getNearestNodeOfType<ListNode>(anchor, ListNode);
    block = (list ?? top).getListType();
  } else if ($isHeadingNode(top)) {
    block = top.getTag();
  } else if ($isQuoteNode(top)) {
    block = "quote";
  } else if ($isCodeNode(top)) {
    block = "code";
  }
  const formats = new Set(INLINE_FORMATS.filter((format) => selection.hasFormat(format)));
  const link =
    $isLinkNode(anchor.getParent()) || $isLinkNode(anchor);
  return { block, formats, link };
}

export function toggleFormat(editor: LexicalEditor, format: TextFormatType): void {
  editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
}

/** Turn the selected blocks into `type`, or back into paragraphs if they are. */
export function setBlockType(
  editor: LexicalEditor,
  type: "paragraph" | HeadingTagType | "quote" | "code",
  current: DocumentBlockType
): void {
  const target = current === type ? "paragraph" : type;
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }
    $setBlocksType(selection, () => {
      if (target === "paragraph") return $createParagraphNode();
      if (target === "quote") return $createQuoteNode();
      if (target === "code") return $createCodeNode();
      return $createHeadingNode(target);
    });
  });
}

export function toggleList(
  editor: LexicalEditor,
  type: ListType,
  current: DocumentBlockType
): void {
  if (current === type) {
    editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    return;
  }
  const command =
    type === "bullet"
      ? INSERT_UNORDERED_LIST_COMMAND
      : type === "number"
        ? INSERT_ORDERED_LIST_COMMAND
        : INSERT_CHECK_LIST_COMMAND;
  editor.dispatchCommand(command, undefined);
}

/** Increase indentation of the selected list items or blocks (PRD R2). */
export function indentSelection(editor: LexicalEditor): void {
  editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
}

/** Decrease indentation of the selected list items or blocks (PRD R2). */
export function outdentSelection(editor: LexicalEditor): void {
  editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
}

/** Link the selection to `url`, or remove the link when `url` is empty. */
export function setLink(editor: LexicalEditor, url: string): void {
  editor.dispatchCommand(TOGGLE_LINK_COMMAND, url.trim() === "" ? null : url.trim());
}

export function insertTable(editor: LexicalEditor): void {
  editor.dispatchCommand(INSERT_TABLE_COMMAND, {
    rows: "3",
    columns: "3",
    includeHeaders: { rows: true, columns: false }
  });
}

export function insertRule(editor: LexicalEditor): void {
  editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
}

export function insertImage(editor: LexicalEditor, src: string, alt: string): void {
  if (src.trim() === "") {
    return;
  }
  editor.update(() => {
    $insertNodes([$createDocumentImageNode(src.trim(), alt.trim())]);
  });
}
