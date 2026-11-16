/**
 * The storyboard as Markdown text: the editor, and the panel beside it.
 * Grammar and round trip: `packages/protocol/src/storyboard-markdown.ts`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ParagraphNode } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import type { Entity, StoryboardMarkdownEntities, StoryboardMarkdownResult } from "@nodetool-ai/protocol";

import { useEntities } from "../../../serverState/useEntities";
import AssetMentionPlugin, { type MentionChoice } from "../../node_types/editing/promptComposer/AssetMentionPlugin";
import { assetToUri } from "../../node_types/editing/promptComposer/promptTokens";
import { Box, Caption, FlexColumn, FlexRow, ScrollArea, SPACING } from "../../ui_primitives";
import { StoryboardLineNode, StoryboardTokenNode } from "./storyboardTextNodes";
import { ActiveLinePlugin, StoryboardTextPlugin } from "./StoryboardTextPlugin";
import { STILL_THUMB_WIDTH, textStyles } from "./storyboardTextStyles";
import { $lines } from "./storyboardTextLines";
import SelectionAssistPlugin from "./SelectionAssistPlugin";
import StoryboardMediaOverlay from "./StoryboardMediaOverlay";
import StoryboardTextOutline from "./StoryboardTextOutline";

interface StoryboardTextViewProps {
  boardId: string;
  readOnly?: boolean;
}


const toMarkdownEntity = (entity: Entity) => ({ id: entity.id, name: entity.name, kind: entity.kind, descriptor: entity.descriptor });

const mentionText = (choice: MentionChoice): string => {
  if ("entity" in choice) {
    return `[${choice.entity.name || choice.entity.id}](entity://${choice.entity.id})`;
  }
  const video = (choice.asset.content_type ?? "").startsWith("video/");
  return `![${video ? "Clip" : "Still"}](${assetToUri(choice.asset)})`;
};

/** Put the caret at the start of a line and bring it into view. */
const JumpTarget: React.FC<{ onReady: (jump: (line: number) => void) => void }> = ({ onReady }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onReady((line) => {
      editor.update(() => {
        $lines()[line]?.selectStart();
      });
      const element = editor.getRootElement()?.children.item(line);
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ block: "center" });
      }
      editor.focus();
    });
  }, [editor, onReady]);
  return null;
};

const StoryboardTextView: React.FC<StoryboardTextViewProps> = ({ boardId, readOnly = false }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: library } = useEntities();
  const entities = useMemo<StoryboardMarkdownEntities>(() => new Map((library ?? []).map((e) => [e.id, toMarkdownEntity(e)])), [library]);
  const [result, setResult] = useState<StoryboardMarkdownResult | null>(null);
  const [caretLine, setCaretLine] = useState<number | null>(null);
  const jumpRef = useRef<(line: number) => void>(() => undefined);
  const onJumpReady = useCallback((jump: (line: number) => void) => {
    jumpRef.current = jump;
  }, []);
  const onJump = useCallback((line: number) => jumpRef.current(line), []);
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
  const issues = result?.warnings.length ?? 0;
  // The outline sits beside the text where there is room for both.
  const wide = useMediaQuery(theme.breakpoints.up("md"));

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <FlexRow gap={SPACING.lg} sx={{ minHeight: 0, flex: 1, alignItems: "stretch" }}>
        <FlexColumn gap={SPACING.sm} sx={{ minHeight: 0, flex: 1, minWidth: 0 }}>
          <FlexRow gap={SPACING.md} align="center" wrap>
            <Caption color="secondary">{t("storyboardText.hint")}</Caption>
            {issues > 0 && <Caption color="error">{t("storyboardText.issues", { lines: issues })}</Caption>}
          </FlexRow>
          <ScrollArea thin sx={{ flex: 1, minHeight: 0 }}>
            <Box sx={{ ...textStyles(theme), position: "relative", maxWidth: "80ch", marginInline: "auto" }}>
              <RichTextPlugin
                contentEditable={<ContentEditable className="sb-text" spellCheck={false} aria-label={t("storyboardText.editorLabel")} />}
                placeholder={null}
                ErrorBoundary={() => null}
              />
              <StoryboardMediaOverlay result={result} />
            </Box>
          </ScrollArea>
        </FlexColumn>
        {wide && (
          <FlexColumn sx={{ width: theme.spacing(STILL_THUMB_WIDTH + SPACING.xxl), flexShrink: 0, minHeight: 0 }}>
            <StoryboardTextOutline result={result} caretLine={caretLine} onJump={onJump} />
          </FlexColumn>
        )}
      </FlexRow>
      <HistoryPlugin />
      <ActiveLinePlugin onCaretLine={setCaretLine} />
      <StoryboardTextPlugin boardId={boardId} entities={entities} readOnly={readOnly} onResult={setResult} />
      <JumpTarget onReady={onJumpReady} />
      {!readOnly && <AssetMentionPlugin insertAsText={mentionText} />}
      {!readOnly && <SelectionAssistPlugin boardId={boardId} result={result} entities={entities} />}
    </LexicalComposer>
  );
};

export default StoryboardTextView;
