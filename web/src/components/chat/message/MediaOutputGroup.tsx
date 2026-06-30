/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AspectRatioIcon from "@mui/icons-material/CropOriginal";
import AppsIcon from "@mui/icons-material/Apps";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import TvIcon from "@mui/icons-material/Tv";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import SpeedIcon from "@mui/icons-material/Speed";
import TuneIcon from "@mui/icons-material/Tune";
import LayersIcon from "@mui/icons-material/Layers";
import AddToCanvasIcon from "@mui/icons-material/AddPhotoAlternate";
import {
  BORDER_RADIUS,
  FlexColumn,
  FlexRow,
  MOTION,
  Text,
  ToolbarIconButton,
  FONT_SIZE_SANS,
  SPACING,
  Z_INDEX,
  getSpacingPx
} from "../../ui_primitives";
import ImageView from "../../node/ImageView";
import type {
  Message,
  MessageContent
} from "../../../stores/ApiTypes";
import type { MediaGenerationRequest } from "../../../stores/MediaGenerationStore";
import {
  isAudioContent,
  isImageContent,
  isVideoContent
} from "./MediaOutputGroup.helpers";
import {
  useAddMediaToCanvas,
  type MediaContentBlock
} from "../../../hooks/handlers/useGenerationToCanvas";

const VIDEO_STYLE: React.CSSProperties = { width: "100%", height: "100%" };
const AUDIO_STYLE: React.CSSProperties = { width: "100%", padding: getSpacingPx(SPACING.lg) };

type ChatMessageWithMedia = Message & {
  media_generation?: MediaGenerationRequest | null;
};

interface MediaOutputGroupProps {
  message: ChatMessageWithMedia;
  mediaContents: MessageContent[];
}

const styles = (theme: Theme) =>
  css({
    width: "100%",
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 8,

    ".media-output-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      flexWrap: "wrap",
      color: theme.vars.palette.text.secondary
    },

    ".media-output-meta": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    },

    ".media-meta-chip": {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.pill,
      background: theme.vars.palette.c_overlay_subtle,
      color: theme.vars.palette.text.secondary,
      fontSize: FONT_SIZE_SANS.caption,
      "& svg": { fontSize: 14, opacity: 0.75 }
    },

    ".media-grid": {
      display: "grid",
      gap: 8,
      width: "100%",
      "&.count-1": { gridTemplateColumns: "1fr" },
      "&.count-2": { gridTemplateColumns: "1fr 1fr" },
      "&.count-3": {
        gridTemplateColumns: "1fr 1fr",
        "& > :nth-of-type(1)": { gridColumn: "1 / span 2" }
      },
      "&.count-4": { gridTemplateColumns: "1fr 1fr" },
      "&.count-many": {
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))"
      }
    },

    ".media-grid > *": {
      position: "relative",
      width: "100%",
      aspectRatio: "auto",
      borderRadius: BORDER_RADIUS.lg,
      overflow: "hidden",
      background: theme.vars.palette.grey[900]
    },

    ".media-grid img, .media-grid video": {
      width: "100%",
      height: "100%",
      display: "block",
      objectFit: "cover"
    },

    ".add-to-canvas-button": {
      position: "absolute",
      top: getSpacingPx(SPACING.xs),
      left: getSpacingPx(SPACING.xs),
      zIndex: Z_INDEX.dropdown,
      opacity: 0,
      transition: `opacity ${MOTION.normal}`,
      backgroundColor: "var(--palette-c_scrim)",
      color: "var(--palette-grey-0)",
      borderRadius: BORDER_RADIUS.sm,
      width: 24,
      height: 24,
      padding: getSpacingPx(SPACING.xs),
      "&:hover": {
        backgroundColor: "var(--palette-c_scrim_strong)"
      },
      "& svg": {
        fontSize: 14
      }
    },

    ".media-grid > *:hover .add-to-canvas-button": {
      opacity: 1
    },

    ".media-output-header:hover .add-all-button, .media-output-group:hover .add-all-button": {
      opacity: 1
    },

    ".add-all-button": {
      opacity: 0.6,
      transition: `opacity ${MOTION.normal}`
    }
  });

