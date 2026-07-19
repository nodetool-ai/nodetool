/** @jsxImportSource @emotion/react */
/**
 * ShotCard
 *
 * One shot in the storyboard grid: its slug + index, action text, camera line,
 * the keyframe still (or a placeholder), the rendered clip when present, a
 * status indicator, an optional cost chip, and the plan → still → approve →
 * clip action buttons.
 */

import React, { memo, useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { Shot, ShotStatus } from "@nodetool-ai/protocol";

import {
  Card,
  FlexRow,
  FlexColumn,
  EditorButton,
  StatusIndicator,
  Chip,
  Text,
  Caption,
  VideoPlayer,
  SPACING,
  getSpacingPx,
  BORDER_RADIUS,
  MOTION,
  type StatusType
} from "../ui_primitives";
import ImageRefPreview from "../node/ImageRefPreview";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { syncShotClipToTimeline } from "../../stores/storyboard/timelineSync";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";

interface ShotCardProps {
  boardId: string;
  shot: Shot;
  readOnly?: boolean;
}

const STATUS_META: Record<ShotStatus, { status: StatusType; label: string; pulse?: boolean }> = {
  planned: { status: "default", label: "Planned" },
  keyframe_generating: { status: "pending", label: "Generating still…", pulse: true },
  keyframe_ready: { status: "info", label: "Still ready" },
  approved: { status: "success", label: "Approved" },
  clip_generating: { status: "pending", label: "Rendering…", pulse: true },
  rendered: { status: "success", label: "Rendered" },
  failed: { status: "error", label: "Failed" }
};

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: getSpacingPx(SPACING.sm),
    ".preview": {
      position: "relative",
      width: "100%",
      aspectRatio: "16 / 9",
      borderRadius: BORDER_RADIUS.sm,
      overflow: "hidden",
      backgroundColor: theme.vars.palette.c_overlay_subtle,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "& img": {
        width: "100%",
        height: "100%",
        objectFit: "cover"
      }
    },
    ".placeholder": {
      color: theme.vars.palette.text.disabled,
      textAlign: "center",
      padding: getSpacingPx(SPACING.md)
    },
    ".camera": {
      color: theme.vars.palette.text.secondary
    },
    // ── Generating: shimmer sweep + spark over the preview, glow on the card ──
    "@keyframes shot-shimmer": {
      from: { backgroundPosition: "200% 0" },
      to: { backgroundPosition: "-200% 0" }
    },
    "@keyframes shot-spark": {
      "0%, 100%": { opacity: 0.4, transform: "scale(0.9) rotate(0deg)" },
      "50%": { opacity: 1, transform: "scale(1.2) rotate(90deg)" }
    },
    "@keyframes shot-breathe": {
      "0%, 100%": { boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}33` },
      "50%": { boxShadow: `0 0 14px 1px ${theme.vars.palette.primary.main}55` }
    },
    "&.generating": {
      animation: `shot-breathe ${MOTION.pulse} infinite`
    },
    ".conjure": {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: getSpacingPx(SPACING.sm),
      backgroundImage: `linear-gradient(100deg, transparent 40%, ${theme.vars.palette.action.selected} 50%, transparent 60%)`,
      backgroundSize: "200% 100%",
      animation: `shot-shimmer ${MOTION.spin} infinite`,
      ".spark": {
        fontSize: "1.5em",
        color: theme.vars.palette.primary.main,
        animation: `shot-spark ${MOTION.pulse} infinite`
      },
      ".conjure-label": {
        color: theme.vars.palette.text.secondary
      }
    },
    "@media (prefers-reduced-motion: reduce)": {
      "&.generating, .conjure, .conjure .spark": { animation: "none" }
    }
  });

const cameraLine = (shot: Shot): string =>
  [
    shot.camera?.framing,
    shot.camera?.lens,
    shot.camera?.angle,
    shot.camera?.movement
  ]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(" · ");

const ShotCardInner: React.FC<ShotCardProps> = ({ boardId, shot, readOnly }) => {
  const theme = useTheme();
  const approveShot = useStoryboardStore((state) => state.approveShot);
  const selectClipVersion = useStoryboardStore(
    (state) => state.selectClipVersion
  );
  const { generateKeyframe, generateClip, generateRevisedClip } =
    useGenerateShot();

  const meta = STATUS_META[shot.status];
  const isGenerating =
    shot.status === "keyframe_generating" || shot.status === "clip_generating";
  const camera = cameraLine(shot);
  const clipUri = shot.clip?.uri;
  const takes = shot.clip_versions ?? (shot.clip ? [shot.clip] : []);
  const selectedTake = takes.findIndex(
    (v) =>
      (shot.clip?.asset_id && v.asset_id === shot.clip.asset_id) ||
      (!shot.clip?.asset_id && v.uri === shot.clip?.uri)
  );

  const handleSelectTake = useCallback(
    (index: number) => {
      selectClipVersion(boardId, shot.id, index);
      // Keep a linked, already-assembled timeline on the newly chosen take.
      const assetId = (shot.clip_versions ?? [])[index]?.asset_id;
      if (assetId) {
        void syncShotClipToTimeline(boardId, shot.id, assetId);
      }
    },
    [selectClipVersion, boardId, shot.id, shot.clip_versions]
  );

  const handleGenerateStill = useCallback(() => {
    void generateKeyframe(boardId, shot);
  }, [generateKeyframe, boardId, shot]);

  const handleApprove = useCallback(() => {
    approveShot(boardId, shot.id);
  }, [approveShot, boardId, shot.id]);

  const handleGenerateClip = useCallback(() => {
    void generateClip(boardId, shot);
  }, [generateClip, boardId, shot]);

  const handleRevise = useCallback(() => {
    const instruction = window.prompt(
      "Describe the change to make (e.g. 'make it darker, add rain')"
    );
    if (instruction && instruction.trim().length > 0) {
      void generateRevisedClip(boardId, shot, instruction.trim());
    }
  }, [generateRevisedClip, boardId, shot]);

  return (
    <Card
      variant="outlined"
      padding="compact"
      css={styles(theme)}
      className={`shot-card${isGenerating ? " generating" : ""}`}
    >
      <FlexRow align="center" justify="space-between" gap={1}>
        <Text size="small" weight={600} truncate>
          {`${shot.index + 1}. ${shot.slug ?? "Untitled shot"}`}
        </Text>
        <StatusIndicator
          status={meta.status}
          label={meta.label}
          pulse={meta.pulse}
        />
      </FlexRow>

      <div className="preview">
        {clipUri ? (
          <VideoPlayer src={clipUri} />
        ) : (
          <ImageRefPreview
            value={shot.keyframe}
            placeholder={
              <Caption className="placeholder">No still yet</Caption>
            }
          />
        )}
        {isGenerating && (
          <div className="conjure">
            <span className="spark">✦</span>
            <Caption className="conjure-label">
              {shot.status === "clip_generating"
                ? "Rendering clip…"
                : "Conjuring still…"}
            </Caption>
          </div>
        )}
      </div>

      <Text size="small" lineClamp={3}>
        {shot.action}
      </Text>

      {camera.length > 0 && (
        <Caption className="camera" noWrap>
          {camera}
        </Caption>
      )}

      {takes.length > 1 && (
        <FlexRow gap={0.5} align="center" wrap className="takes">
          <Caption color="secondary">Takes</Caption>
          {takes.map((take, i) => (
            <Chip
              key={take.asset_id ?? take.uri ?? i}
              compact
              clickable={!readOnly}
              color={i === selectedTake ? "primary" : "default"}
              label={`${i + 1}`}
              onClick={readOnly ? undefined : () => handleSelectTake(i)}
            />
          ))}
        </FlexRow>
      )}

      {typeof shot.cost_estimate === "number" && (
        <FlexRow>
          <Chip compact color="info" label={`~$${shot.cost_estimate.toFixed(2)}`} />
        </FlexRow>
      )}

      {!readOnly && (
        <FlexColumn gap={0.5}>
          <FlexRow gap={0.5}>
            <EditorButton
              onClick={handleGenerateStill}
              disabled={isGenerating}
            >
              {shot.keyframe ? "Regenerate" : "Generate still"}
            </EditorButton>
            <EditorButton
              onClick={handleApprove}
              disabled={shot.status !== "keyframe_ready"}
            >
              Approve
            </EditorButton>
          </FlexRow>
          <EditorButton
            onClick={handleGenerateClip}
            disabled={
              isGenerating ||
              !shot.keyframe ||
              (shot.status !== "approved" && shot.status !== "rendered")
            }
            fullWidth
          >
            {shot.clip ? "New take" : "Generate clip"}
          </EditorButton>
          {shot.clip && (
            <EditorButton
              onClick={handleRevise}
              disabled={isGenerating}
              fullWidth
            >
              Revise clip
            </EditorButton>
          )}
        </FlexColumn>
      )}
    </Card>
  );
};

export const ShotCard = memo(ShotCardInner);
ShotCard.displayName = "ShotCard";

export default ShotCard;
