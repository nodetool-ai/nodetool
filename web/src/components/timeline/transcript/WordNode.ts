/**
 * WordNode — a Lexical `TextNode` that carries the media binding of one
 * transcript word, so the script editor is a freeform contentEditable whose
 * text stays mapped to the timeline.
 *
 * Each word renders as a `<span>` tagged with `data-clip` / `data-word` and its
 * absolute `data-start` / `data-end` (ms), which the active-word highlight and
 * caret-seek plugins read straight off the DOM. Words don't absorb adjacent
 * typing (`canInsertTextBefore/After` → false) so each keeps a stable identity
 * through edits; characters typed *inside* a word still edit its text (a
 * relabel on reconcile), while text typed *between* words lands in a plain
 * `TextNode`.
 */

import {
  TextNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread
} from "lexical";
import type { CaptionWordKind } from "@nodetool-ai/timeline";

export type WordBinding = {
  clipId: string;
  wordIndex: number;
  startMs: number;
  endMs: number;
  wordKind: CaptionWordKind;
};

export type SerializedWordNode = Spread<
  { type: "transcript-word"; version: 1 } & WordBinding,
  SerializedTextNode
>;

export class WordNode extends TextNode {
  __clipId: string;
  __wordIndex: number;
  __startMs: number;
  __endMs: number;
  __wordKind: CaptionWordKind;

  static getType(): string {
    return "transcript-word";
  }

  static clone(node: WordNode): WordNode {
    return new WordNode(
      node.__text,
      {
        clipId: node.__clipId,
        wordIndex: node.__wordIndex,
        startMs: node.__startMs,
        endMs: node.__endMs,
        wordKind: node.__wordKind
      },
      node.__key
    );
  }

  constructor(text: string, binding: WordBinding, key?: NodeKey) {
    super(text, key);
    this.__clipId = binding.clipId;
    this.__wordIndex = binding.wordIndex;
    this.__startMs = binding.startMs;
    this.__endMs = binding.endMs;
    this.__wordKind = binding.wordKind;
  }

  static importJSON(serialized: SerializedWordNode): WordNode {
    const node = $createWordNode(serialized.text, {
      clipId: serialized.clipId,
      wordIndex: serialized.wordIndex,
      startMs: serialized.startMs,
      endMs: serialized.endMs,
      wordKind: serialized.wordKind
    });
    node.setFormat(serialized.format);
    node.setDetail(serialized.detail);
    node.setMode(serialized.mode);
    node.setStyle(serialized.style);
    return node;
  }

  exportJSON(): SerializedWordNode {
    return {
      ...super.exportJSON(),
      type: "transcript-word",
      version: 1,
      clipId: this.__clipId,
      wordIndex: this.__wordIndex,
      startMs: this.__startMs,
      endMs: this.__endMs,
      wordKind: this.__wordKind
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.setAttribute("data-clip", this.__clipId);
    dom.setAttribute("data-word", String(this.__wordIndex));
    dom.setAttribute("data-start", String(this.__startMs));
    dom.setAttribute("data-end", String(this.__endMs));
    dom.classList.add("transcript-word");
    if (this.__wordKind === "filler") {
      dom.classList.add("transcript-word--filler");
    }
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const updated = super.updateDOM(prevNode, dom, config);
    if (prevNode.__wordKind !== this.__wordKind) {
      dom.classList.toggle("transcript-word--filler", this.__wordKind === "filler");
    }
    return updated;
  }

  // Keep words discrete: adjacent typing creates separate text, not a longer word.
  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }

  getClipId(): string {
    return this.getLatest().__clipId;
  }

  getWordIndex(): number {
    return this.getLatest().__wordIndex;
  }

  getStartMs(): number {
    return this.getLatest().__startMs;
  }
}

export const $createWordNode = (text: string, binding: WordBinding): WordNode =>
  new WordNode(text, binding);

export const $isWordNode = (
  node: LexicalNode | null | undefined
): node is WordNode => node instanceof WordNode;
