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
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import ViewAgendaOutlinedIcon from "@mui/icons-material/ViewAgendaOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import ReplayIcon from "@mui/icons-material/Replay";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import AddToPhotosOutlinedIcon from "@mui/icons-material/AddToPhotosOutlined";
import VolumeUpOutlinedIcon from "@mui/icons-material/VolumeUpOutlined";

import {
  BORDER_RADIUS,
  Box,
  Chip,
  CopyButton,
  DeleteButton,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  MagicGenerationFill,
  PADDING,
  ResponsiveImage,
  Slider,
  SPACING,
  Surface,
  Text,
  ToggleGroup,
  ToggleOption,
  ToolbarIconButton,
  TruncatedText,
  VideoPlayer,
  Z_INDEX
} from "../../ui_primitives";
import type {
  Message,
  MessageContent,
  MessageVideoContent
} from "../../../stores/ApiTypes";
import useMediaGenerationStore from "../../../stores/MediaGenerationStore";
import { useChatDraftStore } from "../../../stores/ChatDraftStore";
import type { ChatStatus } from "../types/chat.types";
import {
  cssAspectRatio,
  extractGenerationTurns,
  type GenerationTurn
} from "./extractGenerationTurns";
import { COMPOSER_CLEARANCE, DEFAULT_ASPECT_RATIO } from "./generationLayout";

interface VideoGenerationFeedProps {
  messages: readonly Message[];
  status: ChatStatus;
  threadId?: string | null;
  onResendFrom?: (message: Message) => void;
  onRewindTo?: (message: Message) => void;
  onAddOutputToCanvas?: (content: MessageContent) => void;
  isCanvasAvailable?: boolean;
}

type VideoViewMode = "list" | "grid";

