import React, { useEffect, useRef } from "react";

interface VideoPlayerProps {
  data: Uint8Array | string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ data }) => {
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
    <div className="video-container">
      <video ref={videoRef} controls />
    </div>
  );
};
