/**
 * Lexical nodes of the storyboard text view: one node per Markdown line, and
 * styled runs inside it. The text is the document, so the nodes carry no data
 * beyond their text: a run's kind is recomputed from the line on every change.
 */
import {
  $createRangeSelection,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  ParagraphNode,
  TextNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type PointType,
  type SerializedParagraphNode,
  type SerializedTextNode,
  type Spread
} from "lexical";
import {
  tokenizeStoryboardLine,
  type StoryboardMarkdownEntities
} from "@nodetool-ai/protocol";

export class StoryboardLineNode extends ParagraphNode {
  static getType(): string {
    return "storyboard-line";
  }
  static clone(node: StoryboardLineNode): StoryboardLineNode {
    return new StoryboardLineNode(node.__key);
  }
  static importJSON(json: SerializedParagraphNode): StoryboardLineNode {
    return new StoryboardLineNode().updateFromJSON(json);
  }
  exportJSON(): SerializedParagraphNode {
    return { ...super.exportJSON(), type: "storyboard-line", version: 1 };
  }
  createDOM(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "sb-line";
    return dom;
  }
  updateDOM(): boolean {
    return false;
  }
}

type SerializedTokenNode = Spread<{ kind: string }, SerializedTextNode>;

const tokenClass = (kind: string): string => `sb-tk sb-tk-${kind}`;

export class StoryboardTokenNode extends TextNode {
  __kind: string;
  static getType(): string {
    return "storyboard-token";
  }
  static clone(node: StoryboardTokenNode): StoryboardTokenNode {
    return new StoryboardTokenNode(node.__text, node.__kind, node.__key);
  }
  static importJSON(json: SerializedTokenNode): StoryboardTokenNode {
    return new StoryboardTokenNode(json.text, json.kind);
  }
  constructor(text: string, kind = "text", key?: NodeKey) {
    super(text, key);
    this.__kind = kind;
  }
  exportJSON(): SerializedTokenNode {
    return { ...super.exportJSON(), type: "storyboard-token", version: 1, kind: this.__kind };
  }
  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.className = tokenClass(this.__kind);
    return dom;
  }
  updateDOM(prev: this, dom: HTMLElement, config: EditorConfig): boolean {
    const replace = super.updateDOM(prev, dom, config);
    if (prev.__kind !== this.__kind) {
      dom.className = tokenClass(this.__kind);
    }
    return replace;
  }
}

export const $isStoryboardLine = (node: LexicalNode | null | undefined): node is StoryboardLineNode =>
  node instanceof StoryboardLineNode;

/** The line a selection point is in. */
export const $lineOf = (point: PointType): StoryboardLineNode | null => {
  const node = point.getNode();
  if ($isStoryboardLine(node)) {
    return node;
  }
  const parent = node.getParent();
  return $isStoryboardLine(parent) ? parent : null;
};

/** Character offset of a selection point inside a line, or -1 when the point is elsewhere. */
export function $lineOffset(line: StoryboardLineNode, point: PointType): number {
  const node = point.getNode();
  const kids = line.getChildren();
  if (node.is(line)) {
    return kids.slice(0, point.offset).reduce((sum, kid) => sum + kid.getTextContentSize(), 0);
  }
  if (!node.getParent()?.is(line)) {
    return -1;
  }
  let offset = 0;
  for (const kid of kids) {
    if (kid.is(node)) {
      return offset + (point.type === "text" ? point.offset : 0);
    }
    offset += kid.getTextContentSize();
  }
  return -1;
}

export function $setPoint(point: PointType, line: StoryboardLineNode, offset: number): void {
  let left = offset;
  const kids = line.getChildren();
  for (const kid of kids) {
    const size = kid.getTextContentSize();
    if (left <= size) {
      point.set(kid.getKey(), left, "text");
      return;
    }
    left -= size;
  }
  const last = kids[kids.length - 1];
  if (last) {
    point.set(last.getKey(), last.getTextContentSize(), "text");
  } else {
    point.set(line.getKey(), 0, "element");
  }
}

export function $newLine(text: string): StoryboardLineNode {
  const line = new StoryboardLineNode();
  if (text) {
    line.append($createTextNode(text));
  }
  return line;
}

/** Replace characters [start, end) of a line, keeping the caret where it was. */
export function $spliceLine(line: StoryboardLineNode, start: number, end: number, text: string): void {
  const selection = $getSelection();
  const range = $isRangeSelection(selection);
  const anchor = range ? $lineOffset(line, selection.anchor) : -1;
  const focus = range ? $lineOffset(line, selection.focus) : -1;
  const old = line.getTextContent();
  const next = old.slice(0, start) + text + old.slice(end);
  line.splice(0, line.getChildrenSize(), next ? [$createTextNode(next)] : []);
  const shift = (offset: number): number =>
    offset <= start ? offset : offset >= end ? offset + text.length - (end - start) : start;
  if (anchor >= 0 && focus >= 0) {
    const moved = $createRangeSelection();
    $setPoint(moved.anchor, line, shift(anchor));
    $setPoint(moved.focus, line, shift(focus));
    $setSelection(moved);
  }
}

/** Re-style a line after its text changed, and keep the caret where it was. */
export function $retokenLine(line: LexicalNode | null, entities: StoryboardMarkdownEntities): void {
  if (!$isStoryboardLine(line) || !line.isAttached()) {
    return;
  }
  const kids = line.getChildren();
  const want = tokenizeStoryboardLine(line.getTextContent(), entities).map((token) => ({
    kind: token.kind === "entity" ? `entity sb-tk-${token.entityKind ?? "missing"}` : token.kind,
    text: token.text
  }));
  const same =
    kids.length === want.length &&
    kids.every((kid, i) => kid instanceof StoryboardTokenNode && kid.__kind === want[i].kind && kid.getTextContent() === want[i].text);
  if (same) {
    return;
  }
  const selection = $getSelection();
  const range = $isRangeSelection(selection);
  const anchor = range ? $lineOffset(line, selection.anchor) : -1;
  const focus = range ? $lineOffset(line, selection.focus) : -1;
  line.splice(0, kids.length, want.map((token) => new StoryboardTokenNode(token.text, token.kind)));
  if (range && anchor >= 0) {
    $setPoint(selection.anchor, line, anchor);
  }
  if (range && focus >= 0) {
    $setPoint(selection.focus, line, focus);
  }
}
