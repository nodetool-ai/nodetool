/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AspectRatioIcon from "@mui/icons-material/CropOriginal";
import AppsIcon from "@mui/icons-material/Apps";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import TvIcon from "@mui/icons-material/Tv";
import { FlexColumn, FlexRow, Text } from "../../ui_primitives";
import ImageView from "../../node/ImageView";
import type {
  Message,
  MessageContent,
  MessageImageContent,
  MessageVideoContent
} from "../../../stores/ApiTypes";
import type { MediaGenerationRequest } from "../../../stores/MediaGenerationStore";

type ChatMessageWithMedia = Message & {
  media_generation?: MediaGenerationRequest | null;
};

interface MediaOutputGroupProps {
  message: ChatMessageWithMedia;
  mediaContents: MessageContent[];
}

function isImageContent(c: MessageContent): c is MessageImageContent {
  return c.type === "image_url";
}

function isVideoContent(c: MessageContent): c is MessageVideoContent {
  return c.type === "video";
}

/**
 * Returns true if the content array is purely image + video media blocks —
 * i.e. the kind of output produced by a media generation turn.
 */
export function isMediaOnlyContent(content: unknown): boolean {
  if (!Array.isArray(content) || content.length === 0) {
    return false;
  }
  return content.every(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      (isImageContent(c as MessageContent) || isVideoContent(c as MessageContent))
  );
}

const styles = (theme: Theme) =>
  css({
    width: "100%",
    borderRadius: 14,
    backgroundColor: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,

    ".media-output-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
      color: theme.vars.palette.text.secondary
    },

    ".media-output-meta": {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap"
    },

    ".media-meta-chip": {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 8px",
      borderRadius: 999,
      background: "rgba(255,255,255,0.04)",
      color: theme.vars.palette.text.secondary,
      fontSize: 12,
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
      width: "100%",
      aspectRatio: "auto",
      borderRadius: 10,
      overflow: "hidden",
      background: theme.vars.palette.grey[900]
    },

    ".media-grid img, .media-grid video": {
      width: "100%",
      height: "100%",
      display: "block",
      objectFit: "cover"
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
  const gen = message.media_generation ?? null;

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
    <div css={styles(theme)} className="media-output-group">
      <div className="media-output-header">
        <FlexColumn gap={0.25} sx={{ minWidth: 0 }}>
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
          {gen?.mode === "image" && typeof gen.variations === "number" && (
            <span className="media-meta-chip">
              <AppsIcon fontSize="small" />
              {gen.variations}
            </span>
          )}
          {gen?.mode === "video" && typeof gen.duration === "number" && (
            <span className="media-meta-chip">
              <AccessTimeIcon fontSize="small" />
              {gen.duration}s
            </span>
          )}
        </FlexRow>
      </div>

      <div className={`media-grid ${gridClass}`}>
        {mediaContents.map((c, i) => {
          if (isImageContent(c)) {
            const src =
              c.image?.uri || (c.image?.data as string | undefined) || "";
            return (
              <div key={`media-${i}`}>
                <ImageView source={src} />
              </div>
            );
          }
          if (isVideoContent(c)) {
            const src = c.video?.uri || "";
            return (
              <div key={`media-${i}`}>
                <video
                  src={src}
                  controls
                  preload="metadata"
                  playsInline
                  style={{ width: "100%", height: "100%" }}
                />
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
