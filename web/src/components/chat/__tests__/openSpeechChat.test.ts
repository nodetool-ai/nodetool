import {
  openImageChat,
  openSpeechChat,
  openVideoChat
} from "../openSpeechChat";
import useChatDraftStore from "../../../stores/ChatDraftStore";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

describe("openSpeechChat / openImageChat / openVideoChat", () => {
  it("opens a chat whose composer speaks the typed line", async () => {
    const createNewThread = jest.fn().mockResolvedValue("thread-1");
    useGlobalChatStore.setState({ createNewThread });
    const openForegroundTab = jest.fn();
    useWorkspaceTabsStore.setState({ openForegroundTab });

    await openSpeechChat("project-1", "Good morning, Grandma");

    expect(createNewThread).toHaveBeenCalledWith("Read aloud", null, {
      projectId: "project-1",
      mediaMode: "audio"
    });
    expect(useChatDraftStore.getState().takeDraft("thread-1")).toBe(
      "Good morning, Grandma"
    );
    expect(openForegroundTab).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat",
        ref: "thread-1",
        title: "Read aloud"
      })
    );
  });

  it("opens an image generation tab with seeded draft and attachments", async () => {
    const createNewThread = jest.fn().mockResolvedValue("thread-img");
    useGlobalChatStore.setState({ createNewThread });
    const openForegroundTab = jest.fn();
    useWorkspaceTabsStore.setState({ openForegroundTab });

    const attachments = [
      {
        id: "ref-1",
        dataUri: "asset://img-1",
        type: "image/png",
        name: "ref.png",
        assetUri: "asset://img-1"
      }
    ];
    await openImageChat("project-1", {
      title: "Pizza truck",
      draft: "Wood fired pizza truck at night",
      attachments,
      mediaMode: "image_edit"
    });

    expect(createNewThread).toHaveBeenCalledWith("Pizza truck", null, {
      projectId: "project-1",
      mediaMode: "image_edit"
    });
    expect(useChatDraftStore.getState().takeDraft("thread-img")).toBe(
      "Wood fired pizza truck at night"
    );
    expect(useChatDraftStore.getState().takeAttachments("thread-img")).toEqual(
      attachments
    );
    expect(openForegroundTab).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat",
        ref: "thread-img",
        title: "Pizza truck"
      })
    );
  });

  it("opens a video generation tab", async () => {
    const createNewThread = jest.fn().mockResolvedValue("thread-vid");
    useGlobalChatStore.setState({ createNewThread });
    const openForegroundTab = jest.fn();
    useWorkspaceTabsStore.setState({ openForegroundTab });

    await openVideoChat("project-1", {
      title: "Driftline ad",
      draft: "Condensation beads down the can"
    });

    expect(createNewThread).toHaveBeenCalledWith("Driftline ad", null, {
      projectId: "project-1",
      mediaMode: "video"
    });
    expect(useChatDraftStore.getState().takeDraft("thread-vid")).toBe(
      "Condensation beads down the can"
    );
    expect(openForegroundTab).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat",
        ref: "thread-vid",
        title: "Driftline ad"
      })
    );
  });
});
