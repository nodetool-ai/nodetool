import type { JSX } from "react";
import {
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical";

import RawMarkdownBlock from "./RawMarkdownBlock";

export type SerializedRawMarkdownNode = Spread<
  { type: "raw-markdown"; version: 1; markdown: string },
  SerializedLexicalNode
>;

/**
 * A block the formatted editor cannot represent, kept as its Markdown source:
 * YAML front matter, raw HTML, link reference definitions and indented code.
 * It renders as source and is edited in the source view, so saving writes it
 * back unchanged.
 */
export class RawMarkdownNode extends DecoratorNode<JSX.Element> {
  __markdown: string;

  static getType(): string {
    return "raw-markdown";
  }

  static clone(node: RawMarkdownNode): RawMarkdownNode {
    return new RawMarkdownNode(node.__markdown, node.__key);
  }

  static importJSON(serialized: SerializedRawMarkdownNode): RawMarkdownNode {
    return $createRawMarkdownNode(serialized.markdown);
  }

  constructor(markdown: string, key?: NodeKey) {
    super(key);
    this.__markdown = markdown;
  }

  exportJSON(): SerializedRawMarkdownNode {
    return { type: "raw-markdown", version: 1, markdown: this.getMarkdown() };
  }

  getMarkdown(): string {
    return this.getLatest().__markdown;
  }

  createDOM(): HTMLElement {
    const element = document.createElement("div");
    element.className = "document-raw-block";
    return element;
  }

  updateDOM(): boolean {
    return false;
  }

  getTextContent(): string {
    return this.getMarkdown();
  }

  isInline(): false {
    return false;
  }

  decorate(): JSX.Element {
    return <RawMarkdownBlock markdown={this.__markdown} />;
  }
}

export function $createRawMarkdownNode(markdown: string): RawMarkdownNode {
  return new RawMarkdownNode(markdown);
}

export function $isRawMarkdownNode(
  node: LexicalNode | null | undefined
): node is RawMarkdownNode {
  return node instanceof RawMarkdownNode;
}
