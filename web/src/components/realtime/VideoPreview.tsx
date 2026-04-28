import { useEffect, useRef } from "react";

import { Card, FlexColumn, Text } from "../ui_primitives";
import { realtimeCardSx, realtimePreviewPaneSx } from "./realtimeStyles";

interface VideoPreviewProps {
  stream: MediaStream | null;
  title?: string;
  emptyText?: string;
  muted?: boolean;
}

const VideoPreview = ({
  stream,
  title = "Local Camera Preview",
  emptyText = "Start the preview to prepare a local video source for the realtime session.",
  muted = true
}: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <Card
      padding="normal"
      variant="outlined"
      sx={realtimeCardSx}
    >
      <FlexColumn gap={1.5}>
        <Text weight={600}>{title}</Text>
        <FlexColumn sx={realtimePreviewPaneSx}>
          {stream ? (
            <video
              ref={videoRef}
              autoPlay
              muted={muted}
              playsInline
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 0,
                background: "black",
                objectFit: "cover"
              }}
            />
          ) : (
            <Text color="secondary" align="center">
              {emptyText}
            </Text>
          )}
        </FlexColumn>
      </FlexColumn>
    </Card>
  );
};

export default VideoPreview;
