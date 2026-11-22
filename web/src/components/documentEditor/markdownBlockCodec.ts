/**
 * The block codec between a Markdown file and the Lexical editor (document
 * editor PRD R4 and R20).
 *
 * Each block of the file is imported on its own, so every top-level Lexical
 * node belongs to exactly one block. Saving walks the top-level nodes:
 *
 * - A block no update has touched since the load is written from the bytes
 *   it was read from, with no export. An update listener records the
 *   top-level node of every node an update dirtied.
 * - A touched block is exported. When the export equals the export of the
 *   nodes as loaded (an edit that was undone, a neighbour that Lexical only
 *   relinked), the source bytes are still written.
 * - Otherwise the block is written from the export, keeping its id and the
 *   blank lines after it.
 *
 * Exports are cached per top-level node until an update touches it again, so
 * an autosave re-exports only the blocks that changed since the last one. Opening and saving an unedited
 * document writes identical bytes; an edit rewrites only the blocks it
 * touched.
 */
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $parseSerializedNode,
  $setSelection,
  createEditor,
  type EditorState,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
  type SerializedLexicalNode
} from "lexical";
import {
  splitMarkdownBlocks,
  type MarkdownBlock,
  type MarkdownBlockDocument,
  type MarkdownBlockKind,
  type MarkdownBlockSource
} from "@nodetool-ai/protocol";

import { HorizontalRuleNode } from "../textEditor/HorizontalRuleNode";
import { DOCUMENT_TRANSFORMERS } from "./documentTransformers";
import { DocumentImageNode } from "./nodes/DocumentImageNode";
import { RawMarkdownNode } from "./nodes/RawMarkdownNode";

/** Every node class a document can hold. */
export const DOCUMENT_NODES: ReadonlyArray<Klass<LexicalNode>> = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  CodeNode,
  CodeHighlightNode,
  LinkNode,
  AutoLinkNode,
  HorizontalRuleNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  DocumentImageNode,
  RawMarkdownNode
];

/** The update tag of a load, which is not an edit. */
export const DOCUMENT_LOAD_TAG = "document-load";

/** Blocks the formatted editor keeps as source, see {@link RawMarkdownNode}. */
const RAW_KINDS: ReadonlySet<MarkdownBlockKind> = new Set([
  "front_matter",
  "html",
  "definition",
  "indented_code"
]);

const rawJSON = (markdown: string): SerializedLexicalNode =>
  ({ type: "raw-markdown", version: 1, markdown }) as SerializedLexicalNode;

/** A node and its descendants as JSON, the shape `$parseSerializedNode` reads. */
export function $exportNodeTree(node: LexicalNode): SerializedLexicalNode {
  const json = node.exportJSON();
  if ($isElementNode(node)) {
    (json as SerializedElementNode).children = node
      .getChildren()
      .map($exportNodeTree);
  }
  return json;
}

/**
 * A Lexical editor with no DOM that converts between Markdown and node JSON.
 * The live editor never imports or exports Markdown itself, so its own state
 * and history are untouched by a conversion.
 */
export class HeadlessMarkdown {
  private readonly editor: LexicalEditor = createEditor({
    namespace: "document-codec",
    nodes: [...DOCUMENT_NODES],
    onError: (error) => {
      throw error;
    }
  });

  /** The top-level nodes one block imports to, never none. */
  importBlock(block: MarkdownBlockSource): SerializedLexicalNode[] {
    if (RAW_KINDS.has(block.kind)) {
      return [rawJSON(block.text)];
    }
    let nodes: SerializedLexicalNode[] = [];
    this.editor.update(
      () => {
        $convertFromMarkdownString(block.text, DOCUMENT_TRANSFORMERS);
        nodes = $getRoot().getChildren().map($exportNodeTree);
      },
      { discrete: true }
    );
    return nodes.length > 0 ? nodes : [rawJSON(block.text)];
  }

  /** The Markdown of one top-level node. */
  exportNode(json: SerializedLexicalNode): string {
    let markdown = "";
    this.editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append($parseSerializedNode(json));
        markdown = $convertToMarkdownString(DOCUMENT_TRANSFORMERS);
      },
      { discrete: true }
    );
    return markdown;
  }
}

/** How each block was loaded. `nodes` is null for a block made after load. */
interface BlockOrigin {
  block: MarkdownBlock;
  keys: NodeKey[];
  nodes: LexicalNode[] | null;
  /**
   * Following blocks whose nodes Lexical merged into this block's on load,
   * such as two adjacent lists of the same type. They save with this block.
   */
  absorbed: MarkdownBlock[];
}

