/** @jsxImportSource @emotion/react */

import React, { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import ImageIcon from "@mui/icons-material/Image";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import AutoAwesomeMotionIcon from "@mui/icons-material/AutoAwesomeMotion";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { ReplaceClipAssetDialog } from "../Tracks/ReplaceClipAssetDialog";
import { ToolbarIconButton, FlexRow, SPACING } from "../../ui_primitives";
import { useAlertNotifier } from "../../../hooks/useAlertNotifier";

// ── Styles ─────────────────────────────────────────────────────────────────

const actionsRowStyles = (theme: Theme) =>
  css({
    padding: theme.spacing(SPACING.micro, SPACING.xs),
    gap: theme.spacing(SPACING.micro),
    flexWrap: "wrap",
    alignItems: "center"
  });

// ── Component ──────────────────────────────────────────────────────────────

interface ClipActionsProps {
  clipId: string;
  duplicateOffsetMs?: number;
}

export const ClipActions: React.FC<ClipActionsProps> = memo(
  ({ clipId, duplicateOffsetMs = 0 }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const navigate = useNavigate();

    const clip = useTimelineStore((s) => findClipById(s.clips, clipId));
    const sequenceId = useTimelineStore((s) => s.sequenceId);

    const duplicateClip = useTimelineStore((s) => s.duplicateClip);
    const regenerateAsCopy = useTimelineStore((s) => s.regenerateAsCopy);
    const selectClip = useTimelineUIStore((s) => s.selectClip);
    const setClipLocked = useTimelineStore((s) => s.setClipLocked);

    const duplicateBusyRef = useRef(false);
    const [duplicateBusy, setDuplicateBusy] = useState(false);
    const reportDuplicateError = useAlertNotifier("error");
    const [replaceOpen, setReplaceOpen] = useState(false);

    const handleDuplicate = useCallback(async () => {
      if (duplicateBusyRef.current) {
        return;
      }
      duplicateBusyRef.current = true;
      setDuplicateBusy(true);
      try {
        const newClipId = await duplicateClip(clipId, duplicateOffsetMs);
        selectClip(newClipId);
      } catch (err) {
        reportDuplicateError(
          err instanceof Error
            ? err.message
            : t("pass3_22.timeline.inspector.clipActions.duplicateFailed")
        );
      } finally {
        duplicateBusyRef.current = false;
        setDuplicateBusy(false);
      }
    }, [
      clipId,
      duplicateOffsetMs,
      duplicateClip,
      selectClip,
      reportDuplicateError,
      t
    ]);

    // ── Regenerate as new clip ─────────────────────────────────────────────
    // Drops a fresh sibling immediately to the right with the same binding
    // (workflow + overrides, or prompt + model) but no rendered asset, so
    // the user can roll a new take without losing the existing one.
    const handleRegenerateAsCopy = useCallback(() => {
      try {
        const newClipId = regenerateAsCopy(clipId, duplicateOffsetMs);
        selectClip(newClipId);
      } catch (err) {
        reportDuplicateError(
          err instanceof Error
            ? err.message
            : t("pass3_22.timeline.inspector.clipActions.createCopyFailed")
        );
      }
    }, [
      clipId,
      duplicateOffsetMs,
      regenerateAsCopy,
      selectClip,
      reportDuplicateError,
      t
    ]);

    // ── Lock ───────────────────────────────────────────────────────────────

    const handleToggleLock = useCallback(() => {
      if (!clip) {
        return;
      }
      setClipLocked(clipId, !clip.locked);
    }, [clipId, clip, setClipLocked]);

    // ── Replace Output ─────────────────────────────────────────────────────

    const handleOpenReplace = useCallback(() => {
      setReplaceOpen(true);
    }, []);

    const handleCloseReplace = useCallback(() => {
      setReplaceOpen(false);
    }, []);

    // ── Open in Node Editor ────────────────────────────────────────────────

    const handleOpenInNodeEditor = useCallback(() => {
      if (!clip?.workflowId || !sequenceId) {
        return;
      }
      navigate(
        `/editor/${clip.workflowId}?from=timeline:${sequenceId}:${clipId}`
      );
    }, [clip?.workflowId, sequenceId, clipId, navigate]);

    if (!clip) {
      return null;
    }

    return (
      <>
        <FlexRow css={actionsRowStyles(theme)}>
          {/* Generation has its own primary button in the prompt / inputs
              panel; this toolbar is for clip operations only. */}
          <ToolbarIconButton
            icon={<ContentCopyIcon fontSize="small" />}
            tooltip={t(
              "pass3_22.timeline.inspector.clipActions.duplicateTooltip"
            )}
            onClick={() => void handleDuplicate()}
            disabled={duplicateBusy}
            aria-label={t("pass3_22.timeline.inspector.clipActions.duplicate")}
            data-testid="clip-action-duplicate"
          />

          {clip.sourceType === "generated" && (
            <ToolbarIconButton
              icon={<AutoAwesomeMotionIcon fontSize="small" />}
              tooltip={t(
                "pass3_22.timeline.inspector.clipActions.regenerateTooltip"
              )}
              onClick={handleRegenerateAsCopy}
              aria-label={t(
                "pass3_22.timeline.inspector.clipActions.regenerate"
              )}
              data-testid="clip-action-regenerate-as-copy"
            />
          )}

          <ToolbarIconButton
            icon={
              clip.locked ? (
                <LockIcon fontSize="small" />
              ) : (
                <LockOpenIcon fontSize="small" />
              )
            }
            tooltip={
              clip.locked
                ? t("pass3_22.timeline.inspector.clipActions.lockedTooltip")
                : t("pass3_22.timeline.inspector.clipActions.unlockedTooltip")
            }
            active={clip.locked}
            onClick={handleToggleLock}
            aria-label={
              clip.locked
                ? t("pass3_22.timeline.inspector.clipActions.unlock")
                : t("pass3_22.timeline.inspector.clipActions.lock")
            }
            data-testid="clip-action-lock"
          />

          <ToolbarIconButton
            icon={<ImageIcon fontSize="small" />}
            tooltip={t(
              "pass3_22.timeline.inspector.clipActions.replaceTooltip"
            )}
            onClick={handleOpenReplace}
            aria-label={t(
              "pass3_22.timeline.inspector.clipActions.replaceOutput"
            )}
            data-testid="clip-action-replace-output"
          />

          {clip.workflowId && sequenceId && (
            <ToolbarIconButton
              icon={<OpenInNewIcon fontSize="small" />}
              tooltip={t(
                "pass3_22.timeline.inspector.clipActions.openInNodeEditorTooltip"
              )}
              onClick={handleOpenInNodeEditor}
              aria-label={t(
                "pass3_22.timeline.inspector.clipActions.openWorkflowInNodeEditor"
              )}
              data-testid="clip-action-open-in-editor"
            />
          )}
        </FlexRow>

        {replaceOpen && (
          <ReplaceClipAssetDialog
            clipId={clipId}
            onClose={handleCloseReplace}
          />
        )}
      </>
    );
  }
);

ClipActions.displayName = "ClipActions";
