"use client";
import React from "react";

export function MediaOutput({ type, src, alt = "Output", className = "" }: { type: "image" | "audio" | "video"; src: string; alt?: string; className?: string }) {
  if (type === "image") return <img src={src} alt={alt} className={`w-full rounded ${className}`} style={{ imageRendering: "pixelated" }} />;
  if (type === "audio") return <audio controls src={src} className={`w-full ${className}`} />;
  return <video controls src={src} className={`w-full rounded ${className}`} />;
}