interface Group {
  id: string | null;
  keys: NodeKey[];
  nodes: LexicalNode[];
}

const sameList = <T,>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const hasBlankLine = (gap: string): boolean => /\n[ \t]*\r?\n/.test(gap);

const kindOf = (text: string): MarkdownBlockKind =>
  splitMarkdownBlocks(text).blocks[0]?.kind ?? "paragraph";

/** Binds one Markdown document to one live Lexical editor. */
export class MarkdownDocumentBinding {
  private readonly codec = new HeadlessMarkdown();
  private leading = "";
  private finalGap = "\n";
  private eol = "\n";
  private origins = new Map<string, BlockOrigin>();
  private blockOfKey = new Map<NodeKey, string>();
  private originalNext = new Map<string, string | null>();
  private exportCache = new Map<NodeKey, string>();
  private touched = new Set<NodeKey>();
  private canonical = new Map<string, string>();
  private initialState: EditorState | null = null;

  private isUntouched(origin: BlockOrigin, group: Group): boolean {
    return (
      origin.nodes !== null &&
      sameList(origin.keys, group.keys) &&
      group.keys.every((key) => !this.touched.has(key))
    );
  }

  constructor(private readonly newId: () => string) {}

  /**
   * Replace the editor's content with `document`. The load is one discrete
   * update tagged {@link DOCUMENT_LOAD_TAG}; the caller clears the history.
   */
  load(editor: LexicalEditor, document: MarkdownBlockDocument): void {
    const imported = document.blocks.map((block) => this.codec.importBlock(block));
    const keysPerBlock: NodeKey[][] = [];
    editor.update(
      () => {
        $setSelection(null);
        const root = $getRoot();
        root.clear();
        imported.forEach((jsons) => {
          const keys: NodeKey[] = [];
          for (const json of jsons) {
            const node = $parseSerializedNode(json);
            root.append(node);
            keys.push(node.getKey());
          }
          keysPerBlock.push(keys);
        });
        if (document.blocks.length === 0) {
          root.append($createParagraphNode());
        }
      },
      { discrete: true, tag: DOCUMENT_LOAD_TAG }
    );

    this.leading = document.leading;
    const last = document.blocks[document.blocks.length - 1];
    this.finalGap = last ? last.gap : "\n";
    const sample = document.leading + document.blocks.map((block) => block.gap).join("");
    this.eol = sample.includes("\r\n") ? "\r\n" : "\n";
    this.origins = new Map();
    this.blockOfKey = new Map();
    this.originalNext = new Map();
    this.exportCache = new Map();
    this.touched = new Set();
    this.canonical = new Map();
    this.initialState = editor.getEditorState();
    this.initialState.read(() => {
      let owner: BlockOrigin | null = null;
      document.blocks.forEach((block, index) => {
        const present = keysPerBlock[index].filter((key) => $getNodeByKey(key) !== null);
        if (owner && present.length < keysPerBlock[index].length) {
          // A node transform merged this block into the one before it.
          owner.absorbed.push(block);
          owner.keys.push(...present);
          for (const key of present) this.blockOfKey.set(key, owner.block.id);
          this.originalNext.set(block.id, document.blocks[index + 1]?.id ?? null);
          return;
        }
        owner = { block, keys: present, nodes: null, absorbed: [] };
        this.origins.set(block.id, owner);
        for (const key of present) this.blockOfKey.set(key, block.id);
        this.originalNext.set(block.id, document.blocks[index + 1]?.id ?? null);
      });
      for (const origin of this.origins.values()) {
        const nodes = origin.keys.map((key) => $getNodeByKey(key));
        origin.nodes = nodes.every((node) => node !== null)
          ? (nodes as LexicalNode[])
          : null;
      }
    });
  }

