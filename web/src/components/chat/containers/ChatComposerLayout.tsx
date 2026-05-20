// web/src/components/chat/containers/ChatComposerLayout.tsx
import React from "react";
import { Outlet } from "react-router-dom";
import { ComposerSlotProvider } from "../composer/composerSlotContext";
import PersistentComposer from "../composer/PersistentComposer";

/**
 * Layout route wrapping the start page (/dashboard) and the chat view
 * (/chat/:thread_id). Keeps a single composer instance mounted across
 * navigation between the two so the composer's draft text and focus survive and
 * its position can be animated (FLIP) from the centered start-page slot to the
 * pinned-bottom chat slot.
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
