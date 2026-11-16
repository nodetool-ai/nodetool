/**
 * The storyboard as Markdown text.
 *
 * The text is the board. Every change is read with `parseStoryboardMarkdown`
 * against the current board, so what the text does not show (takes, render
 * records, status, models) is kept by id, and the result is written to the
 * store, from where autosave persists it. A change to the board from anywhere
 * else (a render finishing, an undo in the document bar, the agent) that the
 * text does not reflect writes the text again.
 *
 * Grammar and round trip: `packages/protocol/src/storyboard-markdown.ts`.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  $addUpdateTag,
  $getRoot,
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
  ParagraphNode,
  TextNode,
  mergeRegister,
  type LexicalEditor,
  type RangeSelection
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useTheme, type Theme } from "@mui/material/styles";
import {
  STORYBOARD_MARKDOWN_ID,
  parseStoryboardMarkdown,
  storyboardToMarkdown,
  type Entity,
  type Screenplay,
  type Shot,
  type StoryboardMarkdownEntities,
  type StoryboardMarkdownResult
} from "@nodetool-ai/protocol";

import type { storyboards } from "@nodetool-ai/protocol/api-schemas";

import { useStoryboardStore, type StoryboardBoard, type StoryboardTextEdit } from "../../../stores/storyboard/StoryboardStore";
import { boardToDocument } from "../../../hooks/storyboard/useStoryboardServerSync";
import { useEntities } from "../../../serverState/useEntities";
import AssetMentionPlugin, { type MentionChoice } from "../../node_types/editing/promptComposer/AssetMentionPlugin";
import { assetToUri } from "../../node_types/editing/promptComposer/promptTokens";
import { Box, Caption, FlexColumn, FlexRow, ScrollArea, EYEBROW, FONT_SIZE_MONO, FONT_WEIGHT, SPACING, TYPOGRAPHY } from "../../ui_primitives";
import {
  $isStoryboardLine,
  $lineOf,
  $lineOffset,
  $newLine,
  $retokenLine,
  $setPoint,
  $spliceLine,
  StoryboardLineNode,
  StoryboardTokenNode
} from "./storyboardTextNodes";

type StoryboardDocumentSchema = storyboards.StoryboardDocumentSchema;

interface StoryboardTextViewProps {
  boardId: string;
  readOnly?: boolean;
}

/** The parts of the document the text writes, in a stable key order, for comparison. */
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

const RELOAD_TAG = "storyboard-text-reload";
const ID_AFTER_CARET = new RegExp(`^\\s*\\{#${STORYBOARD_MARKDOWN_ID}\\}\\s*$`);
const SHOT_REF = new RegExp(`\\[([^\\]\\n]*)\\]\\(#(${STORYBOARD_MARKDOWN_ID})\\)`, "g");

const $lines = (): StoryboardLineNode[] => $getRoot().getChildren().filter($isStoryboardLine);
const $loadText = (markdown: string): void => {
  const root = $getRoot();
  root.clear();
  root.append(...markdown.replace(/\n$/, "").split("\n").map($newLine));
};

/** The selection as Markdown, one line break per line. */
function $selectedMarkdown(selection: RangeSelection): string {
  const [start, end] = selection.isBackward() ? [selection.focus, selection.anchor] : [selection.anchor, selection.focus];
  const a = $lineOf(start);
  const b = $lineOf(end);
  if (!a || !b) {
    return selection.getTextContent();
  }
  const from = $lineOffset(a, start);
  const to = $lineOffset(b, end);
  if (a.is(b)) {
    return a.getTextContent().slice(from, to);
  }
  const out = [a.getTextContent().slice(from)];
  for (let node = a.getNextSibling(); node && !node.is(b); node = node.getNextSibling()) {
    out.push(node.getTextContent());
  }
  out.push(b.getTextContent().slice(0, to));
  return out.join("\n");
}

function $insertLines(text: string): void {
  text.split(/\r?\n/).forEach((part, i) => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }
    if (i > 0) {
      selection.insertParagraph();
    }
    const now = $getSelection();
    if (part && $isRangeSelection(now)) {
      now.insertText(part);
    }
  });
}

const warningText = (t: TFunction, result: StoryboardMarkdownResult, line: number): string => {
  const warning = result.lines[line]?.warning;
  return warning ? t(`storyboardText.warnings.${warning.code}`, { ...warning.params, defaultValue: warning.message }) : "";
};

