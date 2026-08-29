import { renderHook, act } from "@testing-library/react";
import { useStartTrackChat } from "../useStartTrackChat";
import { WELCOME_TRACKS } from "../../components/onboarding/welcomeTracks";
import { useChatDraftStore } from "../../stores/ChatDraftStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import useOnboardingStore from "../../stores/OnboardingStore";
import useMediaGenerationStore from "../../stores/MediaGenerationStore";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate
}));

const createNewThread = jest.fn(async () => "thread-1");

jest.mock("../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      createNewThread
    })
  }
}));

describe("useStartTrackChat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatDraftStore.setState({ drafts: {} });
    useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
    useOnboardingStore.setState({ completedSteps: [], dismissed: false });
    useMediaGenerationStore.getState().setMode("chat");
  });

  const imageTrack = WELCOME_TRACKS.find((t) => t.id === "image")!;

  it("opens a chat tab seeded with the track's prompt, sending nothing", async () => {
    const { result } = renderHook(() => useStartTrackChat());
    await act(async () => {
      await result.current("image");
    });

    expect(createNewThread).toHaveBeenCalledWith(imageTrack.threadTitle, null);
    expect(useChatDraftStore.getState().drafts["thread-1"]).toBe(
      imageTrack.samplePrompt
    );
    expect(useWorkspaceTabsStore.getState().tabs).toEqual([
      expect.objectContaining({ type: "chat", ref: "thread-1" })
    ]);
    expect(mockNavigate).toHaveBeenCalledWith("/workspace");
  });

  it("puts the composer in the track's mode", async () => {
    const { result } = renderHook(() => useStartTrackChat());
    await act(async () => {
      await result.current("image");
    });

    expect(useMediaGenerationStore.getState().mode).toBe("image");
  });

  it("marks the getting-started step", async () => {
    const { result } = renderHook(() => useStartTrackChat());
    await act(async () => {
      await result.current("agent");
    });

    expect(useOnboardingStore.getState().completedSteps).toContain(
      "open-template"
    );
  });

  it("creates no workflow tab for an unknown track", async () => {
    const { result } = renderHook(() => useStartTrackChat());
    await act(async () => {
      await result.current("nope" as never);
    });

    expect(createNewThread).not.toHaveBeenCalled();
    expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(0);
  });
});
