/**
 * "Ask the chat agent" tutorial cast — a synthetic, backend-free capture of a
 * conversation with NodeTool's Global Chat: a question, a web-search tool
 * call, and a streamed answer. Exercises the real `ChatView` — message
 * bubbles, the tool-call card, and token-by-token streaming — with no
 * backend and no generated credits.
 */
import { PROVIDER_IDS } from "../../stores/ApiTypes";
import {
  assistantStart,
  assistantStream,
  progress,
  status,
  toolResult,
  toolRunning,
  userMessage,
} from "./chatCastHelpers";
import type { ChatDemoCast } from "./chatCastTypes";

const ASSISTANT_ID = "demo-assistant-1";
const TOOL_CALL_ID = "demo-tool-call-1";

const ANSWER_TOKENS = [
  "The James Webb Space Telescope ",
  "found water vapor, carbon dioxide, ",
  "and methane in the atmosphere ",
  "of exoplanet K2-18b — the strongest ",
  "signs yet of a possible ",
  "hydrogen-rich \"Hycean\" world.",
];

export const agentChatCast: ChatDemoCast = {
  version: 1,
  kind: "chat",
  id: "chat-agent-qa",
  name: "Ask the chat agent",
  description:
    "A question, a web-search tool call, and a streamed answer in Global Chat.",
  createdAt: "2026-01-01T00:00:00.000Z",
  durationMs: 12500,
  fps: 30,
  model: {
    type: "language_model",
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: PROVIDER_IDS.OPENAI,
  },
  events: [
    status(0, "connected"),
    userMessage(300, "What did the James Webb telescope just discover?"),
    status(700, "streaming"),

    assistantStart(1100, ASSISTANT_ID, [
      {
        id: TOOL_CALL_ID,
        name: "search_web",
        args: { query: "James Webb telescope latest discovery" },
      },
    ]),
    toolRunning(1300, TOOL_CALL_ID, "Searching the web…"),
    progress(1300, 1, 1, "Searching the web…"),

    toolRunning(3600, null),
    progress(3600, 0, 0, null),
    toolResult(3600, ASSISTANT_ID, [
      {
        id: TOOL_CALL_ID,
        name: "search_web",
        args: { query: "James Webb telescope latest discovery" },
        result: {
          title: "JWST detects possible biosignature on K2-18b",
          source: "nasa.gov",
        },
      },
    ]),

    ...assistantStream(ASSISTANT_ID, ANSWER_TOKENS, 4000, 6500),
    status(10600, "connected"),
  ],
};
