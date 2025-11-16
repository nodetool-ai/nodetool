/** @jsxImportSource @emotion/react */
import React from "react";
import { Chunk } from "../../../stores/ApiTypes";
import Actions from "./Actions";
import { MaybeMarkdown } from "./markdown";
import { outputStyles } from "./styles";
import { useTheme } from "@mui/material/styles";
import ImageView from "../ImageView";
import StreamPcm16Player from "./StreamPcm16Player";

type Props = {
  chunk: Chunk;
  onCopy: (text: string) => void;
};

export const ChunkRenderer: React.FC<Props> = ({ chunk, onCopy }) => {
  const theme = useTheme();

  switch (chunk.content_type) {
    case "image":
      return <ImageView source={chunk.content} />;
    case "audio":
      return (
        <StreamPcm16Player
          base64={chunk.content as string}
          sampleRate={22000}
          channels={1}
        />
      );
    case "video":
      return (
        <video
          src={chunk.content as string}
          controls
          style={{ width: "100%" }}
        />
      );
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
              <Actions onCopy={() => onCopy(text)} />
              <MaybeMarkdown text={text} />
            </>
          )}
        </div>
      );
    }
  }
};
