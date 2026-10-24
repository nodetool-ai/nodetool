/**
 * ShotInspector
 *
 * The selection footer, docked under the shot grid: which shot is selected,
 * its description, where it appears in the project's sibling documents, and
 * the four actions PRD § 7.5 leaves here — `Edit`, `Iterate`, `Regenerate`,
 * `Delete`.
 *
 * Every field this used to edit now lives in {@link ShotEditPanel}, which the
 * board opens under the shot's card when `Edit` is taken here. The
 * cross-document chips stay because nothing else on the board says where a shot
 * landed in the script and in the cut.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Shot } from "@nodetool-ai/protocol";

import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { entitiesForShot } from "../../stores/storyboard/shotEntities";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { requestDocumentFocus } from "../../stores/DocumentFocusStore";
import { useEntities } from "../../serverState/useEntities";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { useBoardScriptLines } from "../../hooks/storyboard/useShotDuration";
import { useShotTimelineLink } from "../../hooks/storyboard/useShotTimelineLink";
import ShotActionText from "./ShotActionText";
import ShotRenderDialog from "./ShotRenderDialog";
import { isShotGenerating } from "./ShotStatusPill";
import {
  Box,
  Caption,
  Chip,
  CloseButton,
  Dialog,
  ToolbarDivider,
  EditorButton,
  FlexColumn,
  FlexRow,
  Panel,
  Text,
  TextArea,
  CONTROL,
  SPACING,
  TYPOGRAPHY,
  Tooltip
} from "../ui_primitives";
import { colorForType } from "../../config/data_types";

interface ShotInspectorProps {
  boardId: string;
  shot: Shot;
  readOnly?: boolean;
  /** Clears the board's selection. */
  onClose?: () => void;
  /**
   * Opens the shot's editor. The board renders it under the shot's card, so the
   * footer asks rather than opening a surface of its own. Without it `Edit` is
   * not offered.
   */
  onEdit?: (shotId: string) => void;
}

/** Sky — the app's colour for anything script- or voice-shaped. */
const SCRIPT_COLOR = colorForType("audio");

/** Violet — the app's colour for anything picture-shaped. */
const TIMELINE_COLOR = colorForType("video");

/** Secondary actions read as text; only `Edit` carries the accent. */
const quietActionSx = {
  color: "text.secondary",
  "&:hover": { color: "text.primary", bgcolor: "c_overlay_subtle" }
} as const;

/** A cross-document link chip, tinted by the document type it points at. */
const NO_ENTITY_IDS: string[] = [];

