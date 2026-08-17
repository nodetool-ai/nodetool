/** @jsxImportSource @emotion/react */
/**
 * AssistantDock — the editor assistant panel, replayed from a chat cast track.
 *
 * Every document surface (sketch, script, storyboard, JS script, app) docks the
 * same assistant: `AssistantChatPanel`, which is `ChatView` plus a header. The
 * production panel opens a websocket and owns a live thread, so a backend-free
 * replay renders `ChatView` directly — the same component, driven by the fold
 * in `../chat/chatReplay.ts` instead of by the socket.
 *
 * Used by `../doc/DocDemoPlayer.tsx` beside the document, and available to any
 * other player that wants to show the assistant that drove a run.
 */
import React, { useLayoutEffect, useMemo } from "react";

import ChatView from "../../components/chat/containers/ChatView";
import { FlexRow, Text, SPACING } from "../../components/ui_primitives";
import type { LanguageModel } from "../../stores/ApiTypes";
import type { ChatCastEvent } from "../chat/chatCastTypes";
import { computeChatStateAt, seedChatGlobalState } from "../chat/chatReplay";

const DEMO_THREAD_ID = "demo-assistant-thread";

/** Default dock width, matching the editor's assistant dock at 1920×1080. */
export const ASSISTANT_DOCK_WIDTH_PX = 520;

export interface AssistantDockProps {
  /** The assistant conversation, in chat-cast events. */
  events: ChatCastEvent[];
  /** Elapsed time into the cast, in milliseconds. */
  timeMs: number;
  /** Heading above the thread, e.g. "Sketch Assistant". */
  title: string;
  /** Model badge shown in the composer. */
  model: LanguageModel;
  style?: React.CSSProperties;
}

export function AssistantDock({
  events,
  timeMs,
  title,
  model,
  style
}: AssistantDockProps): React.JSX.Element {
  const state = useMemo(
    () => computeChatStateAt(events, timeMs),
    [events, timeMs]
  );

  // Mirror into GlobalChatStore before paint: the tool-call spinner and the
  // todo sidebar read a few fields off the global store instead of props.
  useLayoutEffect(() => {
    seedChatGlobalState(DEMO_THREAD_ID, state);
  }, [state]);

  return (
    <div
      data-assistant-dock
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        ...style
      }}
    >
      <FlexRow
        align="center"
        sx={{ px: SPACING.md, py: SPACING.sm, flexShrink: 0 }}
      >
        <Text size="small" weight={600}>
          {title}
        </Text>
      </FlexRow>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatView
          status={state.status}
          messages={state.messages}
          sendMessage={async () => {}}
          progress={state.progress}
          total={state.total}
          progressMessage={state.progressMessage}
          runningToolCallId={state.runningToolCallId}
          runningToolMessage={state.runningToolMessage}
          model={model}
          showNewChatButton={false}
        />
      </div>
    </div>
  );
}

export default AssistantDock;
