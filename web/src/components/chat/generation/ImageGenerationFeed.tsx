/** @jsxImportSource @emotion/react */
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import ReplayIcon from "@mui/icons-material/Replay";
import AddToPhotosOutlinedIcon from "@mui/icons-material/AddToPhotosOutlined";
import type { SxProps, Theme } from "@mui/material/styles";

import {
  Box,
  Chip,
  EmptyState,
  FlexColumn,
  FlexRow,
  MagicGenerationFill,
  MOTION,
  PADDING,
  SPACING,
  Surface,
  Text,
  ToolbarIconButton,
  TruncatedText,
  Z_INDEX
} from "../../ui_primitives";
import ImageView from "../../node/ImageView";
import {
  useResolvedMediaUris,
  type MediaLocator
} from "../../../hooks/useResolvedMediaUri";
import { resolveInlineMediaSource } from "../../../utils/resolveMediaUri";
import type {
  Message,
  MessageContent,
  MessageImageContent
} from "../../../stores/ApiTypes";
import useMediaGenerationStore from "../../../stores/MediaGenerationStore";
import { useChatDraftStore } from "../../../stores/ChatDraftStore";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../../stores/WorkspaceTabsStore";
import type { ChatStatus } from "../types/chat.types";
import {
  extractGenerationTurns,
  numericAspectRatio,
  type GenerationTurn
} from "./extractGenerationTurns";
import { COMPOSER_CLEARANCE } from "./generationLayout";

interface ImageGenerationFeedProps {
  messages: readonly Message[];
  status: ChatStatus;
  threadId?: string | null;
  onResendFrom?: (message: Message) => void;
  onAddOutputToCanvas?: (content: MessageContent) => void;
  isCanvasAvailable?: boolean;
}

interface ImageTile {
  key: string;
  turn: GenerationTurn;
  item: MessageImageContent;
}

/** Controls drawn over a picture: legible on any image, light or dark. */
const OVERLAY_CONTROL_SX: SxProps<Theme> = {
  bgcolor: "c_scrim",
  color: "common.white",
  backdropFilter: "blur(8px)",
  "&:hover": { bgcolor: "c_overlay_strong" }
};

/**
 * Base row height (px) used for flex-basis. Each tile's flex-basis and
 * flex-grow are proportional to its aspect ratio, so every row scales its
 * height to fill 100% of the feed width while keeping all images in that row
 * at the same height and preserving each image's aspect ratio.
 */
const BASE_ROW_HEIGHT = 240;
const DEFAULT_NUMERIC_RATIO = 16 / 9;

