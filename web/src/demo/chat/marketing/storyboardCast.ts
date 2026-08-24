/**
 * "Build something cool" — the agent picks a teaser, creates a storyboard,
 * renders a keyframe per shot, and lays the six of them out as a contact
 * sheet. The screenshot is the "it does the work, in the open" frame: a chain
 * of tool cards with the agent's own reasoning between them, ending in
 * something you can actually look at.
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

const PITCH = [
  "Let's do it. My pick: a cinematic teaser for a fictional chase film — ",
  "**\"SCRAPHEART: Nothing Left to Lose\"** — built as a real storyboard with ",
  "AI-rendered keyframes. It exercises generation, critique and assembly, and ",
  "ends with something you can watch. Building the board now:",
];

const SHOTS_DONE = [
  "Six shots are on the board. Now picking an image model and rendering the ",
  "keyframes — one call per shot, in parallel:",
];

const SHEET = [
  "All six rendered clean. Here they are as one contact sheet, in cut order:\n\n",
  `![SCRAPHEART keyframes, six shots in cut order](${ASSETS}/contact-sheet.jpg)\n\n`,
  "The board is saved as [SCRAPHEART — Desert Chase (Teaser)](storyboard://sb_scrapheart) ",
  "— every shot keeps its prompt, its model and its keyframe, so you can re-render ",
  "one without touching the other five.\n\n",
  "Next step is animating these into clips. Want me to price that first?",
];

export const storyboardCast: ChatDemoCast = {
  version: 1,
  kind: "chat",
  id: "chat-storyboard-stills",
  name: "Storyboard and keyframes",
  description:
    "A tool-call chain that creates a storyboard, renders six keyframes, and builds a contact sheet.",
  createdAt: "2026-08-24T10:00:00.000Z",
  durationMs: 16000,
  fps: 30,
  model: MARKETING_CHAT_MODEL,
  events: [
    status(0, "connected"),
    userMessage(200, "build sth cool"),
    status(500, "streaming"),

    // 1 — create the board
    assistantStart(
      800,
      "sb-1",
      [
        {
          id: "sb-call-1",
          name: "execute_code",
          args: {
            title: "Creating SCRAPHEART teaser storyboard",
            code: [
              'const board = await nodetool.storyboards.create({',
              '  title: "SCRAPHEART — Desert Chase (Teaser)",',
              '  aspect_ratio: "16:9",',
              "});",
              "return board.id;",
            ].join("\n"),
          },
        },
      ],
      at(0)
    ),
    toolMessage(1100, "sb-call-1", "execute_code", "sb_scrapheart", at(385)),
    ...assistantStream("sb-1", PITCH, 1400, 2600),

    // 2 — add the shots
    assistantStart(
      4200,
      "sb-2",
      [
        {
          id: "sb-call-2",
          name: "execute_code",
          args: {
            title: "Adding six shots with prompts and timings",
            code: [
              "await nodetool.storyboards.edit(boardId, shots.map((s, i) => ({",
              '  op: "add_shot", prompt: s.prompt, duration: s.seconds,',
              "})));",
            ].join("\n"),
          },
        },
      ],
      at(4200)
    ),
    toolMessage(4500, "sb-call-2", "execute_code", "6 shots added", at(4469)),
    ...assistantStream("sb-2", SHOTS_DONE, 4800, 1600),

    // 3 — render the keyframes
    assistantStart(
      6800,
      "sb-3",
      [
        {
          id: "sb-call-3",
          name: "render_storyboard_stills",
          message: "Rendering six keyframes on the picked model",
          args: { storyboard_id: "sb_scrapheart", model: "fal-ai/flux/dev" },
        },
      ],
      at(6800)
    ),
    toolMessage(
      9200,
      "sb-call-3",
      "render_storyboard_stills",
      "6 of 6 shots rendered",
      at(15000)
    ),

    // 4 — the contact sheet
    assistantStart(
      9500,
      "sb-4",
      [
        {
          id: "sb-call-4",
          name: "execute_code",
          args: {
            title: "Building a contact sheet from the six keyframes",
            code: [
              "const stills = shots.map((s) => s.keyframe);",
              "const sheet = await nodetool.image.grid(stills, { columns: 3 });",
              'return nodetool.media.toImage(sheet);',
            ].join("\n"),
          },
        },
      ],
      at(9500)
    ),
    toolMessage(
      10000,
      "sb-call-4",
      "execute_code",
      "asset://a_contact_sheet",
      at(11700)
    ),
    ...assistantStream("sb-4", SHEET, 10300, 4700),
    status(15200, "connected"),
  ],
};
