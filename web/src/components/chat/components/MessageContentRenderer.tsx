import React, { useCallback, useMemo, useRef } from "react";
import { MessageContent } from "../../../stores/ApiTypes";
import ImageView from "../../node/ImageView";
import ChatMarkdown from "../ChatMarkdown";
import AudioPlayer from "../../audio/AudioPlayer";

interface MessageContentRendererProps {
  content: MessageContent;
  renderTextContent: (text: string, index: number) => React.ReactNode;
  index: number;
}

export const MessageContentRenderer: React.FC<MessageContentRendererProps> = ({
  content,
  renderTextContent,
  index
}) => {
  const objectUrl = useCallback(
    (source: string | Uint8Array | undefined, type: string) => {
      if (!source) return undefined;
      if (typeof source === "string") return source;

      return URL.createObjectURL(new Blob([source], { type }));
    },
    []
  );
  const videoRef = useRef<HTMLVideoElement>(null);

  switch (content.type) {
    case "text":
      return <ChatMarkdown content={content.text ?? ""} />;
    case "image_url": {
      const resolvedImageUrl: string | undefined = objectUrl(
        content.image?.uri === ""
          ? (content.image?.data as Uint8Array)
          : content.image?.uri,
        "image/png"
      );
      return <ImageView source={resolvedImageUrl} />;
    }
    case "audio":
      return (
        <AudioPlayer
          source={
            content.audio?.uri === ""
              ? (content.audio?.data as Uint8Array)
              : content.audio?.uri
          }
        />
      );
    case "video": {
      const uri = objectUrl(
        content.video?.uri === ""
          ? (content.video?.data as Uint8Array)
          : content.video?.uri,
        "video/mp4"
      );
      return (
        <video ref={videoRef} controls style={{ width: "100%" }} src={uri} />
      );
    }
    case "document":
      return <div>Document</div>;
    default:
      return null;
  }
};
