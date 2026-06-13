import React, { useEffect, useRef } from "react";
import { playPcm16Base64, type PcmEncoding } from "./audio";

const StreamPcm16Player: React.FC<{
  base64: string;
  sampleRate?: number;
  channels?: number;
  encoding?: PcmEncoding;
}> = ({ base64, sampleRate = 16000, channels = 1, encoding = "pcm16le" }) => {
  const lastPlayedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      typeof base64 === "string" &&
      base64 &&
      base64 !== lastPlayedRef.current
    ) {
      try {
        playPcm16Base64(base64, { sampleRate, channels, encoding });
      } catch (e) {
        console.error("PCM16 chunk playback failed", e);
      }
      lastPlayedRef.current = base64;
    }
  }, [base64, sampleRate, channels, encoding]);
  return null;
};

export default StreamPcm16Player;
