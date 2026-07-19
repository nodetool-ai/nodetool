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
import ShotTakesGallery from "./ShotTakesGallery";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { entitiesForShot } from "../../stores/storyboard/shotEntities";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { useEntities } from "../../serverState/useEntities";
import { ENTITY_KIND_COLOR } from "../entities/entityKind";

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

const EMPTY_IDS: string[] = [];

const ShotCardInner: React.FC<ShotCardProps> = ({ boardId, shot, readOnly }) => {
  const theme = useTheme();
  const approveShot = useStoryboardStore((state) => state.approveShot);
  const toggleShotEntity = useStoryboardStore((state) => state.toggleShotEntity);
  const boardEntityIds = useStoryboardStore(
    (state) => state.boards[boardId]?.entityIds ?? EMPTY_IDS
  );
  const { data: allEntities } = useEntities();
  const { generateKeyframe, generateClip, generateRevisedClip } =
    useGenerateShot();

  // The board's cast, and which of it this shot's prompt will actually use.
  const boardEntities = (allEntities ?? []).filter((e) =>
    boardEntityIds.includes(e.id)
  );
  const appliedEntities = entitiesForShot(shot, boardEntities);
  const appliedIds = appliedEntities.map((e) => e.id);

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

      {boardEntities.length > 0 && (
        <FlexRow gap={0.5} wrap>
          {boardEntities.map((entity) => {
            const applied = appliedIds.includes(entity.id);
            return (
              <Chip
                key={entity.id}
                compact
                label={entity.name || "Untitled"}
                color={applied ? ENTITY_KIND_COLOR[entity.kind] : "default"}
                variant={applied ? "filled" : "outlined"}
                sx={applied ? undefined : { opacity: 0.55 }}
                title={
                  applied
                    ? `${entity.descriptor || entity.name} — click to exclude from this shot`
                    : `Click to include ${entity.name} in this shot`
                }
                onClick={
                  readOnly
                    ? undefined
                    : () =>
                        toggleShotEntity(boardId, shot.id, entity.id, appliedIds)
                }
              />
            );
          })}
        </FlexRow>
      )}

      <ShotTakesGallery boardId={boardId} shot={shot} readOnly={readOnly} />

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
