import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import useGlobalChatStore from "../stores/GlobalChatStore";
import useMediaGenerationStore from "../stores/MediaGenerationStore";
import { useChatDraftStore } from "../stores/ChatDraftStore";
import { useWorkspaceTabsStore } from "../stores/WorkspaceTabsStore";
import useOnboardingStore from "../stores/OnboardingStore";
import { useNotificationStore } from "../stores/NotificationStore";
import {
  WELCOME_TRACKS,
  type WelcomeTrackId
} from "../components/portal/welcomeTracks";

/**
 * Opens a welcome-flow track as a chat tab: a fresh thread in the track's
 * composer mode, with the track's example prompt already in the box. Nothing
 * is sent — the user reads the prompt, edits it if they like, and presses
 * send.
 */
export const useStartTrackChat = (): ((
  trackId: WelcomeTrackId
) => Promise<void>) => {
  const navigate = useNavigate();

  return useCallback(
    async (trackId: WelcomeTrackId) => {
      const track = WELCOME_TRACKS.find((t) => t.id === trackId);
      if (!track) {
        return;
      }
      useOnboardingStore.getState().markStep("open-template");

      // The composer mode decides what the send generates.
      useMediaGenerationStore.getState().setMode(track.chatMode);

      try {
        const threadId = await useGlobalChatStore
          .getState()
          // Explicit null: a dashboard starter is a plain conversation, not
          // one bound to whatever workflow happens to be open.
          .createNewThread(track.threadTitle, null);
        useChatDraftStore.getState().setDraft(threadId, track.samplePrompt);
        useWorkspaceTabsStore.getState().openTab({
          type: "chat",
          ref: threadId,
          mode: "view",
          title: track.threadTitle
        });
        navigate("/workspace");
      } catch (error) {
        console.error("Failed to open starter chat:", error);
        useNotificationStore.getState().addNotification({
          type: "warning",
          alert: true,
          content: `Could not open the ${track.label} chat. Try again from the workspace.`
        });
      }
    },
    [navigate]
  );
};
