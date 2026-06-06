/**
 * DraftNode — a Lexical `TextNode` holding the free text of an un-voiced beat.
 *
 * Unlike {@link WordNode}, a draft has no per-word timing, so it is one freely
 * editable node (normal insert behavior — you type whole sentences into it).
 * It carries the draft clip's id so a blur reconcile can write the text back as
 * that beat's TTS prompt, or delete the beat when the text is removed.
 */

import {
  TextNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread
} from "lexical";

export type SerializedDraftNode = Spread<
  { type: "transcript-draft"; version: 1; clipId: string },
  SerializedTextNode
>;

export class DraftNode extends TextNode {
  __clipId: string;

  static getType(): string {
    return "transcript-draft";
  }

  static clone(node: DraftNode): DraftNode {
    return new DraftNode(node.__text, node.__clipId, node.__key);
  }

  constructor(text: string, clipId: string, key?: NodeKey) {
    super(text, key);
    this.__clipId = clipId;
  }

  static importJSON(serialized: SerializedDraftNode): DraftNode {
    const node = $createDraftNode(serialized.text, serialized.clipId);
    node.setFormat(serialized.format);
    node.setDetail(serialized.detail);
    node.setMode(serialized.mode);
    node.setStyle(serialized.style);
    return node;
  }

  exportJSON(): SerializedDraftNode {
    return {
      ...super.exportJSON(),
      type: "transcript-draft",
      version: 1,
      clipId: this.__clipId
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.setAttribute("data-draft-clip", this.__clipId);
    dom.classList.add("transcript-draft");
    return dom;
  }

  getClipId(): string {
    return this.getLatest().__clipId;
  }
}

export const $createDraftNode = (text: string, clipId: string): DraftNode =>
  new DraftNode(text, clipId);

export const $isDraftNode = (
  node: LexicalNode | null | undefined
): node is DraftNode => node instanceof DraftNode;
