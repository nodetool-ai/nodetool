/** @jsxImportSource @emotion/react */
import React, { memo, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import GraphicEqOutlinedIcon from "@mui/icons-material/GraphicEqOutlined";
import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";
import ReplayIcon from "@mui/icons-material/Replay";
import AddToPhotosOutlinedIcon from "@mui/icons-material/AddToPhotosOutlined";

import {
  AudioPlayback,
  BORDER_RADIUS,
  Box,
  Chip,
  CopyButton,
  DeleteButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  Label,
  MagicGenerationFill,
  PADDING,
  SPACING,
  Surface,
  Text,
  ToolbarIconButton,
  TruncatedText
} from "../../ui_primitives";
import type { Message, MessageContent } from "../../../stores/ApiTypes";
import type { ChatStatus } from "../types/chat.types";
import {
  extractGenerationTurns,
  type GenerationTurn
} from "./extractGenerationTurns";
import { COMPOSER_CLEARANCE } from "./generationLayout";

interface AudioGenerationFeedProps {
  messages: readonly Message[];
  status: ChatStatus;
  onResendFrom?: (message: Message) => void;
  onRewindTo?: (message: Message) => void;
  onAddOutputToCanvas?: (content: MessageContent) => void;
  isCanvasAvailable?: boolean;
}

function formatDateHeader(isoDate: string | null, fallbackLabel: string): string {
  if (!isoDate) {
    return fallbackLabel;
  }
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return fallbackLabel;
  }
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

const AudioGenerationFeed: React.FC<AudioGenerationFeedProps> = ({
  messages,
  status,
  onResendFrom,
  onRewindTo,
  onAddOutputToCanvas,
  isCanvasAvailable = false
}) => {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const turns = useMemo(
    () => extractGenerationTurns(messages, status),
    [messages, status]
  );

  const groupedByDate = useMemo(() => {
    const groups: Array<{ dateLabel: string; items: GenerationTurn[] }> = [];
    const fallbackLabel = t("generationFeed.recent");
    for (const turn of turns) {
      const label = formatDateHeader(turn.createdAt, fallbackLabel);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.dateLabel === label) {
        lastGroup.items.push(turn);
      } else {
        groups.push({ dateLabel: label, items: [turn] });
      }
    }
    return groups;
  }, [t, turns]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || turns.length === 0) {
      return;
    }
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [turns.length]);

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
          icon={<GraphicEqOutlinedIcon fontSize="large" />}
          title={t("generationFeed.audioEmptyTitle")}
          description={t("generationFeed.audioEmptyDescription")}
        />
      </FlexColumn>
    );
  }

  return (
    <Box
      ref={scrollContainerRef}
      data-testid="audio-generation-feed"
      sx={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        px: { xs: PADDING.compact, md: PADDING.spacious },
        pt: PADDING.normal,
        pb: COMPOSER_CLEARANCE
      }}
    >
      <FlexColumn gap={SPACING.lg} sx={{ maxWidth: 1120, mx: "auto" }}>
        {groupedByDate.map((group) => (
          <FlexColumn key={group.dateLabel} gap={SPACING.sm}>
            <Label
              size="normal"
              sx={{
                px: PADDING.micro,
                color: "text.primary",
                fontWeight: 600
              }}
            >
              {group.dateLabel}
            </Label>

            <FlexColumn gap={SPACING.sm}>
              {group.items.map((turn) => {
                const gen = turn.mediaGeneration;
                const isMusic = gen?.mode === "music";
                const modelLabel =
                  gen?.model ||
                  (isMusic
                    ? t("generationFeed.music")
                    : t("generationFeed.speech"));
                const firstAudio = turn.audioOutputs[0];

                return (
                  <Surface
                    key={turn.id}
                    data-testid="audio-generation-row"
                    variant="outlined"
                    sx={{
                      borderRadius: BORDER_RADIUS.xl,
                      p: PADDING.normal,
                      display: "flex",
                      flexDirection: { xs: "column", md: "row" },
                      alignItems: { xs: "stretch", md: "center" },
                      gap: SPACING.md
                    }}
                  >
                    <FlexRow
                      align="center"
                      gap={SPACING.sm}
                      sx={{
                        width: { xs: "100%", md: 240 },
                        flexShrink: 0,
                        minWidth: 0
                      }}
                    >
                      <Surface
                        variant="outlined"
                        sx={{
                          borderRadius: BORDER_RADIUS.md,
                          width: 40,
                          height: 40,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "text.secondary"
                        }}
                      >
                        {isMusic ? (
                          <MusicNoteOutlinedIcon fontSize="small" />
                        ) : (
                          <GraphicEqOutlinedIcon fontSize="small" />
                        )}
                      </Surface>

                      <FlexColumn sx={{ minWidth: 0, flex: 1 }}>
                        <TruncatedText
                          variant="body2"
                          sx={{ fontWeight: 600, color: "text.primary" }}
                        >
                          {modelLabel}
                        </TruncatedText>
                        <TruncatedText variant="caption" color="text.secondary">
                          {turn.prompt ||
                            t("generationFeed.untitledTrack")}
                        </TruncatedText>
                      </FlexColumn>
                    </FlexRow>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {turn.isPending ? (
                        <Box
                          data-testid="audio-generation-pending"
                          sx={{
                            position: "relative",
                            width: "100%",
                            height: 44,
                            borderRadius: BORDER_RADIUS.md,
                            overflow: "hidden"
                          }}
                        >
                          <MagicGenerationFill borderRadius={BORDER_RADIUS.md} />
                        </Box>
                      ) : turn.audioOutputs.length > 0 ? (
                        <FlexColumn gap={SPACING.xs}>
                          {turn.audioOutputs.map((aud, idx) => (
                            <AudioPlayback
                              key={`${turn.id}-aud-${idx}`}
                              locator={aud.audio}
                            />
                          ))}
                        </FlexColumn>
                      ) : (
                        <Text size="small" color="secondary">
                          {turn.errorText ||
                            t("generationFeed.noAudioOutput")}
                        </Text>
                      )}
                    </Box>

                    <FlexRow
                      align="center"
                      justify="flex-end"
                      gap={SPACING.xs}
                      sx={{ flexShrink: 0 }}
                    >
                      {gen?.voice && !isMusic && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={gen.voice}
                        />
                      )}
                      {typeof gen?.speed === "number" &&
                        gen.speed !== 1 &&
                        !isMusic && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${gen.speed}x`}
                          />
                        )}
                      {typeof gen?.duration === "number" && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`${gen.duration}s`}
                        />
                      )}

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

                      {isCanvasAvailable &&
                        onAddOutputToCanvas &&
                        firstAudio && (
                          <ToolbarIconButton
                            size="small"
                            tooltip={t("generationFeed.addToCanvas")}
                            onClick={() => onAddOutputToCanvas(firstAudio)}
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
                  </Surface>
                );
              })}
            </FlexColumn>
          </FlexColumn>
        ))}
      </FlexColumn>
    </Box>
  );
};

export default memo(AudioGenerationFeed);
