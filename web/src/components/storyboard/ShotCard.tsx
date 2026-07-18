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
  type StatusType
} from "../ui_primitives";
import ImageRefPreview from "../node/ImageRefPreview";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
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
  const { generateKeyframe, generateClip } = useGenerateShot();

  const meta = STATUS_META[shot.status];
  const isGenerating =
    shot.status === "keyframe_generating" || shot.status === "clip_generating";
  const camera = cameraLine(shot);
  const clipUri = shot.clip?.uri;

  const handleGenerateStill = useCallback(() => {
    void generateKeyframe(boardId, shot);
  }, [generateKeyframe, boardId, shot]);

  const handleApprove = useCallback(() => {
    approveShot(boardId, shot.id);
  }, [approveShot, boardId, shot.id]);

  const handleGenerateClip = useCallback(() => {
    void generateClip(boardId, shot);
  }, [generateClip, boardId, shot]);

  return (
    <Card variant="outlined" padding="compact" css={styles(theme)} className="shot-card">
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
      </div>

      <Text size="small" lineClamp={3}>
        {shot.action}
      </Text>

      {camera.length > 0 && (
        <Caption className="camera" noWrap>
          {camera}
        </Caption>
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
            disabled={shot.status !== "approved"}
            fullWidth
          >
            Generate clip
          </EditorButton>
        </FlexColumn>
      )}
    </Card>
  );
};

export const ShotCard = memo(ShotCardInner);
ShotCard.displayName = "ShotCard";

export default ShotCard;
