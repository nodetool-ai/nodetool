/**
 * Lexical `$`-helpers that bridge the editor tree and the on-disk prompt
 * string. Run inside an `editor.update` / `editorState.read` callback.
 */
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  type ElementNode
} from "lexical";

import {
  $createAssetMentionNode
} from "./AssetMentionNode";
import { $createVariableNode } from "./VariableNode";
import { parseAssetUri, tokenizePrompt } from "./promptTokens";

/** Short, human-friendly chip label for an asset URN seen at load time. */
const shortAssetLabel = (uri: string): string => {
  const { assetId, ext } = parseAssetUri(uri);
  const id = assetId.length > 10 ? `${assetId.slice(0, 8)}…` : assetId;
  return ext ? `${id}.${ext}` : id;
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