  /**
   * Record which top-level nodes each update touches. `onEdit` runs after
   * every update that changed content and was not a load. Returns the
   * unsubscribe function.
   */
  attach(editor: LexicalEditor, onEdit?: () => void): () => void {
    return editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves, tags }) => {
        if (tags.has(DOCUMENT_LOAD_TAG)) return;
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        editorState.read(() => {
          for (const key of [...dirtyLeaves, ...dirtyElements.keys()]) {
            if (key === "root") continue;
            const top = $getNodeByKey(key)?.getTopLevelElement();
            if (!top) continue;
            this.touched.add(top.getKey());
            this.exportCache.delete(top.getKey());
          }
        });
        onEdit?.();
      }
    );
  }

  /** The document the editor holds now, as blocks with stable ids. */
  serialize(state: EditorState): MarkdownBlockDocument {
    const groups: Group[] = [];
    const pending = new Map<NodeKey, SerializedLexicalNode>();
    const needCanonical: string[] = [];

    state.read(() => {
      const seen = new Set<string>();
      let current = null as Group | null;
      for (const node of $getRoot().getChildren()) {
        const key = node.getKey();
        let id = this.blockOfKey.get(key) ?? null;
        if (id !== null && current?.id === id) {
          current.keys.push(key);
          current.nodes.push(node);
          continue;
        }
        if (id !== null && seen.has(id)) id = null;
        if (id !== null) seen.add(id);
        current = { id, keys: [key], nodes: [node] };
        groups.push(current);
      }
      for (const group of groups) {
        const origin = group.id === null ? undefined : this.origins.get(group.id);
        if (origin && this.isUntouched(origin, group)) {
          continue;
        }
        if (origin?.nodes && sameList(origin.keys, group.keys) && !this.canonical.has(origin.block.id)) {
          needCanonical.push(origin.block.id);
        }
        for (const node of group.nodes) {
          if (!this.exportCache.has(node.getKey()) && !pending.has(node.getKey())) {
            pending.set(node.getKey(), $exportNodeTree(node));
          }
        }
      }
    });

    // The nodes as loaded only read correctly inside the state they belong to.
    const canonicalJSON = new Map<string, SerializedLexicalNode[]>();
    if (needCanonical.length > 0 && this.initialState) {
      this.initialState.read(() => {
        for (const id of needCanonical) {
          const nodes = this.origins.get(id)?.nodes;
          if (nodes) canonicalJSON.set(id, nodes.map($exportNodeTree));
        }
      });
    }
    for (const [key, json] of pending) {
      this.exportCache.set(key, this.codec.exportNode(json));
    }
    for (const [id, jsons] of canonicalJSON) {
      this.canonical.set(id, this.joinExports(jsons.map((json) => this.codec.exportNode(json))));
    }

    const blocks: MarkdownBlock[] = [];
    // The id whose original successor decides a block's gap: a merged block
    // ends where the last block it absorbed ended.
    const endsAs = new Map<string, string>();
    for (const group of groups) {
      const origin = group.id === null ? undefined : this.origins.get(group.id);
      const exported = (): string =>
        this.joinExports(group.keys.map((key) => this.exportCache.get(key) ?? ""));
      if (
        origin &&
        (this.isUntouched(origin, group) ||
          (origin.nodes !== null &&
            sameList(origin.keys, group.keys) &&
            exported() === this.canonical.get(origin.block.id)))
      ) {
        blocks.push(origin.block, ...origin.absorbed);
        continue;
      }
      const text = exported();
      if (text === "") {
        continue;
      }
      if (origin) {
        const last = origin.absorbed[origin.absorbed.length - 1] ?? origin.block;
        blocks.push({ ...origin.block, text, gap: last.gap, kind: kindOf(text) });
        endsAs.set(origin.block.id, last.id);
        continue;
      }
      // A block made after the load keeps the id it gets here.
      const id = this.newId();
      const block: MarkdownBlock = { id, text, gap: this.eol + this.eol, kind: kindOf(text) };
      this.origins.set(id, { block, keys: group.keys, nodes: null, absorbed: [] });
      for (const key of group.keys) this.blockOfKey.set(key, id);
      blocks.push(block);
    }

    // Keep the gaps of untouched neighbours; separate new neighbours by a
    // blank line and end the file the way it ended.
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      const next = blocks[index + 1];
      const originalNext = this.originalNext.get(endsAs.get(block.id) ?? block.id);
      if (next) {
        if (!hasBlankLine(block.gap) && originalNext !== next.id) {
          blocks[index] = { ...block, gap: this.eol + this.eol };
        }
      } else if (originalNext !== null) {
        blocks[index] = { ...block, gap: this.finalGap || this.eol };
      }
    }
    return { leading: this.leading, blocks };
  }

  private joinExports(parts: readonly string[]): string {
    return parts.filter((part) => part !== "").join(this.eol + this.eol);
  }
}
