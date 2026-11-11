import type { ActivityEntry } from "@nodetool-ai/app-runtime";

import type { Message, ToolCall } from "../../../stores/ApiTypes";

export interface TranscriptMessages {
  messages: Message[];
  toolResultsByCallId: Record<string, { name: string; content: string }>;
}

/**
 * Express an app run's transcript as chat messages, so the chat components
 * render it. Consecutive tool calls share one message and one timeline.
 */
export const transcriptToMessages = (
  entries: ReadonlyArray<ActivityEntry>
): TranscriptMessages => {
  const messages: Message[] = [];
  const toolResultsByCallId: TranscriptMessages["toolResultsByCallId"] = {};
  let toolCalls: ToolCall[] | null = null;
  entries.forEach((entry, index) => {
    if (entry.kind === "text") {
      toolCalls = null;
      messages.push({
        type: "message",
        id: `transcript-${index}`,
        role: "assistant",
        content: entry.text
      } as Message);
      return;
    }
    if (!toolCalls) {
      toolCalls = [];
      messages.push({
        type: "message",
        id: `transcript-${index}`,
        role: "assistant",
        content: "",
        tool_calls: toolCalls
      } as Message);
    }
    toolCalls.push({
      id: entry.id,
      name: entry.name,
      args: entry.args ?? {},
      message: entry.label
    } as ToolCall);
    if (entry.status !== "running") {
      toolResultsByCallId[entry.id] = {
        name: entry.name,
        content: entry.result ?? ""
      };
    }
  });
  return { messages, toolResultsByCallId };
};
