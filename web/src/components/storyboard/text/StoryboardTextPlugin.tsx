/**
 * The Lexical plugins that make the editor a storyboard: the sync between the
 * text and the board, and the active-line marker that shows syntax.
 *
 * Every change is read with `parseStoryboardMarkdown` against the current
 * board, so what the text does not show (takes, render records, status,
 * models) is kept by id, and the result is written to the store, from where
 * autosave persists it. A change to the board from anywhere else that the text
 * does not reflect writes the text again.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  COPY_COMMAND,
  CUT_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  HISTORY_MERGE_TAG,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  PASTE_COMMAND,
  TextNode,
  mergeRegister,
  type LexicalEditor
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  parseStoryboardMarkdown,
  storyboardToMarkdown,
  type Screenplay,
  type Shot,
  type StoryboardMarkdownEntities,
  type StoryboardMarkdownResult
} from "@nodetool-ai/protocol";
import type { storyboards } from "@nodetool-ai/protocol/api-schemas";

import { useStoryboardStore, type StoryboardBoard, type StoryboardTextEdit } from "../../../stores/storyboard/StoryboardStore";
import { boardToDocument } from "../../../hooks/storyboard/useStoryboardServerSync";
import {
  $isStoryboardLine,
  $lineOf,
  $lineOffset,
  $retokenLine,
  $setPoint,
  $spliceLine,
  StoryboardLineNode,
  StoryboardTokenNode
} from "./storyboardTextNodes";
import { $insertLines, $lines, $loadText, $selectedMarkdown, ID_AFTER_CARET, RELOAD_TAG, SHOT_REF } from "./storyboardTextLines";

type StoryboardDocumentSchema = storyboards.StoryboardDocumentSchema;

const textOwnedKey = (doc: Pick<StoryboardDocumentSchema, "screenplay" | "shots" | "brief" | "style" | "entityIds" | "aspectRatio" | "genre" | "look_preset_ids">): string =>
  stableStringify({
    screenplay: doc.screenplay,
    shots: doc.shots,
    brief: doc.brief,
    style: doc.style,
    entityIds: doc.entityIds,
    aspectRatio: doc.aspectRatio,
    genre: doc.genre,
    look_preset_ids: doc.look_preset_ids ?? []
  });
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The board as the stored document, which the text is read against. */
const documentOf = (board: StoryboardBoard): StoryboardDocumentSchema =>
  // SAFETY: the wire document type comes from the same zod schema; tRPC's
  // inferred alias and the protocol export differ only in name.
  boardToDocument(board) as unknown as StoryboardDocumentSchema;

const editOf = (doc: StoryboardDocumentSchema): StoryboardTextEdit => ({
  // SAFETY: the storyboard schema mirrors the `Screenplay` and `Shot`
  // interfaces in creative.ts; the server sync hook reads them the same way.
  screenplay: doc.screenplay as Screenplay | null,
  shots: doc.shots as Shot[],
  brief: doc.brief,
  style: doc.style,
  entityIds: doc.entityIds,
  aspectRatio: doc.aspectRatio,
  genre: doc.genre,
  look_preset_ids: doc.look_preset_ids ?? []
});


const warningText = (t: TFunction, result: StoryboardMarkdownResult, line: number): string => {
  const warning = result.lines[line]?.warning;
  return warning ? t(`storyboardText.warnings.${warning.code}`, { ...warning.params, defaultValue: warning.message }) : "";
};

export interface StoryboardTextPluginProps {
  boardId: string;
  entities: StoryboardMarkdownEntities;
  readOnly: boolean;
  onResult: (result: StoryboardMarkdownResult) => void;
}

