/**
 * Hero stage 1 — the sentence that starts the project.
 *
 * A brief goes in, the agent picks the shape (a six-shot teaser), writes the
 * board, and hands off to the storyboard surface where the stills land. It
 * ends on the hand-off deliberately: `heroStoryboardCast` picks the same
 * session up on the board itself.
 */
import {
  assistantStart,
  assistantStream,
  status,
  toolMessage,
  userMessage
} from "../chat/chatCastHelpers";
import type { ChatDemoCast } from "../chat/chatCastTypes";
import { HERO_BRIEF, HERO_MODEL, HERO_SHOTS, HERO_TITLE, at } from "./shared";

const PLAN = [
  "Six shots, twelve seconds. ",
  "Opening on the blower, out on the getaway — ",
  "blown-out sun, dust in every frame, 35 mm. ",
  "Writing the board:"
];

const HANDOFF = [
  "Board is up: **six shots**, cut order locked. ",
  "Rendering a still for each one now — ",
  "cheap frames first, so we only pay for video on shots that work."
];

export const heroBriefCast: ChatDemoCast = {
  version: 1,
  kind: "chat",
  id: "hero-brief",
  name: "Hero — describe the project",
  description:
    "One sentence describes SCRAPHEART; the agent picks the shape and writes the six-shot board.",
  createdAt: "2026-08-24T10:00:00.000Z",
  durationMs: 12000,
  fps: 30,
  model: HERO_MODEL,
  events: [
    status(0, "connected"),
    userMessage(300, HERO_BRIEF),
    status(800, "streaming"),

    assistantStart(
      1500,
      "hero-1",
      [
        {
          id: "hero-call-board",
          name: "create_storyboard",
          args: { title: HERO_TITLE, aspect_ratio: "16:9", shots: 6 }
        }
      ],
      at(0)
    ),
    toolMessage(2700, "hero-call-board", "create_storyboard", "sb_scrapheart", at(1180)),
    ...assistantStream("hero-1", PLAN, 3000, 2600),

    assistantStart(
      6000,
      "hero-2",
      [
        {
          id: "hero-call-shots",
          name: "edit_storyboard",
          message: "Writing six shots with framing, motion and length",
          args: {
            storyboard_id: "sb_scrapheart",
            ops: HERO_SHOTS.map((s) => ({
              op: "add_shot",
              slug: s.slug,
              action: s.action,
              camera: { framing: s.framing, movement: s.movement },
              duration_seconds: s.seconds
            }))
          }
        }
      ],
      at(6000)
    ),
    toolMessage(
      7400,
      "hero-call-shots",
      "edit_storyboard",
      `${HERO_SHOTS.length} shots written`,
      at(7350)
    ),
    ...assistantStream("hero-2", HANDOFF, 7700, 3600),
    status(11600, "connected")
  ]
};
