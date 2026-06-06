import React from "react";
import {
  DecoratorNode,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical";

import { AssetMentionChip } from "./AssetMentionChip";

export type SerializedAssetMentionNode = Spread<
  {
    type: "asset-mention";
    version: 1;
    uri: string;
    label: string;
    thumb?: string;
  },
  SerializedLexicalNode
>;

export class AssetMentionNode extends DecoratorNode<React.JSX.Element> {
  __uri: string;
  __label: string;
  /** Display-only preview URL; never part of the on-disk prompt string. */
  __thumb?: string;

  static getType(): string {
    return "asset-mention";
  }

  static clone(node: AssetMentionNode): AssetMentionNode {
    return new AssetMentionNode(
      node.__uri,
      node.__label,
      node.__thumb,
      node.__key
    );
  }

  constructor(uri: string, label: string, thumb?: string, key?: NodeKey) {
    super(key);
    this.__uri = uri;
    this.__label = label;
    this.__thumb = thumb;
  }

  static importJSON(serialized: SerializedAssetMentionNode): AssetMentionNode {
    return $createAssetMentionNode(
      serialized.uri,
      serialized.label,
      serialized.thumb
    );
  }

  exportJSON(): SerializedAssetMentionNode {
    return {
      type: "asset-mention",
      version: 1,
      uri: this.__uri,
      label: this.__label,
      ...(this.__thumb != null && { thumb: this.__thumb })
    };
  }

  createDOM(): HTMLElement {
    const span = document.createElement("span");
    span.style.display = "inline-block";
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span");
    element.textContent = this.__uri;
    return { element };
  }

  isInline(): true {
    return true;
  }

  /** On-disk encoding — the asset URN that the runtime dereferences. */
  getTextContent(): string {
    return this.__uri;
  }

  getUri(): string {
    return this.__uri;
  }

  decorate(): React.JSX.Element {
    return (
      <AssetMentionChip
        uri={this.__uri}
        label={this.__label}
        thumb={this.__thumb}
      />
    );
  }
}

export const $createAssetMentionNode = (
  uri: string,
  label: string,
  thumb?: string
): AssetMentionNode => new AssetMentionNode(uri, label || uri, thumb);

export const $isAssetMentionNode = (
  node: LexicalNode | null | undefined
): node is AssetMentionNode => node instanceof AssetMentionNode;
