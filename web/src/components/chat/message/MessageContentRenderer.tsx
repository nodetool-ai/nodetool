import React, { useCallback, useMemo, useRef, useEffect } from "react";
import { MessageContent } from "../../../stores/ApiTypes";
import ImageView from "../../node/ImageView";
import ChatMarkdown from "./ChatMarkdown";
import AudioPlayer from "../../audio/AudioPlayer";
import { parseHarmonyContent, hasHarmonyTokens, getDisplayContent } from "../utils/harmonyUtils";

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
      if (!source) {return undefined;}
      if (typeof source === "string") {return source;}

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

  // Render content according to Harmony format
  switch (content.type) {
    case "text": {
      const textContent = content.text ?? "";
      
      // Check if the text content contains Harmony format tokens
      if (hasHarmonyTokens(textContent)) {
        const { messages, rawText } = parseHarmonyContent(textContent);
        
        // If we have parsed Harmony messages, render them
        if (messages.length > 0) {
          return (
            <>
              {messages.map((message, i) => (
                <React.Fragment key={i}>
                  {renderTextContent(getDisplayContent(message), index + i)}
                </React.Fragment>
              ))}
              {rawText && renderTextContent(rawText, index + messages.length)}
            </>
          );
        }
      }
      
      // If no Harmony tokens or parsing failed, render as regular text
      return renderTextContent(textContent, index);
    }
    case "image_url": {
      // Handle image content in Harmony format
      const imageSource = content.image?.uri && content.image.uri !== "" 
        ? content.image.uri 
        : createObjectUrl(content.image?.data as Uint8Array, "image/png");
      return <ImageView source={imageSource} />;
    }
    case "audio":
      // Handle audio content in Harmony format
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
      // Handle video content in Harmony format
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
      // Handle document content in Harmony format
      return <div>Document</div>;
    default:
      return null;
  }
};