function titleFromPrompt(prompt: string | null | undefined): string {
  if (!prompt) return "Generated";
  const words = prompt.trim().split(/\s+/).slice(0, 4).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Renders the grouped output of a media-generation turn: a header with model
 * name, variation count, and resolution/aspect metadata plus a responsive
 * grid of the generated image / video blocks.
 */
const MediaOutputGroup: React.FC<MediaOutputGroupProps> = ({
  message,
  mediaContents
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const gen = message.media_generation ?? null;
  const { isCanvasAvailable, addBlocksToCanvas } = useAddMediaToCanvas();

  const addOne = useCallback(
    (block: MediaContentBlock) => addBlocksToCanvas([block]),
    [addBlocksToCanvas]
  );
  const addAll = useCallback(
    () =>
      addBlocksToCanvas(
        mediaContents.filter(
          (c): c is MediaContentBlock =>
            isImageContent(c) || isVideoContent(c) || isAudioContent(c)
        )
      ),
    [addBlocksToCanvas, mediaContents]
  );

  // Derive a title from the message prompt when possible
  const prompt = useMemo(() => {
    const content = message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const text = content.find((c) => c && (c as MessageContent).type === "text");
      if (text && (text as { text?: string }).text) {
        return (text as { text?: string }).text as string;
      }
    }
    return null;
  }, [message.content]);

  const title = titleFromPrompt(prompt);

  const count = mediaContents.length;
  const gridClass =
    count === 1
      ? "count-1"
      : count === 2
        ? "count-2"
        : count === 3
          ? "count-3"
          : count === 4
            ? "count-4"
            : "count-many";

  return (
    <div css={cssStyles} className="media-output-group">
      <div className="media-output-header">
        <FlexColumn gap={0.5} sx={{ minWidth: 0 }}>
          <Text size="normal" weight={600} truncate>
            {title}
          </Text>
          {prompt && prompt !== title && (
            <Text size="small" color="secondary" truncate>
              {prompt}
            </Text>
          )}
        </FlexColumn>
        <FlexRow className="media-output-meta" align="center">
          {gen?.model && (
            <span className="media-meta-chip">
              <AutoAwesomeIcon fontSize="small" />
              {gen.model}
            </span>
          )}
          {gen?.resolution && (
            <span className="media-meta-chip">
              <TvIcon fontSize="small" />
              {gen.resolution}
            </span>
          )}
          {gen?.aspect_ratio && (
            <span className="media-meta-chip">
              <AspectRatioIcon fontSize="small" />
              {gen.aspect_ratio}
            </span>
          )}
          {(gen?.mode === "image" || gen?.mode === "image_edit") &&
            typeof gen.variations === "number" && (
              <span className="media-meta-chip">
                <AppsIcon fontSize="small" />
                {gen.variations}
              </span>
            )}
          {(gen?.mode === "video" || gen?.mode === "image_to_video") &&
            typeof gen.duration === "number" && (
              <span className="media-meta-chip">
                <AccessTimeIcon fontSize="small" />
                {gen.duration}s
              </span>
            )}
          {gen?.mode === "image_edit" &&
            typeof gen.strength === "number" && (
              <span className="media-meta-chip">
                <TuneIcon fontSize="small" />
                {gen.strength.toFixed(2)}
              </span>
            )}
          {(gen?.mode === "image_edit" ||
            gen?.mode === "image_to_video") &&
            typeof gen.num_inference_steps === "number" && (
              <span className="media-meta-chip">
                <LayersIcon fontSize="small" />
                {gen.num_inference_steps} steps
              </span>
            )}
          {gen?.mode === "audio" && gen.voice && (
            <span className="media-meta-chip">
              <RecordVoiceOverIcon fontSize="small" />
              {gen.voice}
            </span>
          )}
          {gen?.mode === "audio" && typeof gen.speed === "number" && (
            <span className="media-meta-chip">
              <SpeedIcon fontSize="small" />
              {gen.speed}x
            </span>
          )}
          {isCanvasAvailable && mediaContents.length > 1 && (
            <ToolbarIconButton
              className="add-all-button"
              tooltip="Add all to canvas"
              size="small"
              onClick={addAll}
            >
              <AddToCanvasIcon fontSize="small" />
            </ToolbarIconButton>
          )}
        </FlexRow>
      </div>

      <div className={`media-grid ${gridClass}`}>
        {mediaContents.map((c, i) => {
          if (isImageContent(c)) {
            const src =
              c.image?.uri || (c.image?.data as string | undefined) || "";
            const key = c.image?.asset_id || c.image?.uri || `media-${i}`;
            return (
              <div key={key}>
                <ImageView source={src} />
                {isCanvasAvailable && (
                  <ToolbarIconButton
                    className="add-to-canvas-button"
                    tooltip="Add to canvas"
                    size="small"
                    onClick={() => addOne(c)}
                  >
                    <AddToCanvasIcon />
                  </ToolbarIconButton>
                )}
              </div>
            );
          }
          if (isVideoContent(c)) {
            const src = c.video?.uri || "";
            const key = c.video?.asset_id || c.video?.uri || `media-${i}`;
            return (
              <div key={key}>
                <video
                  src={src}
                  controls
                  preload="metadata"
                  playsInline
                  aria-label="Generated video"
                  style={VIDEO_STYLE}
                />
                {isCanvasAvailable && (
                  <ToolbarIconButton
                    className="add-to-canvas-button"
                    tooltip="Add to canvas"
                    size="small"
                    onClick={() => addOne(c)}
                  >
                    <AddToCanvasIcon />
                  </ToolbarIconButton>
                )}
              </div>
            );
          }
          if (isAudioContent(c)) {
            const src = c.audio?.uri || "";
            const key = c.audio?.asset_id || c.audio?.uri || `media-${i}`;
            return (
              <div key={key}>
                <audio
                  src={src}
                  controls
                  preload="metadata"
                  aria-label="Generated audio"
                  style={AUDIO_STYLE}
                />
                {isCanvasAvailable && (
                  <ToolbarIconButton
                    className="add-to-canvas-button"
                    tooltip="Add to canvas"
                    size="small"
                    onClick={() => addOne(c)}
                  >
                    <AddToCanvasIcon />
                  </ToolbarIconButton>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};

export default memo(MediaOutputGroup);
