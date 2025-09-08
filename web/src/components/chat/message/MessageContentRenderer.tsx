import React, { useCallback, useMemo, useRef, useEffect } from "react";
import { MessageContent } from "../../../stores/ApiTypes";
import ImageView from "../../node/ImageView";
import ChatMarkdown from "./ChatMarkdown";
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
  const objectUrlRef = useRef<string | null>(null);

  const createObjectUrl = useCallback(
    (source: string | Uint8Array | undefined, type: string): string | undefined => {
      if (!source) return undefined;
      if (typeof source === "string") return source;

      // Revoke previous object URL if it exists
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }

      // Create new object URL
      const newObjectUrl = URL.createObjectURL(new Blob([source], { type }));
      objectUrlRef.current = newObjectUrl;
      return newObjectUrl;
    },
    []
  );

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);

  switch (content.type) {
    case "text":
      return renderTextContent(content.text ?? "", index);
    case "image_url": {
      // If we have a valid URI, use it directly; otherwise create object URL from data
      const imageSource = content.image?.uri && content.image.uri !== "" 
        ? content.image.uri 
        : createObjectUrl(content.image?.data as Uint8Array, "image/png");
      return <ImageView source={imageSource} />;
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
      const uri = createObjectUrl(
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
