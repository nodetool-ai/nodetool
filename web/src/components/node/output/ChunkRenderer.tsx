/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Chunk } from "../../../stores/ApiTypes";
import Actions from "./Actions";
import { MaybeMarkdown } from "./markdown";
import { outputStyles } from "./styles";
import { useTheme } from "@mui/material/styles";
import ImageView from "../ImageView";
import StreamPcm16Player from "./StreamPcm16Player";
import { ToolCallRenderer } from "./ToolCallRenderer";
import { AgentStatusRenderer } from "./AgentStatusRenderer";
import { ToolbarIconButton } from "../../ui_primitives";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

type Props = {
  chunk: Chunk;
};

export const ChunkRenderer: React.FC<Props> = memo(({ chunk }) => {
  const theme = useTheme();
  const contentType = chunk.content_type;

  if (contentType === "html" as string) {
    return (
      <iframe
        srcDoc={(chunk.content as string) ?? ""}
        sandbox=""
        style={{ width: "100%", minHeight: 320, border: "none" }}
        title="HTML chunk output"
      />
    );
  }

  switch (chunk.content_type) {
    case "tool_call":
      return <ToolCallRenderer chunk={chunk} />;
    case "agent_status":
      return <AgentStatusRenderer chunk={chunk} />;
    case "image":
      return (
        <ImageView
          source={typeof chunk.content === "string" ? chunk.content : undefined}
        />
      );
    case "audio": {
      const meta = chunk.content_metadata;
      return (
        <StreamPcm16Player
          base64={chunk.content as string}
          sampleRate={(meta?.sample_rate as number | undefined) ?? 22000}
          channels={(meta?.channels as number | undefined) ?? 1}
          encoding={meta?.encoding === "f32le" ? "f32le" : "pcm16le"}
        />
      );
    }
    case "video": {
      const videoSrc = chunk.content as string;
      return (
        <div className="video-chunk-output" css={{ position: "relative" }}>
          <video
            src={videoSrc}
            controls
            // nodrag/nopan stop ReactFlow's drag from capturing the pointer so
            // the native controls (scrub, volume) get the mouse events.
            className="nodrag nopan"
            aria-label="Video output"
            style={{ width: "100%" }}
          />
          <ToolbarIconButton
            title="Open in new tab"
            size="small"
            onClick={() => {
              if (videoSrc) window.open(videoSrc, "_blank", "noopener,noreferrer");
            }}
            aria-label="Open video in new tab"
            sx={{ position: "absolute", top: 4, right: 4, zIndex: 10 }}
          >
            <OpenInNewIcon />
          </ToolbarIconButton>
        </div>
      );
    }
    case "document":
      return (
        <div className="output value" css={outputStyles(theme)}>
          <a href={chunk.content as string} target="_blank" rel="noreferrer">
            Open document
          </a>
        </div>
      );
    case "text":
    default: {
      const text = (chunk.content as string) ?? "";
      return (
        <div className="output value" css={outputStyles(theme)}>
          {text !== "" && (
            <>
              <Actions copyValue={text} />
              <MaybeMarkdown text={text} />
            </>
          )}
        </div>
      );
    }
  }
});

ChunkRenderer.displayName = "ChunkRenderer";
