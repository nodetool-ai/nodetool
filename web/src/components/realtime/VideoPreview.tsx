import { useEffect, useRef } from "react";

import { Card, FlexColumn, Text } from "../ui_primitives";

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
    <Card padding="normal" variant="outlined">
      <FlexColumn gap={2}>
        <Text weight={600}>{title}</Text>
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted={muted}
            playsInline
            style={{
              width: "100%",
              minHeight: 320,
              borderRadius: 8,
              background: "black",
              objectFit: "cover"
            }}
          />
        ) : (
          <Text color="secondary">{emptyText}</Text>
        )}
      </FlexColumn>
    </Card>
  );
};

export default VideoPreview;
