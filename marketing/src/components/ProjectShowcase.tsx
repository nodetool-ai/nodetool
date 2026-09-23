"use client";
import React from "react";
import HeroDemoPlayer from "./HeroDemoPlayer";

export default function ProjectShowcase() {
  return (
    <div className="relative mx-auto max-w-5xl">
      <HeroDemoPlayer
        mediaBase="/agent-redo"
        priority={false}
        alt="The agent renders a six-shot SCRAPHEART storyboard. A one-line note sends shot 3 back for night, only that shot renders again, and the timeline cut picks up the new take."
      />
    </div>
  );
}