/** Reads the text into the board on every change, and the board into the text when it changed elsewhere. */
export const StoryboardTextPlugin: React.FC<StoryboardTextPluginProps> = ({ boardId, entities, readOnly, onResult }) => {
  const { t } = useTranslation();
  const [editor] = useLexicalComposerContext();
  const applyTextEdit = useStoryboardStore((state) => state.applyTextEdit);
  const board = useStoryboardStore((state) => state.boards[boardId]);
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const written = useRef<StoryboardBoard | null>(null);
  // Nothing is written to the board before the text was loaded from it. The
  // editor starts with one empty line, and an update that commits before the
  // load (Lexical's own setup, or a restyle) would otherwise read as "the
  // director deleted everything" and empty the board.
  const loaded = useRef(false);

  const decorate = useCallback(
    (editorInstance: LexicalEditor, result: StoryboardMarkdownResult, keys: string[]): void => {
      for (const info of result.lines) {
        const dom = editorInstance.getElementByKey(keys[info.line]);
        if (!dom) {
          continue;
        }
        const set = (name: string, value: string | undefined): void => {
          if (value) {
            dom.dataset[name] = value;
          } else {
            delete dom.dataset[name];
          }
        };
        set("role", info.role);
        set("key", info.key);
        set("n", info.shotNumber ? String(info.shotNumber) : undefined);
        const warning = warningText(t, result, info.line);
        set("warn", warning ? "1" : undefined);
        if (warning) {
          dom.title = warning;
        } else {
          dom.removeAttribute("title");
        }
        if (info.syntaxWidth) {
          dom.style.setProperty("--sb-mk", String(info.syntaxWidth));
        } else {
          dom.style.removeProperty("--sb-mk");
        }
      }
    },
    [t]
  );

  /** Ids for new headings, and shot references that name an old number. Merged into the change that caused them. */
  const fixups = useCallback((editorInstance: LexicalEditor, result: StoryboardMarkdownResult): void => {
    const numbers = new Map(result.shotOrder.map((id, i) => [id, i + 1]));
    const refs: Array<{ line: number; start: number; end: number; text: string }> = [];
    editorInstance.getEditorState().read(() => {
      $lines().forEach((line, i) => {
        for (const m of line.getTextContent().matchAll(SHOT_REF)) {
          const n = numbers.get(m[2]);
          if (n && m[1] !== `Shot ${n}`) {
            refs.push({ line: i, start: m.index + 1, end: m.index + 1 + m[1].length, text: `Shot ${n}` });
          }
        }
      });
    });
    if (!result.missingIds.length && !refs.length) {
      return;
    }
    editorInstance.update(() => {
      const lines = $lines();
      // Right to left within a line, so earlier offsets stay valid.
      const work = [
        ...refs,
        ...result.missingIds.map((need) => {
          const length = lines[need.line]?.getTextContentSize() ?? 0;
          return need.replace
            ? { line: need.line, start: need.replace.start, end: need.replace.start + need.replace.text.length, text: ` {#${need.id}}` }
            : { line: need.line, start: length, end: length, text: ` {#${need.id}}` };
        })
      ].sort((a, b) => a.line - b.line || b.start - a.start);
      for (const w of work) {
        const line = lines[w.line];
        if (line) {
          $spliceLine(line, w.start, w.end, w.text);
        }
      }
      $addUpdateTag(HISTORY_MERGE_TAG);
    });
  }, []);

  useLayoutEffect(() => {
    const retoken = (node: TextNode | StoryboardLineNode): void => {
      $retokenLine($isStoryboardLine(node) ? node : node.getParent(), entitiesRef.current);
    };
    const wrap = (mark: string): boolean => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        return true;
      }
      const text = $selectedMarkdown(selection);
      if (!text.includes("\n")) {
        selection.insertText(mark + text + mark);
      }
      return true;
    };
    const clipboard = (event: ClipboardEvent | KeyboardEvent | null, cut: boolean): boolean => {
      const selection = $getSelection();
      const data = event && "clipboardData" in event ? event.clipboardData : null;
      if (!$isRangeSelection(selection) || !data) {
        return false;
      }
      data.setData("text/plain", $selectedMarkdown(selection));
      event?.preventDefault();
      if (cut) {
        selection.removeText();
      }
      return true;
    };
    const block = (event: DragEvent): boolean => {
      event.preventDefault();
      return true;
    };
    return mergeRegister(
      editor.registerNodeTransform(StoryboardLineNode, retoken),
      editor.registerNodeTransform(StoryboardTokenNode, retoken),
      editor.registerNodeTransform(TextNode, retoken),
      // Enter just before a line's {#id} must not carry the id to the next line: the object keeps it.
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }
          const line = $lineOf(selection.anchor);
          if (!line) {
            return false;
          }
          const text = line.getTextContent();
          const at = $lineOffset(line, selection.anchor);
          if (at > 0 && ID_AFTER_CARET.test(text.slice(at))) {
            $setPoint(selection.anchor, line, text.length);
            $setPoint(selection.focus, line, text.length);
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerCommand(INSERT_LINE_BREAK_COMMAND, () => editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(FORMAT_TEXT_COMMAND, (format) => wrap(format === "bold" ? "**" : format === "italic" ? "*" : ""), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(FORMAT_ELEMENT_COMMAND, () => true, COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(DRAGSTART_COMMAND, block, COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(DROP_COMMAND, block, COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(COPY_COMMAND, (event) => clipboard(event, false), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(CUT_COMMAND, (event) => clipboard(event, true), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const data = event && "clipboardData" in event ? event.clipboardData : null;
          if (!data) {
            return true;
          }
          event.preventDefault();
          $insertLines(data.getData("text/plain"));
          return true;
        },
        COMMAND_PRIORITY_CRITICAL
      ),
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
        if (!dirtyElements.size && !dirtyLeaves.size) {
          return;
        }
        const current = useStoryboardStore.getState().boards[boardId];
        if (!current) {
          return;
        }
        let keys: string[] = [];
        let result: StoryboardMarkdownResult | null = null;
        editorState.read(() => {
          const lines = $lines();
          keys = lines.map((line) => line.getKey());
          result = parseStoryboardMarkdown(lines.map((line) => line.getTextContent()), { base: documentOf(current), entities: entitiesRef.current });
        });
        if (!result) {
          return;
        }
        const parsed: StoryboardMarkdownResult = result;
        decorate(editor, parsed, keys);
        onResult(parsed);
        if (readOnly || tags.has(RELOAD_TAG) || !loaded.current) {
          return;
        }
        fixups(editor, parsed);
        if (textOwnedKey(parsed.document) !== textOwnedKey(documentOf(current))) {
          applyTextEdit(boardId, editOf(parsed.document));
          written.current = useStoryboardStore.getState().boards[boardId] ?? null;
        }
      })
    );
  }, [editor, boardId, readOnly, applyTextEdit, decorate, fixups, onResult]);

  // The board changed and the text does not say so: write the text again.
  useEffect(() => {
    if (!board || board === written.current) {
      return;
    }
    written.current = board;
    const doc = documentOf(board);
    const text = editor.getEditorState().read(() => $lines().map((line) => line.getTextContent()));
    const reflected = text.length > 1 || text[0] ? parseStoryboardMarkdown(text, { base: doc, entities: entitiesRef.current }).document : null;
    if (reflected && textOwnedKey(reflected) === textOwnedKey(doc)) {
      loaded.current = true;
      return;
    }
    editor.update(
      () => {
        $loadText(storyboardToMarkdown(doc, { entities: entitiesRef.current }));
        loaded.current = true;
        $addUpdateTag(RELOAD_TAG);
        $addUpdateTag(HISTORY_MERGE_TAG);
      },
      { tag: RELOAD_TAG }
    );
  }, [board, editor]);

  // A library that loaded after the text needs its chips drawn. Restyling
  // changes no text, so the update is not read back into the board.
  useEffect(() => {
    editor.update(
      () => {
        for (const line of $lines()) {
          $retokenLine(line, entities);
        }
        $addUpdateTag(RELOAD_TAG);
        $addUpdateTag(HISTORY_MERGE_TAG);
      },
      { tag: RELOAD_TAG }
    );
  }, [editor, entities]);

  return null;
};

/** Marks the line(s) holding the caret, which show their syntax. */
export const ActiveLinePlugin: React.FC<{ onCaretLine?: (line: number | null) => void }> = ({ onCaretLine }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    let active: HTMLElement[] = [];
    let caret: number | null = null;
    return editor.registerUpdateListener(({ editorState }) => {
      const next: HTMLElement[] = [];
      let line: number | null = null;
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }
        const focused = $lineOf(selection.focus);
        line = focused ? $lines().findIndex((node) => node.is(focused)) : null;
        for (const point of [selection.anchor, selection.focus]) {
          const line = $lineOf(point);
          const dom = line ? editor.getElementByKey(line.getKey()) : null;
          if (dom && !next.includes(dom)) {
            next.push(dom);
          }
        }
      });
      active.filter((dom) => !next.includes(dom)).forEach((dom) => dom.classList.remove("sb-active"));
      next.forEach((dom) => dom.classList.add("sb-active"));
      active = next;
      if (line !== caret) {
        caret = line;
        onCaretLine?.(line);
      }
    });
  }, [editor, onCaretLine]);
  return null;
};

