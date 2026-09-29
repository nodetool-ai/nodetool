"use client";
import React, { useRef } from "react";
import { useAutoplayInView } from "../lib/useAutoplayInView";

/** A muted, looping <video> that plays while it is on screen. */
export default function AutoplayVideo(
  props: React.VideoHTMLAttributes<HTMLVideoElement>
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useAutoplayInView(videoRef);
  return <video ref={videoRef} muted loop playsInline {...props} />;
}
