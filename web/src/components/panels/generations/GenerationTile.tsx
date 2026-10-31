import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Caption,
  FlexColumn,
  MagicGenerationFill,
  MediaThumbnail,
  StatusPill,
  Text,
  ToolbarIconButton,
  Tooltip,
  BORDER_RADIUS,
  SPACING,
  selectableTileStyles,
  type StatusPillTone
} from "../../ui_primitives";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import StopIcon from "@mui/icons-material/Stop";

import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationStore } from "../../../stores/storyboard/StoryboardGenerationStore";
import type {
  GenerationActivity,
  GenerationActivityStatus,
  GenerationMediaKind
} from "../../../stores/GenerationActivityStore";
import { formatPredictionElapsed } from "../../../core/chat/mediaPrediction";
import { formatClockTime } from "../../../utils/formatUtils";
import { notifyMutationError } from "../../../utils/notifyMutationError";
import OpenAsWorkflowAction from "./OpenAsWorkflowAction";
import { presetCatalog } from "../../../lib/presets/catalog";
import { presetText } from "../../../utils/presetText";

const KIND_ICON: Record<GenerationMediaKind, React.ReactNode> = {
  image: <ImageOutlinedIcon />,
  video: <MovieOutlinedIcon />,
  audio: <AudiotrackOutlinedIcon />,
  other: <AutoAwesomeOutlinedIcon />
};

const PILL_TONE: Record<GenerationActivityStatus, StatusPillTone> = {
  generating: "rendering",
  generated: "done",
  failed: "failed",
  cancelled: "neutral"
};

/** The tile's second line: where it was made, then how long it took or when. */
const metaLine = (
  generation: GenerationActivity,
  now: number,
  sourceLabel: string
): string => {
  const parts = [sourceLabel, generation.model];
  if (generation.status === "generating") {
    parts.push(
      formatPredictionElapsed(
        Math.max(0, Math.floor((now - generation.startedAt) / 1000))
      )
    );
  } else if (generation.endedAt) {
    parts.push(formatClockTime(generation.endedAt));
  }
  return parts.filter(Boolean).join(" · ");
};

export interface GenerationTileProps {
  generation: GenerationActivity;
  /** The panel's clock, so every running tile ticks together. */
  now: number;
}

/**
 * One generation: its result (or the generating fill while it runs), the
 * prompt, and where it was made. Clicking opens that document.
 */
const GenerationTile = memo(function GenerationTile({
  generation,
  now
}: GenerationTileProps) {
  const { t } = useTranslation();
  const [stopping, setStopping] = useState(false);
  const { source } = generation;
  const running = generation.status === "generating";
  const canStop = running && generation.channel !== "prediction";

  const sourceLabel =
    source?.title ||
    (source ? t(`generations.source.${source.type}`, { defaultValue: "" }) : "");
  // A run from a preset often sends no prompt of its own, so the tile names
  // the presets it used before it falls back to the kind.
  const presetTitle = (generation.preset_ids ?? [])
    .map((id) => presetCatalog.getPreset(id))
    .filter((preset): preset is NonNullable<typeof preset> => Boolean(preset))
    .map((preset) => presetText(t, preset).name)
    .join(" + ");
  const title =
    generation.prompt ||
    presetTitle ||
    t("generations.untitled", { kind: t(`generations.kind.${generation.kind}`) });
  const assetId = generation.assetIds[0];
  const presetIds = generation.preset_ids ?? [];
  const canOpenAsWorkflow =
    presetIds.length > 0 &&
    (generation.kind === "image" || generation.kind === "video");

  const handleOpen = useCallback(() => {
    if (!source) {
      return;
    }
    useWorkspaceTabsStore.getState().openTab({
      type: source.type,
      ref: source.ref,
      title: source.title || undefined
    });
    // A shot render lands on its shot, as the board's own queue did.
    if (source.type === "storyboard") {
      const renders = useStoryboardGenerationStore.getState();
      const shotId =
        renders.requestRecords[generation.id]?.shotId ??
        renders.jobToShot[generation.id];
      if (shotId) {
        useStoryboardStore.getState().selectShot(source.ref, shotId);
      }
    }
  }, [generation.id, source]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleOpen();
      }
    },
    [handleOpen]
  );

  const handleStop = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();
      setStopping(true);
      try {
        // Loaded on use: the tracker pulls in the chat store, which the
        // bottom panel does not otherwise need.
        const { cancelGeneration } = await import(
          "../../../hooks/useGenerationActivityTracking"
        );
        await cancelGeneration(generation);
      } catch (error) {
        notifyMutationError(t("generations.stopFailed"), error);
      } finally {
        setStopping(false);
      }
    },
    [generation, t]
  );

  const thumbnail = (
    <MediaThumbnail
      locator={assetId ? { asset_id: assetId } : null}
      kind={assetId ? generation.kind : undefined}
      alt={title}
      aspectRatio="16/10"
      borderRadius={BORDER_RADIUS.md}
      icon={
        generation.status === "failed" ? (
          <ErrorOutlineIcon color="error" />
        ) : (
          KIND_ICON[generation.kind]
        )
      }
      label={
        <StatusPill tone={PILL_TONE[generation.status]}>
          {t(`generations.status.${generation.status}`)}
        </StatusPill>
      }
      actions={
        canStop || canOpenAsWorkflow ? (
          <>
            {canOpenAsWorkflow ? (
              <OpenAsWorkflowAction
                generation={generation}
                presetIds={presetIds}
              />
            ) : null}
            {canStop ? (
              <ToolbarIconButton
                icon={<StopIcon fontSize="inherit" />}
                tooltip={t("generations.stop")}
                ariaLabel={t("generations.stop")}
                loading={stopping}
                onClick={handleStop}
              />
            ) : null}
          </>
        ) : undefined
      }
    />
  );

  return (
    <FlexColumn
      gap={SPACING.xs}
      role={source ? "button" : undefined}
      tabIndex={source ? 0 : undefined}
      aria-label={
        source
          ? t("generations.openSource", { title: sourceLabel || title })
          : undefined
      }
      onClick={source ? handleOpen : undefined}
      onKeyDown={source ? handleKeyDown : undefined}
      sx={(theme) => ({
        ...selectableTileStyles(theme),
        p: SPACING.xs,
        minWidth: 0,
        cursor: source ? "pointer" : "default"
      })}
    >
      <Box sx={{ position: "relative" }}>
        {thumbnail}
        {running && <MagicGenerationFill borderRadius={BORDER_RADIUS.md} />}
      </Box>
      <FlexColumn sx={{ minWidth: 0, px: SPACING.micro }}>
        <Text size="small" weight={500} truncate>
          {title}
        </Text>
        {generation.status === "failed" && generation.error ? (
          <Tooltip title={generation.error}>
            <Caption color="error" noWrap>
              {generation.error}
            </Caption>
          </Tooltip>
        ) : (
          <Caption color="secondary" noWrap>
            {metaLine(generation, now, sourceLabel)}
          </Caption>
        )}
      </FlexColumn>
    </FlexColumn>
  );
});

GenerationTile.displayName = "GenerationTile";

export default GenerationTile;
