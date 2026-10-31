/**
 * One generation in the Create grid: its result (or a fill while it runs), the
 * prompt, and the actions a result can take. The tile opens the result; the
 * buttons beneath it carry the rest, so no action hides behind a gesture.
 */
import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import ReplayIcon from "@mui/icons-material/Replay";
import StopIcon from "@mui/icons-material/Stop";
import VideoLibraryOutlinedIcon from "@mui/icons-material/VideoLibraryOutlined";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  MagicGenerationFill,
  MediaThumbnail,
  SPACING,
  StatusPill,
  Text,
  ToolbarIconButton,
  Tooltip,
  selectableTileStyles,
  type StatusPillTone
} from "../ui_primitives";
import type { GenerationActivityStatus } from "../../stores/GenerationActivityStore";
import { canOpenAsWorkflow } from "./createActions";
import { canRetake, type CreateFeedItem } from "./createFeed";

const PILL_TONE: Record<GenerationActivityStatus, StatusPillTone> = {
  generating: "rendering",
  generated: "done",
  failed: "failed",
  cancelled: "neutral"
};

export interface CreateGridItemActions {
  onOpen: (item: CreateFeedItem) => void;
  onDownload: (item: CreateFeedItem) => void;
  onRetake: (item: CreateFeedItem) => void;
  onSendToTimeline: (item: CreateFeedItem) => void;
  onOpenAsWorkflow: (item: CreateFeedItem) => void;
  onStop: (item: CreateFeedItem) => Promise<void>;
}

interface CreateGridItemProps {
  item: CreateFeedItem;
  actions: CreateGridItemActions;
}

const CreateGridItem = memo(function CreateGridItem({
  item,
  actions
}: CreateGridItemProps) {
  const { t } = useTranslation();
  const [stopping, setStopping] = useState(false);
  const running = item.status === "generating";
  const done = item.assetId !== null && item.status === "generated";
  const title =
    item.prompt ||
    t("generations.untitled", { kind: t(`generations.kind.${item.kind}`) });
  const canStop = running && item.generation?.channel === "rpc";

  const handleOpen = useCallback(() => {
    if (done) {
      actions.onOpen(item);
    }
  }, [actions, done, item]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        handleOpen();
      }
    },
    [handleOpen]
  );

  const handleStop = useCallback(async () => {
    setStopping(true);
    try {
      await actions.onStop(item);
    } finally {
      setStopping(false);
    }
  }, [actions, item]);

  const fallbackIcon =
    item.status === "failed" ? (
      <ErrorOutlineIcon color="error" />
    ) : item.kind === "video" ? (
      <MovieOutlinedIcon />
    ) : item.kind === "image" ? (
      <ImageOutlinedIcon />
    ) : (
      <AutoAwesomeOutlinedIcon />
    );

  return (
    <FlexColumn
      gap={SPACING.xs}
      data-testid="create-grid-item"
      sx={(theme) => ({ ...selectableTileStyles(theme), p: SPACING.xs, minWidth: 0 })}
    >
      <Box
        role={done ? "button" : undefined}
        tabIndex={done ? 0 : undefined}
        aria-label={done ? t("create_view.item.open", { title }) : undefined}
        onClick={done ? handleOpen : undefined}
        onKeyDown={done ? handleKeyDown : undefined}
        sx={{ position: "relative", cursor: done ? "pointer" : "default" }}
      >
        <MediaThumbnail
          {...(item.asset
            ? { asset: item.asset }
            : item.assetId
              ? { locator: { asset_id: item.assetId } }
              : {})}
          kind={item.assetId ? item.kind : undefined}
          alt={title}
          aspectRatio="16/10"
          borderRadius={BORDER_RADIUS.md}
          icon={fallbackIcon}
          label={
            item.status === "generated" ? undefined : (
              <StatusPill tone={PILL_TONE[item.status]}>
                {t(`generations.status.${item.status}`)}
              </StatusPill>
            )
          }
          actions={
            canStop ? (
              <ToolbarIconButton
                icon={<StopIcon fontSize="inherit" />}
                tooltip={t("generations.stop")}
                ariaLabel={t("generations.stop")}
                loading={stopping}
                onClick={handleStop}
              />
            ) : undefined
          }
        />
        {running && <MagicGenerationFill borderRadius={BORDER_RADIUS.md} />}
      </Box>
      <FlexColumn sx={{ minWidth: 0, px: SPACING.micro }}>
        <Text size="small" weight={500} truncate>
          {title}
        </Text>
        {item.status === "failed" && item.error ? (
          <Tooltip title={item.error}>
            <Caption color="error" noWrap>
              {item.error}
            </Caption>
          </Tooltip>
        ) : (
          <Caption color="secondary" noWrap>
            {[item.model, new Date(item.createdAt).toLocaleString()]
              .filter(Boolean)
              .join(" · ")}
          </Caption>
        )}
      </FlexColumn>
      {(done || canRetake(item)) && (
        <FlexRow gap={SPACING.xs} sx={{ px: SPACING.micro }}>
          {done && (
            <ToolbarIconButton
              icon={<DownloadOutlinedIcon fontSize="inherit" />}
              tooltip={t("create_view.item.download")}
              ariaLabel={t("create_view.item.downloadLabel", { title })}
              onClick={() => actions.onDownload(item)}
            />
          )}
          {canRetake(item) && (
            <ToolbarIconButton
              icon={<ReplayIcon fontSize="inherit" />}
              tooltip={t("create_view.item.retake")}
              ariaLabel={t("create_view.item.retakeLabel", { title })}
              onClick={() => actions.onRetake(item)}
            />
          )}
          {done && item.kind === "video" && (
            <ToolbarIconButton
              icon={<VideoLibraryOutlinedIcon fontSize="inherit" />}
              tooltip={t("create_view.item.sendToTimeline")}
              ariaLabel={t("create_view.item.sendToTimelineLabel", { title })}
              onClick={() => actions.onSendToTimeline(item)}
            />
          )}
          {done && canOpenAsWorkflow(item) && (
            <ToolbarIconButton
              icon={<AccountTreeOutlinedIcon fontSize="inherit" />}
              tooltip={t("create_view.item.openAsWorkflow")}
              ariaLabel={t("create_view.item.openAsWorkflowLabel", { title })}
              onClick={() => actions.onOpenAsWorkflow(item)}
            />
          )}
        </FlexRow>
      )}
    </FlexColumn>
  );
});

CreateGridItem.displayName = "CreateGridItem";

export default CreateGridItem;
