/**
 * "Write a script with the assistant" tutorial cast.
 *
 * The Script Assistant is asked for a 20-second two-hander and then to voice
 * it: `ui_script_add_speaker`, `ui_script_add_line`, `ui_script_voice_all`.
 * Lines appear in the real `ScriptDocumentPane`, then flip from draft to
 * voiced as takes land on them.
 *
 * Backend-free: the takes carry a fixed asset id and word timings, so nothing
 * is synthesized on replay.
 */
import { PROVIDER_IDS } from "../../stores/ApiTypes";
import {
  assistantStart,
  assistantStream,
  status,
  toolResult,
  toolRunning,
  userMessage
} from "../chat/chatCastHelpers";
import type { ScriptTake } from "../../stores/script/ScriptStore";
import { patch, scriptLine, scriptSection } from "./docCastHelpers";
import { DOC_CAST_VERSION, type ScriptDocCast } from "./docCastTypes";

const ASSISTANT_ID = "script-assistant-1";
const SPEAKER_CALL = "script-call-add-speaker";
const LINES_CALL = "script-call-add-lines";
const VOICE_CALL = "script-call-voice-all";

const VOICE = {
  provider: PROVIDER_IDS.ELEVENLABS,
  model: "eleven_turbo_v2_5",
  voice: "Rachel"
};

const cast = [
  { id: "spk-host", name: "Host", color: "#22c55e", voice: VOICE },
  {
    id: "spk-guest",
    name: "Guest",
    color: "#8b5cf6",
    voice: { ...VOICE, voice: "Adam" }
  }
];

const LINES = [
  scriptLine("line-1", "spk-host", "So — what does NodeTool actually do?"),
  scriptLine(
    "line-2",
    "spk-guest",
    "It turns an idea into a running AI pipeline. You wire nodes, press Run."
  ),
  scriptLine("line-3", "spk-host", "And when I'd rather just ask for it?"),
  scriptLine(
    "line-4",
    "spk-guest",
    "Then the assistant builds the graph for you, and you watch it work."
  )
];

/** One voiced take. Word timings ride into the timeline as captions. */
const take = (lineId: string, durationMs: number): ScriptTake => ({
  id: `take-${lineId}`,
  assetId: `demo-take-${lineId}`,
  durationMs,
  words: [],
  textSnapshot: LINES.find((l) => l.id === lineId)?.text ?? "",
  voiceSnapshot: VOICE,
  createdAt: new Date(0).toISOString()
});

const voiced = LINES.map((line, i) => ({
  ...line,
  takes: [take(line.id, 2200 + i * 400)],
  currentTakeId: `take-${line.id}`
}));

const ANSWER = [
  "Four lines across two voices, ",
  "about twenty seconds. ",
  "Every line is voiced — ",
  "say the word and I'll cut it into a timeline."
];

export const scriptAssistantCast: ScriptDocCast = {
  version: DOC_CAST_VERSION,
  kind: "doc",
  surface: "script",
  id: "script-assistant",
  name: "Write a script with the assistant",
  description:
    "Ask the Script Assistant for a two-hander: it casts the speakers, writes the lines, and voices every one.",
  createdAt: new Date(0).toISOString(),
  durationMs: 19000,
  fps: 30,
  docId: "demo-script-1",
  assistantTitle: "Script Assistant",
  assistantModel: {
    type: "language_model",
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: PROVIDER_IDS.ANTHROPIC
  },

  doc: {
    title: "What is NodeTool?",
    cast: [],
    sections: [scriptSection("sec-1", "Cold open", [])],
    timelineId: null,
    storyboardId: null
  },

  events: [
    // The cast is added first — a line needs a speaker to belong to.
    patch(3800, { cast }),
    // Then the lines, as one add_line batch.
    patch(7200, { sections: [scriptSection("sec-1", "Cold open", LINES)] }),
    // voice_all lands a take on every line: draft → voiced.
    patch(13200, { sections: [scriptSection("sec-1", "Cold open", voiced)] })
  ],

  assistant: [
    status(0, "connected"),
    userMessage(
      400,
      "Draft a 20-second intro for two hosts, then voice every line."
    ),
    status(900, "streaming"),

    assistantStart(1500, ASSISTANT_ID, [
      {
        id: SPEAKER_CALL,
        name: "ui_script_add_speaker",
        args: { names: ["Host", "Guest"] }
      }
    ]),
    toolRunning(1700, SPEAKER_CALL, "Casting the speakers…"),
    toolRunning(3600, null),
    toolResult(3800, ASSISTANT_ID, [
      {
        id: SPEAKER_CALL,
        name: "ui_script_add_speaker",
        args: { names: ["Host", "Guest"] },
        result: { speakerIds: ["spk-host", "spk-guest"] }
      },
      {
        id: LINES_CALL,
        name: "ui_script_add_line",
        args: { count: 4, sectionId: "sec-1" }
      }
    ]),
    toolRunning(4200, LINES_CALL, "Writing the lines…"),
    toolRunning(7000, null),
    toolResult(7200, ASSISTANT_ID, [
      {
        id: LINES_CALL,
        name: "ui_script_add_line",
        args: { count: 4, sectionId: "sec-1" },
        result: { lineIds: LINES.map((l) => l.id) }
      },
      {
        id: VOICE_CALL,
        name: "ui_script_voice_all",
        args: { onlyDraft: true }
      }
    ]),
    toolRunning(7800, VOICE_CALL, "Voicing 4 lines…"),
    toolRunning(13000, null),
    toolResult(13200, ASSISTANT_ID, [
      {
        id: SPEAKER_CALL,
        name: "ui_script_add_speaker",
        args: { names: ["Host", "Guest"] },
        result: { speakerIds: ["spk-host", "spk-guest"] }
      },
      {
        id: LINES_CALL,
        name: "ui_script_add_line",
        args: { count: 4, sectionId: "sec-1" },
        result: { lineIds: LINES.map((l) => l.id) }
      },
      {
        id: VOICE_CALL,
        name: "ui_script_voice_all",
        args: { onlyDraft: true },
        result: { voiced: 4, failed: 0 }
      }
    ]),

    ...assistantStream(ASSISTANT_ID, ANSWER, 13800, 3600),
    status(17600, "connected")
  ]
};
