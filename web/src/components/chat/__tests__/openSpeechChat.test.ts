import { openSpeechChat } from "../openSpeechChat";
import useChatDraftStore from "../../../stores/ChatDraftStore";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import useMediaGenerationStore from "../../../stores/MediaGenerationStore";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

describe("openSpeechChat", () => {
  it("opens a chat whose composer speaks the typed line", async () => {
    useMediaGenerationStore.getState().setMode("chat");
    const createNewThread = jest.fn().mockResolvedValue("thread-1");
    useGlobalChatStore.setState({ createNewThread });
    const openForegroundTab = jest.fn();
    useWorkspaceTabsStore.setState({ openForegroundTab });

    await openSpeechChat("project-1", "Good morning, Grandma");

    expect(useMediaGenerationStore.getState().mode).toBe("audio");
    expect(createNewThread).toHaveBeenCalledWith(undefined, null, {
      projectId: "project-1"
    });
    expect(useChatDraftStore.getState().takeDraft("thread-1")).toBe(
      "Good morning, Grandma"
    );
    expect(openForegroundTab).toHaveBeenCalledWith(
      expect.objectContaining({ type: "chat", ref: "thread-1" })
    );
  });
});