const ShotInspectorInner: React.FC<ShotInspectorProps> = ({
  boardId,
  shot,
  readOnly,
  onClose,
  onEdit
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const formatNumber = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, {
        useGrouping: false
      }).format(value),
    [locale]
  );
  const removeShot = useStoryboardStore((state) => state.removeShot);
  const boardEntityIds = useStoryboardStore(
    (state) => state.boards[boardId]?.entityIds ?? NO_ENTITY_IDS
  );
  const scriptId = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay?.script_id ?? null
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { generateRevisedClip } = useGenerateShot();
  const { data: allEntities } = useEntities();

  const [iterateOpen, setIterateOpen] = useState(false);
  const [iterateText, setIterateText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isGenerating = isShotGenerating(shot);
  const shotName = `${formatNumber(shot.index + 1)}. ${
    shot.slug ?? t("i18n-cont-storyboard-04.storyboard.shotInspector.untitledShot")
  }`;
  const shotNumber = formatNumber(shot.index + 1);
  const onBoard = new Set(boardEntityIds);
  const shotEntities = allEntities
    ? entitiesForShot(
        shot,
        allEntities.filter((entity) => onBoard.has(entity.id))
      )
    : [];

  // Where this shot lands in the project's other documents: the script line it
  // covers, and the clip it owns in the assembled cut.
  const scriptLines = useBoardScriptLines(boardId);
  const scriptLink = useMemo(() => {
    const ids = shot.script_line_ids ?? [];
    if (!scriptId || ids.length === 0) {
      return null;
    }
    const order = [...scriptLines.keys()];
    const first = ids
      .map((id) => ({ id, position: order.indexOf(id) }))
      .filter((entry) => entry.position >= 0)
      .sort((a, b) => a.position - b.position)[0];
    return {
      lineId: first?.id ?? null,
      label: first
        ? t("i18n-cont-storyboard-04.storyboard.shotInspector.scriptLine", {
            line: formatNumber(first.position + 1)
          })
        : t("i18n-cont-storyboard-04.storyboard.shotInspector.script")
    };
  }, [formatNumber, scriptId, scriptLines, shot.script_line_ids, t]);
  const timelineLink = useShotTimelineLink(boardId, shot.id);

  const handleOpenScript = useCallback(() => {
    if (!scriptId) {
      return;
    }
    // Park the line before the tab opens: the script pane reads the request as
    // it renders, and scrolls to the line rather than to the top.
    if (scriptLink?.lineId) {
      requestDocumentFocus({
        type: "script",
        ref: scriptId,
        lineId: scriptLink.lineId
      });
    }
    openTab({
      type: "script",
      ref: scriptId,
      mode: "edit",
      title: t("i18n-cont-storyboard-04.storyboard.shotInspector.script")
    });
  }, [openTab, scriptId, scriptLink, t]);

  // A start that throws records its reason on the shot's job state (and
  // toasts it), which is what the card's error line shows — so the rejection
  // is already reported and only needs to not go unhandled.
  const [stillRenderOpen, setStillRenderOpen] = useState(false);
  const handleRegenerate = useCallback(() => setStillRenderOpen(true), []);
  const closeStillRender = useCallback(() => setStillRenderOpen(false), []);

  const handleIterateConfirm = useCallback(() => {
    const instruction = iterateText.trim();
    if (instruction.length > 0) {
      void generateRevisedClip(boardId, shot, instruction).catch(
        () => undefined
      );
    }
    setIterateOpen(false);
    setIterateText("");
  }, [iterateText, generateRevisedClip, boardId, shot]);

  const handleDelete = useCallback(() => {
    removeShot(boardId, shot.id);
    setConfirmDelete(false);
  }, [removeShot, boardId, shot.id]);

  return (
    <Panel padding="none" className="shot-inspector">
      <FlexRow
        align="center"
        gap={SPACING.lg}
        wrap
        sx={{
          minHeight: `${CONTROL.height.xl}px`,
          px: SPACING.xl,
          py: SPACING.md
        }}
      >
        <Box sx={{ ...TYPOGRAPHY.mono.caption, color: "text.secondary" }}>
          {t("i18n-cont-storyboard-04.storyboard.shotInspector.selectedShot", {
            number: shotNumber
          })}
        </Box>
        <ToolbarDivider />
        <Box sx={{ flex: "1 1 240px", minWidth: 0 }}>
          <ShotActionText action={shot.action} entities={shotEntities} />
        </Box>
        <ToolbarDivider />
        <Caption color="secondary">
          {t("i18n-cont-storyboard-04.storyboard.shotInspector.appearsIn")}
        </Caption>
        {timelineLink && (
          <Tooltip
            title={t("i18n-cont-storyboard-04.storyboard.shotInspector.openCutTooltip")}
            describeChild
          >
            <Chip
              compact
              variant="outlined"
              label={timelineLink.label}
              accent={TIMELINE_COLOR}
              onClick={timelineLink.open}
            />
          </Tooltip>
        )}
        {scriptLink && (
          <Tooltip
            title={t("i18n-cont-storyboard-04.storyboard.shotInspector.openScriptTooltip")}
            describeChild
          >
            <Chip
              compact
              variant="outlined"
              label={scriptLink.label}
              accent={SCRIPT_COLOR}
              onClick={handleOpenScript}
            />
          </Tooltip>
        )}
        {!timelineLink && !scriptLink && (
          <Caption color="muted">
            {t("i18n-cont-storyboard-04.storyboard.shotInspector.noDocumentLinks")}
          </Caption>
        )}
        {!readOnly && (
          <>
            {onEdit && (
              <EditorButton
                variant="contained"
                color="primary"
                onClick={() => onEdit(shot.id)}
                tooltip={t(
                  "i18n-cont-storyboard-04.storyboard.shotInspector.editTooltip"
                )}
              >
                {t("i18n-cont-storyboard-04.storyboard.shotInspector.edit")}
              </EditorButton>
            )}
            <EditorButton
              onClick={() => setIterateOpen(true)}
              disabled={isGenerating || !shot.clip}
              sx={quietActionSx}
              tooltip={
                shot.clip
                  ? t("i18n-cont-storyboard-04.storyboard.shotInspector.iterateTooltip")
                  : t("i18n-cont-storyboard-04.storyboard.shotInspector.renderClipFirst")
              }
            >
              {t("i18n-cont-storyboard-04.storyboard.shotInspector.iterate")}
            </EditorButton>
            <EditorButton
              onClick={handleRegenerate}
              loading={isGenerating}
              sx={quietActionSx}
              tooltip={t(
                "i18n-cont-storyboard-04.storyboard.shotInspector.regenerateTooltip"
              )}
            >
              {t("i18n-cont-storyboard-04.storyboard.shotInspector.regenerate")}
            </EditorButton>
            <EditorButton
              onClick={() => setConfirmDelete(true)}
              disabled={isGenerating}
              sx={quietActionSx}
              tooltip={t("i18n-cont-storyboard-04.storyboard.shotInspector.deleteTooltip")}
            >
              {t("i18n-cont-storyboard-04.storyboard.shotInspector.delete")}
            </EditorButton>
          </>
        )}
        {onClose && (
          <CloseButton
            onClick={onClose}
            tooltip={t("i18n-cont-storyboard-04.storyboard.shotInspector.clearSelection")}
          />
        )}
      </FlexRow>

      <Dialog
        open={iterateOpen}
        onClose={() => setIterateOpen(false)}
        title={t("i18n-cont-storyboard-04.storyboard.shotInspector.iterateDialogTitle")}
        onConfirm={handleIterateConfirm}
        confirmText={t("i18n-cont-storyboard-04.storyboard.shotInspector.iterate")}
        confirmDisabled={iterateText.trim().length === 0}
      >
        <FlexColumn gap={SPACING.xs}>
          <Caption color="secondary">
            {t("i18n-cont-storyboard-04.storyboard.shotInspector.iterateDescription")}
          </Caption>
          <TextArea
            value={iterateText}
            placeholder={t(
              "i18n-cont-storyboard-04.storyboard.shotInspector.iteratePlaceholder"
            )}
            onChange={(value) => setIterateText(value)}
            rows={3}
            autoFocus
          />
        </FlexColumn>
      </Dialog>

      {/* Mounted only while open: it subscribes to the model catalog. */}
      {stillRenderOpen && (
        <ShotRenderDialog
          boardId={boardId}
          shot={shot}
          step="still"
          onClose={closeStillRender}
        />
      )}

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("i18n-cont-storyboard-04.storyboard.shotInspector.deleteDialogTitle")}
        onConfirm={handleDelete}
        confirmText={t("i18n-cont-storyboard-04.storyboard.shotInspector.delete")}
        destructive
      >
        <Text>
          {t("i18n-cont-storyboard-04.storyboard.shotInspector.deleteDescription", {
            shotName
          })}
        </Text>
      </Dialog>
    </Panel>
  );
};

export const ShotInspector = memo(ShotInspectorInner);
ShotInspector.displayName = "ShotInspector";

export default ShotInspector;
