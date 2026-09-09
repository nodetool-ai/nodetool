"use client";
import React from "react";
import HeroDemoPlayer from "./HeroDemoPlayer";

export default function ProjectShowcase() {
  return (
    <div className="relative mx-auto max-w-5xl">
      <HeroDemoPlayer
        mediaBase="/conversation-project"
        priority={false}
        alt="A conversation becomes a SCRAPHEART storyboard, six keyframes, an editable cut, and a saved project."
      />
    </div>
  );
}
