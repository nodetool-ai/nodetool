import { ogImage, ogSize, ogContentType } from "../../lib/og";

export const alt = "NodeTool for Developers";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage(
    "Your agent makes the media too",
    "Images, video, speech, and workflows for Claude Code, Codex, and Cursor.",
    { image: "screen_workflow.png", accent: "blue", eyebrow: "For developers" }
  );
}
