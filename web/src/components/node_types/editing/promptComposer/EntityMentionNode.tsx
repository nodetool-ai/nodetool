import React from "react";
import {
  DecoratorNode,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical";

import { EntityMentionChip } from "./EntityMentionChip";

export type SerializedEntityMentionNode = Spread<
  {
    type: "entity-mention";
    version: 1;
    uri: string;
    label: string;
    thumb?: string;
  },
  SerializedLexicalNode
>;

export class EntityMentionNode extends DecoratorNode<React.JSX.Element> {
  __uri: string;
  __label: string;
  /** Display-only preview URL; never part of the on-disk prompt string. */
  __thumb?: string;

  static getType(): string {
    return "entity-mention";
  }

  static clone(node: EntityMentionNode): EntityMentionNode {
    return new EntityMentionNode(
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

  static importJSON(
    serialized: SerializedEntityMentionNode
  ): EntityMentionNode {
    return $createEntityMentionNode(
      serialized.uri,
      serialized.label,
      serialized.thumb
    );
  }

  exportJSON(): SerializedEntityMentionNode {
    return {
      type: "entity-mention",
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

  /** On-disk encoding — the entity URN the runtime expands at generation time. */
  getTextContent(): string {
    return this.__uri;
  }

  getUri(): string {
    return this.__uri;
  }

  decorate(): React.JSX.Element {
    return (
      <EntityMentionChip
        uri={this.__uri}
        label={this.__label}
        thumb={this.__thumb}
      />
    );
  }
}

export const $createEntityMentionNode = (
  uri: string,
  label: string,
  thumb?: string
): EntityMentionNode => new EntityMentionNode(uri, label || uri, thumb);

export const $isEntityMentionNode = (
  node: LexicalNode | null | undefined
): node is EntityMentionNode => node instanceof EntityMentionNode;
