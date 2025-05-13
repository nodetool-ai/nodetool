import React, { useEffect, useRef } from "react";
import { Box } from "@chakra-ui/react";

interface VideoPlayerProps {
  data: Uint8Array | string;
  className?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  data,
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const url =
      data instanceof Uint8Array
        ? URL.createObjectURL(new Blob([data], { type: "video/mp4" }))
        : data;

    if (videoRef.current) {
      videoRef.current.src = url;
    }

    return () => {
      if (data instanceof Uint8Array) {
        URL.revokeObjectURL(url);
      }
    };
  }, [data]);

  return (
    <Box
      className={
        className ? `video-player-root ${className}` : "video-player-root"
      }
      width="100%"
      position="relative"
      paddingTop="56.25%"
      bg="gray.800"
      borderRadius="lg"
      boxShadow="md"
      overflow="hidden"
    >
      <video
        ref={videoRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          borderRadius: "8px",
        }}
        controls
      />
    </Box>
  );
};
