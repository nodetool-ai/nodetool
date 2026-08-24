/**
 * "Go" — the clips render, the timeline assembles, and the agent hands back
 * the finished teaser plus every document it made on the way. The screenshot
 * is the payoff frame: the chat did not leave a transcript, it left a
 * storyboard, a timeline and a workflow you can open.
 */
import {
  assistantStart,
  assistantStream,
  status,
  toolMessage,
  userMessage,
} from "../chatCastHelpers";
import type { ChatDemoCast } from "../chatCastTypes";
import { ASSETS, MARKETING_CHAT_MODEL, at } from "./shared";

const ASSEMBLING = ["All six landed clean. Assembling the timeline:"];

const DONE = [
  "Done — the teaser is cut:\n\n",
  `![SCRAPHEART teaser cut](${ASSETS}/teaser.mp4)\n\n`,
  "**What got built**, start to finish:\n\n",
  "1. [SCRAPHEART — Desert Chase (Teaser)](storyboard://sb_scrapheart) — 6-shot ",
  "descent: dead engine → the chain → the rollover → the bike → the cut → the ",
  "getaway.\n",
  "2. Six clips on **Gemini Omni Flash**, image-to-video off each approved keyframe, ",
  "with synced engine and wind audio.\n",
  "3. [SCRAPHEART teaser cut](timeline://tl_scrapheart) — 1920×1080, 24s, six clips ",
  "with 4-frame dissolves and a hard cut on the last.\n",
  "4. [Render SCRAPHEART shots](workflow://wf_scrapheart_render) — the render step ",
  "saved as a reusable workflow. Swap the storyboard and it runs on the next film.\n\n",
  "**Spent: $3.06** of the $3.00 estimate — one shot re-rendered at 5s instead of 4s.\n\n",
  "Open the timeline to trim it, or say the word and I will cut a 9:16 version for ",
  "social off the same clips.",
];

export const deliveredCast: ChatDemoCast = {
  version: 1,
  kind: "chat",
  id: "chat-trailer-delivered",
  name: "The finished teaser",
  description:
    "The clips render, the timeline assembles, and every document the agent made comes back as a link.",
  createdAt: "2026-08-24T10:00:00.000Z",
  durationMs: 15000,
  fps: 30,
  model: MARKETING_CHAT_MODEL,
  events: [
    status(0, "connected"),
    userMessage(200, "proceed with Omni Flash"),
    status(500, "streaming"),

    assistantStart(
      800,
      "done-1",
      [
        {
          id: "done-call-1",
          name: "render_storyboard_clips",
          message: "Rendering six clips on Gemini Omni Flash",
          args: { storyboard_id: "sb_scrapheart", model: "fal-ai/gemini-omni-flash" },
        },
      ],
      at(0)
    ),
    toolMessage(
      2600,
      "done-call-1",
      "render_storyboard_clips",
      "6 of 6 clips rendered · 24.0s total",
      at(96000)
    ),

    assistantStart(
      3000,
      "done-2",
      [
        {
          id: "done-call-2",
          name: "assemble_storyboard_timeline",
          message: "Assembling clips into a timeline sequence",
          args: { storyboard_id: "sb_scrapheart", name: "SCRAPHEART teaser cut" },
        },
      ],
      at(3000)
    ),
    toolMessage(
      3400,
      "done-call-2",
      "assemble_storyboard_timeline",
      "timeline://tl_scrapheart · 6 clips",
      at(3492)
    ),
    ...assistantStream("done-2", ASSEMBLING, 3700, 900),

    assistantStart(
      4800,
      "done-3",
      [
        {
          id: "done-call-3",
          name: "validate_timeline",
          message: "Validating the timeline and saving project state",
          args: { timeline_id: "tl_scrapheart" },
        },
      ],
      at(4800)
    ),
    toolMessage(
      5200,
      "done-call-3",
      "validate_timeline",
      "ok — no issues",
      at(5074)
    ),

    ...assistantStream("done-3", DONE, 5500, 8000),
    status(13800, "connected"),
  ],
};
