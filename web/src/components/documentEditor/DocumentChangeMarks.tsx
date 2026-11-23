/**
 * The marks on blocks an outside write changed (document editor PRD R9).
 *
 * The plugin outlines each changed block on the page and drops a block's
 * mark once the user edits it. The bar above the page lists every change,
 * a removed block included, with its revert, remove or restore action.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey } from "lexical";

import {
  BORDER_RADIUS,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  Text
} from "../ui_primitives";
import type { BlockChange } from "./documentChanges";
import { DOCUMENT_LOAD_TAG, type MarkdownDocumentBinding } from "./markdownBlockCodec";

const MARK_CLASS: Record<"modified" | "inserted", string> = {
  modified: "doc-change-modified",
  inserted: "doc-change-inserted"
};

interface DocumentChangeMarksPluginProps {
  binding: MarkdownDocumentBinding;
  changes: readonly BlockChange[];
  /** The user edited these marked blocks. */
  onEdited: (blockIds: string[]) => void;
}

export function DocumentChangeMarksPlugin({
  binding,
  changes,
  onEdited
}: DocumentChangeMarksPluginProps): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const marked = changes.filter(
      (change): change is Extract<BlockChange, { kind: "modified" | "inserted" }> =>
        change.kind !== "deleted"
    );
    const paint = (): void => {
      for (const change of marked) {
        for (const key of binding.keysOf(change.blockId)) {
          editor.getElementByKey(key)?.classList.add(MARK_CLASS[change.kind]);
        }
      }
    };
    paint();
    const markedIds = new Set(marked.map((change) => change.blockId));
    const unregister = editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves, tags }) => {
        // The reconciler can replace a block's element: paint it again.
        paint();
        if (tags.has(DOCUMENT_LOAD_TAG) || markedIds.size === 0) return;
        const edited = new Set<string>();
        editorState.read(() => {
          for (const key of [...dirtyLeaves, ...dirtyElements.keys()]) {
            if (key === "root") continue;
            const top = $getNodeByKey(key)?.getTopLevelElement();
            const blockId = top ? binding.blockIdOf(top.getKey()) : null;
            if (blockId && markedIds.has(blockId)) edited.add(blockId);
          }
        });
        if (edited.size > 0) onEdited([...edited]);
      }
    );
    return () => {
      unregister();
      for (const change of marked) {
        for (const key of binding.keysOf(change.blockId)) {
          editor.getElementByKey(key)?.classList.remove(MARK_CLASS[change.kind]);
        }
      }
    };
  }, [binding, changes, editor, onEdited]);

  return null;
}

/** The first line of a block, for the list. */
const excerpt = (text: string): string => {
  const line = text.split("\n").find((entry) => entry.trim() !== "") ?? "";
  return line.replace(/^[#>*\-+\d.\s[\]x|`]+/, "").slice(0, 80) || "…";
};

interface DocumentChangesBarProps {
  changes: readonly BlockChange[];
  /** The block's current Markdown, for an inserted or modified block. */
  textOf: (blockId: string) => string | null;
  onRevert: (blockId: string) => void;
  onDismiss: (blockIds?: readonly string[]) => void;
}

export function DocumentChangesBar({ changes, textOf, onRevert, onDismiss }: DocumentChangesBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (changes.length === 0) return null;
  return (
    <FlexColumn
      sx={{
        flexShrink: 0,
        borderBottom: 1,
        borderColor: "divider",
        paddingX: PADDING.normal,
        paddingY: PADDING.compact
      }}
    >
      <FlexRow gap={GAP.normal} align="center">
        <Text size="small" sx={{ flex: 1 }}>
          {t("documentEditor.changes.title", { count: changes.length })}
        </Text>
        <EditorButton
          variant="text"
          density="compact"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? t("documentEditor.changes.hide") : t("documentEditor.changes.show")}
        </EditorButton>
        <EditorButton variant="text" density="compact" onClick={() => onDismiss()}>
          {t("documentEditor.changes.dismissAll")}
        </EditorButton>
      </FlexRow>
      {open && (
        <FlexColumn gap={GAP.tight} sx={{ paddingTop: PADDING.compact }}>
          {changes.map((change) => {
            const text =
              change.kind === "deleted" ? change.previous.text : textOf(change.blockId) ?? "";
            return (
              <FlexRow
                key={change.blockId}
                gap={GAP.normal}
                align="center"
                sx={{ padding: PADDING.compact, borderRadius: BORDER_RADIUS.sm, backgroundColor: "action.hover" }}
              >
                <Caption color="secondary" sx={{ flexShrink: 0 }}>
                  {t(`documentEditor.changes.kinds.${change.kind}`)}
                </Caption>
                <Text
                  size="small"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    textDecoration: change.kind === "deleted" ? "line-through" : "none"
                  }}
                  lineClamp={1}
                >
                  {excerpt(text)}
                </Text>
                <EditorButton variant="text" density="compact" onClick={() => onRevert(change.blockId)}>
                  {t(`documentEditor.changes.actions.${change.kind}`)}
                </EditorButton>
                <EditorButton
                  variant="text"
                  density="compact"
                  onClick={() => onDismiss([change.blockId])}
                  sx={{ color: "text.secondary" }}
                >
                  {t("documentEditor.changes.dismiss")}
                </EditorButton>
              </FlexRow>
            );
          })}
        </FlexColumn>
      )}
    </FlexColumn>
  );
}
