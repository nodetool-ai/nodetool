import React, { useEffect, useRef, memo } from "react";
import { playPcm16Base64 } from "./audio";

const StreamPcm16Player: React.FC<{
  base64: string;
  sampleRate?: number;
  channels?: number;
}> = ({ base64, sampleRate = 16000, channels = 1 }) => {
  const lastPlayedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      typeof base64 === "string" &&
      base64 &&
      base64 !== lastPlayedRef.current
    ) {
      try {
        playPcm16Base64(base64, { sampleRate, channels });
      } catch (e) {
        console.error("PCM16 chunk playback failed", e);
      }
      lastPlayedRef.current = base64;
    }
  }, [base64, sampleRate, channels]);
  return null;
};

export default memo(StreamPcm16Player);
