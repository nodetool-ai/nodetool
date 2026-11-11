/**
 * One generation in the Create grid: its result (or a fill while it runs), the
 * prompt, and the actions a result can take. The tile opens the result; the
 * buttons beneath it carry the rest, so no action hides behind a gesture. The
 * actions that start a new take from this one (edit, animate, extend, …) sit
 * in its More menu, so a narrow tile keeps one row of buttons.
 *
 * An audio take plays in place: there is no picture to open.
 */
import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import ReplayIcon from "@mui/icons-material/Replay";
import StopIcon from "@mui/icons-material/Stop";
import VideoLibraryOutlinedIcon from "@mui/icons-material/VideoLibraryOutlined";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  ContextMenu,
  FlexColumn,
  FlexRow,
  MagicGenerationFill,
  MediaThumbnail,
  MenuItemPrimitive,
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
  /** Attach the result to the prompt as a reference. */
  onUseAsReference: (item: CreateFeedItem) => void;
  /** Start a new take from the result in `mode`, with it as the only input. */
  onStartFrom: (item: CreateFeedItem, mode: CreateFollowUpMode) => void;
  onOpenInSketch: (item: CreateFeedItem) => void;
  /** Put the result's prompt back in the composer. */
  onReusePrompt: (item: CreateFeedItem) => void;
}

/** The modes a result can seed: an image is edited or animated, a clip changed or extended. */
export type CreateFollowUpMode = "image_edit" | "image_to_video" | "retake" | "extend";

const FOLLOW_UPS: Record<"image" | "video", readonly CreateFollowUpMode[]> = {
  image: ["image_edit", "image_to_video"],
  video: ["retake", "extend"]
};

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
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const running = item.status === "generating";
  const done = item.assetId !== null && item.status === "generated";
  const audio = item.kind === "audio";
  // An audio take's tile is its player, so the tile itself opens nothing.
  const opens = done && !audio;
  const title =
    item.prompt ||
    t("generations.untitled", { kind: t(`generations.kind.${item.kind}`) });
  const canStop = running && item.generation?.channel === "rpc";

  const handleOpen = useCallback(() => {
    if (opens) {
      actions.onOpen(item);
    }
  }, [actions, opens, item]);

  const closeMore = useCallback(() => setMoreAnchor(null), []);
  const runMore = useCallback(
    (run: () => void) => () => {
      setMoreAnchor(null);
      run();
    },
    []
  );

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
    ) : audio ? undefined : (
      <AutoAwesomeOutlinedIcon />
    );

  return (
    <FlexColumn
      gap={SPACING.xs}
      data-testid="create-grid-item"
      sx={(theme) => ({ ...selectableTileStyles(theme), p: SPACING.xs, minWidth: 0 })}
    >
      <Box
        role={opens ? "button" : undefined}
        tabIndex={opens ? 0 : undefined}
        aria-label={opens ? t("create_view.item.open", { title }) : undefined}
        onClick={opens ? handleOpen : undefined}
        onKeyDown={opens ? handleKeyDown : undefined}
        sx={{ position: "relative", cursor: opens ? "pointer" : "default" }}
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
          interactive={audio && done}
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
          {done && (
            <ToolbarIconButton
              icon={<MoreHorizIcon fontSize="inherit" />}
              tooltip={t("create_view.item.more")}
              ariaLabel={t("create_view.item.moreLabel", { title })}
              onClick={(event) => setMoreAnchor(event.currentTarget)}
            />
          )}
        </FlexRow>
      )}
      {done && (
        <ContextMenu open={moreAnchor !== null} anchorEl={moreAnchor} onClose={closeMore}>
          {!audio && (
            <MenuItemPrimitive
              label={t("create_view.item.useAsReference")}
              onClick={runMore(() => actions.onUseAsReference(item))}
            />
          )}
          {(item.kind === "image" || item.kind === "video") &&
            FOLLOW_UPS[item.kind].map((mode) => (
              <MenuItemPrimitive
                key={mode}
                label={t(`create_view.item.startFrom.${mode}`)}
                onClick={runMore(() => actions.onStartFrom(item, mode))}
              />
            ))}
          {item.kind === "image" && (
            <MenuItemPrimitive
              label={t("create_view.item.openInSketch")}
              onClick={runMore(() => actions.onOpenInSketch(item))}
            />
          )}
          {item.prompt && (
            <MenuItemPrimitive
              label={t("create_view.item.reusePrompt")}
              onClick={runMore(() => actions.onReusePrompt(item))}
            />
          )}
        </ContextMenu>
      )}
    </FlexColumn>
  );
});

CreateGridItem.displayName = "CreateGridItem";

export default CreateGridItem;
