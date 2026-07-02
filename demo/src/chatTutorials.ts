/**
 * Chat-panel tutorial videos rendered by the Remotion harness. Sibling to
 * `tutorials.ts` (the graph-editor tutorials) — same three-beat shell, a
 * different replay surface (`ChatTutorial` / `ChatDemoPlayer`).
 */
import type { ChatTutorialProps } from "./ChatTutorial";
import { framesForTiming } from "./tutorialTiming";

const INTRO_SECONDS = 2.5;
const OUTRO_SECONDS = 4;

export interface ChatTutorialEntry {
  /** Remotion composition id, e.g. "ChatTutorial-agent-qa". */
  compositionId: string;
  /** Output basename: out/<slug>.mp4 → web/public/tutorials/<slug>.mp4. */
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
    replayWindowMs: 11000,
    steps: [
      { atMs: 300, label: "Ask a question" },
      { atMs: 1300, label: "The agent searches the web" },
      { atMs: 4000, label: "It streams back an answer" },
    ],
    captions: [
      { fromMs: 400, toMs: 1200, text: "Type a question — Global Chat sends it straight to your model." },
      { fromMs: 1500, toMs: 3500, text: "When the agent needs fresh info, it calls a tool — you see exactly what ran." },
      { fromMs: 4200, toMs: 10600, text: "The answer streams back token by token, grounded in what it just found." },
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