interface StoryboardTextPluginProps {
  boardId: string;
  entities: StoryboardMarkdownEntities;
  readOnly: boolean;
  onResult: (result: StoryboardMarkdownResult) => void;
}

/** Reads the text into the board on every change, and the board into the text when it changed elsewhere. */
const StoryboardTextPlugin: React.FC<StoryboardTextPluginProps> = ({ boardId, entities, readOnly, onResult }) => {
  const { t } = useTranslation();
  const [editor] = useLexicalComposerContext();
  const applyTextEdit = useStoryboardStore((state) => state.applyTextEdit);
  const board = useStoryboardStore((state) => state.boards[boardId]);
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  const written = useRef<StoryboardBoard | null>(null);

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
        if (readOnly || tags.has(RELOAD_TAG)) {
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
      return;
    }
    editor.update(
      () => {
        $loadText(storyboardToMarkdown(doc, { entities: entitiesRef.current }));
        $addUpdateTag(RELOAD_TAG);
        $addUpdateTag(HISTORY_MERGE_TAG);
      },
      { tag: RELOAD_TAG }
    );
  }, [board, editor]);

  // A library that loaded after the text needs its chips drawn.
  useEffect(() => {
    editor.update(() => {
      for (const line of $lines()) {
        $retokenLine(line, entities);
      }
      $addUpdateTag(HISTORY_MERGE_TAG);
    });
  }, [editor, entities]);

  return null;
};

const toMarkdownEntity = (entity: Entity) => ({ id: entity.id, name: entity.name, kind: entity.kind, descriptor: entity.descriptor });

const mentionText = (choice: MentionChoice): string => {
  if ("entity" in choice) {
    return `[${choice.entity.name || choice.entity.id}](entity://${choice.entity.id})`;
  }
  const video = (choice.asset.content_type ?? "").startsWith("video/");
  return `![${video ? "Clip" : "Still"}](${assetToUri(choice.asset)})`;
};

const textStyles = (theme: Theme) => ({
  "& .sb-text": {
    outline: "none",
    caretColor: theme.vars.palette.primary.main,
    paddingBottom: theme.spacing(SPACING.xxxl),
    ...TYPOGRAPHY.sans.body,
    color: theme.vars.palette.text.primary
  },
  "& .sb-line": {
    position: "relative",
    paddingLeft: theme.spacing(SPACING.xxxl * 2),
    minHeight: "1.5em",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    borderLeft: "2px solid transparent"
  },
  "& .sb-line[data-role='blank']": { minHeight: "0.75em" },
  "& .sb-line[style*='--sb-mk']": { textIndent: "calc(var(--sb-mk) * -1ch - 0.28em)" },
  "& .sb-line[data-role='title']": { ...TYPOGRAPHY.sans.title, paddingBottom: theme.spacing(SPACING.sm) },
  "& .sb-line[data-role='act']": {
    ...TYPOGRAPHY.sans.title,
    marginTop: theme.spacing(SPACING.xl),
    paddingTop: theme.spacing(SPACING.lg),
    borderTop: `1px solid ${theme.vars.palette.divider}`
  },
  "& .sb-line[data-role='scene']": {
    ...EYEBROW,
    fontFamily: "var(--fontFamily2)",
    color: theme.vars.palette.text.secondary,
    marginTop: theme.spacing(SPACING.lg),
    paddingTop: theme.spacing(SPACING.md),
    paddingBottom: theme.spacing(SPACING.xs)
  },
  "& .sb-line[data-role='shot']": {
    fontWeight: FONT_WEIGHT.semibold,
    paddingTop: theme.spacing(SPACING.md),
    paddingBottom: theme.spacing(SPACING.micro)
  },
  "& .sb-line[data-role='shot']::before": {
    content: "attr(data-n)",
    position: "absolute",
    left: theme.spacing(SPACING.sm),
    textIndent: 0,
    fontFamily: "var(--fontFamily2)",
    fontSize: FONT_SIZE_MONO.label,
    color: theme.vars.palette.text.secondary,
    userSelect: "none"
  },
  "& .sb-line[data-role='field']": {
    paddingLeft: theme.spacing(SPACING.xxxl * 2 + SPACING.lg),
    textIndent: theme.spacing(-SPACING.lg)
  },
  "& .sb-line[data-role='cont']": { paddingLeft: theme.spacing(SPACING.xxxl * 2 + SPACING.lg) },
  "& .sb-line[data-key='brief'], & .sb-line[data-key='objective']": { color: theme.vars.palette.text.secondary },
  "& .sb-line[data-role='still'], & .sb-line[data-role='clip'], & .sb-line[data-role='stray']": {
    fontFamily: "var(--fontFamily2)",
    fontSize: FONT_SIZE_MONO.caption,
    color: theme.vars.palette.text.secondary
  },
  "& .sb-line[data-warn]": { borderLeftColor: theme.vars.palette.error.main },
  "& .sb-tk-syntax": { color: "transparent" },
  "& .sb-tk-hidden, & .sb-tk-id": { fontSize: 0 },
  "& .sb-line.sb-active .sb-tk-syntax, & .sb-line.sb-active .sb-tk-hidden": { color: theme.vars.palette.text.disabled, fontSize: "inherit" },
  "& .sb-line.sb-active .sb-tk-id": { fontSize: FONT_SIZE_MONO.caption, fontFamily: "var(--fontFamily2)", color: theme.vars.palette.text.disabled },
  "& .sb-tk-label": { ...EYEBROW, fontFamily: "var(--fontFamily2)", color: theme.vars.palette.text.secondary },
  "& .sb-line[data-key='unknown'] .sb-tk-label": { color: theme.vars.palette.error.main },
  "& .sb-tk-bold": { fontWeight: FONT_WEIGHT.semibold },
  "& .sb-tk-italic": { fontStyle: "italic" },
  "& .sb-tk-entity, & .sb-tk-shotref": {
    whiteSpace: "nowrap",
    textIndent: 0,
    fontWeight: FONT_WEIGHT.medium,
    color: theme.vars.palette.primary.main,
    borderBottom: `1px solid ${theme.vars.palette.divider}`
  },
  "& .sb-tk-missing": { color: theme.vars.palette.error.main }
});

