/** @jsxImportSource @emotion/react */
/**
 * ClipActions
 *
 * Action bar rendered in the timeline Inspector for the selected clip.
 * Surfaces four lifecycle actions (PRD §17, §6 #1, §6 #6):
 *
 *   1. Duplicate Linked   — same workflowId, independent paramOverrides.
 *   2. Duplicate Variation — clones the workflow so both graphs are independent.
 *   3. Lock / Unlock       — prevents successful generations from swapping currentAssetId.
 *   4. Replace Output…     — picks an existing asset and sets currentAssetId directly.
 */

import React, { memo, useCallback, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import ImageIcon from "@mui/icons-material/Image";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { ToolbarIconButton, FlexRow, Text, Dialog, TextInput, Toast } from "../../ui_primitives";

// ── Styles ─────────────────────────────────────────────────────────────────

const actionsRowStyles = (theme: Theme) =>
  css({
    padding: theme.spacing(0.5, 1),
    gap: theme.spacing(0.5),
    flexWrap: "wrap",
    alignItems: "center"
  });

const sectionLabelStyles = (theme: Theme) =>
  css({
    fontSize: 11,
    color: theme.vars.palette.text.secondary,
    userSelect: "none",
    paddingRight: theme.spacing(0.5)
  });

// ── Component ──────────────────────────────────────────────────────────────

export interface ClipActionsProps {
  clipId: string;
  /**
   * Optional time offset in ms applied when placing the duplicate alongside
   * the original. Defaults to 0 (same start; callers may supply clip.durationMs).
   */
  duplicateOffsetMs?: number;
}

export const ClipActions: React.FC<ClipActionsProps> = memo(
  ({ clipId, duplicateOffsetMs = 0 }) => {
    const theme = useTheme();

    const clip = useTimelineStore(
      (s) => s.clips.find((c) => c.id === clipId)
    );

    const duplicateClipLinked = useTimelineStore((s) => s.duplicateClipLinked);
    const duplicateClipAsVariation = useTimelineStore(
      (s) => s.duplicateClipAsVariation
    );
    const setClipLocked = useTimelineStore((s) => s.setClipLocked);
    const replaceClipOutput = useTimelineStore((s) => s.replaceClipOutput);

    const [variationBusy, setVariationBusy] = useState(false);
    const [variationError, setVariationError] = useState<string | null>(null);
    const [replaceOpen, setReplaceOpen] = useState(false);
    const [assetIdInput, setAssetIdInput] = useState("");

    // ── Duplicate Linked ───────────────────────────────────────────────────

    const handleDuplicateLinked = useCallback(() => {
      duplicateClipLinked(clipId, duplicateOffsetMs);
    }, [clipId, duplicateOffsetMs, duplicateClipLinked]);

    // ── Duplicate as Variation ─────────────────────────────────────────────

    const handleDuplicateVariation = useCallback(async () => {
      if (variationBusy) {
        return;
      }
      setVariationBusy(true);
      try {
        await duplicateClipAsVariation(clipId, duplicateOffsetMs);
      } catch (err) {
        setVariationError(
          err instanceof Error ? err.message : "Failed to create variation"
        );
      } finally {
        setVariationBusy(false);
      }
    }, [clipId, duplicateOffsetMs, duplicateClipAsVariation, variationBusy]);

    // ── Lock ───────────────────────────────────────────────────────────────

    const handleToggleLock = useCallback(() => {
      if (!clip) {
        return;
      }
      setClipLocked(clipId, !clip.locked);
    }, [clipId, clip, setClipLocked]);

    // ── Replace Output ─────────────────────────────────────────────────────

    const handleOpenReplace = useCallback(() => {
      setAssetIdInput(clip?.currentAssetId ?? "");
      setReplaceOpen(true);
    }, [clip]);

    const handleConfirmReplace = useCallback(() => {
      const trimmed = assetIdInput.trim();
      if (trimmed) {
        replaceClipOutput(clipId, trimmed);
      }
      setReplaceOpen(false);
    }, [clipId, assetIdInput, replaceClipOutput]);

    const handleCancelReplace = useCallback(() => {
      setReplaceOpen(false);
    }, []);

    if (!clip) {
      return null;
    }

    return (
      <>
        <FlexRow css={actionsRowStyles(theme)}>
          <span css={sectionLabelStyles(theme)}>Clip</span>

          <ToolbarIconButton
            icon={<ContentCopyIcon fontSize="small" />}
            tooltip={
              "Duplicate Linked — shared graph, independent param overrides"
            }
            onClick={handleDuplicateLinked}
            aria-label="Duplicate clip linked"
            data-testid="clip-action-duplicate-linked"
          />

          <ToolbarIconButton
            icon={<CallSplitIcon fontSize="small" />}
            tooltip={
              variationBusy
                ? "Cloning workflow…"
                : "Duplicate as Variation — for trying a different look; graph is fully independent"
            }
            onClick={handleDuplicateVariation}
            disabled={variationBusy}
            aria-label="Duplicate clip as variation"
            data-testid="clip-action-duplicate-variation"
          />

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
                ? "Locked — successful generations do not replace current output"
                : "Unlocked — successful generations replace current output"
            }
            active={clip.locked}
            onClick={handleToggleLock}
            aria-label={clip.locked ? "Unlock clip" : "Lock clip"}
            data-testid="clip-action-lock"
          />

          <ToolbarIconButton
            icon={<ImageIcon fontSize="small" />}
            tooltip="Replace Output… — pick an existing asset without regenerating"
            onClick={handleOpenReplace}
            aria-label="Replace clip output"
            data-testid="clip-action-replace-output"
          />
        </FlexRow>

        {/* Replace Output dialog */}
        <Dialog
          open={replaceOpen}
          onClose={handleCancelReplace}
          title="Replace Output"
          onConfirm={handleConfirmReplace}
          onCancel={handleCancelReplace}
          confirmText="Replace"
          cancelText="Cancel"
          showActions
        >
          <Text size="small" sx={{ mb: 1 }}>
            Enter the asset ID to use as the clip&apos;s current output. The
            generation state and param overrides will not be changed.
          </Text>
          <TextInput
            value={assetIdInput}
            onChange={(e) => setAssetIdInput(e.target.value)}
            placeholder="Asset ID"
            inputProps={{ "aria-label": "Asset ID" }}
            fullWidth
            size="small"
          />
        </Dialog>

        {/* Variation error toast */}
        <Toast
          open={variationError !== null}
          message={variationError ?? ""}
          severity="error"
          onClose={() => setVariationError(null)}
          vertical="top"
          horizontal="center"
        />
      </>
    );
  }
);

ClipActions.displayName = "ClipActions";
