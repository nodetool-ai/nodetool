import { act, renderHook } from "@testing-library/react";

import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useStoryboardTextAssist } from "../useStoryboardTextAssist";
import type { AssistRequest } from "../../../components/storyboard/text/storyboardTextAssist";

const mockRpcRequest = jest.fn();
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => mockRpcRequest(...args)
}));

const BOARD = "board-assist";
const request: AssistRequest = {
  markdown: "### Shot {#s1}\nNova kneels.",
  entities: new Map(),
  instruction: "tighten",
  selection: { mode: "single", text: "Nova kneels.", marked: "⟦Nova kneels.⟧", scope: "Shot 1 · action", from: "Shot 1 · action", to: "Shot 1 · action", heading: false }
};

beforeEach(() => {
  mockRpcRequest.mockReset();
  useStoryboardStore.getState().ensureBoard(BOARD);
});
afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
});

describe("useStoryboardTextAssist", () => {
  it("asks for a model when neither the board nor the chat has one", async () => {
    useGlobalChatStore.setState({ selectedModel: null } as never);
    const { result } = renderHook(() => useStoryboardTextAssist(BOARD));
    await act(() => result.current.ask(request));
    expect(result.current.error).toBe("no_model");
    expect(mockRpcRequest).not.toHaveBeenCalled();
  });

  it("asks the board's director model and keeps the conversation for a follow-up", async () => {
    useStoryboardStore.getState().setDirectorModel(BOARD, { type: "language_model", id: "director", provider: "openai", name: "Director" });
    mockRpcRequest
      .mockResolvedValueOnce({ text: "<mode>replace</mode><text>Nova kneels low.</text><why>Tighter.</why>" })
      .mockResolvedValueOnce({ text: "<mode>replace</mode><text>Nova crouches.</text><why>Shorter.</why>" });
    const { result } = renderHook(() => useStoryboardTextAssist(BOARD));

    await act(() => result.current.ask(request));
    expect(result.current.reply).toEqual({ mode: "replace", text: "Nova kneels low.", why: "Tighter." });
    expect(mockRpcRequest.mock.calls[0][1]).toMatchObject({ provider: "openai", model: "director" });

    await act(() => result.current.followUp("shorter"));
    expect(result.current.reply?.text).toBe("Nova crouches.");
    const messages = (mockRpcRequest.mock.calls[1][1] as { messages: Array<{ role: string; content: string }> }).messages;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[2].content).toContain("Follow-up instruction: shorter");
  });

  it("reports an empty answer and a failed call", async () => {
    useStoryboardStore.getState().setDirectorModel(BOARD, { type: "language_model", id: "director", provider: "openai", name: "Director" });
    mockRpcRequest.mockResolvedValueOnce({ text: "<mode>note</mode><text></text>" }).mockRejectedValueOnce(new Error("rate limited"));
    const { result } = renderHook(() => useStoryboardTextAssist(BOARD));
    await act(() => result.current.ask(request));
    expect(result.current.error).toBe("empty");
    await act(() => result.current.ask(request));
    expect(result.current).toMatchObject({ error: "failed", errorDetail: "rate limited", status: "error" });
  });

  it("drops the answer of a cancelled request", async () => {
    useStoryboardStore.getState().setDirectorModel(BOARD, { type: "language_model", id: "director", provider: "openai", name: "Director" });
    let resolve: (value: unknown) => void = () => undefined;
    mockRpcRequest.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useStoryboardTextAssist(BOARD));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.ask(request);
    });
    expect(result.current.status).toBe("running");
    act(() => result.current.cancel());
    await act(async () => {
      resolve({ text: "<mode>replace</mode><text>late</text>" });
      await pending;
    });
    expect(result.current.reply).toBeNull();
  });
});
