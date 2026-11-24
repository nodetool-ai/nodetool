import type { JSX } from "react";
import {
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical";

import DocumentEmbed from "./DocumentEmbed";

export type SerializedDocumentEmbedNode = Spread<
  { type: "document-embed"; version: 1; src: string; alt: string; title: string },
  SerializedLexicalNode
>;

/**
 * An embed written in Markdown image syntax, `![alt](src "title")`: an image,
 * video, audio clip, 3D model, storyboard shot, timeline or voice script (see
 * `document-embeds.ts` in protocol). `src` is stored as written: a path
 * relative to the document (PRD Q2), an `asset://` locator, a `storyboard://`,
 * `timeline://` or `script://` resource URI, or a URL. It is resolved for
 * display only, through the media resolution boundary.
 */
export class DocumentEmbedNode extends DecoratorNode<JSX.Element> {
  __src: string;
  __alt: string;
  __title: string;

  static getType(): string {
    return "document-embed";
  }

  static clone(node: DocumentEmbedNode): DocumentEmbedNode {
    return new DocumentEmbedNode(node.__src, node.__alt, node.__title, node.__key);
  }

  static importJSON(serialized: SerializedDocumentEmbedNode): DocumentEmbedNode {
    return $createDocumentEmbedNode(serialized.src, serialized.alt, serialized.title);
  }

  constructor(src: string, alt: string, title = "", key?: NodeKey) {
    super(key);
    this.__src = src;
    this.__alt = alt;
    this.__title = title;
  }

  exportJSON(): SerializedDocumentEmbedNode {
    const latest = this.getLatest();
    return {
      type: "document-embed",
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
    element.className = "document-embed";
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
    return <DocumentEmbed src={this.__src} alt={this.__alt} />;
  }
}

export function $createDocumentEmbedNode(
  src: string,
  alt: string,
  title = ""
): DocumentEmbedNode {
  return new DocumentEmbedNode(src, alt, title);
}

export function $isDocumentEmbedNode(
  node: LexicalNode | null | undefined
): node is DocumentEmbedNode {
  return node instanceof DocumentEmbedNode;
}
