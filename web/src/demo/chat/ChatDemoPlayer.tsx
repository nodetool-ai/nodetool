/** @jsxImportSource @emotion/react */
/**
 * ChatDemoPlayer — renders the real `ChatView` chat panel for a chat cast at
 * a given time. Sibling to `../DemoPlayer.tsx` (the graph-editor player):
 * same "self-contained provider stack + pure function of elapsed time" shape,
 * but `ChatView` is prop-driven rather than store-driven, so replay is a
 * plain fold (`computeChatStateAt`) instead of a stateful engine.
 */
import React, { useLayoutEffect, useMemo } from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { MemoryRouter } from "react-router-dom";
import { TRPCProvider } from "../../trpc/Provider";

import "../../styles/vars.css";
import "../../styles/base.css";
import "../../styles/markdown/nodetool-markdown.css";
import "../../styles/markdown/github-markdown.css";

import ThemeNodetool from "../../components/themes/ThemeNodetool";
import ChatView from "../../components/chat/containers/ChatView";
import type { ChatDemoCast } from "./chatCastTypes";
import { computeChatStateAt, seedChatGlobalState } from "./chatReplay";

const DEMO_THREAD_ID = "demo-chat-thread";

export interface ChatDemoPlayerProps {
  cast: ChatDemoCast;
  /** Elapsed time into the cast, in milliseconds. */
  timeMs: number;
  style?: React.CSSProperties;
}

/** Self-contained chat surface. `timeMs` may change every frame. */
export function ChatDemoPlayer({
  cast,
  timeMs,
  style,
}: ChatDemoPlayerProps): React.JSX.Element {
  const state = useMemo(
    () => computeChatStateAt(cast.events, timeMs),
    [cast, timeMs]
  );

  // Mirror into GlobalChatStore before paint, same as DemoPlayer's engine
  // seeking — a couple of chat components read it directly instead of props.
  useLayoutEffect(() => {
    seedChatGlobalState(DEMO_THREAD_ID, state);
  }, [state]);

  return (
    <MemoryRouter>
      <TRPCProvider>
        <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
          <InitColorSchemeScript attribute="class" defaultMode="dark" />
          <CssBaseline />
          <div
            data-demo-player
            style={{ width: "100%", height: "100%", ...style }}
          >
            <ChatView
              status={state.status}
              messages={state.messages}
              sendMessage={async () => {}}
              progress={state.progress}
              total={state.total}
              progressMessage={state.progressMessage}
              runningToolCallId={state.runningToolCallId}
              runningToolMessage={state.runningToolMessage}
              model={cast.model}
              showConversationHeader={false}
            />
          </div>
        </ThemeProvider>
      </TRPCProvider>
    </MemoryRouter>
  );
}

export default ChatDemoPlayer;