const ImageGenerationFeed: React.FC<ImageGenerationFeedProps> = ({
  messages,
  status,
  threadId,
  onResendFrom,
  onAddOutputToCanvas,
  isCanvasAvailable = false
}) => {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [naturalRatios, setNaturalRatios] = useState<Record<string, number>>(
    {}
  );

  const handleTileDimensions = useCallback(
    (key: string, dims: { width: number; height: number }) => {
      if (dims.width <= 0 || dims.height <= 0) {
        return;
      }
      const nextRatio = dims.width / dims.height;
      setNaturalRatios((prev) =>
        prev[key] !== undefined && Math.abs(prev[key] - nextRatio) < 0.001
          ? prev
          : { ...prev, [key]: nextRatio }
      );
    },
    []
  );

  const turns = useMemo(
    () => extractGenerationTurns(messages, status),
    [messages, status]
  );

  // Every finished picture, resolved in one batch so the grid fills at once.
  const tiles = useMemo(
    (): ImageTile[] =>
      turns.flatMap((turn) =>
        turn.imageOutputs.map((item, idx) => ({
          key: `${turn.id}-${idx}`,
          turn,
          item
        }))
      ),
    [turns]
  );
  const locators = useMemo(
    (): MediaLocator[] => tiles.map((tile) => tile.item.image),
    [tiles]
  );
  const resolvedUris = useResolvedMediaUris(locators);
  const srcByKey = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<React.ComponentProps<typeof ImageView>["source"]>
    >();
    tiles.forEach((tile, index) => {
      const src =
        resolvedUris[index] ??
        resolveInlineMediaSource(tile.item.image?.data as string | undefined);
      if (src) {
        map.set(tile.key, src);
      }
    });
    return map;
  }, [resolvedUris, tiles]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || turns.length === 0) {
      return;
    }
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [turns.length]);

  const handleEdit = useCallback(
    (tile: ImageTile) => {
      if (!threadId) {
        return;
      }
      const assetId = tile.item.image?.asset_id;
      useChatDraftStore.getState().setAttachments(threadId, [
        {
          id: `ref-${tile.key}-${Date.now()}`,
          dataUri: tile.item.image?.uri ?? "",
          type: "image/png",
          name: tile.turn.prompt.slice(0, 32) || "reference.png",
          assetUri: assetId ? `asset://${assetId}` : undefined
        }
      ]);
      const mediaStore = useMediaGenerationStore.getState();
      mediaStore.setMode("image_edit");
      mediaStore.setThreadMode(threadId, "image_edit");
    },
    [threadId]
  );

  const handleOpenInSketch = useCallback(
    (tile: ImageTile) => {
      const assetId = tile.item.image?.asset_id;
      if (!assetId) {
        return;
      }
      // The tab bar shows only the open project's tabs, so the new tab
      // carries it; without one the click looked like a no-op.
      useWorkspaceTabsStore.getState().openForegroundTab({
        type: "image",
        ref: assetId,
        mode: "edit",
        title:
          tile.turn.prompt.slice(0, 40) || t("generationFeed.sketchTitle"),
        projectId: creationProjectId()
      });
    },
    [t]
  );

  if (turns.length === 0) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        sx={{
          width: "100%",
          height: "100%",
          pb: COMPOSER_CLEARANCE,
          px: PADDING.comfortable
        }}
      >
        <EmptyState
          icon={<ImageOutlinedIcon fontSize="large" />}
          title={t("generationFeed.imageEmptyTitle")}
          description={t("generationFeed.imageEmptyDescription")}
        />
      </FlexColumn>
    );
  }

  const renderTile = (tile: ImageTile, fallbackRatio: number) => {
    const src = srcByKey.get(tile.key);
    const assetId = tile.item.image?.asset_id;
    const modelLabel = tile.turn.mediaGeneration?.model;
    const resolutionLabel = tile.turn.mediaGeneration?.resolution;
    const ratio = naturalRatios[tile.key] ?? fallbackRatio;

    return (
      <Box
        key={tile.key}
        data-testid="image-generation-tile"
        sx={{
          position: "relative",
          flexGrow: ratio,
          flexShrink: ratio,
          flexBasis: `${Math.round(BASE_ROW_HEIGHT * ratio)}px`,
          aspectRatio: `${ratio}`,
          minWidth: 0,
          overflow: "hidden",
          "& .image-output": {
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            minHeight: 0,
            borderRadius: 0,
            background: "none"
          },
          "& .image-output > img, & .image-output > canvas": {
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: 0,
            display: "block"
          },
          "& .image-dimensions": {
            display: "none"
          },
          "& .image-view-actions": {
            top: (theme) => theme.spacing(PADDING.compact),
            right: (theme) => theme.spacing(PADDING.compact)
          },
          "&:hover .image-view-actions": {
            opacity: 1
          },
          "& .tile-overlay": {
            opacity: 0,
            transition: `opacity ${MOTION.fast}`
          },
          "&:hover .tile-overlay, &:focus-within .tile-overlay": {
            opacity: 1
          },
          // Touch screens have no hover, so the controls stay visible.
          "@media (hover: none)": {
            "& .tile-overlay": { opacity: 1 }
          }
        }}
      >
        {src ? (
          <ImageView
            source={src}
            onNaturalDimensions={(dims) => handleTileDimensions(tile.key, dims)}
          />
        ) : (
          <MagicGenerationFill />
        )}

        <FlexColumn
          justify="space-between"
          className="tile-overlay"
          sx={{
            position: "absolute",
            inset: 0,
            p: PADDING.compact,
            background: (theme) =>
              `linear-gradient(180deg, ${theme.vars.palette.c_scrim_soft} 0%, transparent 35%, transparent 55%, ${theme.vars.palette.c_scrim} 100%)`,
            pointerEvents: "none",
            zIndex: Z_INDEX.raised
          }}
        >
          <FlexRow gap={SPACING.micro} align="center" justify="flex-start">
            {modelLabel && (
              <Chip
                size="small"
                variant="filled"
                label={modelLabel}
                sx={OVERLAY_CONTROL_SX}
              />
            )}
            {resolutionLabel && (
              <Chip
                size="small"
                variant="filled"
                label={resolutionLabel}
                sx={OVERLAY_CONTROL_SX}
              />
            )}
          </FlexRow>

          <FlexColumn gap={SPACING.micro}>
            {tile.turn.prompt && (
              <TruncatedText
                maxLines={2}
                variant="caption"
                sx={{ color: "common.white", fontWeight: 500 }}
              >
                {tile.turn.prompt}
              </TruncatedText>
            )}

            <FlexRow
              gap={SPACING.micro}
              align="center"
              justify="flex-end"
              sx={{ pointerEvents: "auto" }}
            >
              {threadId && (
                <ToolbarIconButton
                  size="small"
                  tooltip={t("generationFeed.editImage")}
                  onClick={() => handleEdit(tile)}
                  sx={OVERLAY_CONTROL_SX}
                >
                  <AutoFixHighOutlinedIcon fontSize="small" />
                </ToolbarIconButton>
              )}
              {assetId && (
                <ToolbarIconButton
                  size="small"
                  tooltip={t("generationFeed.openInSketch")}
                  onClick={() => handleOpenInSketch(tile)}
                  sx={OVERLAY_CONTROL_SX}
                >
                  <BrushOutlinedIcon fontSize="small" />
                </ToolbarIconButton>
              )}
              {onResendFrom && (
                <ToolbarIconButton
                  size="small"
                  tooltip={t("generationFeed.rerun")}
                  onClick={() => onResendFrom(tile.turn.userMessage)}
                  sx={OVERLAY_CONTROL_SX}
                >
                  <ReplayIcon fontSize="small" />
                </ToolbarIconButton>
              )}
              {isCanvasAvailable && onAddOutputToCanvas && (
                <ToolbarIconButton
                  size="small"
                  tooltip={t("generationFeed.addToCanvas")}
                  onClick={() => onAddOutputToCanvas(tile.item)}
                  sx={OVERLAY_CONTROL_SX}
                >
                  <AddToPhotosOutlinedIcon fontSize="small" />
                </ToolbarIconButton>
              )}
            </FlexRow>
          </FlexColumn>
        </FlexColumn>
      </Box>
    );
  };

  return (
    <Box
      ref={scrollContainerRef}
      data-testid="image-generation-feed"
      sx={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        pb: COMPOSER_CLEARANCE
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          alignContent: "flex-start",
          gap: SPACING.micro,
          width: "100%"
        }}
      >
        {/* Turn order, oldest first: a failed or pending request sits where
            it was asked, not after every finished picture. */}
        {turns.map((turn) => {
          const fallbackRatio =
            numericAspectRatio(turn.mediaGeneration?.aspect_ratio) ??
            DEFAULT_NUMERIC_RATIO;
          const tileFlexSx = {
            flexGrow: fallbackRatio,
            flexShrink: fallbackRatio,
            flexBasis: `${Math.round(BASE_ROW_HEIGHT * fallbackRatio)}px`,
            aspectRatio: `${fallbackRatio}`,
            minWidth: 0
          };

          if (turn.isPending) {
            const count = Math.max(1, turn.mediaGeneration?.variations ?? 1);
            return Array.from({ length: count }, (_, idx) => (
              <Box
                key={`${turn.id}-pending-${idx}`}
                data-testid="image-generation-pending-tile"
                sx={{
                  position: "relative",
                  ...tileFlexSx
                }}
              >
                <MagicGenerationFill />
              </Box>
            ));
          }

          if (turn.imageOutputs.length > 0) {
            return turn.imageOutputs.map((item, idx) =>
              renderTile(
                { key: `${turn.id}-${idx}`, turn, item },
                fallbackRatio
              )
            );
          }

          if (turn.errorText) {
            return (
              <Surface
                key={`${turn.id}-error`}
                variant="outlined"
                sx={{
                  ...tileFlexSx,
                  p: PADDING.normal,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: SPACING.sm
                }}
              >
                <Text size="small" color="secondary">
                  {turn.errorText}
                </Text>
                {onResendFrom && (
                  <FlexRow justify="flex-end">
                    <ToolbarIconButton
                      size="small"
                      tooltip={t("generationFeed.rerun")}
                      onClick={() => onResendFrom(turn.userMessage)}
                    >
                      <ReplayIcon fontSize="small" />
                    </ToolbarIconButton>
                  </FlexRow>
                )}
              </Surface>
            );
          }
          return null;
        })}
      </Box>
    </Box>
  );
};

export default memo(ImageGenerationFeed);
