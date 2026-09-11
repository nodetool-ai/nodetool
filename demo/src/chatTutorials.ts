/**
 * Chat-panel tutorial videos rendered by the Remotion harness. Sibling to
 * `tutorials.ts` (the graph-editor tutorials) — same three-beat shell, a
 * different replay surface (`ChatTutorial` / `ChatDemoPlayer`).
 */
import type { ChatTutorialProps } from "./ChatTutorial";
import { framesForTiming } from "./tutorialTiming";

const INTRO_SECONDS = 1.5;
const OUTRO_SECONDS = 2;

interface ChatTutorialEntry {
  /** Remotion composition id, e.g. "ChatTutorial-agent-qa". */
  compositionId: string;
  /** Output basename under docs/assets/tutorials/. */
  slug: string;
  fps: number;
  props: ChatTutorialProps;
}

const entry = (
  slug: string,
  fps: number,
  props: Omit<ChatTutorialProps, "introSeconds" | "outroSeconds">
): ChatTutorialEntry => ({
  compositionId: `ChatTutorial-${slug}`,
  slug,
  fps,
  props: { ...props, introSeconds: INTRO_SECONDS, outroSeconds: OUTRO_SECONDS },
});

export const CHAT_TUTORIALS: ChatTutorialEntry[] = [
  entry("agent-qa", 30, {
    castId: "chat-agent-qa",
    title: "Ask the chat agent",
    subtitle: "Global Chat · tool calls, streamed live",
    replayWindowMs: 21000,
    timeMap: [
      { presentationFromMs: 0, presentationToMs: 2500, castFromMs: 0, castToMs: 700 },
      { presentationFromMs: 2500, presentationToMs: 4000, castFromMs: 700, castToMs: 700 },
      { presentationFromMs: 4000, presentationToMs: 7500, castFromMs: 700, castToMs: 3600 },
      { presentationFromMs: 7500, presentationToMs: 9000, castFromMs: 3600, castToMs: 3600 },
      { presentationFromMs: 9000, presentationToMs: 16000, castFromMs: 3600, castToMs: 10600 },
      { presentationFromMs: 16000, presentationToMs: 18000, castFromMs: 10600, castToMs: 10600 },
      { presentationFromMs: 18000, presentationToMs: 21000, castFromMs: 10600, castToMs: 12500 },
    ],
    shots: [
      { id: "chat-overview", fromMs: 0, toMs: 1500, target: { kind: "overview" }, moveMs: 0 },
      { id: "submitted-question", fromMs: 1500, toMs: 3000, target: { kind: "component", focusId: "message-demo-user-300" }, moveMs: 600, anchorMs: 2400, emphasis: "outline-dim" },
      { id: "web-search", fromMs: 3000, toMs: 7500, target: { kind: "component", focusId: "tool-call-demo-tool-call-1" }, moveMs: 600, actionAtMs: 4725, anchorMs: 7000, emphasis: "outline-dim" },
      { id: "answer", fromMs: 7500, toMs: 18000, target: { kind: "component", focusId: "message-demo-assistant-1" }, moveMs: 600, actionAtMs: 9400, anchorMs: 17000, emphasis: "outline-dim" },
      { id: "chat-context", fromMs: 18000, toMs: 21000, target: { kind: "component", focusId: "chat-panel" }, moveMs: 600, anchorMs: 20000 },
    ],
    steps: [
      { atMs: 1500, label: "Read the submitted question" },
      { atMs: 3000, label: "The agent searches the web" },
      { atMs: 7500, label: "It streams a sourced answer" },
    ],
    captions: [
      { fromMs: 1500, toMs: 5000, text: "The submitted question asks for a recent discovery." },
      { fromMs: 5000, toMs: 8500, text: "The web search shows its status and source." },
      { fromMs: 9500, toMs: 15000, text: "The answer streams from what the search found." },
    ],
    outroTitle: "Chat with tools",
    outroPoints: [
      "Ask anything — models, memory, and tools are one panel away",
      "Watch tool calls run in the open, not behind a spinner",
      "Every answer streams live, no waiting for the full reply",
    ],
  }),
];

/** Total frames for a chat tutorial entry: intro + replay window + outro. */
export function chatTutorialFrames(e: ChatTutorialEntry): number {
  return framesForTiming(e.fps, e.props);
}