/** Marks the line(s) holding the caret, which show their syntax. */
const ActiveLinePlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    let active: HTMLElement[] = [];
    return editor.registerUpdateListener(({ editorState }) => {
      const next: HTMLElement[] = [];
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }
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
    });
  }, [editor]);
  return null;
};

const StoryboardTextView: React.FC<StoryboardTextViewProps> = ({ boardId, readOnly = false }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: library } = useEntities();
  const entities = useMemo<StoryboardMarkdownEntities>(() => new Map((library ?? []).map((e) => [e.id, toMarkdownEntity(e)])), [library]);
  const [issues, setIssues] = useState(0);
  const onResult = useCallback((result: StoryboardMarkdownResult) => setIssues(result.warnings.length), []);
  const initialConfig = useMemo(
    () => ({
      namespace: "storyboard-text",
      editable: !readOnly,
      nodes: [
        StoryboardLineNode,
        StoryboardTokenNode,
        { replace: ParagraphNode, with: () => new StoryboardLineNode(), withKlass: StoryboardLineNode }
      ],
      onError: (error: Error) => {
        throw error;
      }
    }),
    [readOnly]
  );

  return (
    <FlexColumn gap={SPACING.sm} sx={{ minHeight: 0, flex: 1 }}>
      <FlexRow gap={SPACING.md} align="center" wrap>
        <Caption color="secondary">{t("storyboardText.hint")}</Caption>
        {issues > 0 && <Caption color="error">{t("storyboardText.issues", { lines: issues })}</Caption>}
      </FlexRow>
      <ScrollArea thin sx={{ flex: 1, minHeight: 0 }}>
        <Box sx={{ ...textStyles(theme), maxWidth: "80ch", marginInline: "auto" }}>
          <LexicalComposer initialConfig={initialConfig}>
            <RichTextPlugin
              contentEditable={<ContentEditable className="sb-text" spellCheck={false} aria-label={t("storyboardText.editorLabel")} />}
              placeholder={null}
              ErrorBoundary={() => null}
            />
            <HistoryPlugin />
            <ActiveLinePlugin />
            <StoryboardTextPlugin boardId={boardId} entities={entities} readOnly={readOnly} onResult={onResult} />
            {!readOnly && <AssetMentionPlugin insertAsText={mentionText} />}
          </LexicalComposer>
        </Box>
      </ScrollArea>
    </FlexColumn>
  );
};

export default StoryboardTextView;
