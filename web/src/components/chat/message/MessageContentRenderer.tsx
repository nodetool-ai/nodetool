/** @jsxImportSource @emotion/react */
import React, { useCallback, useRef, useEffect, useMemo } from "react";
import { css } from "@emotion/react";
import AddToCanvasIcon from "@mui/icons-material/AddPhotoAlternate";
import { MessageContent } from "../../../stores/ApiTypes";
import ImageView from "../../node/ImageView";
import AudioPlayer from "../../audio/AudioPlayer";
import {
  BORDER_RADIUS,
  MOTION,
  SPACING,
  ToolbarIconButton,
  Z_INDEX,
  getSpacingPx
} from "../../ui_primitives";
import {
  useAddMediaToCanvas,
  type MediaContentBlock
} from "../../../hooks/handlers/useGenerationToCanvas";
import { serializeDragData } from "../../../lib/dragdrop";
import {
  parseHarmonyContent,
  hasHarmonyTokens,
  getDisplayContent
} from "../utils/harmonyUtils";

interface MessageContentRendererProps {
  content: MessageContent;
  renderTextContent: (text: string, index: number) => React.ReactNode;
  index: number;
}

const wrapperStyles = css({
  position: "relative",
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
  "&:hover .add-to-canvas-button": {
    opacity: 1
  }
});

export const MessageContentRenderer: React.FC<MessageContentRendererProps> = React.memo(({
  content,
  renderTextContent,
  index
}) => {
  const objectUrlRef = useRef<string | null>(null);
  const { isCanvasAvailable, addBlocksToCanvas } = useAddMediaToCanvas();

  const createObjectUrl = useCallback(
    (
      source: string | Uint8Array | undefined,
      type: string
    ): string | undefined => {
      if (!source) {
        return undefined;
      }
      if (typeof source === "string") {
        return source;
      }

      // Revoke previous object URL if it exists
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }

      // Create new object URL
      const newObjectUrl = URL.createObjectURL(new Blob([source as BlobPart], { type }));
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

  // Memoize video style to prevent recreation on every render
  const videoStyle = useMemo(() => ({ width: "100%" }), []);

  const handleAddToCanvas = useCallback(() => {
    addBlocksToCanvas([content as MediaContentBlock]);
  }, [addBlocksToCanvas, content]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      serializeDragData(
        { type: "chat-media", payload: content as MediaContentBlock },
        e.dataTransfer
      );
      e.dataTransfer.effectAllowed = "copy";
    },
    [content]
  );

  const dragProps = isCanvasAvailable
    ? { draggable: true, onDragStart: handleDragStart }
    : {};

  const addButton = isCanvasAvailable ? (
    <ToolbarIconButton
      className="add-to-canvas-button"
      tooltip="Add to canvas"
      size="small"
      onClick={handleAddToCanvas}
    >
      <AddToCanvasIcon />
    </ToolbarIconButton>
  ) : null;

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
              {messages.map((message, i) => {
                const messageKey = `${index}-${i}-${message.role}-${message.content.length}`;
                return (
                  <React.Fragment key={messageKey}>
                    {renderTextContent(getDisplayContent(message), index + i)}
                  </React.Fragment>
                );
              })}
              {rawText && renderTextContent(rawText, index + messages.length)}
            </>
          );
        }
      }

      // If no Harmony tokens or parsing failed, render as regular text
      return renderTextContent(textContent, index);
    }
    case "image_url": {
      // Handle image content. MessageImageContent uses "image_url" type
      // (Python-style) and carries an ImageRef under `image`. Both the
      // user-uploaded images and images produced by the media-generation
      // pipeline arrive through this branch.
      let imageSource: string | Uint8Array | undefined;

      if (content.image?.data) {
        imageSource = content.image.data as Uint8Array;
      } else if (content.image?.uri) {
        imageSource = content.image.uri;
      } else {
        return <div>Error: No image source available</div>;
      }

      return (
        <div css={wrapperStyles} {...dragProps}>
          <ImageView source={imageSource} />
          {addButton}
        </div>
      );
    }
    case "audio":
      // Handle audio content in Harmony format
      return (
        <div css={wrapperStyles} {...dragProps}>
          <AudioPlayer
            source={
              content.audio?.uri === ""
                ? (content.audio?.data as Uint8Array)
                : content.audio?.uri
            }
          />
          {addButton}
        </div>
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
        <div css={wrapperStyles} {...dragProps}>
          <video ref={videoRef} controls style={videoStyle} src={uri} aria-label="Video content" />
          {addButton}
        </div>
      );
    }
    case "document":
      // Handle document content in Harmony format
      return <div>Document</div>;
    default:
      return null;
  }
});

MessageContentRenderer.displayName = "MessageContentRenderer";
