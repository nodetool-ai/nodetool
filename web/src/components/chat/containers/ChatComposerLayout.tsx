// web/src/components/chat/containers/ChatComposerLayout.tsx
import React from "react";
import { Outlet } from "react-router-dom";
import { ComposerSlotProvider } from "../composer/composerSlotContext";
import PersistentComposer from "../composer/PersistentComposer";

/**
 * Layout route wrapping the chat view (/chat/:thread_id). Keeps a single
 * composer instance mounted across navigation between threads so its draft text
 * and focus survive and its position can be FLIP-animated between slots.
 */
const ChatComposerLayout: React.FC = () => {
  return (
    <ComposerSlotProvider>
      <Outlet />
      <PersistentComposer />
    </ComposerSlotProvider>
  );
};

export default ChatComposerLayout;
