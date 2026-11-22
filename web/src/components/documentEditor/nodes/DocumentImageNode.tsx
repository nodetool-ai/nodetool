import type { JSX } from "react";
import {
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical";

import DocumentImage from "./DocumentImage";

export type SerializedDocumentImageNode = Spread<
  { type: "document-image"; version: 1; src: string; alt: string; title: string },
  SerializedLexicalNode
>;

/**
 * A Markdown image, `![alt](src "title")`. `src` is stored as written: a path
 * relative to the document (PRD Q2), an `asset://` locator or a URL. It is
 * resolved for display only, through the media resolution boundary.
 */
export class DocumentImageNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __alt: string;
  __title: string;

  static getType(): string {
    return "document-image";
  }

  static clone(node: DocumentImageNode): DocumentImageNode {
    return new DocumentImageNode(node.__src, node.__alt, node.__title, node.__key);
  }

  static importJSON(serialized: SerializedDocumentImageNode): DocumentImageNode {
    return $createDocumentImageNode(serialized.src, serialized.alt, serialized.title);
  }

  constructor(src: string, alt: string, title = "", key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__alt = alt;
    this.__title = title;
  }

  exportJSON(): SerializedDocumentImageNode {
    const latest = this.getLatest();
    return {
      type: "document-image",
      version: 1,
      src: latest.__src,
      alt: latest.__alt,
      title: latest.__title
    };
  }

  getSrc(): string {
    return this.getLatest().__src;
  }

  getAlt(): string {
    return this.getLatest().__alt;
  }

  getTitle(): string {
    return this.getLatest().__title;
  }

  createDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "document-image";
    return element;
  }

  updateDOM(): boolean {
    return false;
  }

  getTextContent(): string {
    return this.getAlt();
  }

  isInline(): true {
    return true;
  }

  decorate(): JSX.Element {
    return <DocumentImage src={this.__src} alt={this.__alt} />;
  }
}

export function $createDocumentImageNode(
  src: string,
  alt: string,
  title = ""
): DocumentImageNode {
  return new DocumentImageNode(src, alt, title);
}

export function $isDocumentImageNode(
  node: LexicalNode | null | undefined
): node is DocumentImageNode {
  return node instanceof DocumentImageNode;
}