const VideoGenerationFeed: React.FC<VideoGenerationFeedProps> = ({
  messages,
  status,
  threadId,
  onResendFrom,
  onRewindTo,
  onAddOutputToCanvas,
  isCanvasAvailable = false
}) => {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<VideoViewMode>("list");
  const [tileSize, setTileSize] = useState<number>(360);

  const turns = useMemo(
    () => extractGenerationTurns(messages, status),
    [messages, status]
  );

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || turns.length === 0) {
      return;
    }
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [turns.length]);

  const handleUseVideoAsReference = useCallback(
    (turn: GenerationTurn, videoItem: MessageVideoContent) => {
      if (!threadId) {
        return;
      }
      const assetId = videoItem.video?.asset_id;
      const rawUri = videoItem.video?.uri ?? "";
      useChatDraftStore.getState().setAttachments(threadId, [
        {
          id: `vid-ref-${turn.id}-${Date.now()}`,
          dataUri: rawUri,
          type: "video/mp4",
          name: turn.prompt.slice(0, 32) || "clip.mp4",
          assetUri: assetId ? `asset://${assetId}` : undefined
        }
      ]);
      const mediaStore = useMediaGenerationStore.getState();
      mediaStore.setMode("extend");
      mediaStore.setThreadMode(threadId, "extend");
    },
    [threadId]
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
          icon={<VideocamOutlinedIcon fontSize="large" />}
          title={t("generationFeed.videoEmptyTitle")}
          description={t("generationFeed.videoEmptyDescription")}
        />
      </FlexColumn>
    );
  }

  return (
    <Box
      ref={scrollContainerRef}
      data-testid="video-generation-feed"
      sx={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        px: { xs: PADDING.compact, md: PADDING.comfortable },
        pt: PADDING.compact,
        pb: COMPOSER_CLEARANCE
      }}
    >
      <FlexRow
        align="center"
        justify="space-between"
        gap={SPACING.md}
        sx={{
          position: "sticky",
          top: 0,
          zIndex: Z_INDEX.sticky,
          py: PADDING.micro,
          mb: SPACING.md,
          bgcolor: "background.default",
          borderBottom: 1,
          borderColor: "divider"
        }}
      >
        <FlexRow align="center" gap={SPACING.xs}>
          <Chip
            size="small"
            variant="outlined"
            icon={<VideocamOutlinedIcon fontSize="small" />}
            label={t("generationFeed.history", { total: turns.length })}
          />
        </FlexRow>

        <FlexRow align="center" gap={SPACING.md}>
          {viewMode === "grid" && (
            <Box sx={{ width: 120 }}>
              <Slider
                size="small"
                min={240}
                max={540}
                step={20}
                value={tileSize}
                aria-label={t("generationFeed.tileSize")}
                onChange={(_e, val) => {
                  if (typeof val === "number") {
                    setTileSize(val);
                  }
                }}
              />
            </Box>
          )}

          <ToggleGroup
            segmented
            exclusive
            size="small"
            value={viewMode}
            onChange={(_e, next: VideoViewMode | null) => {
              if (next) {
                setViewMode(next);
              }
            }}
            aria-label={t("generationFeed.viewMode")}
          >
            <ToggleOption value="list" aria-label={t("generationFeed.list")}>
              <FlexRow align="center" gap={SPACING.micro}>
                <ViewAgendaOutlinedIcon fontSize="small" />
                <span>{t("generationFeed.list")}</span>
              </FlexRow>
            </ToggleOption>
            <ToggleOption value="grid" aria-label={t("generationFeed.grid")}>
              <FlexRow align="center" gap={SPACING.micro}>
                <GridViewOutlinedIcon fontSize="small" />
                <span>{t("generationFeed.grid")}</span>
              </FlexRow>
            </ToggleOption>
          </ToggleGroup>
        </FlexRow>
      </FlexRow>

      {viewMode === "list" ? (
        <FlexColumn gap={SPACING.lg} sx={{ maxWidth: 1280, mx: "auto" }}>
          {turns.map((turn) => {
            const gen = turn.mediaGeneration;
            const aspectRatio = cssAspectRatio(gen?.aspect_ratio) ?? DEFAULT_ASPECT_RATIO;
            const modelLabel = gen?.model || t("generationFeed.video");
            const durationLabel =
              typeof gen?.duration === "number" ? `${gen.duration}s` : null;
            const firstVideo = turn.videoOutputs[0];

            return (
              <Surface
                key={turn.id}
                data-testid="video-generation-card"
                variant="outlined"
                sx={{
                  borderRadius: BORDER_RADIUS.xl,
                  p: PADDING.normal,
                  display: "flex",
                  flexDirection: { xs: "column", md: "row" },
                  gap: SPACING.lg,
                  alignItems: "stretch"
                }}
              >
                <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: SPACING.sm
                  }}
                >
                  {turn.isPending ? (
                    <Box
                      data-testid="video-generation-pending"
                      sx={{
                        position: "relative",
                        width: "100%",
                        aspectRatio,
                        borderRadius: BORDER_RADIUS.lg,
                        overflow: "hidden"
                      }}
                    >
                      <MagicGenerationFill borderRadius={BORDER_RADIUS.lg} />
                    </Box>
                  ) : turn.videoOutputs.length > 0 ? (
                    turn.videoOutputs.map((vid, idx) => (
                      <Box
                        key={`${turn.id}-vid-${idx}`}
                        sx={{
                          width: "100%",
                          aspectRatio,
                          borderRadius: BORDER_RADIUS.lg,
                          overflow: "hidden",
                          bgcolor: "background.default"
                        }}
                      >
                        <VideoPlayer locator={vid.video} />
                      </Box>
                    ))
                  ) : (
                    <Surface
                      variant="outlined"
                      sx={{
                        p: PADDING.normal,
                        borderRadius: BORDER_RADIUS.lg,
                        width: "100%",
                        minHeight: 200,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <Text size="small" color="secondary">
                        {turn.errorText ||
                          t("generationFeed.noVideoOutput")}
                      </Text>
                    </Surface>
                  )}
                </Box>

                <FlexColumn
                  justify="space-between"
                  gap={SPACING.md}
                  sx={{
                    width: { xs: "100%", md: 320 },
                    flexShrink: 0,
                    borderLeft: { xs: 0, md: 1 },
                    borderTop: { xs: 1, md: 0 },
                    borderColor: "divider",
                    pl: { xs: 0, md: PADDING.normal },
                    pt: { xs: PADDING.compact, md: 0 }
                  }}
                >
                  <FlexColumn gap={SPACING.sm} sx={{ minHeight: 0, flex: 1 }}>
                    <FlexRow align="center" gap={SPACING.xs} wrap>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={modelLabel}
                      />
                    </FlexRow>

                    {turn.prompt && (
                      <Box
                        sx={{
                          maxHeight: 220,
                          overflowY: "auto",
                          pr: PADDING.micro
                        }}
                      >
                        <Text
                          size="small"
                          color="secondary"
                          sx={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}
                        >
                          {turn.prompt}
                        </Text>
                      </Box>
                    )}

                    {turn.referenceImages.length > 0 && (
                      <FlexRow gap={SPACING.xs} wrap>
                        {turn.referenceImages.map((refImg, idx) => (
                          <ResponsiveImage
                            key={`${turn.id}-ref-${idx}`}
                            locator={refImg.image}
                            alt={t("generationFeed.referenceAlt", { index: idx + 1 })}
                            aspectRatio="1 / 1"
                            fit="cover"
                            sx={{
                              width: 48,
                              height: 48,
                              borderRadius: BORDER_RADIUS.md,
                              border: 1,
                              borderColor: "divider"
                            }}
                          />
                        ))}
                      </FlexRow>
                    )}
                  </FlexColumn>

                  <FlexColumn gap={SPACING.sm}>
                    <FlexRow gap={SPACING.xs} wrap>
                      {gen?.resolution && (
                        <Chip
                          size="small"
                          variant="filled"
                          label={gen.resolution}
                        />
                      )}
                      {durationLabel && (
                        <Chip
                          size="small"
                          variant="filled"
                          label={durationLabel}
                        />
                      )}
                      {gen?.aspect_ratio && (
                        <Chip
                          size="small"
                          variant="filled"
                          label={gen.aspect_ratio}
                        />
                      )}
                      {gen?.use_reference_video_audio && (
                        <Chip
                          size="small"
                          variant="filled"
                          icon={<VolumeUpOutlinedIcon fontSize="small" />}
                          label={t("generationFeed.audio")}
                        />
                      )}
                    </FlexRow>

                    <FlexRow
                      align="center"
                      justify="space-between"
                      gap={SPACING.xs}
                      sx={{
                        pt: PADDING.micro,
                        borderTop: 1,
                        borderColor: "divider"
                      }}
                    >
                      <FlexRow align="center" gap={SPACING.xs}>
                        {onResendFrom && (
                          <EditorButton
                            size="small"
                            variant="text"
                            startIcon={<ReplayIcon fontSize="small" />}
                            onClick={() => onResendFrom(turn.userMessage)}
                          >
                            {t("generationFeed.rerun")}
                          </EditorButton>
                        )}
                        {firstVideo && (
                          <ToolbarIconButton
                            size="small"
                            tooltip={t("generationFeed.extendClip")}
                            onClick={() =>
                              handleUseVideoAsReference(turn, firstVideo)
                            }
                          >
                            <AutoFixHighOutlinedIcon fontSize="small" />
                          </ToolbarIconButton>
                        )}
                      </FlexRow>

                      <FlexRow align="center" gap={SPACING.micro}>
                        {turn.prompt && (
                          <CopyButton
                            value={turn.prompt}
                            tooltip={t("generationFeed.copyPrompt")}
                          />
                        )}
                        {isCanvasAvailable &&
                          onAddOutputToCanvas &&
                          firstVideo && (
                            <ToolbarIconButton
                              size="small"
                              tooltip={t("generationFeed.addToCanvas")}
                              onClick={() => onAddOutputToCanvas(firstVideo)}
                            >
                              <AddToPhotosOutlinedIcon fontSize="small" />
                            </ToolbarIconButton>
                          )}
                        {onRewindTo && (
                          <DeleteButton
                            onClick={() => onRewindTo(turn.userMessage)}
                            tooltip={t("generationFeed.removeFromThread")}
                          />
                        )}
                      </FlexRow>
                    </FlexRow>
                  </FlexColumn>
                </FlexColumn>
              </Surface>
            );
          })}
        </FlexColumn>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))`,
            gap: SPACING.md,
            width: "100%"
          }}
        >
          {turns.map((turn) => {
            const gen = turn.mediaGeneration;
            const aspectRatio = cssAspectRatio(gen?.aspect_ratio) ?? DEFAULT_ASPECT_RATIO;
            const firstVideo = turn.videoOutputs[0];
            const modelLabel = gen?.model || t("generationFeed.video");

            return (
              <Surface
                key={turn.id}
                data-testid="video-generation-card"
                variant="outlined"
                sx={{
                  borderRadius: BORDER_RADIUS.lg,
                  p: PADDING.compact,
                  display: "flex",
                  flexDirection: "column",
                  gap: SPACING.sm
                }}
              >
                {turn.isPending ? (
                  <Box
                    data-testid="video-generation-pending"
                    sx={{
                      position: "relative",
                      width: "100%",
                      aspectRatio,
                      borderRadius: BORDER_RADIUS.md,
                      overflow: "hidden"
                    }}
                  >
                    <MagicGenerationFill borderRadius={BORDER_RADIUS.md} />
                  </Box>
                ) : firstVideo ? (
                  <Box
                    sx={{
                      width: "100%",
                      aspectRatio,
                      borderRadius: BORDER_RADIUS.md,
                      overflow: "hidden",
                      bgcolor: "background.default"
                    }}
                  >
                    <VideoPlayer locator={firstVideo.video} />
                  </Box>
                ) : (
                  <Surface
                    variant="outlined"
                    sx={{
                      p: PADDING.compact,
                      borderRadius: BORDER_RADIUS.md,
                      minHeight: 160
                    }}
                  >
                    <Text size="small" color="secondary">
                      {turn.errorText ||
                        t("generationFeed.noVideoOutput")}
                    </Text>
                  </Surface>
                )}

                <FlexRow align="center" justify="space-between" gap={SPACING.xs}>
                  <Chip size="small" variant="outlined" label={modelLabel} />
                  <FlexRow align="center" gap={SPACING.micro}>
                    {onResendFrom && (
                      <ToolbarIconButton
                        size="small"
                        tooltip={t("generationFeed.rerun")}
                        onClick={() => onResendFrom(turn.userMessage)}
                      >
                        <ReplayIcon fontSize="small" />
                      </ToolbarIconButton>
                    )}
                    {turn.prompt && (
                      <CopyButton
                        value={turn.prompt}
                        tooltip={t("generationFeed.copyPrompt")}
                      />
                    )}
                  </FlexRow>
                </FlexRow>

                {turn.prompt && (
                  <TruncatedText maxLines={2} variant="caption" color="text.secondary">
                    {turn.prompt}
                  </TruncatedText>
                )}
              </Surface>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default memo(VideoGenerationFeed);
