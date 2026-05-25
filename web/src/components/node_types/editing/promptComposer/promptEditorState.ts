/**
 * Lexical `$`-helpers that bridge the editor tree and the on-disk prompt
 * string. Run inside an `editor.update` / `editorState.read` callback.
 */
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $insertNodes,
  $isElementNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode
} from "lexical";

import {
  $createAssetMentionNode,
  type AssetMentionNode
} from "./AssetMentionNode";
import { $createVariableNode } from "./VariableNode";
import { parseAssetUri, tokenizePrompt } from "./promptTokens";

/** Short, human-friendly chip label for an asset URN seen at load time. */
const shortAssetLabel = (uri: string): string => {
  const { assetId, ext } = parseAssetUri(uri);
  const id = assetId.length > 10 ? `${assetId.slice(0, 8)}…` : assetId;
  return ext ? `${id}.${ext}` : id;
};

const endsWithSpace = (text: string): boolean => /\s$/.test(text);
const startsWithSpace = (text: string): boolean => /^\s/.test(text);

/**
 * Insert an asset-mention chip at the current selection (or in place of
 * `nodeToReplace`), guaranteeing the URN ends up surrounded by spaces so it
 * never glues to adjacent text in the serialized prompt.
 */
export const $insertAssetMention = (
  node: AssetMentionNode,
  nodeToReplace?: LexicalNode | null
): void => {
  if (nodeToReplace) {
    nodeToReplace.replace(node);
  } else {
    $insertNodes([node]);
  }
  const prev = node.getPreviousSibling();
  const prevIsSpacedText = $isTextNode(prev) && endsWithSpace(prev.getTextContent());
  // No leading space at the very start of a line; otherwise pad unless the
  // preceding text already ends in whitespace.
  if (prev !== null && !prevIsSpacedText) {
    node.insertBefore($createTextNode(" "));
  }
  const next = node.getNextSibling();
  const nextIsSpacedText =
    $isTextNode(next) && startsWithSpace(next.getTextContent());
  if (!nextIsSpacedText) {
    node.insertAfter($createTextNode(" "));
  }
};

/** Serialize the editor tree to the canonical prompt string. */
export const $serializePrompt = (): string =>
  $getRoot()
    .getChildren()
    .map((block) =>
      $isElementNode(block)
        ? (block as ElementNode)
            .getChildren()
            .map((child) => child.getTextContent())
            .join("")
        : block.getTextContent()
    )
    .join("\n");

/** Replace the editor contents with the parsed representation of `text`. */
export const $setPromptFromString = (text: string): void => {
  const root = $getRoot();
  root.clear();
  const lines = tokenizePrompt(text);
  if (lines.length === 0) {
    root.append($createParagraphNode());
    return;
  }
  for (const lineTokens of lines) {
    const paragraph = $createParagraphNode();
    for (const token of lineTokens) {
      if (token.kind === "text") {
        paragraph.append($createTextNode(token.text));
      } else if (token.kind === "asset") {
        paragraph.append(
          $createAssetMentionNode(token.uri, shortAssetLabel(token.uri))
        );
      } else {
        paragraph.append($createVariableNode(token.expr));
      }
    }
    root.append(paragraph);
  }
};
